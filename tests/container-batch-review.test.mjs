import test from 'node:test';
import assert from 'node:assert/strict';
import {runContainerBatchReview,containerObservationReport} from '../src/container-batch-review.js';
const files=()=>[new File(['a'],'a.mkv'),new File(['b'],'bad.mkv'),new File(['c'],'c.mp4')];
test('read-only review inspects sources without subtitles, continues on failure, and preserves exact File identity',async()=>{
 const source=files(),seen=[];
 const result=await runContainerBatchReview(source,{inspect:async file=>{seen.push(file);if(file===source[1])throw Error('bad header');return {streams:[{codec_type:'video'}]};}});
 assert.deepEqual(seen,source);assert.deepEqual(result.rows.map(r=>r.state),['inspected','failed','inspected']);
 assert.equal(result.rows[1].error,'bad header');assert.equal(result.rows[0].source.name,'a.mkv');
 assert.equal('blob' in result.rows[0],false);assert.equal('muxed' in result.rows[0],false);
 assert.equal(result.operation,'read-only-container-review');
});
test('cancellation discards in-flight result, preserves completed reports and marks remaining sources',async()=>{
 let cancelled=false;const source=files();let calls=0;
 const result=await runContainerBatchReview(source,{shouldCancel:()=>cancelled,inspect:async()=>{if(++calls===2)cancelled=true;return {streams:[]};}});
 assert.deepEqual(result.rows.map(r=>r.state),['inspected','cancelled','notRun']);assert.equal(calls,2);
 assert.equal(result.cancelled,true);assert.equal(result.rows[1].observation,null);
});
test('selection changes stop stale inspection and input mutation cannot extend the frozen run',async()=>{
 const source=files();let current=true;let calls=0;
 const result=await runContainerBatchReview(source,{isCurrent:()=>current,inspect:async()=>{calls++;source.push(new File(['d'],'later.mkv'));current=false;return {};}});
 assert.equal(result.rows.length,3);assert.equal(calls,1);assert.equal(result.rows[0].state,'interrupted');
});
test('container report describes observations without inventing decode, payload integrity or writer approval',()=>{
 const report=containerObservationReport({streams:[{index:0,codec_name:'h264',codec_type:'video'}],format:{format_name:'matroska,webm',tags:{title:'A'}},chapters:[{id:7,tags:{title:'First'}}]});
 assert.equal(report.streams[0].codec_name,'h264');assert.equal(report.chapters[0].tags.title,'First');
 assert.equal(report.claims.decoding,'not-tested');assert.equal(report.claims.wholeFileIntegrity,'not-hashed');
 assert.equal(report.claims.writerAdmission,'not-evaluated');assert.equal(report.claims.remux,'not-performed');
 assert.throws(()=>containerObservationReport({}),/OBSERVATION/);
});

test('missing inspection data must fail instead of becoming a successful empty report',async()=>{
 const result=await runContainerBatchReview([files()[0]],{inspect:async()=>({})});
 assert.equal(result.rows[0].state,'failed');assert.match(result.rows[0].error,/OBSERVATION/);
});
