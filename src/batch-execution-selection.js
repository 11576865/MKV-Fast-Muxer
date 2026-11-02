/** Session-only execution choices, never a File/recipe/writer permission. */
export function createBatchExecutionSelection(){
 let entries=new Map(),revision=0;
 const same=(a,b)=>a.video===b.video&&a.outputName===b.outputName&&
  a.files.length===(b.subtitleInputFiles||[]).length&&a.files.every((f,i)=>f===b.subtitleInputFiles[i]);
 const get=job=>{const e=entries.get(job?.video);if(!e||!same(e,job))throw Error('任务文件绑定已变化，请重新审核');return e;};
 const chosen=jobs=>jobs.filter(job=>get(job).included);
 return Object.freeze({
  get revision(){return revision;},
  reconcile(jobs){
   const next=new Map();let changed=jobs.length!==entries.size;
   for(const job of jobs){
    if(!job.video||!job.outputName||next.has(job.video))throw Error('批量选择存在重复或无效任务绑定');
    const prior=entries.get(job.video),valid=prior&&same(prior,job);
    if(!valid)changed=true;
    next.set(job.video,valid?prior:{video:job.video,outputName:job.outputName,files:[...(job.subtitleInputFiles||[])],included:true});
   }
   entries=next;if(changed)revision++;
  },
  included:job=>get(job).included,
  count:jobs=>chosen(jobs).length,
  set(job,value){if(typeof value!=='boolean')throw Error('任务选择必须为布尔值');const e=get(job);if(e.included!==value){e.included=value;revision++;}},
  setAll(jobs,value){if(typeof value!=='boolean')throw Error('任务选择必须为布尔值');const list=jobs.map(get);if(list.some(e=>e.included!==value)){list.forEach(e=>e.included=value);revision++;}},
  invert(jobs){const list=jobs.map(get);list.forEach(e=>e.included=!e.included);if(list.length)revision++;},
  project(pairing){
   const jobs=chosen(pairing.jobs||[]);if(!jobs.length)throw Error('请至少选择一个批量任务');
   const videos=new Set(jobs.map(j=>j.video)),names=new Set(jobs.map(j=>j.outputName));
   return {...pairing,jobs,
    outputNameCollisions:(pairing.outputNameCollisions||[]).filter(c=>c.videos.filter(v=>videos.has(v)).length>1),
    directoryConflicts:(pairing.directoryConflicts||[]).filter(name=>names.has(name))};
  },
 });
}
