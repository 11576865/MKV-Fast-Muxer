import test from 'node:test';
import assert from 'node:assert/strict';
import * as shelfModule from '../src/source-draft-shelf.js';
import {buildContainerDocument} from '../src/container-document.js';
import {createLiveSourceTrackSession,commitLiveSourceTrackChanges} from '../src/live-source-track-authority.js';
const fixture=name=>{
 const source={name,size:10,lastModified:1};
 const stream={index:1,codec_type:'audio',codec_name:'aac',tags:{title:'Original',language:'eng'},disposition:{}};
 const track={index:1,type:'audio',stream,order:1,include:true,title:'Original',language:'eng',
  default:false,forced:false,original:false,commentary:false,hearingImpaired:false};
 const trackState={fileKey:`${name}|10|1`,streams:[stream],tracks:[track],attachments:[],chapters:[],format:{tags:{}}};
 const session=createLiveSourceTrackSession({source,trackState,projection:buildContainerDocument({video:source,trackState})});
 return {source,trackState,session};
};
test('A and B drafts preserve their existing validated authority and take only exact File identities',()=>{
 assert.equal(typeof shelfModule.createSourceDraftShelf,'function');
 const shelf=shelfModule.createSourceDraftShelf(),a=fixture('A.mkv'),b=fixture('B.mkv');
 commitLiveSourceTrackChanges(a.session,{source:a.source,trackState:a.trackState,changes:[{index:1,field:'title',value:'Authored A'}]});
 shelf.remember({...a,appendMode:false,preserveAttachments:true,userTouched:true});
 shelf.remember({...b,appendMode:true,preserveAttachments:false,userTouched:false});
 assert.equal(shelf.take({...a.source}),null);
 const restored=shelf.take(a.source);
 assert.equal(restored.trackState.tracks[0].title,'Authored A');
 assert.equal(restored.session,a.session);assert.equal(restored.appendMode,false);
 assert.equal(shelf.take(a.source),null,'active state is removed from inactive shelf');
 assert.equal(shelf.take(b.source).session,b.session);
});
test('mutated executor projection cannot be stored or restored as new authority',()=>{
 assert.equal(typeof shelfModule.createSourceDraftShelf,'function');
 const shelf=shelfModule.createSourceDraftShelf(),a=fixture('A.mkv');
 a.trackState.tracks[0].title='bypass';
 assert.throws(()=>shelf.remember({...a}),/PROJECTION_DRIFT/);
 a.trackState.tracks[0].title='Original';shelf.remember({...a});
 a.trackState.tracks[0].title='later bypass';
 assert.throws(()=>shelf.take(a.source),/PROJECTION_DRIFT/);
});
test('dropping removed File eliminates its cached draft without affecting another File',()=>{
 assert.equal(typeof shelfModule.createSourceDraftShelf,'function');
 const shelf=shelfModule.createSourceDraftShelf(),a=fixture('A.mkv'),b=fixture('B.mkv');
 shelf.remember({...a});shelf.remember({...b});shelf.drop(a.source);
 assert.equal(shelf.take(a.source),null);assert.equal(shelf.take(b.source).source,b.source);
});
