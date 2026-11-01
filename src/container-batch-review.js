export const MAX_CONTAINER_REVIEW_SOURCES=100;
const copy=value=>JSON.parse(JSON.stringify(value));
const sourceFacts=file=>Object.freeze({name:file.name,size:file.size,lastModified:file.lastModified});
export function containerObservationReport(raw,{attachments=null,preservation=null}={}){
 if(!raw||!Array.isArray(raw.streams))throw Error('CONTAINER_OBSERVATION_REQUIRED');
 return copy({schema:'softmux-container-observation-v1',streams:raw.streams,
  chapters:Array.isArray(raw.chapters)?raw.chapters:[],format:raw.format||null,
  attachmentInventory:attachments,preservationObservation:preservation,
  claims:{decoding:'not-tested',wholeFileIntegrity:'not-hashed',attachmentPayloads:'not-hashed',
   writerAdmission:'not-evaluated',remux:'not-performed',wholeEbmlTree:'not-verified',chapterUids:'ffprobe-observation-not-exact-uid-proof'}});
}
// Separate from the mux queue: an observation never becomes a generated MKV,
// a saved artifact, a writer permission or a change to a single-source draft.
export async function runContainerBatchReview(files,{inspect,shouldCancel=()=>false,isCurrent=()=>true,onUpdate=()=>{},runId=globalThis.crypto.randomUUID()}={}){
 const sources=Object.freeze(Array.from(files||[]));
 if(!sources.length||sources.length>MAX_CONTAINER_REVIEW_SOURCES||typeof inspect!=='function'||
   sources.some(f=>!f||typeof f.name!=='string'||!Number.isSafeInteger(f.size)||f.size<0))throw Error('CONTAINER_REVIEW_INPUT_INVALID');
 const rows=sources.map((file,index)=>({id:runId+':'+index,source:sourceFacts(file),state:'queued',observation:null,error:''}));
 const snapshot=()=>rows.map(row=>copy(row));
 let cancelled=false,interrupted=false;
 onUpdate(snapshot());
 for(let index=0;index<sources.length;index++){
  const row=rows[index];
  if(shouldCancel()||!isCurrent()){
   cancelled=shouldCancel();interrupted=!isCurrent();
   row.state=interrupted?'interrupted':'cancelled';break;
  }
  row.state='inspecting';onUpdate(snapshot());
  try{
   const observed=await inspect(sources[index],index);
   if(shouldCancel()||!isCurrent()){
    cancelled=shouldCancel();interrupted=!isCurrent();
    row.state=interrupted?'interrupted':'cancelled';break;
   }
   const observation=observed?.schema==='softmux-container-observation-v1'
     ? observed : containerObservationReport(observed);
   if(!Array.isArray(observation.streams))throw Error('CONTAINER_OBSERVATION_REQUIRED');
   row.observation=copy(observation);
   row.state=observation.partial?'partial':'inspected';
  }catch(error){
   if(shouldCancel()||!isCurrent()){
    cancelled=shouldCancel();interrupted=!isCurrent();row.state=interrupted?'interrupted':'cancelled';break;
   }
   row.state='failed';row.error=error?.message||String(error);
  }
  onUpdate(snapshot());
 }
 for(const row of rows)if(row.state==='queued')row.state='notRun';
 const result={schema:'softmux-container-review-batch-v1',operation:'read-only-container-review',runId,
  cancelled,interrupted,rows:snapshot(),claims:{remux:'not-performed',reportPersistence:'download-not-confirmed'}};
 onUpdate(result.rows);
 return Object.freeze(result);
}
