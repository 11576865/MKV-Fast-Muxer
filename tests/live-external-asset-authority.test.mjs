import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveExternalAssetSession,commitLiveExternalAssetChanges,
  commitExternalFontMode,inspectLiveExternalAssets,
} from '../src/live-external-asset-authority.js';

function fixture() {
  const file=(name)=>({name,size:1200,lastModified:44});
  const audioFile=file('japanese.flac');
  const subtitleFile=file('zh.ass');
  const sidecarFile=file('zh.assfonts.zip');
  const fontFile=file('font.ttf');
  const audio=[{file:audioFile,title:'Japanese',language:'jpn',
    default:false,original:false,commentary:false,hearingImpaired:false}];
  const subtitle=[{file:subtitleFile,sidecarFile,
    format:{label:'ASS',assLike:true},identity:{kind:'ass'},
    title:'Chinese',language:'zho',default:true,forced:false,
    original:false,commentary:false,hearingImpaired:false}];
  const fonts=[fontFile];
  const session=createLiveExternalAssetSession({
    audioRows:audio,subtitleRows:subtitle,fonts,fontMode:'preserve',
  });
  const base=(mode='preserve')=>({
    audioRows:audio,subtitleRows:subtitle,fonts,mode,
  });
  const commit=(changes,mode='preserve')=>commitLiveExternalAssetChanges(
    session,{...base(mode),changes});
  return {audio,subtitle,fonts,session,base,commit,files:{audioFile,subtitleFile,sidecarFile,fontFile}};
}
const edit=(kind,index,field,value)=>({kind,index,field,value});

test('real external audio and subtitle edits are immutable domain revisions projected to legacy writer',()=>{
  const f=fixture(),before=f.session.project;
  const r=f.commit([edit('audio',0,'title','Alternate Japanese'),
    edit('audio',0,'commentary',true),
    edit('subtitle',0,'forced',true),
    edit('subtitle',0,'language','eng')]);
  assert.equal(r.updatedObjects,2);
  assert.equal(r.changedFields,4);
  assert.equal(r.fileWritten,false);
  assert.equal(r.writerAuthorized,false);
  assert.notEqual(f.session.project,before);
  assert.equal(Object.isFrozen(f.session.project.objects),true);
  assert.equal(f.audio[0].title,'Alternate Japanese');
  assert.equal(f.audio[0].commentary,true);
  assert.equal(f.subtitle[0].forced,true);
  assert.equal(f.subtitle[0].language,'eng');
  const objects=f.session.project.objects;
  assert.equal(objects.find(o=>o.kind==='audio').attributes.title,'Alternate Japanese');
  assert.equal(objects.find(o=>o.kind==='subtitle').attributes.language,'eng');
  assert.equal(objects.find(o=>o.kind==='audio').sourceId!==null,true);
  assert.equal(objects.find(o=>o.kind==='attachment').attributes.name,'font.ttf');
  assert.equal(objects.find(o=>o.kind==='metadata').attributes.value,'preserve');
  assert.equal(f.audio[0].file,f.files.audioFile);
  assert.equal(f.subtitle[0].sidecarFile,f.files.sidecarFile);
});

test('mixed invalid external metadata edit never commits an earlier valid edit',()=>{
  const f=fixture(),state=JSON.stringify([f.audio[0].title,f.subtitle[0].title]);
  const before=f.session.project;
  assert.throws(()=>f.commit([
    edit('audio',0,'title','Would be applied'),
    edit('subtitle',0,'language','bad value!'),
  ]),/EXTERNAL_DOMAIN_TEXT_INVALID/);
  assert.throws(()=>f.commit([
    edit('audio',0,'title','Would be applied'),
    edit('audio',0,'forced',true),
  ]),/EXTERNAL_DOMAIN_FIELD_UNSUPPORTED/);
  assert.throws(()=>f.commit([
    edit('audio',0,'title','Would be applied'),
    edit('subtitle',7,'title','Fake'),
  ]),/EXTERNAL_DOMAIN_TARGET_NOT_FOUND/);
  assert.equal(JSON.stringify([f.audio[0].title,f.subtitle[0].title]),state);
  assert.equal(f.session.project,before);
  assert.equal(f.session.generation,0);
});

test('a replacement File with identical display identity cannot inherit previous editor authority',()=>{
  const f=fixture(),replacement={...f.audio[0].file};
  f.audio[0].file=replacement;
  assert.throws(()=>f.commit([edit('audio',0,'title','Wrong')]),
    /EXTERNAL_DOMAIN_SOURCE_CHANGED/);
  assert.equal(f.audio[0].title,'Japanese');
  f.audio[0].file=f.files.audioFile;
  f.subtitle[0].sidecarFile={...f.files.sidecarFile};
  assert.throws(()=>f.commit([edit('subtitle',0,'title','Wrong')]),
    /EXTERNAL_DOMAIN_SOURCE_CHANGED/);
  assert.equal(f.session.generation,0);
});

test('legacy bypass and mutable subtitle identity drift are refused',()=>{
  const f=fixture();
  f.audio[0].title='untrusted bypass';
  assert.throws(()=>f.commit([edit('subtitle',0,'default',false)]),
    /EXTERNAL_DOMAIN_EXECUTOR_PROJECTION_DRIFT/);
  f.audio[0].title='Japanese';
  f.subtitle[0].identity={kind:'ass'};
  assert.throws(()=>f.commit([edit('audio',0,'default',true)]),
    /EXTERNAL_DOMAIN_SOURCE_CHANGED/);
});

test('font selection stays exact File inventory and font policy is domain-owned',()=>{
  const f=fixture(),initial=f.session.project;
  const mode=commitExternalFontMode(f.session,{
    audioRows:f.audio,subtitleRows:f.subtitle,fonts:f.fonts,
    previousMode:'preserve',nextMode:'force',
  });
  assert.equal(mode.status,'font-mode-domain-committed');
  assert.notEqual(f.session.project,initial);
  assert.equal(f.session.mode,'force');
  assert.equal(f.session.project.objects.find(o=>o.id==='external-policy:font')
    .attributes.value,'force');
  assert.equal(inspectLiveExternalAssets(f.session,f.base('force')).fontInventoryCount,1);
  const before=f.session.project;
  assert.throws(()=>commitExternalFontMode(f.session,{
    audioRows:f.audio,subtitleRows:f.subtitle,fonts:f.fonts,
    previousMode:'force',nextMode:'invalid',
  }),/EXTERNAL_DOMAIN_MODE_INVALID/);
  assert.equal(f.session.project,before);
  f.fonts[0]={...f.files.fontFile};
  assert.throws(()=>f.commit([edit('audio',0,'title','Refused')],'force'),
    /EXTERNAL_DOMAIN_INVENTORY_CHANGED/);
});

test('no-op does not create revision, and 150 typed title characters are bounded',()=>{
  const f=fixture();const project=f.session.project;
  assert.equal(f.commit([edit('audio',0,'title','Japanese')]).status,'no-change');
  assert.equal(f.session.project,project);
  for(let i=1;i<=150;i++)
    f.commit([edit('audio',0,'title','X'.repeat(i))]);
  const report=inspectLiveExternalAssets(f.session,f.base());
  assert.equal(report.generation,150);
  assert.equal(report.project.history.length<=85,true);
  assert.equal(f.audio[0].title,'X'.repeat(150));
  assert.equal(report.sourceAudioCount,1);
  assert.equal(report.sourceSubtitleCount,1);
  assert.equal(report.fontMode,'preserve');
  assert.equal(report.sourcesByteVerified,false);
  assert.equal(report.resourceOnlyWriting,false);
});

test('external resource domain can exist without any source video or resource assets',()=>{
  const state=createLiveExternalAssetSession({fontMode:'preserve'});
  const snapshot=inspectLiveExternalAssets(state,{
    audioRows:[],subtitleRows:[],fonts:[],mode:'preserve',
  });
  assert.equal(snapshot.project.sources.length,0);
  assert.deepEqual(snapshot.project.objects.map(o=>o.kind),['metadata']);
  assert.equal(snapshot.resourceOnlyWriting,false);
  assert.equal(snapshot.writerAuthorized,false);
});

test('reselection rebind is explicit and never merges same-named old File references',()=>{
  const f=fixture();
  const replacementAudio={...f.audio[0].file};
  const successor=[{...f.audio[0],file:replacementAudio,title:'Fresh'}];
  const next=createLiveExternalAssetSession({
    audioRows:successor,subtitleRows:f.subtitle,fonts:f.fonts,fontMode:'preserve',
  });
  const receipt=commitLiveExternalAssetChanges(next,{
    audioRows:successor,subtitleRows:f.subtitle,fonts:f.fonts,mode:'preserve',
    changes:[edit('audio',0,'title','Fresh after rebind')],
  });
  assert.equal(receipt.updatedObjects,1);
  assert.equal(f.audio[0].title,'Japanese');
  assert.equal(successor[0].title,'Fresh after rebind');
  assert.equal(f.session.project.objects.find(o=>o.kind==='audio').attributes.title,'Japanese');
});
