/** Current-session control of safe boundaries; no File grants, mux or DOM. */
export function createBatchRunControl(onChange=()=>{}) {
 let phase='running',wake=null,next=null;
 const events=[];
 const note=()=>{
  events.push(Object.freeze({phase,at:new Date().toISOString(),nextJobId:next?.jobId||null}));
  if(events.length>200)events.shift();
  onChange();
 };
 const release=()=>{const resolve=wake;wake=null;resolve?.();};
 const set=value=>{phase=value;note();release();};
 return Object.freeze({
  get phase(){return phase;},
  pause(){if(phase==='running')set('pause-requested');},
  resume(){if(['pause-requested','paused'].includes(phase))set('running');},
  stop(){if(!['finished','cancelled'].includes(phase))set('stop-requested');},
  cancel(){if(phase!=='finished')set('cancelled');},
  finish(){set('finished');},
  snapshot(){return Object.freeze({phase,nextJobId:next?.jobId||null,
   nextOutputName:next?.outputName||'',events:Object.freeze([...events])});},
  async beforeNextJob(job){
   if(wake)throw Error('批量队列不能同时等待两个任务边界');
   next={jobId:job.jobId,outputName:job.outputName};
   if(phase==='pause-requested'){
    phase='paused';
    // Install before notifying: an immediate Resume/Stop cannot miss its wakeup.
    const wait=new Promise(resolve=>{wake=resolve;});note();await wait;
   }
   next=null;
   return ['stop-requested','cancelled','finished'].includes(phase)?'stop':'continue';
  },
 });
}
