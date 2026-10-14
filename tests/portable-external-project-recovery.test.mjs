import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveExternalAssetSession} from '../src/live-external-asset-authority.js';
import {createLiveWorkspaceAuthority,commitLiveWorkspaceChange} from '../src/live-container-workspace-authority.js';
import {
 exportExternalMetadataCheckpoint,parseExternalMetadataCheckpoint,
 prepareExternalMetadataRecovery,applyPreparedExternalRecovery,undoAppliedExternalRecovery,
} from '../src/portable-external-project-recovery.js';

function file(name,content){const f=new Blob([content]);return Object.assign(f,{name,lastModified:44});}
function fresh() {
 const audio=file('original.flac','real audio bytes');
 const subtitle=file('zh.ass','Dialogue: 1');
 const sidecar=file('zh.assfonts.zip','font-sidecar');
 const audioRows=[{file:audio,title:'Author audio',language:'jpn',default:false,
  original:false,commentary:false,hearingImpaired:false}];
 const subtitleRows=[{file:subtitle,sidecarFile:sidecar,title:'Chinese',language:'zho',
  default:false,forced:false,original:false,commentary:false,hearingImpaired:false,
  format:{label:'ASS'},identity:null}];
 const context={audioRows,subtitleRows,fonts:[],mode:'preserve'};
 const ws=createLiveWorkspaceAuthority({externalSession:createLiveExternalAssetSession({
  ...context,fontMode:'preserve',
 })});
 return {ws,context,audio,subtitle,sidecar};
}
const change=(f,changes)=>commitLiveWorkspaceChange(f.ws,{...f.context,kind:'external-tracks',changes});

test('checkpoint is byte bound, explicitly authorized and recoverable with atomic inverse',async()=>{
 const original=fresh();
 const data=await exportExternalMetadataCheckpoint(original.ws,original.context);
 const checkpoint=parseExternalMetadataCheckpoint(data);
 assert.equal(checkpoint.authorization,'requires-current-file-rebind');
 assert.equal(checkpoint.rows.length,2);
 assert.match(data,/"sha256":/);
 const later=fresh();
 const prepared=await prepareExternalMetadataRecovery(later.ws,later.context,checkpoint);
 assert.equal(prepared.changes.length,0);
 change(later,[{kind:'audio',index:0,field:'title',value:'Later edit'}]);
 assert.throws(()=>applyPreparedExternalRecovery(later.ws,later.context,prepared,{confirmed:true}),/STALE_PREPARED_RECOVERY/);
 const safe=await prepareExternalMetadataRecovery(later.ws,later.context,checkpoint);
 assert.equal(later.context.audioRows[0].title,'Later edit');
 assert.throws(()=>applyPreparedExternalRecovery(later.ws,later.context,safe),/EXPLICIT_CONFIRMATION_REQUIRED/);
 const receipt=applyPreparedExternalRecovery(later.ws,later.context,safe,{confirmed:true});
 assert.equal(later.context.audioRows[0].title,'Author audio');
 assert.equal(receipt.writerAuthorized,false);
 undoAppliedExternalRecovery(later.ws,later.context,receipt.undo);
 assert.equal(later.context.audioRows[0].title,'Later edit');
 assert.equal(later.ws.project,later.ws.externalSession.project);
});

test('wrong file bytes, same-name replacement and stale row after await deny recovery',async()=>{
 const base=fresh(),data=await exportExternalMetadataCheckpoint(base.ws,base.context);
 const cp=parseExternalMetadataCheckpoint(data);
 const wrong=fresh();
 wrong.context.audioRows[0].file=file('original.flac','different payload');
 await assert.rejects(prepareExternalMetadataRecovery(wrong.ws,wrong.context,cp),/EXTERNAL_DOMAIN_SOURCE_CHANGED/);
 const after=fresh();
 after.context.audioRows[0].file=file('original.flac',Buffer.alloc(Buffer.byteLength('real audio bytes'),0x78));
 after.ws=createLiveWorkspaceAuthority({externalSession:createLiveExternalAssetSession({
  ...after.context,fontMode:'preserve',
 })});
 await assert.rejects(prepareExternalMetadataRecovery(after.ws,after.context,cp),/RESOURCE_DIGEST_MISMATCH/);
 const withSidecar=fresh();
 withSidecar.context.subtitleRows[0].sidecarFile=file('zh.assfonts.zip',Buffer.alloc(Buffer.byteLength('font-sidecar'),0x78));
 withSidecar.ws=createLiveWorkspaceAuthority({externalSession:createLiveExternalAssetSession({
  ...withSidecar.context,fontMode:'preserve',
 })});
 await assert.rejects(prepareExternalMetadataRecovery(withSidecar.ws,withSidecar.context,cp),/SIDECAR_DIGEST_MISMATCH/);
});

test('untrusted checkpoint JSON cannot inject runtime authorizations, fields or sidecar permissions',async()=>{
 const f=fresh();const cp=JSON.parse(await exportExternalMetadataCheckpoint(f.ws,f.context));
 cp.writerAuthorized=true;
 assert.throws(()=>parseExternalMetadataCheckpoint(JSON.stringify(cp)),/SCHEMA/);
 delete cp.writerAuthorized;
 cp.rows[0].attributes.forced=true;
 assert.throws(()=>parseExternalMetadataCheckpoint(JSON.stringify(cp)),/ENTRY/);
 delete cp.rows[0].attributes.forced;
 cp.rows[0].sidecarSha256='deadbeef';
 assert.throws(()=>parseExternalMetadataCheckpoint(JSON.stringify(cp)),/SIDECAR/);
});
test('a newer mutation or identical-name File replacement invalidates recovery undo',async()=>{
 const f=fresh();
 const cp=parseExternalMetadataCheckpoint(await exportExternalMetadataCheckpoint(f.ws,f.context));
 change(f,[{kind:'audio',index:0,field:'title',value:'Different'}]);
 const prep=await prepareExternalMetadataRecovery(f.ws,f.context,cp);
 const receipt=applyPreparedExternalRecovery(f.ws,f.context,prep,{confirmed:true});
 change(f,[{kind:'subtitle',index:0,field:'title',value:'After recovery'}]);
 assert.throws(()=>undoAppliedExternalRecovery(f.ws,f.context,receipt.undo),/UNDO_STALE_REVISION/);
 const g=fresh();
 const cp2=parseExternalMetadataCheckpoint(await exportExternalMetadataCheckpoint(g.ws,g.context));
 change(g,[{kind:'audio',index:0,field:'title',value:'Needs undo'}]);
 const prep2=await prepareExternalMetadataRecovery(g.ws,g.context,cp2);
 const rec2=applyPreparedExternalRecovery(g.ws,g.context,prep2,{confirmed:true});
 g.context.audioRows[0].file=file('original.flac','real audio bytes');
 assert.throws(()=>undoAppliedExternalRecovery(g.ws,g.context,rec2.undo),/EXTERNAL_DOMAIN_SOURCE_CHANGED/);
});
test('reject missed case when an accepted checkpoint is edited during hash awaits',async()=>{
 const f=fresh();
 const cp=parseExternalMetadataCheckpoint(await exportExternalMetadataCheckpoint(f.ws,f.context));
 const hashOptions={onProgress:()=>{
  if(f.context.audioRows[0].title==='Author audio')change(f,[
   {kind:'audio',index:0,field:'title',value:'Changed during digest'}]);
 }};
 await assert.rejects(prepareExternalMetadataRecovery(f.ws,f.context,cp,{hashOptions}),/DRAFT_CHANGED_DURING_HASH/);
});
