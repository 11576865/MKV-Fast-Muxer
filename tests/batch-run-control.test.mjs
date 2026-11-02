import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchRunControl} from '../src/batch-run-control.js';
const job={jobId:'job-2',outputName:'second.mkv'};
test('pause request waits at the next boundary; resume releases it once',async()=>{
 let control;let paused;const arrived=new Promise(r=>paused=r);
 control=createBatchRunControl(()=>{if(control.phase==='paused')paused();});
 control.pause();assert.equal(control.phase,'pause-requested');
 let finished=false;const wait=control.beforeNextJob(job).then(v=>{finished=true;return v;});
 await arrived;assert.equal(finished,false);assert.equal(control.snapshot().nextJobId,'job-2');
 control.resume();assert.equal(await wait,'continue');assert.equal(control.phase,'running');
 assert.equal(await control.beforeNextJob(job),'continue');
});
test('stop or hard cancel wakes a paused gate without hanging',async()=>{
 for(const action of ['stop','cancel']){
  const c=createBatchRunControl();c.pause();const pending=c.beforeNextJob(job);
  assert.equal(c.phase,'paused');c[action]();assert.equal(await pending,'stop');
 }
});
test('resume before a boundary withdraws pause; finish wakes and disables further requests',async()=>{
 const c=createBatchRunControl();c.pause();c.resume();assert.equal(await c.beforeNextJob(job),'continue');
 c.pause();const wait=c.beforeNextJob(job);c.finish();assert.equal(await wait,'stop');
 c.pause();c.resume();c.stop();assert.equal(c.phase,'finished');
});
test('synchronous resume in the paused notification cannot lose a wakeup',async()=>{
 let c;c=createBatchRunControl(()=>{if(c.phase==='paused')c.resume();});c.pause();
 assert.equal(await c.beforeNextJob(job),'continue');
});
test('run observations are immutable, bounded and contain no File authorization',()=>{
 const c=createBatchRunControl();for(let i=0;i<150;i++){c.pause();c.resume();}
 const s=c.snapshot();assert.equal(s.events.length,200);assert.ok(Object.isFrozen(s.events));
 assert.ok(s.events.every(Object.isFrozen));assert.equal(JSON.stringify(s).includes('File'),false);
});
