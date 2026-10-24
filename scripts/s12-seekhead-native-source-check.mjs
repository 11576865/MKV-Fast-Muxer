/**
 * Real S12 native Matroska source canary for read-only SeekHead proof.
 * Runs on each true large-media file BEFORE the product browser mux stage.
 * Does not treat an incomplete index as writer permission or an accepted
 * writer source; records the actual index status and all reasons.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import path from 'node:path';
import { inspectS12SeekHeadIndex } from '../src/s12-seekhead-index-proof.js';
const dir=path.resolve(process.env.S12_DIR||'.e2e/s12');
const fixture=JSON.parse(await fs.readFile(path.join(dir,'s12-fixture-receipt.json'),'utf8'));
const sourceFile=path.join(dir,fixture.source);
const native=await openAsBlob(sourceFile,{type:'video/x-matroska'});
assert.equal(native.size,fixture.sourceBytes);
const reads=[];
const file={
  size:native.size,
  slice(from,to,type){
    reads.push(to-from);
    return native.slice(from,to,type);
  },
};
const result=await inspectS12SeekHeadIndex(file);
assert.equal(result.writerAuthorized,false);
assert.equal(result.publicationAuthorized,false);
assert.ok(reads.length>0);
assert.ok(reads.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=32),
  'SeekHead probe attempted unbounded large-media or attachment reads');
assert.ok(['INDEX_REFERENCES_VERIFIED','INDEX_UNVERIFIED','NO_SEEKHEAD'].includes(result.status));
if(result.status==='INDEX_REFERENCES_VERIFIED'){
  assert.ok(result.references.length>0);
  assert.ok(result.references.every(row=>row.matched));
}
// An incomplete or nonconforming index must remain UNVERIFIED, but do not
// silently accept broken links in native mkvmerge fixtures as a positive.
if(result.references.length && result.references.some(x=>!x.matched)){
  assert.equal(result.status,'INDEX_UNVERIFIED');
  throw Error('S12_NATIVE_SEEKHEAD_POINTER_MISMATCH:'+
    result.reasons.join(';'));
}
if(result.reasons.some(x=>x.startsWith('INDEX_SCAN_FAILED:'))){
  throw Error('S12_NATIVE_SEEKHEAD_PARSE_FAILED:'+result.reasons.join(';'));
}
console.log('S12 REAL NATIVE SEEKHEAD READ-ONLY EVIDENCE',JSON.stringify({
  tier:fixture.tier,kind:fixture.kind,
  realSourceBytes:fixture.sourceBytes,
  status:result.status,reasonCodes:result.reasons,
  verifiedPointers:result.references.filter(x=>x.matched).length,
  declaredPointers:result.references.length,
  topLevelCount:result.topLevelCount,
  slices:reads.length,maxSlice:Math.max(...reads),
  writerAuthorized:result.writerAuthorized,
  publicationAuthorized:result.publicationAuthorized,
}));
