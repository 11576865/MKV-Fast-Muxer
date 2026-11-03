import { prepareResearchSeekHeadReattachment } from './s12-reattach-seekhead-prototype.mjs';
const original=document.querySelector('#originalFile');
const remuxed=document.querySelector('#remuxedFile');
const run=document.querySelector('#run');
const result=document.querySelector('#result');
let lastUrl=null;
const state={stage:'waiting',evidence:null,error:null};
window.__s12BrowserByteLane=state;
function update(){
 run.disabled=!(original.files?.[0]&&remuxed.files?.[0])||state.stage==='working';
 result.textContent=state.stage+(state.error?': '+state.error:'');
}
original.addEventListener('change',update);
remuxed.addEventListener('change',update);
run.addEventListener('click',async()=>{
 if(run.disabled)return;
 state.stage='working';state.evidence=null;state.error=null;update();
 try{
  const a=original.files[0],b=remuxed.files[0];
  // The inputs are actual browser File objects; no arrayBuffer() over the
  // entire original, no fs access, no indirect candidate product write grant.
  const candidate=await prepareResearchSeekHeadReattachment({
   original:a,remuxed:b
  });
  if(candidate.evidence.authorization!=='NONE_RESEARCH_ONLY')
   throw Error('RESEARCH_PROTOTYPE_UNEXPECTED_AUTHORITY');
  state.evidence={...candidate.evidence,
   originalBytes:a.size,remuxedBytes:b.size,
   outputBytes:candidate.blob.size,
   sourceKind:Object.prototype.toString.call(a),
   browserUserAgent:navigator.userAgent,
  };
  if(lastUrl)URL.revokeObjectURL(lastUrl);
  lastUrl=URL.createObjectURL(candidate.blob);
  const link=document.createElement('a');
  link.href=lastUrl;link.download='s12-browser-research-reattached.mkv';
  document.body.appendChild(link);
  link.click();link.remove();
  state.stage='download-dispatched';update();
 }catch(error){
  state.error=String(error?.message||error);state.stage='failed';update();
  console.error('S12_BROWSER_REATTACH_REJECTED',error);
 }
});
window.addEventListener('pagehide',()=>{if(lastUrl)URL.revokeObjectURL(lastUrl)});
update();
