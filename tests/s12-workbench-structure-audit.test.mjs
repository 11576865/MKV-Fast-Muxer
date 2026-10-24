import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditS12WorkbenchStructure,formatS12WorkbenchStructure,
  S12_WORKBENCH_STRUCTURE_SCHEMA,
} from '../src/s12-workbench-structure-audit.js';

const source=new Blob(['actual source file']);
const finished=new Blob(['actual finished mkv']);
const pointers=(src='INDEX_REFERENCES_VERIFIED',dest='INDEX_REFERENCES_VERIFIED')=>({
  status:'FINISHED_INDEX_POINTERS_SCOPED_VERIFIED',
  source:{seekStatus:src,cuesStatus:'CUES_CLUSTER_POINTERS_VERIFIED',
    seekReferences:1,cueReferences:2},
  finished:{seekStatus:dest,cuesStatus:'CUES_CLUSTER_POINTERS_VERIFIED',
    seekReferences:3,cueReferences:4},
  errors:[],
});
const block=(status='CUE_TRACK_BLOCK_HEADERS_VERIFIED',
  timestamp='CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED')=>({
    status,totalReferences:4,checkedReferences:status==='CUE_TRACK_BLOCK_HEADERS_VERIFIED'?4:0,
    reasons:[],cueTimestampStatus:timestamp,cueTimestampCheckedReferences:timestamp==='CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED'?4:0,
    cueTimestampReasons:[],
});
const options=(pointerResult=pointers(),blocks=[block(),block()])=>{
  const seen=[];
  return {seen,inspector:{
    pointerInspector:async args=>{
      assert.equal(args.source,source);assert.equal(args.finished,finished);
      seen.push('pointers');return pointerResult;
    },
    blockInspector:async file=>{
      seen.push(file===source?'source-block':'finished-block');
      return file===source?blocks[0]:blocks[1];
    },
  }};
};

test('S12 workbench rejects missing or identical Blob authority before scanners run',async()=>{
  let calls=0;
  const inspect={pointerInspector:async()=>{calls++;throw Error('called');}};
  for(const args of [{source,finished:source},{source,finished:null},
    {source:null,finished},{}]){
    const r=await auditS12WorkbenchStructure(args,inspect);
    assert.equal(r.status,'NOT_RUN');
    assert.equal(r.writerAuthorized,false);
    assert.equal(r.publicationAuthorized,false);
  }
  assert.equal(calls,0);
});

test('S12 workbench reads exact source and final result and never grants preservation authority',async()=>{
  const {inspector,seen}=options();
  const r=await auditS12WorkbenchStructure({source,finished},inspector);
  assert.equal(r.schema,S12_WORKBENCH_STRUCTURE_SCHEMA);
  assert.equal(r.status,'FINISHED_SCOPED_INDEX_AND_TIMESTAMP_VERIFIED');
  assert.deepEqual(new Set(seen),new Set(['pointers','source-block','finished-block']));
  assert.equal(r.finished.seekReferences,3);
  assert.equal(r.source.cueReferences,2);
  assert.equal(r.finished.block.timestampsChecked,4);
  for(const key of ['writerAuthorized','publicationAuthorized',
    'sourceOutputPacketParityProven','uidGraphProven','userDeviceSaveVerified'])
    assert.equal(r[key],false,key+' must never be implied');
  const label=formatS12WorkbenchStructure(r);
  assert.match(label,/真实来源[\s\S]*实际成品[\s\S]*CueTime/);
  assert.match(label,/不验证关键帧/);
});

test('S12 workbench never promotes incomplete final Block timing to verified',async()=>{
  const {inspector}=options(pointers(),[block(),block('CUE_TRACK_BLOCK_HEADERS_VERIFIED',
    'CUE_BLOCK_TIMESTAMP_UNVERIFIED')]);
  const r=await auditS12WorkbenchStructure({source,finished},inspector);
  assert.equal(r.status,'STRUCTURE_INCOMPLETE_OR_UNVERIFIED');
  assert.equal(r.finished.block.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED');
  assert.equal(r.finished.block.timestampStatus,'CUE_BLOCK_TIMESTAMP_UNVERIFIED');
});

test('S12 verified final evidence remains independent of unverified source proof',async()=>{
  const {inspector}=options(pointers('INDEX_UNVERIFIED'),[
    block('CUE_BLOCK_EVIDENCE_UNVERIFIED','CUE_BLOCK_TIMESTAMP_UNVERIFIED'),block()]);
  const r=await auditS12WorkbenchStructure({source,finished},inspector);
  assert.equal(r.status,'FINISHED_SCOPED_INDEX_AND_TIMESTAMP_VERIFIED');
  assert.equal(r.source.block.checked,0);
  assert.equal(r.sourceOutputPacketParityProven,false);
});

test('S12 actual finished index contradiction takes precedence over positive Block receipts',async()=>{
  const bad=pointers();
  bad.status='FINISHED_INDEX_CONTRADICTION';
  bad.errors=['FINISHED_CUES:CUES_CLUSTER_POINTER_MISMATCH'];
  const {inspector}=options(bad);
  const r=await auditS12WorkbenchStructure({source,finished},inspector);
  assert.equal(r.status,'FINISHED_INDEX_CONTRADICTION');
  assert.match(formatS12WorkbenchStructure(r),/CUES_CLUSTER_POINTER_MISMATCH/);
});

test('S12 modern inspector wires real Blob, has stale-result guard and independent opt-in control',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="outputIndexInspectBtn"[^>]*disabled/);
  assert.match(html,/id="outputIndexResult"[^>]*role="status"/);
  assert.match(main,/lastActualOutput = \{ sourceKey: evidenceSourceAtExecution, sourceFile:video,\s*outputBlob, report \}/);
  assert.match(main,/outputIndexInspectBtn\?\.addEventListener\('click'/);
  assert.match(main,/source:owner\.sourceFile,finished:owner\.outputBlob/);
  assert.match(main,/inspectionSequence !== outputIndexAuditSequence/);
  assert.match(main,/lastActualOutput = null;\s*lastOutputIndexAudit = null;/);
  assert.match(main,/renderActualOutputEvidence\(\);\s*}\s*function /);
  assert.doesNotMatch(main,/outputIndexInspectBtn\?\.addEventListener\('click',[\s\S]*?writerAuthorized\s*=\s*true/);
});
