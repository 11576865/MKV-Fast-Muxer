import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { stageBrowserPrimarySource } from '../src/ffmpeg-browser-source-staging.js';
import { prepareResearchSeekHeadReattachment, preflightResearchOriginalAttachments } from './s12-reattach-seekhead-prototype.mjs';

const source=document.querySelector('#source');
const execute=document.querySelector('#execute');
const status=document.querySelector('#status');
const log=document.querySelector('#log');
const state={phase:'idle',error:null,evidence:null,preflight:null,wasmExitCode:null,
  wasmLogTail:[],sourceKind:null};
window.__s12WasmReattach=state;
let busy=false,outputUrl=null,sourceEpoch=0;
function assertCurrentSource(file,epoch){
 if(sourceEpoch!==epoch||source.files?.[0]!==file)
  throw Error('S12_SOURCE_FILE_CHANGED_DURING_EXECUTION');
}
function clearPreviousResult(){
 state.evidence=null;
 state.preflight=null;
 state.wasmExitCode=null;
 state.execArgs=null;
 if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null;}
}
function update(phase){
 state.phase=phase;
 status.textContent=state.error?phase+': '+state.error:phase;
 execute.disabled=busy||!source.files?.[0];
}
source.addEventListener('change',()=>{
 sourceEpoch+=1;
 clearPreviousResult();
 if(busy){
  state.error='S12_SOURCE_FILE_CHANGED_DURING_EXECUTION';
  update('source-changed-during-running');
 }else{
  state.error=null;
  update('source-selected');
 }
});
execute.addEventListener('click',async()=>{
 if(busy||!source.files?.[0])return;
 busy=true;state.error=null;state.evidence=null;
 state.wasmExitCode=null;state.wasmLogTail=[];state.sourceKind=null;state.preflight=null;
 const original=source.files[0];
 const boundEpoch=sourceEpoch;
 const checkSource=()=>assertCurrentSource(original,boundEpoch);
 const ffmpeg=new FFmpeg();
 const pushLog=value=>{
  const line=String(value||'').slice(0,1500);
  state.wasmLogTail.push(line);
  if(state.wasmLogTail.length>36)state.wasmLogTail.shift();
  log.textContent=state.wasmLogTail.slice(-14).join('\n');
 };
 const listener=({message})=>pushLog(message);
 ffmpeg.on('log',listener);
 let mounted=null;
 try{
  if(original.size<128*1024*1024)
   throw Error('S12_WASM_REATTACH_REQUIRES_LARGE_EXACT_FILE');
  update('preflight-original-source-tags-chapters-and-attachment-master');
  // Reject unsupported source graph BEFORE loading the Wasm engine.
  state.preflight=await preflightResearchOriginalAttachments(original);
  checkSource();
  update('load-local-ffmpeg-wasm');
  const base=new URL('ffmpeg-core/',window.location.origin+'/').href;
  const worker=new URL('ffmpeg-class-worker/worker.js',window.location.origin+'/').href;
  await ffmpeg.load({
   coreURL:base+'ffmpeg-core.js',
   wasmURL:base+'ffmpeg-core.wasm',
   classWorkerURL:worker,
  });
  checkSource();
  update('stage-original-with-workerfs');
  mounted=await stageBrowserPrimarySource({
   ffmpeg,file:original,prefix:'s12-byte-lane',
   fallbackPath:'/s12-full-original-should-not-be-written.mkv',
   workerFsType:FFFSType.WORKERFS,loadBytes:fetchFile
  });
  checkSource();
  if(mounted.kind!=='workerfs')
   throw Error('S12_WASM_REATTACH_NOT_WORKERFS');
  state.sourceKind=mounted.kind;
  // Original attachment streams deliberately excluded. Source is read
  // through File/WORKERFS, not materialized as a MEMFS input.
  await ffmpeg.writeFile('/s12-new.srt',new TextEncoder().encode(
   '1\n00:00:00,150 --> 00:00:01,250\nS12 verified independent WASM subtitle\n'
  ));
  update('ffmpeg-wasm-media-only-exec');
  const args=[
   '-hide_banner','-loglevel','error','-y',
   '-i',mounted.path,
   '-f','srt','-i','/s12-new.srt',
   '-map','0:v:0','-map','0:a:0','-map','1:s:0',
   '-map_metadata','-1','-map_chapters','-1',
   '-c','copy','-c:s','srt','/s12-media-without-original-attachments.mkv'
  ];
  state.execArgs=args.slice();
  const code=await ffmpeg.exec(args,180000);
  checkSource();
  state.wasmExitCode=code;
  if(code!==0)throw Error('S12_WASM_MEDIA_ONLY_MUX_FAILED_EXIT_'+code);
  update('read-FFmpeg-wasm-small-media-output');
  const data=await ffmpeg.readFile('/s12-media-without-original-attachments.mkv');
  checkSource();
  if(!(data instanceof Uint8Array)||data.length<1000||
      data.length>32*1024*1024)
   throw Error('S12_WASM_BASELINE_NOT_BOUNDED');
  const baseline=new Blob([data],{type:'video/x-matroska'});
  update('reinstate-original-attachments-using-browser-Blob-slice');
  const completed=await prepareResearchSeekHeadReattachment({
   original,remuxed:baseline
  });
  checkSource();
  if(completed.evidence.authorization!=='NONE_RESEARCH_ONLY')
   throw Error('S12_RESEARCH_HAS_UNEXPECTED_WRITE_AUTHORITY');
  state.evidence={...completed.evidence,
   sourceBytes:original.size,wasmBaselineBytes:baseline.size,
   sourceType:Object.prototype.toString.call(original),
   wasmExitCode:code,
   resultBytes:completed.blob.size,
  };
  checkSource();
  update('dispatch-real-browser-download');
  if(outputUrl)URL.revokeObjectURL(outputUrl);
  outputUrl=URL.createObjectURL(completed.blob);
  const a=document.createElement('a');
  a.href=outputUrl;a.download='s12-wasm-research-reattached.mkv';
  document.body.appendChild(a);a.click();a.remove();
  update('download-dispatched');
 }catch(error){
  clearPreviousResult();
  state.error=String(error?.message||error);
  update('failed');
  console.error('S12_WASM_REATTACH_REJECTED',error);
 }finally{
  try{await mounted?.cleanup()}catch{}
  try{await ffmpeg.terminate()}catch{}
  ffmpeg.off('log',listener);
  busy=false;
  execute.disabled=!source.files?.[0];
 }
});
window.addEventListener('pagehide',()=>{if(outputUrl)URL.revokeObjectURL(outputUrl)});
update('idle');
