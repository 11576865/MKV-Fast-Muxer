/**
 * Batch Recipe v2: portable, inspect-only job metadata with explicit per-File
 * rebind/review, not a serialized JobPlan or a grant to write output.
 * The ONLY execution path is the existing frozen job plan after fresh pairing,
 * safety/identity preflight, output collision checks and explicit start.
 */
import {fileIdentity} from './batch.js';
import {buildBatchRecipe} from './batch-recipe.js';

export const BATCH_RECIPE_V2_SCHEMA='batch-recipe-v2';
export const BATCH_RECIPE_V2_MAX_BYTES=128*1024;
const META=['title','language','default','forced','original','commentary','hearingImpaired'];
const BOOL=new Set(META.filter(field=>!['title','language'].includes(field)));
const plain=value=>value!==null && typeof value==='object' &&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const immutable=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(immutable);Object.freeze(value);
  }
  return value;
};
const own=(obj,allowed)=>plain(obj)&&Object.keys(obj).every(k=>allowed.includes(k));
const noControls=value=>!/[\u0000-\u001f\u007f]/.test(value);
function metadata(source) {
  if(!own(source,META)||META.some(k=>!(k in source)))
    throw Error('RECIPE_V2_METADATA_SHAPE');
  const result={};
  for(const key of META){
    const value=source[key];
    if(BOOL.has(key)) {
      if(typeof value!=='boolean')throw Error('RECIPE_V2_METADATA_BOOLEAN');
    } else if(typeof value!=='string'||!noControls(value)||
        value.length>(key==='title'?160:35)||
        key==='language'&&!/^[A-Za-z0-9_-]{2,35}$/.test(value))
      throw Error('RECIPE_V2_METADATA_TEXT');
    result[key]=value;
  }
  return result;
}
const safeIdentity=value=>typeof value==='string'&&value.length>0&&
  value.length<=600&&noControls(value);
function validateTasks(tasks){
  if(!Array.isArray(tasks)||tasks.length>200)throw Error('RECIPE_V2_TASK_BUDGET');
  const seenSources=new Set();
  return tasks.map(task=>{
    if(!own(task,['sourceKey','subtitles'])||!safeIdentity(task.sourceKey)||
        !Array.isArray(task.subtitles)||!task.subtitles.length||
        task.subtitles.length>30||seenSources.has(task.sourceKey))
      throw Error('RECIPE_V2_TASK_IDENTITY');
    seenSources.add(task.sourceKey);
    const seen=new Set();
    return {sourceKey:task.sourceKey,subtitles:task.subtitles.map(row=>{
      if(!own(row,['fileKey','metadata'])||!safeIdentity(row.fileKey)||
          seen.has(row.fileKey))throw Error('RECIPE_V2_SUBTITLE_IDENTITY');
      seen.add(row.fileKey);
      return {fileKey:row.fileKey,metadata:metadata(row.metadata)};
    })};
  });
}
export function buildBatchRecipeV2({title='分集字幕配方',note='',policy,tasks=[]}={}){
  const old=buildBatchRecipe({title,note,policy});
  const valid=validateTasks(tasks);
  return immutable({
    schema:BATCH_RECIPE_V2_SCHEMA,title:old.title,note:old.note,
    recipeKind:'episode-subtitle-review',
    policy:old.policy,
    tasks:valid,
    sourceBindings:'must-reselect-and-review',
    outputDirectoryPermission:'not-exported',
    reviewRequired:true,savedArtifacts:'not-included',
  });
}
export function stringifyBatchRecipeV2(recipe){
  return JSON.stringify(parseBatchRecipeV2(JSON.stringify(recipe)),null,2)+'\n';
}
export function parseBatchRecipeV2(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>BATCH_RECIPE_V2_MAX_BYTES)
    throw Error('RECIPE_V2_TOO_LARGE');
  let input;try{input=JSON.parse(text);}catch{throw Error('RECIPE_V2_JSON_INVALID')}
  if(!own(input,['schema','title','note','recipeKind','policy','tasks',
      'sourceBindings','outputDirectoryPermission','reviewRequired','savedArtifacts'])||
    input.schema!==BATCH_RECIPE_V2_SCHEMA||
    input.recipeKind!=='episode-subtitle-review'||
    input.sourceBindings!=='must-reselect-and-review'||
    input.outputDirectoryPermission!=='not-exported'||
    input.reviewRequired!==true||
    input.savedArtifacts!=='not-included')
    throw Error('RECIPE_V2_SCHEMA_UNSUPPORTED');
  return buildBatchRecipeV2(input);
}
export function buildBatchRecipeV2FromPairing(pairing,policy) {
  const tasks=(pairing?.jobs||[]).filter(job=>job.subtitleTracks?.length)
    .map(job=>({
      sourceKey:fileIdentity(job.video),
      subtitles:job.subtitleTracks.map(track=>({
        fileKey:fileIdentity(track.file),
        metadata:metadata(Object.fromEntries(META.map(field=>[
          field,field==='title' ? String(track.title||'') :
            field==='language' ? String(track.language||'und') :
            Boolean(track[field]),
        ]))),
      })),
    }));
  return buildBatchRecipeV2({policy,tasks});
}
/**
 * Exact current pairing has to be fully mapped. Metadata-only fileIdentity
 * strings are review hints, not content proofs. A human must confirm them.
 */
export function reviewBatchRecipeV2(recipe,pairing){
  const parsed=parseBatchRecipeV2(JSON.stringify(recipe));
  const jobs=pairing?.jobs||[];
  if(!parsed.tasks.length)return immutable({
    status:'rules-only',matchedJobs:0,matchedSubtitles:0,ready:false,
    issues:['配方没有逐任务覆盖数据'],executionAuthorized:false,
  });
  const existingSources=new Map();
  for(const job of jobs){
    const key=fileIdentity(job.video);
    if(existingSources.has(key))return immutable({
      status:'ambiguous',matchedJobs:0,matchedSubtitles:0,ready:false,
      issues:['当前来源视频身份键重复；不能批准配方'],executionAuthorized:false,
    });
    existingSources.set(key,job);
  }
  const issues=[],matches=[];
  if(parsed.tasks.length!==jobs.length)
    issues.push('任务集合数量不同；必须重新选择所有来源并重新配对');
  for(const task of parsed.tasks){
    const job=existingSources.get(task.sourceKey);
    if(!job){issues.push('来源未找到：'+task.sourceKey);continue;}
    const actual=new Map();
    for(const track of job.subtitleTracks||[]){
      const key=fileIdentity(track.file);
      if(actual.has(key))issues.push('同一任务内字幕身份重复：'+key);
      actual.set(key,track);
    }
    if(actual.size!==task.subtitles.length)
      issues.push('任务字幕集合数量不符：'+task.sourceKey);
    const sources=[];
    for(const entry of task.subtitles){
      const track=actual.get(entry.fileKey);
      if(!track){issues.push('字幕未找到：'+entry.fileKey);continue;}
      sources.push({file:track.file,metadata:entry.metadata});
    }
    matches.push({video:job.video,subtitles:sources});
  }
  const ready=issues.length===0&&matches.length===jobs.length&&
    !pairing?.ambiguousPairings?.length&&!pairing?.outputNameCollisions?.length&&
    !pairing?.invalidSubtitles?.length;
  if(!ready&&!issues.length)issues.push('当前配对或输出仍存在待审核项目');
  return {
    status:ready?'awaiting-explicit-confirmation':'blocked',
    matchedJobs:matches.length,
    matchedSubtitles:matches.reduce((n,x)=>n+x.subtitles.length,0),
    ready,issues:Object.freeze(issues),executionAuthorized:false,
    // Ephemeral reference-bound review target; NEVER serialize these File refs.
    __currentPairing:pairing,__matched:Object.freeze(matches),
  };
}
export function approveBatchRecipeV2(review,pairing){
  if(!review?.ready||review.__currentPairing!==pairing)
    throw Error('RECIPE_V2_REVIEW_NOT_CURRENT');
  const approved=new Map();
  for(const match of review.__matched) {
    const byTrack=new Map();
    for(const row of match.subtitles)byTrack.set(row.file,Object.freeze({...row.metadata}));
    approved.set(match.video,byTrack);
  }
  return approved;
}
export function setBatchTaskOverride(overrides,{job,track,field,value}={}){
  if(!(overrides instanceof Map)||!job?.video||
      !job.subtitleTracks?.some(row=>row.file===track?.file)||
      !META.includes(field))
    throw Error('RECIPE_V2_EDITOR_TARGET_INVALID');
  const before=new Map(overrides.get(job.video)||[]);
  const source=before.get(track.file)||Object.fromEntries(META.map(k=>[
    k,k==='title'?String(track.title||''):k==='language'?
      String(track.language||'und'):Boolean(track[k]),
  ]));
  const next=metadata({...source,[field]:value});
  before.set(track.file,Object.freeze(next));
  const updated=new Map(overrides);
  updated.set(job.video,before);
  return updated;
}
export function applyBatchTaskOverrides(pairing,overrides){
  if(!(overrides instanceof Map))throw Error('RECIPE_V2_OVERRIDES_INVALID');
  const jobs=pairing.jobs.map(job=>{
    const changes=overrides.get(job.video);
    if(!changes)return job;
    for(const file of changes.keys()) {
      if(!job.subtitleTracks?.some(track=>track.file===file))
        throw Error('RECIPE_V2_STALE_TRACK_BINDING');
    }
    return {...job,subtitleTracks:job.subtitleTracks.map(track=>changes.has(track.file)
      ? {...track,...metadata(changes.get(track.file))}:track)};
  });
  return {...pairing,jobs};
}
