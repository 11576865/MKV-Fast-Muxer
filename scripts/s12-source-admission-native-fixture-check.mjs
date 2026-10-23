/**
 * S12 exact real native MKV source negative/qualification canary.
 * Run after s12-make-genuine-large-mkv.mjs: checks header-only scan and
 * source admission against actual file bytes without invoking any writer.
 * The browser/native finished-output test executes in the next CI step.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import path from 'node:path';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { inspectS12OriginalAttachmentSource } from '../src/s12-original-attachment-admission.js';

const dir=path.resolve(process.env.S12_DIR||'.e2e/s12');
const receipt=JSON.parse(await fs.readFile(path.join(dir,'s12-fixture-receipt.json'),'utf8'));
const filePath=path.join(dir,receipt.source);
const size=(await fs.stat(filePath)).size;
assert.equal(size,receipt.sourceBytes,'actual source file differs from native fixture receipt');
const backing=await openAsBlob(filePath,{type:'video/x-matroska'});
const reads=[];
const source={
  name:receipt.source,size,lastModified:0,
  slice(start,end,type){
    reads.push({start,end,length:end-start});
    return backing.slice(start,end,type);
  },
};
const reader=createMatroskaAttachmentReader(source);
const inventory=await reader.inspect();
assert.equal(inventory.state,'inspected',
  'actual native MKV attachment inspection failed: '+inventory.diagnostic?.code);
// An actual encoder may use an unknown-size Segment. That is a real
// source-class refusal reason, not a fixture failure or a write entitlement.
assert.equal(inventory.structure.topLevelCount,
  inventory.structure.topLevelElements.reduce((n,x)=>n+x.count,0));
assert.equal(inventory.scanning.fileDataBytesRead,0);
assert.equal(inventory.attachments.length,receipt.attachmentCount);
assert.ok(reads.length>0);
assert.ok(reads.every(x=>Number.isSafeInteger(x.length)&&x.length>=0&&x.length<=4096),
  'native large source admission unexpectedly read whole media or FileData');
const explicitIntent=inventory.attachments.map(row=>({
  ordinal:row.ordinal,fileUid:row.fileUid,include:true,
  filename:row.filename,mimeType:row.mimeType,
}));
const admission=await inspectS12OriginalAttachmentSource({
  source,reader,intent:explicitIntent,
});
assert.equal(admission.writerAuthorized,false);
assert.equal(admission.publicationAuthorized,false);
assert.equal(admission.sourceClassCandidate,
  admission.status==='SOURCE_CLASS_CANDIDATE');
assert.ok(['SOURCE_CLASS_CANDIDATE','BLOCKED'].includes(admission.status));
const indexIds=new Set([0x114d9b74,0x1c53bb6b,0x1254c367,0x1043a770,0xbf]);
const indexed=inventory.structure.topLevelElements.filter(item=>indexIds.has(item.id));
if(!inventory.structure.segmentFiniteExact){
  assert.equal(admission.status,'BLOCKED',
    'unknown-sized/trailing source Segment must fail closed');
  assert.ok(admission.reasons.includes('SOURCE_SINGLE_FINITE_EXACT_SEGMENT_REQUIRED'));
}
if(indexed.length){
  assert.equal(admission.status,'BLOCKED',
    'a real source with SeekHead/Cues/Tag/Chapter/CRC must not qualify');
  assert.ok(admission.reasons.some(s=>
    /SOURCE_TOP_LEVEL_NOT_ADMITTED|SOURCE_SEEKHEAD_GRAPH_PROOF_REQUIRED|SOURCE_CUES_GRAPH_PROOF_REQUIRED|SOURCE_TAGS_OR_CHAPTERS_NOT_PRESERVABLE|SOURCE_SEGMENT_CRC_UNVERIFIED/.test(s)));
}
if(!receipt.attachmentCount){
  assert.equal(admission.status,'BLOCKED','a no-attachment PCM file is not an original-attachment candidate');
  assert.ok(admission.reasons.includes('ORIGINAL_ATTACHMENT_COUNT_INVALID'));
}
const differentFile={
  name:source.name,size:source.size,lastModified:source.lastModified,
  slice:source.slice.bind(source),
};
const stale=await inspectS12OriginalAttachmentSource({
  reader,source:differentFile,intent:explicitIntent,
});
assert.deepEqual(stale.reasons,['EXACT_SOURCE_FILE_AUTHORITY_MISSING']);
assert.equal(stale.writerAuthorized,false);

console.log('S12 ACTUAL LARGE MKV READ-ONLY ADMISSION PASS',JSON.stringify({
  sourceBytes:size,kind:receipt.kind,
  originalAttachments:inventory.attachments.length,
  totalOriginalFileDataBytes:inventory.attachments.reduce((n,x)=>n+x.byteLength,0),
  readCalls:reads.length,maxReadBytes:Math.max(...reads.map(x=>x.length)),
  topLevel:inventory.structure.topLevelElements.map(x=>({
    id:'0x'+x.id.toString(16),count:x.count,
  })),
  admission:admission.status,reasons:admission.reasons,
  writerAuthorized:admission.writerAuthorized,publicationAuthorized:admission.publicationAuthorized,
}));
