import { inferredSubtitleMetadata } from './subtitle-format.js';

/**
 * Portable BatchRecipe v2: declarative per-output subtitle metadata,
 * never a File grant, executable JobPlan, historical output, or directory.
 * A reselected/current media pairing must be checked and then explicitly
 * accepted BEFORE its per-job deltas can reach freezeBatchJobPlan.
 */
export const BATCH_RECIPE_V2_SCHEMA='batch-recipe-v2';
export const BATCH_RECIPE_V2_MAX_BYTES=128*1024;
const plain=v=>v!==null&&typeof v==='object' &&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
const POLICY_FIELDS=['preserveAttachments','subsetEnabled','subsetScope'];
const SUBTITLE_FIELDS=['title','language','default','forced','original','commentary','hearingImpaired'];
const RULE_KEYS=['fileName','sidecarName','formatId',...SUBTITLE_FIELDS];
const TEMPLATE_KEYS=['sourceName','outputName','subtitleRules'];
const RECIPE_KEYS=[
  'schema','title','note','recipeKind','policy','jobs','sourceBindings',
  'directoryPermission','reviewRequired','savedArtifacts',
];
function exactKeys(obj,allowed) {
  return plain(obj)&&Object.keys(obj).every(k=>allowed.includes(k)) &&
    Object.keys(obj).length===allowed.length &&
    allowed.every(k=>Object.prototype.hasOwnProperty.call(obj,k));
}
function textField(value,max,{empty=false}={}) {
  return typeof value==='string'&&value.length<=max &&
    (empty||value.length>0) && !/[\u0000-\u001f\u007f]/.test(value);
}
function validMeta(row) {
  if(!exactKeys(row,RULE_KEYS) ||
      !textField(row.fileName,255) ||
      !textField(row.sidecarName,255,{empty:true}) ||
      !textField(row.formatId,48,{empty:true}) ||
      !textField(row.title,160,{empty:true}) ||
      !textField(row.language,35) ||
      !/^[A-Za-z0-9_-]{2,35}$/.test(row.language) ||
      ['default','forced','original','commentary','hearingImpaired']
        .some(k=>typeof row[k]!=='boolean'))
    throw Error('BATCH_RECIPE_V2_SUBTITLE_INVALID');
  return {...row};
}
function validPolicy(policy) {
  if(!exactKeys(policy,POLICY_FIELDS) ||
      typeof policy.preserveAttachments!=='boolean' ||
      typeof policy.subsetEnabled!=='boolean' ||
      !['job','group'].includes(policy.subsetScope))
    throw Error('BATCH_RECIPE_V2_POLICY_INVALID');
  return {...policy};
}
function parseObject(obj) {
  if(!exactKeys(obj,RECIPE_KEYS) ||
      obj.schema!==BATCH_RECIPE_V2_SCHEMA ||
      obj.recipeKind!=='reviewed-output-subtitle-metadata' ||
      obj.sourceBindings!=='must-reselect-and-verify' ||
      obj.directoryPermission!=='not-exported' ||
      obj.reviewRequired!==true ||
      obj.savedArtifacts!=='not-included' ||
      !textField(obj.title,120) ||
      !textField(obj.note,600,{empty:true}) ||
      !Array.isArray(obj.jobs)||obj.jobs.length<1||obj.jobs.length>100)
    throw Error('BATCH_RECIPE_V2_SCHEMA_UNSUPPORTED');
  const policy=validPolicy(obj.policy),seen=new Set(),jobs=[];
  let count=0;
  for(const job of obj.jobs) {
    if(!exactKeys(job,TEMPLATE_KEYS) ||
        !textField(job.sourceName,255) ||
        !textField(job.outputName,255) ||
        !Array.isArray(job.subtitleRules) ||
        !job.subtitleRules.length || job.subtitleRules.length>20)
      throw Error('BATCH_RECIPE_V2_JOB_INVALID');
    const key=JSON.stringify([job.sourceName,job.outputName]);
    if(seen.has(key))throw Error('BATCH_RECIPE_V2_DUPLICATE_JOB');
    seen.add(key);
    count+=job.subtitleRules.length;
    if(count>500)throw Error('BATCH_RECIPE_V2_TRACK_BUDGET');
    const rules=job.subtitleRules.map(validMeta);
    // A repeated subtitle file in the same output must not make the
    // detached rule-to-source assignment underdetermined.
    const identities=rules.map(r=>JSON.stringify([r.fileName,r.sidecarName,r.formatId]));
    if(new Set(identities).size!==identities.length)
      throw Error('BATCH_RECIPE_V2_DUPLICATE_SUBTITLE');
    jobs.push({sourceName:job.sourceName,outputName:job.outputName,
      subtitleRules:rules});
  }
  return freeze({
    schema:BATCH_RECIPE_V2_SCHEMA,title:obj.title,note:obj.note,
    recipeKind:'reviewed-output-subtitle-metadata',
    policy,jobs,
    sourceBindings:'must-reselect-and-verify',
    directoryPermission:'not-exported',reviewRequired:true,
    savedArtifacts:'not-included',
  });
}
export function parseBatchRecipeV2(text) {
  if(typeof text!=='string' ||
      new TextEncoder().encode(text).length>BATCH_RECIPE_V2_MAX_BYTES)
    throw Error('BATCH_RECIPE_V2_SIZE_LIMIT');
  let value;try{value=JSON.parse(text)}catch{throw Error('BATCH_RECIPE_V2_BAD_JSON')}
  return parseObject(value);
}
export function stringifyBatchRecipeV2(recipe) {
  return JSON.stringify(parseBatchRecipeV2(JSON.stringify(recipe)),null,2)+'\n';
}
export function buildBatchRecipeV2({pairing,policy,title='逐输出字幕元数据',note=''}={}) {
  if(!pairing?.jobs?.length)throw Error('BATCH_RECIPE_V2_NO_PAIRING');
  const jobs=pairing.jobs.map(job=>{
    const rows=Array.from(job.subtitleTracks||[]);
    return {
      sourceName:job.video?.name||'',outputName:job.outputName,
      subtitleRules:rows.map((row,index)=>{
        if(!row.file||!row.format)throw Error('BATCH_RECIPE_V2_UNVERIFIED_SUBTITLE');
        const inferred=inferredSubtitleMetadata(row.file,row.format);
        return {
          fileName:row.file.name,
          sidecarName:row.sidecarFile?.name||'',
          formatId:row.format.id||'',
          title:row.title??inferred.title??row.file.name.replace(/\.[^.]+$/,''),
          language:row.language??inferred.language??'und',
          default:row.default??index===0,
          forced:row.forced??false,original:row.original??false,
          commentary:row.commentary??false,
          hearingImpaired:row.hearingImpaired??false,
        };
      }),
    };
  });
  return parseObject({
    schema:BATCH_RECIPE_V2_SCHEMA,title,note,
    recipeKind:'reviewed-output-subtitle-metadata',
    policy,jobs,sourceBindings:'must-reselect-and-verify',
    directoryPermission:'not-exported',reviewRequired:true,
    savedArtifacts:'not-included',
  });
}
function key(job){return JSON.stringify([job.video?.name,job.outputName]);}
function ruleKey(rule){return JSON.stringify([
  rule.fileName,rule.sidecarName,rule.formatId,
]);}
function currentKey(row){return JSON.stringify([
  row.file?.name,row.sidecarFile?.name||'',row.format?.id||'',
]);}

/** Pure read-only preview. No File permission or execution token returned. */
export function previewBatchRecipeV2(recipe,pairing) {
  const valid=parseObject(recipe),issues=[];
  const tasks=pairing?.jobs||[];
  if(tasks.length!==valid.jobs.length)
    issues.push('配方与当前拟输出任务数量不一致');
  if(pairing?.ambiguousPairings?.length ||
      pairing?.outputNameCollisions?.length ||
      pairing?.directoryConflicts?.length ||
      pairing?.invalidSubtitles?.length ||
      pairing?.fontRecognition?.ignored?.length ||
      pairing?.directoryCheckError)
    issues.push('当前配对或输出目录仍存在阻断');
  const wanted=new Map(valid.jobs.map(j=>[JSON.stringify([j.sourceName,j.outputName]),j]));
  const seen=new Set();
  for(const job of tasks) {
    const id=key(job),template=wanted.get(id);
    if(!job.video||!template||seen.has(id)) {
      issues.push('来源/输出任务不唯一或与配方不匹配');
      continue;
    }
    seen.add(id);
    const rows=Array.from(job.subtitleTracks||[]);
    if(rows.length!==template.subtitleRules.length) {
      issues.push('字幕轨道数量与配方不匹配：'+job.outputName);
      continue;
    }
    const byKey=new Map(template.subtitleRules.map(rule=>[ruleKey(rule),rule]));
    const visited=new Set();
    for(const row of rows) {
      const identity=currentKey(row),rule=byKey.get(identity);
      if(!rule||visited.has(identity)||!row.file||!row.format) {
        issues.push('字幕素材/格式/sidecar 不匹配：'+job.outputName);
        break;
      }
      visited.add(identity);
    }
  }
  if(seen.size!==wanted.size)issues.push('配方包含未重新选择的来源任务');
  return freeze({
    state:issues.length?'blocked':'ready',
    issues:issues.slice(0,20),
    matchedJobs:seen.size,totalJobs:valid.jobs.length,
    executionAuthorized:false,requiresExplicitReview:true,
    mustRecheckDirectory:true,mustReinspectMedia:true,
    notice:issues.length?'逐输出规则未通过配对核验，不能执行。'
      :'素材已重新选择并匹配；仅可在确认后冻结本次任务，仍须执行独立预检。',
  });
}

/**
 * Apply ONLY metadata to current in-memory pairing projections, never mutate
 * original pairing, never restore a File handle, and never schedule mux.
 * The caller must revalidate current selection just before JobPlan freeze.
 */
export function applyBatchRecipeV2ToPairing(recipe,pairing) {
  const valid=parseObject(recipe),preview=previewBatchRecipeV2(valid,pairing);
  if(preview.state!=='ready')throw Error('BATCH_RECIPE_V2_BINDING_REJECTED');
  const templates=new Map(valid.jobs.map(job=>[
    JSON.stringify([job.sourceName,job.outputName]),job,
  ]));
  const jobs=pairing.jobs.map(job=>{
    const template=templates.get(key(job)),map=new Map(template.subtitleRules.map(r=>[
      ruleKey(r),r,
    ]));
    const subtitles=job.subtitleTracks.map(track=>{
      const rule=map.get(currentKey(track));
      return Object.freeze({
        ...track,file:track.file,sidecarFile:track.sidecarFile||null,
        title:rule.title,language:rule.language,
        default:rule.default,forced:rule.forced,
        original:rule.original,commentary:rule.commentary,
        hearingImpaired:rule.hearingImpaired,
      });
    });
    return {...job,subtitleTracks:Object.freeze(subtitles)};
  });
  return {...pairing,jobs:Object.freeze(jobs)};
}

/** Stronger than filename/size/mtime: only current browser File references. */
export function captureBatchRecipeV2Binding(recipe,pairing) {
  const preview=previewBatchRecipeV2(recipe,pairing);
  if(preview.state!=='ready')throw Error('BATCH_RECIPE_V2_BINDING_REJECTED');
  return Object.freeze({
    recipe:parseObject(recipe),
    bindings:Object.freeze(pairing.jobs.map(job=>Object.freeze({
      source:job.video,outputName:job.outputName,
      subtitleRefs:Object.freeze(job.subtitleTracks.map(track=>
        Object.freeze({file:track.file,sidecarFile:track.sidecarFile||null,
          formatId:track.format?.id||''}))),
    }))),
  });
}
export function verifyBatchRecipeV2Binding(binding,pairing) {
  if(!binding||!pairing?.jobs?.length ||
      binding.bindings?.length!==pairing.jobs.length)
    return false;
  if(previewBatchRecipeV2(binding.recipe,pairing).state!=='ready')
    return false;
  return binding.bindings.every((bound,index)=>{
    const job=pairing.jobs[index];
    return bound.source===job.video&&bound.outputName===job.outputName &&
      bound.subtitleRefs.length===job.subtitleTracks.length &&
      bound.subtitleRefs.every((ref,i)=>ref.file===job.subtitleTracks[i].file &&
        ref.sidecarFile===(job.subtitleTracks[i].sidecarFile||null) &&
        ref.formatId===(job.subtitleTracks[i].format?.id||''));
  });
}
