/**
 * Actual S12 native MKV cue-to-Cluster location canary.
 * This is read-only source evidence and must not grant writer authority.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import path from 'node:path';
import { inspectS12CuesClusterLocations } from '../src/s12-cues-cluster-proof.js';

const dir=path.resolve(process.env.S12_DIR||'.e2e/s12');
const receipt=JSON.parse(await fs.readFile(path.join(dir,'s12-fixture-receipt.json'),'utf8'));
const file=await openAsBlob(path.join(dir,receipt.source),{type:'video/x-matroska'});
assert.equal(file.size,receipt.sourceBytes);
const reads=[];
const source={size:file.size,slice(from,to,type){
  reads.push(to-from);return file.slice(from,to,type);
}};
const result=await inspectS12CuesClusterLocations(source);
assert.equal(result.writerAuthorized,false);
assert.equal(result.publicationAuthorized,false);
assert.ok(reads.length>0);
assert.ok(reads.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=32),
  'actual large MKV Cues reader accessed unbounded media data');
assert.ok(['NO_CUES','CUES_UNVERIFIED','CUES_CLUSTER_POINTERS_VERIFIED'].includes(result.status));
if(result.status==='CUES_CLUSTER_POINTERS_VERIFIED'){
  assert.ok(result.cuePoints>0&&result.locations.length>0);
  assert.ok(result.locations.every(x=>x.matched));
}
// A real source with a known broken pointer or invalid CRC must not pass
// unnoticed. Absent Cues means no cue proof, not a failed source mux.
const suspicious=result.reasons.filter(x=>
  /CUES_CLUSTER_POINTER_MISMATCH|CUES_RELATIVE_POSITION_OUT_OF_CLUSTER|CUES_CRC_MISMATCH|CUES_SCAN_FAILED/.test(x));
if(suspicious.length)throw Error('S12_NATIVE_CUES_INVALID:'+suspicious.join(';'));
console.log('S12 REAL NATIVE CUES READ-ONLY EVIDENCE',JSON.stringify({
  tier:receipt.tier,kind:receipt.kind,sourceBytes:file.size,
  status:result.status,cuePoints:result.cuePoints,
  declaredLocations:result.locations.length,
  matchedLocations:result.locations.filter(x=>x.matched).length,
  reasonCodes:result.reasons,
  slices:reads.length,maxSlice:Math.max(...reads),
  writerAuthorized:result.writerAuthorized,publicationAuthorized:result.publicationAuthorized,
}));
