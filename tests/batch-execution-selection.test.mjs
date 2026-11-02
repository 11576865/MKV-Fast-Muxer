import test from 'node:test';import assert from 'node:assert/strict';
import {createBatchExecutionSelection} from '../src/batch-execution-selection.js';
const job=i=>({video:{name:i+'.mp4'},subtitleInputFiles:[{name:i+'.srt'}],outputName:i+'.mkv'});
test('selected execution retains excluded jobs and exact bindings across metadata-only projection',()=>{
 const s=createBatchExecutionSelection(),a=job(1),b=job(2);s.reconcile([a,b]);s.set(b,false);
 const after={...b,subtitleTracks:[{title:'Edited'}]};s.reconcile([a,after]);
 assert.equal(s.included(after),false);assert.equal(s.count([a,after]),1);
 assert.deepEqual(s.project({jobs:[a,after],outputNameCollisions:[],directoryConflicts:[]}).jobs,[a]);
 assert.equal(after.subtitleTracks[0].title,'Edited');
});
test('new File references reset selection and stale old binding cannot mutate it',()=>{
 const s=createBatchExecutionSelection(),a=job(1);s.reconcile([a]);s.set(a,false);
 const newer={...a,subtitleInputFiles:[{...a.subtitleInputFiles[0]}]};s.reconcile([newer]);
 assert.equal(s.included(newer),true);assert.throws(()=>s.set(a,false),/绑定/);
});
test('bulk choices and inversion are explicit; empty execution is refused',()=>{
 const s=createBatchExecutionSelection(),jobs=[job(1),job(2),job(3)];s.reconcile(jobs);
 s.setAll(jobs,false);assert.equal(s.count(jobs),0);assert.throws(()=>s.project({jobs}),/至少/);
 s.invert(jobs);assert.equal(s.count(jobs),3);s.setAll(jobs,true);assert.equal(s.count(jobs),3);
});
test('selected destinations scope collision checks without dropping unresolved input blockers',()=>{
 const s=createBatchExecutionSelection(),a=job(1),b=job(2);b.outputName=a.outputName;s.reconcile([a,b]);
 const pairing={jobs:[a,b],outputNameCollisions:[{outputName:a.outputName,videos:[a.video,b.video]}],directoryConflicts:[a.outputName],invalidSubtitles:['bad']};
 assert.equal(s.project(pairing).outputNameCollisions.length,1);
 s.set(b,false);const p=s.project(pairing);assert.equal(p.outputNameCollisions.length,0);
 assert.deepEqual(p.directoryConflicts,[a.outputName]);assert.deepEqual(p.invalidSubtitles,['bad']);
});
