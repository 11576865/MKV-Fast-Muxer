import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBatchJobs, fileIdentity} from '../src/batch.js';
import {freezeBatchJobPlan} from '../src/batch-job-plan.js';
import {createFrozenBatchMuxContext} from '../src/batch-mux-context.js';
import {
  BATCH_RECIPE_V2_SCHEMA,BATCH_RECIPE_V2_MAX_BYTES,
  buildBatchRecipeV2,parseBatchRecipeV2,stringifyBatchRecipeV2,
  buildBatchRecipeV2FromPairing,reviewBatchRecipeV2,approveBatchRecipeV2,
  setBatchTaskOverride,applyBatchTaskOverrides,
} from '../src/batch-recipe-v2.js';

const file=name=>({name,size:2100,lastModified:55});
const policy={preserveAttachments:false,subsetEnabled:false,subsetScope:'job'};
function pairing(){
 const videos=[file('Drama S01E01.mp4'),file('Drama S01E02.mp4')];
 const files=[file('Drama S01E01.zh.ass'),file('Drama S01E02.en.ass')];
 const result=buildBatchJobs(videos,files);
 // The real scanner has supplied content-derived format in the production
 // pipeline; this fixture fills the same verified track field before freeze.
 for(const job of result.jobs){
   for(const track of job.subtitleTracks) {
     track.format=track.format||{id:'ass',label:'ASS',assLike:true};
     track.language=track.language||'und';
     track.title=track.title||track.file.name;
     track.default=true;track.forced=false;
     track.original=false;track.commentary=false;track.hearingImpaired=false;
   }
 }
 result.fonts=[];
 result.fontRecognition={recognized:[],ignored:[]};
 result.videoRecognition={ignored:[]};
 result.directoryConflicts=[];
 result.directoryCheckError='';
 return result;
}
test('portable v2 snapshots every exact reviewed episode and subtitle without File grants',()=>{
 const current=pairing();
 const recipe=buildBatchRecipeV2FromPairing(current,policy);
 const payload=stringifyBatchRecipeV2(recipe);
 const parsed=parseBatchRecipeV2(payload);
 assert.equal(parsed.schema,BATCH_RECIPE_V2_SCHEMA);
 assert.equal(parsed.tasks.length,2);
 assert.equal(parsed.tasks[0].subtitles.length,1);
 assert.equal(parsed.tasks[0].sourceKey,fileIdentity(current.jobs[0].video));
 assert.equal(parsed.tasks[0].subtitles[0].fileKey,
   fileIdentity(current.jobs[0].subtitleTracks[0].file));
 assert.deepEqual(parsed.policy,policy);
 assert.equal(parsed.reviewRequired,true);
 assert.equal(parsed.sourceBindings,'must-reselect-and-review');
 assert.equal(parsed.outputDirectoryPermission,'not-exported');
 assert.equal(parsed.fileHandles,undefined);
 assert.equal(parsed.savedArtifacts,'not-included');
 assert.equal(payload.includes('blob'),false);
 assert.ok(Object.isFrozen(parsed.tasks[0].subtitles[0].metadata));
});
test('untrusted imported metadata never applies until current pairing is explicitly approved',()=>{
 const original=pairing();
 const edit=setBatchTaskOverride(new Map(),{
   job:original.jobs[0],track:original.jobs[0].subtitleTracks[0],
   field:'title',value:'Hand authored first episode',
 });
 const edited=applyBatchTaskOverrides(original,edit);
 const portable=parseBatchRecipeV2(stringifyBatchRecipeV2(
   buildBatchRecipeV2FromPairing(edited,policy)));
 const newPairing=pairing();
 const before=newPairing.jobs[0].subtitleTracks[0].title;
 const review=reviewBatchRecipeV2(portable,newPairing);
 assert.equal(review.ready,true);
 assert.equal(review.executionAuthorized,false);
 assert.equal(newPairing.jobs[0].subtitleTracks[0].title,before);
 assert.equal(review.matchedJobs,2);
 assert.equal(review.matchedSubtitles,2);
 const approved=approveBatchRecipeV2(review,newPairing);
 const derived=applyBatchTaskOverrides(newPairing,approved);
 assert.equal(derived.jobs[0].subtitleTracks[0].title,'Hand authored first episode');
 assert.equal(derived.jobs[1].subtitleTracks[0].title,
   newPairing.jobs[1].subtitleTracks[0].title);
 assert.equal(newPairing.jobs[0].subtitleTracks[0].title,before);
 assert.equal(derived.jobs[0].subtitleTracks[0].file,
   newPairing.jobs[0].subtitleTracks[0].file);
 const plan=freezeBatchJobPlan(derived,{generation:2});
 const job=plan.jobs[0];
 const mux=createFrozenBatchMuxContext(plan,job,{
   headerIdentity:{container:'iso-bmff'},fonts:[],fontIdentities:[],
 });
 assert.equal(job.subtitleTracks[0].title,'Hand authored first episode');
 assert.equal(mux.subtitles[0].title,'Hand authored first episode');
 assert.equal(mux.reportPlan.subtitles[0].title,'Hand authored first episode');
 assert.equal(mux.source,job.video);
 assert.equal(mux.externalAudio.length,0);
});
test('task inspector override is per subtitle and per video, with full typed atomic rejection',()=>{
 const current=pairing(),first=current.jobs[0],second=current.jobs[1];
 let edits=new Map();
 edits=setBatchTaskOverride(edits,{job:first,track:first.subtitleTracks[0],
   field:'title',value:'Edited E01'});
 edits=setBatchTaskOverride(edits,{job:second,track:second.subtitleTracks[0],
   field:'language',value:'jpn'});
 edits=setBatchTaskOverride(edits,{job:second,track:second.subtitleTracks[0],
   field:'forced',value:true});
 assert.throws(()=>setBatchTaskOverride(edits,{job:second,track:second.subtitleTracks[0],
   field:'language',value:'invalid language!'}),/RECIPE_V2_METADATA_TEXT/);
 assert.throws(()=>setBatchTaskOverride(edits,{job:first,track:second.subtitleTracks[0],
   field:'title',value:'cross job'}),/RECIPE_V2_EDITOR_TARGET_INVALID/);
 const derived=applyBatchTaskOverrides(current,edits);
 assert.equal(derived.jobs[0].subtitleTracks[0].title,'Edited E01');
 assert.equal(derived.jobs[1].subtitleTracks[0].language,'jpn');
 assert.equal(derived.jobs[1].subtitleTracks[0].forced,true);
 assert.equal(current.jobs[1].subtitleTracks[0].forced,false);
 assert.ok(Object.isFrozen(edits.get(second.video).get(second.subtitleTracks[0].file)));
});
test('metadata identity string collision or ambiguous current pairing fails closed',()=>{
 const base=pairing(),portable=buildBatchRecipeV2FromPairing(base,policy);
 const replacement=pairing();
 replacement.jobs[1].video={...replacement.jobs[0].video};
 assert.equal(reviewBatchRecipeV2(portable,replacement).ready,false);
 assert.throws(()=>approveBatchRecipeV2(
   reviewBatchRecipeV2(portable,replacement),replacement),/NOT_CURRENT/);
 const pending=pairing();
 pending.ambiguousPairings=[{track:pending.jobs[0].subtitleTracks[0]}];
 assert.equal(reviewBatchRecipeV2(portable,pending).ready,false);
 const missing=pairing();
 missing.jobs.pop();
 assert.equal(reviewBatchRecipeV2(portable,missing).ready,false);
 const swapped=pairing();
 swapped.jobs[0].subtitleTracks[0].file=file('wrong.ass');
 assert.equal(reviewBatchRecipeV2(portable,swapped).ready,false);
});
test('strict parser refuses unsupported schemas, forged authorization and identity/data pollution',()=>{
 const valid=buildBatchRecipeV2FromPairing(pairing(),policy);
 const obj=JSON.parse(stringifyBatchRecipeV2(valid));
 assert.throws(()=>parseBatchRecipeV2('{broken'),/RECIPE_V2_JSON_INVALID/);
 assert.throws(()=>parseBatchRecipeV2('x'.repeat(BATCH_RECIPE_V2_MAX_BYTES+1)),
   /RECIPE_V2_TOO_LARGE/);
 assert.throws(()=>parseBatchRecipeV2(JSON.stringify({...obj,reviewRequired:false})),
   /RECIPE_V2_SCHEMA_UNSUPPORTED/);
 assert.throws(()=>parseBatchRecipeV2(JSON.stringify({...obj,executionAuthorized:true})),
   /RECIPE_V2_SCHEMA_UNSUPPORTED/);
 assert.throws(()=>parseBatchRecipeV2(JSON.stringify({...obj,
   tasks:[obj.tasks[0],obj.tasks[0]]})),/RECIPE_V2_TASK_IDENTITY/);
 const tampered=JSON.parse(JSON.stringify(obj));
 tampered.tasks[0].subtitles[0].metadata.language='zh bad';
 assert.throws(()=>parseBatchRecipeV2(JSON.stringify(tampered)),/RECIPE_V2_METADATA_TEXT/);
 const leaked=JSON.parse(JSON.stringify(obj));
 leaked.tasks[0].subtitles[0].fileHandle='grant';
 assert.throws(()=>parseBatchRecipeV2(JSON.stringify(leaked)),
   /RECIPE_V2_SUBTITLE_IDENTITY/);
 assert.throws(()=>buildBatchRecipeV2({policy,title:'x',tasks:[{
   sourceKey:'bad\nidentity',subtitles:[obj.tasks[0].subtitles[0]],
 }]}),/RECIPE_V2_TASK_IDENTITY/);
});
test('an approval never applies to a different pairing generation',()=>{
 const p=pairing(),document=buildBatchRecipeV2FromPairing(p,policy);
 const review=reviewBatchRecipeV2(document,p);
 assert.equal(review.ready,true);
 assert.throws(()=>approveBatchRecipeV2(review,pairing()),/RECIPE_V2_REVIEW_NOT_CURRENT/);
 const approved=approveBatchRecipeV2(review,p);
 const rerender=pairing();
 assert.equal(applyBatchTaskOverrides(rerender,approved).jobs[0].subtitleTracks[0].title,
   rerender.jobs[0].subtitleTracks[0].title);
});
test('stale per-job File reference must not become a current JobPlan track',()=>{
 const source=pairing(),job=source.jobs[0];
 const map=setBatchTaskOverride(new Map(),{job,track:job.subtitleTracks[0],
   field:'title',value:'Cannot silently remap'});
 const changed={
   ...source,jobs:source.jobs.map((row,i)=>i===0?{
     ...row,subtitleTracks:[{...row.subtitleTracks[0],file:{...row.subtitleTracks[0].file}}],
   }:row),
 };
 assert.throws(()=>applyBatchTaskOverrides(changed,map),/RECIPE_V2_STALE_TRACK_BINDING/);
});

test('twenty-episode recipe round-trip and freeze are plan-only, never twenty claimed media outputs',()=>{
 const n=20;
 const videos=Array.from({length:n},(_,index)=>file(
   'Series S01E'+String(index+1).padStart(2,'0')+'.mp4'));
 const subtitles=Array.from({length:n},(_,index)=>file(
   'Series S01E'+String(index+1).padStart(2,'0')+'.zh.ass'));
 const batch=buildBatchJobs(videos,subtitles);
 batch.fonts=[];
 batch.fontRecognition={recognized:[],ignored:[]};
 batch.videoRecognition={ignored:[]};
 batch.directoryConflicts=[];batch.directoryCheckError='';
 for(const job of batch.jobs) {
   for(const track of job.subtitleTracks){
     track.format={id:'ass',label:'ASS',assLike:true};
     track.language='zho';track.title='Episode '+job.video.name;
     track.default=true;track.forced=false;track.original=false;
     track.commentary=false;track.hearingImpaired=false;
   }
 }
 assert.equal(batch.jobs.length,n);
 const portable=buildBatchRecipeV2FromPairing(batch,policy);
 const next=parseBatchRecipeV2(stringifyBatchRecipeV2(portable));
 const review=reviewBatchRecipeV2(next,batch);
 assert.equal(review.ready,true);
 assert.equal(review.matchedJobs,n);
 assert.equal(review.matchedSubtitles,n);
 const approval=approveBatchRecipeV2(review,batch);
 const effective=applyBatchTaskOverrides(batch,approval);
 const plan=freezeBatchJobPlan(effective,{generation:92});
 assert.equal(plan.jobs.length,n);
 assert.equal(plan.jobs[19].subtitleTracks[0].title,
   'Episode '+videos[19].name);
 assert.equal(plan.policy.directoryName,'');
 assert.ok(Object.isFrozen(plan.jobs));
 // All 20 items remain only reviewed plans: none has run FFmpeg or
 // produced a Blob, outputSHA, directory write or final MKV artifact.
 assert.equal(plan.jobs.some(job=>job.outputSha256||job.blob),false);
});
