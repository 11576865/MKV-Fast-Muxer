import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContainerDocument} from '../src/container-document.js';
import {createLiveSourceTrackSession} from '../src/live-source-track-authority.js';
import {createLiveExternalAssetSession} from '../src/live-external-asset-authority.js';
import {
  createLiveWorkspaceAuthority,inspectLiveWorkspaceAuthority,
  commitLiveWorkspaceChange,
} from '../src/live-container-workspace-authority.js';

function fixture({withSource=true}={}) {
  const source={name:'series.mkv',size:2100,lastModified:44};
  const fileKey='series.mkv|2100|44';
  const stream=(index,codec_type,title,language)=>({
    index,codec_type,codec_name:codec_type==='audio'?'aac':codec_type==='video'?'h264':'ass',
    tags:{title,language},disposition:{default:0,forced:0,original:1},
  });
  const streams=[
    stream(0,'video','','und'),
    stream(1,'audio','Original audio','jpn'),
    stream(2,'subtitle','Original subtitle','zho'),
  ];
  const trackState={
    fileKey,streams,tracks:streams.slice(1).map(s=>({
      index:s.index,type:s.codec_type,stream:s,include:true,order:s.index,
      title:s.tags.title,language:s.tags.language,
      default:false,forced:false,original:true,commentary:false,
      hearingImpaired:false,originalTitle:s.tags.title,
      originalLanguage:s.tags.language,originalDefault:false,
      originalForced:false,originalOriginal:true,
      originalCommentary:false,originalHearingImpaired:false,
    })),attachments:[],chapters:[],format:{tags:{}},
  };
  const sourceSession=withSource?createLiveSourceTrackSession({
    source,trackState,projection:buildContainerDocument({video:source,trackState}),
  }):null;
  const files={
    audio:{name:'extra.flac',size:700,lastModified:5},
    subtitle:{name:'new.ass',size:300,lastModified:5},
    font:{name:'font.ttf',size:400,lastModified:5},
  };
  const audioRows=[{
    file:files.audio,title:'Extra audio',language:'eng',
    default:false,original:false,commentary:false,hearingImpaired:false,
  }];
  const subtitleRows=[{
    file:files.subtitle,sidecarFile:null,format:{label:'ASS',assLike:true},
    identity:null,title:'Extra subtitle',language:'zho',default:false,
    forced:false,original:false,commentary:false,hearingImpaired:false,
  }];
  const fonts=[files.font],mode='preserve';
  const externalSession=createLiveExternalAssetSession({
    audioRows,subtitleRows,fonts,fontMode:mode,
  });
  const workspace=createLiveWorkspaceAuthority({sourceSession,externalSession});
  const context={source,trackState,audioRows,subtitleRows,fonts,mode};
  const change=(kind,values)=>commitLiveWorkspaceChange(workspace,{
    ...context,kind,...values,
  });
  return {source,trackState,sourceSession,externalSession,workspace,
    audioRows,subtitleRows,fonts,context,change,files};
}

test('source and external edit adapters share exactly ONE live immutable ContainerProject',()=>{
  const f=fixture();
  const before=f.workspace.project;
  assert.equal(f.sourceSession.project,before);
  assert.equal(f.externalSession.project,before);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).sameImmutableDocument,true);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).sourceTrackCount,2);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).externalSubtitleCount,1);
  const first=f.change('source-tracks',{changes:[{index:1,field:'title',value:'New source'}]});
  assert.equal(first.writerAuthorized,false);
  assert.equal(f.trackState.tracks[0].title,'New source');
  assert.equal(f.sourceSession.project,f.externalSession.project);
  assert.notEqual(f.workspace.project,before);
  const sourceCommit=f.workspace.project;
  const second=f.change('external-tracks',{changes:[
    {kind:'subtitle',index:0,field:'title',value:'New subtitle'},
    {kind:'audio',index:0,field:'language',value:'jpn'},
  ]});
  assert.equal(second.workspaceGeneration,2);
  assert.equal(f.workspace.project,f.sourceSession.project);
  assert.equal(f.workspace.project,f.externalSession.project);
  assert.notEqual(f.workspace.project,sourceCommit);
  assert.equal(f.subtitleRows[0].title,'New subtitle');
  assert.equal(f.audioRows[0].language,'jpn');
  const names=f.workspace.project.objects.map(o=>o.attributes.title).filter(Boolean);
  assert.ok(names.includes('New source'));
  assert.ok(names.includes('New subtitle'));
  assert.equal(Object.isFrozen(f.workspace.project.objects),true);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).writerAuthorized,false);
});

test('a mutation to either surface refuses stale or direct-bypassed fields from the OTHER',()=>{
  const f=fixture(),before=f.workspace.project;
  f.audioRows[0].title='unsafe legacy bypass';
  assert.throws(()=>f.change('source-tracks',{changes:[
    {index:1,field:'title',value:'blocked'}
  ]}),/EXTERNAL_DOMAIN_EXECUTOR_PROJECTION_DRIFT/);
  assert.equal(f.trackState.tracks[0].title,'Original audio');
  assert.equal(f.workspace.project,before);
  f.audioRows[0].title='Extra audio';
  f.trackState.tracks[0].title='unsafe source bypass';
  assert.throws(()=>f.change('external-tracks',{changes:[
    {kind:'audio',index:0,field:'title',value:'blocked'}
  ]}),/LIVE_TRACK_EXECUTOR_PROJECTION_DRIFT/);
  assert.equal(f.audioRows[0].title,'Extra audio');
  assert.equal(f.workspace.project,before);
});

test('same-looking File replacement cannot inherit combined authoring authority',()=>{
  const f=fixture(),before=f.workspace.project;
  f.audioRows[0].file={...f.files.audio};
  assert.throws(()=>f.change('source-tracks',{changes:[
    {index:1,field:'language',value:'eng'}
  ]}),/EXTERNAL_DOMAIN_SOURCE_CHANGED/);
  assert.equal(f.workspace.project,before);
  assert.equal(f.trackState.tracks[0].language,'jpn');
});

test('font policy and source attachment editing dispatch through same project',()=>{
  const f=fixture();
  const font=f.change('font-mode',{
    previousMode:'preserve',nextMode:'force',
  });
  assert.equal(font.writerAuthorized,false);
  assert.equal(f.externalSession.mode,'force');
  assert.equal(f.workspace.project.objects.find(o=>o.id==='external-policy:font')
    .attributes.value,'force');
  const changed=inspectLiveWorkspaceAuthority(f.workspace,{...f.context,mode:'force'});
  assert.equal(changed.fontCount,1);
  assert.throws(()=>f.change('source-attachments',{changes:[
    {index:999,field:'include',value:false},
  ]}),/LIVE_ATTACHMENT_NOT_FOUND/);
  assert.equal(f.sourceSession.project,f.externalSession.project);
});

test('rebind strips old external objects, retains source revision values and needs fresh grants',()=>{
  const f=fixture();
  f.change('source-tracks',{changes:[{index:1,field:'title',value:'Kept source'}]});
  f.change('external-tracks',{changes:[{kind:'subtitle',index:0,field:'title',value:'Kept subtitle'}]});
  const old=f.workspace.project;
  const newerFont={...f.files.font};
  const rebound=createLiveExternalAssetSession({
    audioRows:f.audioRows,subtitleRows:f.subtitleRows,
    fonts:[newerFont],fontMode:'preserve',
  });
  const newer=createLiveWorkspaceAuthority({
    sourceSession:f.sourceSession,externalSession:rebound,
  });
  assert.notEqual(newer.project,old);
  assert.equal(newer.project.objects.filter(o=>o.id==='external-policy:font').length,1);
  assert.equal(newer.project.objects.find(o=>o.kind==='audio' &&
    o.id.startsWith('object:')).attributes.title,'Kept source');
  assert.equal(newer.project.objects.find(o=>o.id==='external-subtitle:0')
    .attributes.title,'Kept subtitle');
  assert.throws(()=>inspectLiveWorkspaceAuthority(newer,{
    ...f.context,fonts:f.fonts,
  }),/EXTERNAL_DOMAIN_INVENTORY_CHANGED/);
  assert.equal(inspectLiveWorkspaceAuthority(newer,{
    ...f.context,fonts:[newerFont],
  }).sameImmutableDocument,true);
});

test('external resource-only domain is valid but does not grant video-free writing',()=>{
  const f=fixture({withSource:false});
  assert.equal(f.workspace.project.sources.length,3);
  const receipt=f.change('external-tracks',{changes:[
    {kind:'subtitle',index:0,field:'forced',value:true},
  ]});
  assert.equal(receipt.singleDomainDocument,true);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).writerAuthorized,false);
  assert.equal(f.subtitleRows[0].forced,true);
});

test('all domains retain one immutable revision under sustained edits/history compaction',()=>{
  const f=fixture();
  for(let i=1;i<=115;i++){
    f.change(i%2?'source-tracks':'external-tracks',i%2?
      {changes:[{index:1,field:'title',value:'S'.repeat(i)}]}:
      {changes:[{kind:'subtitle',index:0,field:'title',value:'X'.repeat(i)}]});
  }
  assert.equal(f.sourceSession.project,f.workspace.project);
  assert.equal(f.externalSession.project,f.workspace.project);
  assert.ok(f.workspace.project.history.length<=85);
  assert.equal(inspectLiveWorkspaceAuthority(f.workspace,f.context).generation,115);
});
