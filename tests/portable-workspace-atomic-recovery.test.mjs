import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContainerDocument} from '../src/container-document.js';
import {createLiveSourceTrackSession} from '../src/live-source-track-authority.js';
import {createLiveExternalAssetSession} from '../src/live-external-asset-authority.js';
import {createLiveWorkspaceAuthority,commitLiveWorkspaceChange,
  inspectLiveWorkspaceAuthority} from '../src/live-container-workspace-authority.js';
import {createContainerProjectFromProjection,applyContainerProjectEdit,
  serializeContainerProject} from '../src/container-project.js';
import {parseContainerProjectDraft} from '../src/container-project-import.js';
import {exportExternalMetadataCheckpoint,parseExternalMetadataCheckpoint}
  from '../src/portable-external-project-recovery.js';
import {prepareAtomicWorkspaceRecovery,applyAtomicWorkspaceRecovery,
  undoAtomicWorkspaceRecovery} from '../src/portable-workspace-atomic-recovery.js';

function blob(name,contents){
 return Object.assign(new Blob([contents]),{name,lastModified:100});
}
function fresh(){
 const source={name:'show.mkv',size:312,lastModified:22};
 const key='show.mkv|312|22';
 const streams=[
  {index:0,codec_type:'video',codec_name:'h264',tags:{},disposition:{}},
  {index:1,codec_type:'audio',codec_name:'aac',
    tags:{title:'Original audio',language:'jpn'},disposition:{}},
  {index:2,codec_type:'attachment',codec_name:'ttf',
    tags:{filename:'Font.ttf',mimetype:'font/ttf'},disposition:{}},
 ];
 const track={index:1,type:'audio',stream:streams[1],include:true,order:1,
  title:'Original audio',language:'jpn',default:false,forced:false,
  original:false,commentary:false,hearingImpaired:false};
 const attachment={index:2,stream:streams[2],include:true,
  filename:'Font.ttf',mimetype:'font/ttf'};
 const trackState={fileKey:key,streams,tracks:[track],attachments:[attachment],
  chapters:[],format:{tags:{}}};
 const projection=buildContainerDocument({video:source,trackState});
 const sourceSession=createLiveSourceTrackSession({source,trackState,projection});
 const audioRows=[{file:blob('dub.flac','sample audio'),title:'Original dub',
  language:'eng',default:false,original:false,commentary:false,
  hearingImpaired:false,identity:null,format:'flac'}];
 const subtitleRows=[{file:blob('zh.ass','Dialogue: 1'),sidecarFile:blob('font.side','bytes'),
  title:'Chinese',language:'zho',default:false,forced:false,original:false,
  commentary:false,hearingImpaired:false,identity:null,format:'ass'}];
 const context={source,trackState,audioRows,subtitleRows,fonts:[],mode:'preserve'};
 const externalSession=createLiveExternalAssetSession({...context,fontMode:'preserve'});
 const workspace=createLiveWorkspaceAuthority({sourceSession,externalSession});
 return {source,trackState,projection,track,attachment,audioRows,
  subtitleRows,context,workspace};
}
function sourceDraft(live){
 let p=createContainerProjectFromProjection(live);
 const sourceTrack=p.objects.find(o=>o.kind==='audio'&&o.sourceId);
 const attach=p.objects.find(o=>o.kind==='attachment'&&o.sourceId);
 p=applyContainerProjectEdit(p,{type:'set-attribute',objectId:sourceTrack.id,
  field:'title',value:'Recovered source title'});
 p=applyContainerProjectEdit(p,{type:'set-attribute',objectId:attach.id,
  field:'name',value:'Recovered-Font.ttf'});
 return parseContainerProjectDraft(serializeContainerProject(p));
}
const proof=Object.freeze({state:'digest-matches-draft',matched:true,
  sourceByteIdentityProven:true});
async function ready({priorHistory=0}={}){
 const f=fresh();
 const checkpoint=parseExternalMetadataCheckpoint(
  await exportExternalMetadataCheckpoint(f.workspace,f.context));
 commitLiveWorkspaceChange(f.workspace,{...f.context,kind:'external-tracks',changes:[
  {kind:'audio',index:0,field:'title',value:'Local override'},
  {kind:'subtitle',index:0,field:'language',value:'eng'},
 ]});
 if(priorHistory){
   let project=f.workspace.project;
   const id=f.workspace.externalSession.keys.get('audio:0');
   for(let i=0;i<priorHistory;i++)project=applyContainerProjectEdit(project,{
     type:'set-attribute',objectId:id,field:'title',
     value:i%2?'Local override':'Temporary editor title',
   });
   f.workspace.project=project;
   f.workspace.sourceSession.project=project;
   f.workspace.externalSession.project=project;
 }
 const draft=sourceDraft(f.projection);
 const prepared=await prepareAtomicWorkspaceRecovery({
  workspace:f.workspace,context:f.context,sourceDraft:draft,
  sourceProof:proof,liveProjection:f.projection,externalCheckpoint:checkpoint,
 });
 return {...f,prepared,checkpoint,draft};
}
test('S09 one explicit transaction publishes all source, attachment, and external values in ONE revision',async()=>{
 const f=await ready();
 const before=f.workspace.project,gen=f.workspace.generation;
 assert.equal(f.prepared.writerAuthorized,false);
 assert.equal(f.track.title,'Original audio');
 assert.equal(f.attachment.filename,'Font.ttf');
 assert.equal(f.audioRows[0].title,'Local override');
 assert.equal(f.subtitleRows[0].language,'eng');
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared),
  /EXPLICIT_CONFIRMATION_REQUIRED/);
 assert.equal(f.workspace.project,before);
 const receipt=applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true});
 assert.equal(receipt.status,'committed-both-domains');
 assert.equal(f.track.title,'Recovered source title');
 assert.equal(f.attachment.filename,'Recovered-Font.ttf');
 assert.equal(f.audioRows[0].title,'Original dub');
 assert.equal(f.subtitleRows[0].language,'zho');
 assert.equal(f.workspace.generation,gen+1,'one combined revision, no two-phase partial state');
 assert.notEqual(f.workspace.project,before);
 assert.equal(f.workspace.sourceSession.project,f.workspace.project);
 assert.equal(f.workspace.externalSession.project,f.workspace.project);
 assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).sameImmutableDocument,true);
 assert.equal(receipt.muxStarted,false);
 assert.equal(receipt.fileWritten,false);
 const inverse=undoAtomicWorkspaceRecovery(f.workspace,f.context,receipt.undo);
 assert.equal(inverse.status,'reverted-both-domains');
 assert.equal(f.track.title,'Original audio');
 assert.equal(f.attachment.filename,'Font.ttf');
 assert.equal(f.audioRows[0].title,'Local override');
 assert.equal(f.subtitleRows[0].language,'eng');
 assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).sameImmutableDocument,true);
});
test('S09 any stale external value rejects the whole replay without a source half-commit',async()=>{
 const f=await ready();
 const base=f.workspace.project;
 f.subtitleRows[0].language='deu'; // bypasses the domain
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true}),
  /EXTERNAL_DOMAIN_EXECUTOR_PROJECTION_DRIFT/);
 assert.equal(f.workspace.project,base);
 assert.equal(f.track.title,'Original audio');
 assert.equal(f.attachment.filename,'Font.ttf');
 assert.equal(f.audioRows[0].title,'Local override');
});
test('S09 any stale source row rejects before changing external rows or immutable document',async()=>{
 const f=await ready(),base=f.workspace.project;
 f.track.title='unreviewed other title';
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true}),
  /LIVE_TRACK_EXECUTOR_PROJECTION_DRIFT/);
 assert.equal(f.workspace.project,base);
 assert.equal(f.audioRows[0].title,'Local override');
 assert.equal(f.attachment.filename,'Font.ttf');
});
test('S09 newer accepted edit invalidates prepared dual replay without partial state',async()=>{
 const f=await ready(),base=f.workspace.project;
 commitLiveWorkspaceChange(f.workspace,{...f.context,kind:'external-tracks',changes:[
  {kind:'audio',index:0,field:'language',value:'jpn'},
 ]});
 assert.notEqual(f.workspace.project,base);
 const after=f.workspace.project;
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true}),
  /WORKSPACE_ATOMIC_PREPARED_STALE/);
 assert.equal(f.workspace.project,after);
 assert.equal(f.track.title,'Original audio');
});
test('S09 changed File reference and sidecar invalidate prepared replay',async()=>{
 const f=await ready(),before=f.workspace.project;
 f.subtitleRows[0].sidecarFile=blob('font.side','bytes');
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true}),
  /EXTERNAL_DOMAIN_SOURCE_CHANGED/);
 assert.equal(f.workspace.project,before);
 assert.equal(f.track.title,'Original audio');
});
test('S09 inverse requires exact project and rejects later edits; no partial undo',async()=>{
 const f=await ready();
 const applied=applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,{confirmed:true});
 commitLiveWorkspaceChange(f.workspace,{...f.context,kind:'external-tracks',changes:[
  {kind:'audio',index:0,field:'language',value:'jpn'},
 ]});
 const current=f.workspace.project;
 assert.throws(()=>undoAtomicWorkspaceRecovery(f.workspace,f.context,applied.undo),
   /WORKSPACE_ATOMIC_UNDO_STALE/);
 assert.equal(f.workspace.project,current);
 assert.equal(f.track.title,'Recovered source title');
 assert.equal(f.audioRows[0].title,'Original dub');
});
test('S09 bad imported external digest blocks PREPARE and cannot change either domain',async()=>{
 const f=fresh();
 const checkpoint=JSON.parse(await exportExternalMetadataCheckpoint(f.workspace,f.context));
 checkpoint.rows[0].sha256='0'.repeat(64);
 const imported=parseExternalMetadataCheckpoint(JSON.stringify(checkpoint));
 const draft=sourceDraft(f.projection);
 const before=f.workspace.project;
 await assert.rejects(prepareAtomicWorkspaceRecovery({workspace:f.workspace,
  context:f.context,sourceDraft:draft,sourceProof:proof,
  liveProjection:f.projection,externalCheckpoint:imported}),
  /EXTERNAL_CHECKPOINT_RESOURCE_DIGEST_MISMATCH/);
 assert.equal(f.workspace.project,before);
 assert.equal(f.track.title,'Original audio');
});
test('S09 both changes are mandatory: source-only and external-only reuse legacy individual recovery',async()=>{
 const f=fresh(),draft=sourceDraft(f.projection);
 const checkpoint=parseExternalMetadataCheckpoint(
  await exportExternalMetadataCheckpoint(f.workspace,f.context));
 await assert.rejects(prepareAtomicWorkspaceRecovery({workspace:f.workspace,
  context:f.context,sourceDraft:draft,sourceProof:proof,
  liveProjection:f.projection,externalCheckpoint:checkpoint}),
  /WORKSPACE_ATOMIC_EXTERNAL_HAS_NO_EDIT_DELTA/);
});

test('S09 final append-preserve-all switch cannot commit source half while restoring external',async()=>{
 const f=await ready(),old=f.workspace.project;
 assert.throws(()=>applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,
   {confirmed:true,appendMode:true}),/WORKSPACE_ATOMIC_SELECTIVE_MODE_REQUIRED/);
 assert.equal(f.workspace.project,old);
 assert.equal(f.track.title,'Original audio');
 assert.equal(f.audioRows[0].title,'Local override');
});
test('S09 accepted multi-owner transaction remains inversible after history compaction',async()=>{
 const f=await ready({priorHistory:96});
 const receipt=applyAtomicWorkspaceRecovery(f.workspace,f.context,f.prepared,
   {confirmed:true});
 assert.equal(f.track.title,'Recovered source title');
 assert.equal(f.audioRows[0].title,'Original dub');
 const inverse=undoAtomicWorkspaceRecovery(f.workspace,f.context,receipt.undo);
 assert.equal(inverse.status,'reverted-both-domains');
 assert.equal(f.track.title,'Original audio');
 assert.equal(f.audioRows[0].title,'Local override');
 assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).sameImmutableDocument,true);
});
