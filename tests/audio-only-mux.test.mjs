import assert from 'node:assert/strict';
import test from 'node:test';
import * as identity from '../src/media-identity.js';
import {resolveMuxCompatibility,COMPATIBILITY_STATE} from '../src/compatibility.js';
import {resolveContainerCapabilities} from '../src/container-capabilities.js';
import {buildMuxCommand} from '../src/mux-command.js';
const audio={index:0,codec_type:'audio',codec_name:'flac'};
const observed=(format,streams)=>identity.videoIdentityFromProbe({name:'renamed.bin'}, {format:{format_name:format},streams});
test('single primary allows observed audio-only known containers while batch video identity remains false',()=>{
 assert.equal(typeof identity.isSupportedPrimaryMediaIdentity,'function');
 for(const format of ['matroska,webm','mov,mp4,m4a,3gp,3g2,mj2','webm']){
  const actual=observed(format,[audio]);
  assert.equal(identity.isSupportedPrimaryMediaIdentity(actual),true);
  assert.equal(identity.isSupportedVideoIdentity(actual),false);
 }
 for(const actual of [observed('unknown',[audio]),observed('matroska,webm',[]),observed('matroska,webm',[{codec_type:'subtitle',codec_name:'ass'}])])assert.equal(identity.isSupportedPrimaryMediaIdentity(actual),false);
 assert.equal(identity.isSupportedPrimaryMediaIdentity({container:'matroska',audioStreams:[audio]}),false,'requires actual probe');
});
test('audio-only compatibility is explicit and requires selected output audio',()=>{
 const args={videoStreams:[],sourceAudioStreams:[audio]};
 assert.equal(resolveMuxCompatibility(args).state,COMPATIBILITY_STATE.UNSUPPORTED,'batch default stays video-based');
 assert.equal(resolveMuxCompatibility({...args,allowAudioOnlySource:true}).state,COMPATIBILITY_STATE.DIRECT_COPY);
 assert.equal(resolveMuxCompatibility({allowAudioOnlySource:true,externalAudioTracks:[{codec:'flac'}]}).state,COMPATIBILITY_STATE.DIRECT_COPY);
 assert.equal(resolveMuxCompatibility({allowAudioOnlySource:true,newSubtitles:[{format:{id:'ass'}}]}).state,COMPATIBILITY_STATE.UNSUPPORTED);
});
test('capability offers checked audio-only mux but preserves source/risk gates',()=>{
 const args={hasSource:true,sourceContainer:'matroska',sourceInspected:true,hasAudio:true,preservationStatus:'clear'};
 assert.equal(resolveContainerCapabilities(args).mux.code,'RUNTIME_AUDIT_REQUIRED');
 assert.equal(resolveContainerCapabilities({...args,preservationStatus:'blocked'}).mux.code,'PRESERVATION_NOT_CLEARED');
 assert.equal(resolveContainerCapabilities({...args,hasAudio:false}).mux.status,'unsupported');
 assert.equal(resolveContainerCapabilities({...args,sourceInspected:false}).mux.code,'SOURCE_NOT_PROBED');
});
test('existing mux command maps actual audio/subtitle indices without fabricating video or encoding audio',()=>{
 const cmd=buildMuxCommand({mainInputPath:'audio.mka',outputPath:'out.mkv',sourceAudioCount:2,sourceSubtitleCount:0,
  originalAudioTracks:[{index:1,title:'Selected',language:'eng'}],newSubtitleTracks:[{path:'sub.ass',inputIndex:1,format:{id:'ass'}}]});
 assert.ok(cmd.includes('0:v?'));assert.ok(cmd.includes('0:1'));assert.ok(cmd.includes('1:0'));
 assert.ok(cmd.includes('-copyts'));assert.ok(cmd.includes('copy'));assert.equal(cmd.includes('-c:a'),false);
});
test('audio-only source timeline option protects audio even without subtitle streams',()=>{
 const cmd=buildMuxCommand({mainInputPath:'source.mka',outputPath:'out.mkv',preserveSourceTimeline:true,originalAudioTracks:[{index:0}]});
 assert.equal(cmd[0],'-copyts');assert.ok(cmd.includes('-avoid_negative_ts'));assert.ok(cmd.includes('disabled'));
});
