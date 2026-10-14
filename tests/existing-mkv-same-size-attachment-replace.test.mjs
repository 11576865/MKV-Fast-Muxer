import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import {
  prepareSameSizeAttachmentReplacement,
  executeSameSizeAttachmentReplacement,
} from '../src/existing-mkv-same-size-attachment-replace.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';

const concat = (...xs) => Buffer.concat(xs.map(x => Buffer.from(x)));
function vint(n) {
  let width = 1;
  while (BigInt(n) >= (1n << BigInt(width * 7)) - 1n) width++;
  let v = BigInt(n) | (1n << BigInt(width * 7));
  const bytes = Buffer.alloc(width);
  for (let i = width - 1; i >= 0; i--) { bytes[i] = Number(v & 255n); v >>= 8n; }
  return bytes;
}
const el = (id, data) => {
  const payload = Buffer.from(data);
  return concat(Buffer.from(id,'hex'),vint(payload.length),payload);
};
const file = (bytes,name) => {
  const blob = new Blob([bytes]); blob.name = name; blob.lastModified = 1234;
  return blob;
};
const oldA = Buffer.from('TAGGED-attached-old-A');
const oldB = Buffer.from('DECOY-attached-old-B');
const newB = Buffer.from('UPDATED-decoy-data-B');
assert.equal(oldB.length,newB.length);
const attached = (uid,name,data,{crc = false}={}) => el('61A7',concat(
  el('466E',Buffer.from(name)),
  el('4660',Buffer.from('application/octet-stream')),
  el('465C',data),
  el('46AE',Buffer.from([uid])),
  ...(crc ? [el('BF',Buffer.from([0,0,0,0]))] : []),
));
function fixture({ targetedDecoy = false, outerCrc = false, innerCrc = false,
  unknownTop = false, duplicateUid = false }={}) {
  const master = el('1941A469',concat(
    ...(outerCrc ? [el('BF',Buffer.alloc(4))] : []),
    attached(3,'original-first.bin',oldA),
    attached(duplicateUid ? 3 : 4,'original-second.bin',oldB,{crc:innerCrc}),
  ));
  const tags = el('1254C367',el('7373',concat(
    el('63C0',el('63C6',Buffer.from([targetedDecoy?4:3]))),
    el('67C8',concat(el('45A3',Buffer.from('ORIGINAL_TARGET')),
      el('4487',Buffer.from('untouched-tag-value')))),
  )));
  const chapters = el('1043A770',el('45B9',
    el('B6',concat(el('73C4',[12]),
      el('B6',el('73C4',[13]))))));
  const body = concat(
    el('114D9B74',Buffer.alloc(0)),
    el('1549A966',el('2AD7B1',[15,66,64])),
    el('1654AE6B',el('AE',el('73C5',[5]))),
    el('1F43B675',Buffer.alloc(128,0xa3)),
    chapters,tags,master,
    ...(unknownTop?[el('4ABC',Buffer.from('unknown'))]:[]),
  );
  return file(concat(el('1A45DFA3',el('4282',Buffer.from('matroska'))),
    el('18538067',body)),'original.mkv');
}
const prepare = (source=fixture(), replacement=file(newB,'replacement.bin'),opts={}) =>
  prepareSameSizeAttachmentReplacement({
    source,replacement,targetFileUid:'4',
    acknowledgeContentReplacement:true,...opts,
  });
const sha = async blob => createHash('sha256')
  .update(Buffer.from(await blob.arrayBuffer())).digest('hex');

test('P0/P2 real bounded Blob replacement preserves original nested chapters, tags, UID and exact media bytes',async()=>{
  const source = fixture(),replacement=file(newB,'replacement.bin');
  const beforeHash=await sha(source);
  const plan=await prepare(source,replacement);
  assert.equal(Object.isFrozen(plan),true);
  assert.equal(plan.target.fileUid,'4');
  assert.equal(plan.target.byteLength,newB.length);
  assert.equal(plan.execution.originalFileOverwrite,false);
  assert.equal(JSON.stringify(plan).includes('REPLACED-decoy-data-B'),false);
  assert.equal(plan.evidence.authorizesGeneralMatroskaWriter,false);
  const out=await executeSameSizeAttachmentReplacement(plan);
  assert.equal(out.status,'LOCAL_BYTE_AND_INVENTORY_VERIFIED_EXTERNAL_AUDIT_PENDING');
  assert.equal(out.output.size,source.size);
  assert.notEqual(out.evidence.outputSha256,out.evidence.sourceSha256);
  assert.equal(await sha(source),beforeHash);
  const oldScan=await inspectRawSegmentPreservation(source);
  const newScan=await inspectRawSegmentPreservation(out.output);
  assert.equal(oldScan.state,'inspected');
  assert.equal(newScan.state,'inspected');
  oldScan.elements.forEach((entry,index)=>{
    const next=newScan.elements[index];
    assert.equal(next.offset,entry.offset);
    assert.equal(next.byteLength,entry.byteLength);
    if(entry.family==='protected')assert.equal(next.byteCommitment,entry.byteCommitment);
  });
  const reader=createMatroskaAttachmentReader(out.output);
  const inv=await reader.inspect();
  assert.equal(inv.attachments.length,2);
  assert.deepEqual(inv.attachments.map(x=>x.fileUid),['3','4']);
  const bytes=await reader.openAttachment(inv.attachments[1].id).data.arrayBuffer();
  assert.deepEqual(Buffer.from(bytes),newB);
  const original=await reader.openAttachment(inv.attachments[0].id).data.arrayBuffer();
  assert.deepEqual(Buffer.from(original),oldA);
});
test('targeted UID and unknown/CRC-bearing source layouts fail closed',async()=>{
  await assert.rejects(prepare(fixture({targetedDecoy:true})),/TARGETED_ATTACHMENT_UID_BLOCKED/);
  await assert.rejects(prepare(fixture({outerCrc:true})),/ATTACHMENTS_CRC_UNSUPPORTED/);
  await assert.rejects(prepare(fixture({innerCrc:true})),/ATTACHEDFILE_CRC_UNSUPPORTED/);
  await assert.rejects(prepare(fixture({unknownTop:true})),/SOURCE_RAW_OR_UNKNOWN_BLOCKED/);
  await assert.rejects(prepare(fixture({duplicateUid:true})),/INVENTORY_UNVERIFIED/);
});
test('same-size-only and explicit permission, genuine frozen plan and real mutation',async()=>{
  await assert.rejects(prepare(fixture(),file('short','tiny.bin')),/LENGTH_MISMATCH/);
  await assert.rejects(prepare(fixture(),file(oldB,'same.bin')),/NO_CONTENT_CHANGE/);
  await assert.rejects(prepare(fixture(),file(newB,'change.bin'),{
    acknowledgeContentReplacement:false,
  }),/EXPLICIT_REVIEW_REQUIRED/);
  await assert.rejects(prepare(fixture(),file(newB,'change.bin'),{
    targetFileUid:'3',
  }),/LENGTH_MISMATCH|TARGETED_ATTACHMENT_UID_BLOCKED/);
  const plan=await prepare();
  await assert.rejects(executeSameSizeAttachmentReplacement(JSON.parse(JSON.stringify(plan))),
    /FORGED_OR_STALE_PLAN/);
  await assert.rejects(executeSameSizeAttachmentReplacement({...plan}),
    /FORGED_OR_STALE_PLAN/);
});
