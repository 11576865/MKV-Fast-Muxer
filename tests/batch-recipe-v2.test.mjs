import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_RECIPE_V2_SCHEMA,buildBatchRecipeV2,stringifyBatchRecipeV2,
  parseBatchRecipeV2,previewBatchRecipeV2,applyBatchRecipeV2ToPairing,
  captureBatchRecipeV2Binding,verifyBatchRecipeV2Binding,
  setCurrentBatchTaskMetadata,projectCurrentBatchTaskMetadata,
} from '../src/batch-recipe-v2.js';
import {freezeBatchJobPlan,createBatchJobLedger} from '../src/batch-job-plan.js';
import {createFrozenBatchMuxContext} from '../src/batch-mux-context.js';
import {runFrozenBatchQueue} from '../src/batch-runner.js';

const file=name=>({name,size:125,lastModified:55});
function fixture() {
  const videos=[file('Episode S01E01.mp4'),file('Episode S01E02.mp4')];
  const subtitles=[file('Episode S01E01.zh.ass'),file('Episode S01E02.en.ass')];
  const format={id:'ass',label:'ASS',assLike:true};
  const jobs=videos.map((video,i)=>({
    video,outputName:video.name.replace(/\.mp4$/,'.mkv'),
    subtitleInputFiles:[subtitles[i]],subtitles:[subtitles[i]],
    subtitleTracks:[{file:subtitles[i],format,sidecarFile:null}],
  }));
  return {
    jobs,fonts:[],fontRecognition:{recognized:[],ignored:[]},
    videoRecognition:{ignored:[]},
    directoryConflicts:[],directoryCheckError:'',
    ambiguousPairings:[],outputNameCollisions:[],
    invalidSubtitles:[],
  };
}
const policy=()=>({preserveAttachments:false,subsetEnabled:false,subsetScope:'job'});
function withEdits(raw) {
  const next=JSON.parse(JSON.stringify(raw));
  next.jobs[0].subtitleRules[0].title='Episode One Reviewed';
  next.jobs[0].subtitleRules[0].language='jpn';
  next.jobs[0].subtitleRules[0].default=true;
  next.jobs[0].subtitleRules[0].forced=true;
  next.jobs[1].subtitleRules[0].title='Episode Two Reviewed';
  next.jobs[1].subtitleRules[0].language='eng';
  next.jobs[1].subtitleRules[0].commentary=true;
  return next;
}
test('v2 exports strict, portable episode-specific metadata without File or output authorization',()=>{
  const pairing=fixture(),recipe=buildBatchRecipeV2({pairing,policy:policy()});
  const parsed=parseBatchRecipeV2(stringifyBatchRecipeV2(recipe));
  assert.equal(parsed.schema,BATCH_RECIPE_V2_SCHEMA);
  assert.equal(parsed.jobs.length,2);
  assert.equal(parsed.jobs[0].subtitleRules.length,1);
  assert.equal(parsed.jobs[0].sourceName,pairing.jobs[0].video.name);
  assert.equal(parsed.jobs[0].outputName,pairing.jobs[0].outputName);
  assert.equal(parsed.sourceBindings,'must-reselect-and-verify');
  assert.equal(parsed.directoryPermission,'not-exported');
  assert.equal(parsed.reviewRequired,true);
  assert.equal(parsed.savedArtifacts,'not-included');
  assert.ok(!stringifyBatchRecipeV2(parsed).includes('lastModified'));
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.jobs[0].subtitleRules[0]));
});

test('import itself cannot mutate, bind, or create runnable JobPlan; explicit acceptance is required',()=>{
  const pairing=fixture();
  const draft=withEdits(buildBatchRecipeV2({pairing,policy:policy()}));
  const imported=parseBatchRecipeV2(JSON.stringify(draft));
  const old=pairing.jobs[0].subtitleTracks[0];
  const review=previewBatchRecipeV2(imported,pairing);
  assert.equal(review.state,'ready');
  assert.equal(review.executionAuthorized,false);
  assert.equal(old.title,undefined);
  const binding=captureBatchRecipeV2Binding(imported,pairing);
  assert.equal(verifyBatchRecipeV2Binding(binding,pairing),true);
  const patched=applyBatchRecipeV2ToPairing(binding.recipe,pairing);
  assert.equal(patched.jobs[0].subtitleTracks[0].title,'Episode One Reviewed');
  assert.equal(patched.jobs[0].subtitleTracks[0].language,'jpn');
  assert.equal(patched.jobs[0].subtitleTracks[0].forced,true);
  assert.equal(patched.jobs[1].subtitleTracks[0].title,'Episode Two Reviewed');
  assert.equal(patched.jobs[1].subtitleTracks[0].commentary,true);
  assert.equal(old.title,undefined);
  assert.equal(patched.jobs[0].video,pairing.jobs[0].video);
  assert.equal(patched.jobs[0].subtitleTracks[0].file,old.file);
});

test('recipe-to-frozen-job-plan-to-independent mux context delivers per-output metadata',()=>{
  const pairing=fixture(),recipe=withEdits(buildBatchRecipeV2({pairing,policy:policy()}));
  const approval=captureBatchRecipeV2Binding(recipe,pairing);
  assert.equal(verifyBatchRecipeV2Binding(approval,pairing),true);
  const mapped=applyBatchRecipeV2ToPairing(approval.recipe,pairing);
  const plan=freezeBatchJobPlan(mapped,{generation:49,
    preserveAttachments:false,subsetEnabled:false,subsetScope:'job'});
  assert.ok(Object.isFrozen(plan.jobs[0]));
  const first=createFrozenBatchMuxContext(plan,plan.jobs[0],{
    headerIdentity:{container:'iso-bmff'},fonts:[],fontIdentities:[],
  });
  const second=createFrozenBatchMuxContext(plan,plan.jobs[1],{
    headerIdentity:{container:'iso-bmff'},fonts:[],fontIdentities:[],
  });
  assert.equal(first.subtitles[0].title,'Episode One Reviewed');
  assert.equal(first.subtitles[0].language,'jpn');
  assert.equal(first.subtitles[0].forced,true);
  assert.equal(second.subtitles[0].title,'Episode Two Reviewed');
  assert.equal(second.subtitles[0].language,'eng');
  assert.equal(second.subtitles[0].commentary,true);
  assert.notEqual(first.subtitles[0].file,second.subtitles[0].file);
  assert.equal(first.reportPlan.execution,'frozen-batch-context-v1');
  assert.equal(second.reportPlan.subtitles[0].title,'Episode Two Reviewed');
});

test('reselected File with equal name, size, mtime and valid pairing revokes old acceptance',()=>{
  const pairing=fixture(),recipe=buildBatchRecipeV2({pairing,policy:policy()});
  const binding=captureBatchRecipeV2Binding(recipe,pairing);
  const replaced=fixture();
  assert.equal(previewBatchRecipeV2(recipe,replaced).state,'ready');
  assert.equal(verifyBatchRecipeV2Binding(binding,replaced),false);
  const samePairing={...pairing,jobs:[{...pairing.jobs[0],
    subtitleTracks:[{...pairing.jobs[0].subtitleTracks[0],
      file:{...pairing.jobs[0].subtitleTracks[0].file}}]},pairing.jobs[1]]};
  assert.equal(previewBatchRecipeV2(recipe,samePairing).state,'ready');
  assert.equal(verifyBatchRecipeV2Binding(binding,samePairing),false);
});

test('wrong output, missing subtitle, changed format or duplicate source denies full draft',()=>{
  const pairing=fixture(),raw=buildBatchRecipeV2({pairing,policy:policy()});
  const badOutput={...pairing,jobs:[{...pairing.jobs[0],outputName:'other.mkv'},pairing.jobs[1]]};
  assert.equal(previewBatchRecipeV2(raw,badOutput).state,'blocked');
  const badFormat={...pairing,jobs:[{...pairing.jobs[0],
    subtitleTracks:[{...pairing.jobs[0].subtitleTracks[0],
      format:{id:'srt',label:'SRT'}}]},pairing.jobs[1]]};
  assert.equal(previewBatchRecipeV2(raw,badFormat).state,'blocked');
  const duplicated=withEdits(raw);
  duplicated.jobs[1].sourceName=duplicated.jobs[0].sourceName;
  duplicated.jobs[1].outputName=duplicated.jobs[0].outputName;
  assert.throws(()=>parseBatchRecipeV2(JSON.stringify(duplicated)),
    /BATCH_RECIPE_V2_DUPLICATE_JOB/);
  const blocked={...pairing,ambiguousPairings:[{id:'unresolved'}]};
  assert.equal(previewBatchRecipeV2(raw,blocked).state,'blocked');
  assert.throws(()=>applyBatchRecipeV2ToPairing(raw,blocked),
    /BATCH_RECIPE_V2_BINDING_REJECTED/);
});

test('strict JSON rejects foreign permissions, false claims, malformed typed flags and over-budget',()=>{
  const base=buildBatchRecipeV2({pairing:fixture(),policy:policy()});
  const mutate=fn=>{
    const draft=JSON.parse(JSON.stringify(base));fn(draft);
    return JSON.stringify(draft);
  };
  assert.throws(()=>parseBatchRecipeV2(mutate(x=>{x.fileHandles=['secret']})),
    /BATCH_RECIPE_V2_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>parseBatchRecipeV2(mutate(x=>{x.reviewRequired=false})),
    /BATCH_RECIPE_V2_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>parseBatchRecipeV2(mutate(x=>{
    x.jobs[0].subtitleRules[0].forced='true';
  })),/BATCH_RECIPE_V2_SUBTITLE_INVALID/);
  assert.throws(()=>parseBatchRecipeV2(mutate(x=>{
    x.jobs[0].subtitleRules[0].title='evil\nline';
  })),/BATCH_RECIPE_V2_SUBTITLE_INVALID/);
  assert.throws(()=>parseBatchRecipeV2('{bad'),/BATCH_RECIPE_V2_BAD_JSON/);
  assert.throws(()=>parseBatchRecipeV2(' '.repeat(128*1024+1)),
    /BATCH_RECIPE_V2_SIZE_LIMIT/);
});

test('frozen runner retains per-job output and independent audit states',async()=>{
  const pairing=fixture();
  const recipe=withEdits(buildBatchRecipeV2({pairing,policy:policy()}));
  const revised=applyBatchRecipeV2ToPairing(recipe,pairing);
  const plan=freezeBatchJobPlan(revised,{generation:20});
  const ledger=createBatchJobLedger(plan);
  const result=await runFrozenBatchQueue(plan,{
    ledger,prepare:async()=>{},
    execute:async(job)=>({
      blob:{size:100},outputName:job.outputName,
      auditStatus:'pass',auditIssues:[],outputSha256:'abc123',
    }),
    publish:async()=>({savedToDirectory:false,directorySaveError:''}),
  });
  assert.equal(result.results.length,2);
  assert.deepEqual(ledger.snapshot().map(x=>x.state),
    ['awaitingSave','awaitingSave']);
  assert.equal(plan.jobs[0].subtitleTracks[0].title,'Episode One Reviewed');
  assert.equal(plan.jobs[1].subtitleTracks[0].title,'Episode Two Reviewed');
  assert.equal(result.results.every(x=>x.auditStatus==='pass'),true);
});

test('new task inspector edits are nonmutating, per-episode and survive the actual frozen mux context',()=>{
  const original=fixture();
  let edits=new Map();
  edits=setCurrentBatchTaskMetadata(edits,{
    job:original.jobs[0],track:original.jobs[0].subtitleTracks[0],
    field:'title',value:'Episode 01 UI authored',
  });
  edits=setCurrentBatchTaskMetadata(edits,{
    job:original.jobs[0],track:original.jobs[0].subtitleTracks[0],
    field:'language',value:'jpn',
  });
  edits=setCurrentBatchTaskMetadata(edits,{
    job:original.jobs[1],track:original.jobs[1].subtitleTracks[0],
    field:'title',value:'Episode 02 UI authored',
  });
  edits=setCurrentBatchTaskMetadata(edits,{
    job:original.jobs[1],track:original.jobs[1].subtitleTracks[0],
    field:'forced',value:true,
  });
  const next=projectCurrentBatchTaskMetadata(original,edits);
  assert.equal(original.jobs[0].subtitleTracks[0].title,undefined);
  assert.equal(original.jobs[1].subtitleTracks[0].forced,undefined);
  assert.equal(next.jobs[0].subtitleTracks[0].title,'Episode 01 UI authored');
  assert.equal(next.jobs[0].subtitleTracks[0].language,'jpn');
  assert.equal(next.jobs[1].subtitleTracks[0].title,'Episode 02 UI authored');
  assert.equal(next.jobs[1].subtitleTracks[0].forced,true);
  const portable=parseBatchRecipeV2(stringifyBatchRecipeV2(
    buildBatchRecipeV2({pairing:next,policy:policy()})));
  assert.equal(portable.jobs[0].subtitleRules[0].title,'Episode 01 UI authored');
  assert.equal(portable.jobs[1].subtitleRules[0].title,'Episode 02 UI authored');
  const frozen=freezeBatchJobPlan(next,{generation:121});
  const context=createFrozenBatchMuxContext(frozen,frozen.jobs[1],{
    headerIdentity:{container:'iso-bmff'},fonts:[],fontIdentities:[],
  });
  assert.equal(frozen.jobs[0].subtitleTracks[0].title,'Episode 01 UI authored');
  assert.equal(context.subtitles[0].title,'Episode 02 UI authored');
  assert.equal(context.subtitles[0].forced,true);
  assert.equal(context.reportPlan.subtitles[0].title,'Episode 02 UI authored');
  assert.equal(context.source,frozen.jobs[1].video);
  assert.equal(context.kind,'frozen-batch-mux-context-v1');
});

test('in-app edits reject invalid mixed metadata, different source tracks and stale exact sidecar refs',()=>{
  const original=fixture(),track=original.jobs[0].subtitleTracks[0];
  const initial=new Map();
  let good=setCurrentBatchTaskMetadata(initial,{
    job:original.jobs[0],track,field:'title',value:'Safe',
  });
  assert.throws(()=>setCurrentBatchTaskMetadata(good,{
    job:original.jobs[1],track,field:'title',value:'Cross job',
  }),/BATCH_RECIPE_V2_EDITOR_TARGET_INVALID/);
  assert.throws(()=>setCurrentBatchTaskMetadata(good,{
    job:original.jobs[0],track,field:'language',value:'invalid language!',
  }),/BATCH_RECIPE_V2_SUBTITLE_INVALID/);
  assert.throws(()=>setCurrentBatchTaskMetadata(good,{
    job:original.jobs[0],track,field:'forced',value:'true',
  }),/BATCH_RECIPE_V2_SUBTITLE_INVALID/);
  assert.equal(projectCurrentBatchTaskMetadata(original,good)
    .jobs[0].subtitleTracks[0].title,'Safe');
  assert.equal(original.jobs[0].subtitleTracks[0].title,undefined);
  const clone={...original,jobs:[{
    ...original.jobs[0],subtitleTracks:[{
      ...track,file:{...track.file},
    }],
  },original.jobs[1]]};
  assert.throws(()=>projectCurrentBatchTaskMetadata(clone,good),
    /BATCH_RECIPE_V2_EDITOR_TRACK_STALE/);
  const wrongSidecar={...original,jobs:[{
    ...original.jobs[0],subtitleTracks:[{
      ...track,sidecarFile:{name:'fake.idx'},
    }],
  },original.jobs[1]]};
  assert.throws(()=>projectCurrentBatchTaskMetadata(wrongSidecar,good),
    /BATCH_RECIPE_V2_EDITOR_TRACK_STALE/);
  const changedVideo={...original,jobs:[{
    ...original.jobs[0],video:{...original.jobs[0].video},
  },original.jobs[1]]};
  assert.throws(()=>projectCurrentBatchTaskMetadata(changedVideo,good),
    /BATCH_RECIPE_V2_EDITOR_SOURCE_STALE/);
});

test('twenty-episode domain review and freeze is explicitly PLAN-ONLY, not twenty actual outputs',()=>{
  const fmt={id:'ass',label:'ASS',assLike:true};
  const jobs=Array.from({length:20},(_,i)=>{
    const stem='Series S01E'+String(i+1).padStart(2,'0');
    const video=file(stem+'.mp4'),subtitle=file(stem+'.zh.ass');
    return {video,outputName:stem+'.mkv',
      subtitles:[subtitle],subtitleInputFiles:[subtitle],
      subtitleTracks:[{file:subtitle,format:fmt,sidecarFile:null,
        title:'Episode '+String(i+1),language:'zho',default:true,
        forced:false,original:false,commentary:false,hearingImpaired:false}]};
  });
  const pairing={jobs,fonts:[],fontRecognition:{recognized:[],ignored:[]},
    videoRecognition:{ignored:[]},directoryCheckError:'',
    directoryConflicts:[],ambiguousPairings:[],outputNameCollisions:[],
    invalidSubtitles:[]};
  let changes=new Map();
  for(const job of pairing.jobs) {
    changes=setCurrentBatchTaskMetadata(changes,{
      job,track:job.subtitleTracks[0],field:'title',
      value:'Reviewed '+job.outputName,
    });
  }
  const projected=projectCurrentBatchTaskMetadata(pairing,changes);
  const recipe=buildBatchRecipeV2({pairing:projected,policy:policy()});
  const parsed=parseBatchRecipeV2(stringifyBatchRecipeV2(recipe));
  assert.equal(parsed.jobs.length,20);
  assert.equal(previewBatchRecipeV2(parsed,projected).state,'ready');
  const frozen=freezeBatchJobPlan(projected,{generation:20});
  assert.equal(frozen.jobs.length,20);
  assert.equal(frozen.jobs[19].subtitleTracks[0].title,
    'Reviewed '+jobs[19].outputName);
  assert.equal(frozen.jobs.some(x=>x.blob||x.outputSha256),false);
  assert.equal(frozen.jobs.every(x=>x.subtitleTracks.length===1),true);
  // Deliberately do not run FFmpeg, a real 20-output performance test,
  // upload files, create downloads, or imply successful delivered MKVs.
});
