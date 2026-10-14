import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  prepareTailAttachmentResize,executeTailAttachmentResize,
} from '../src/existing-mkv-tail-attachment-resize.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';

const cat=(...pieces)=>Buffer.concat(pieces.map(x=>Buffer.from(x)));
function size(n,w=null){
  if(w===null){w=1;while(BigInt(n)>=(1n<<BigInt(7*w))-1n)w++;}
  let n0=BigInt(n)|(1n<<BigInt(7*w));const b=Buffer.alloc(w);
  for(let i=w-1;i>=0;i--){b[i]=Number(n0&255n);n0>>=8n;}return b;
}
const el=(id,bytes,{width=null}={})=>cat(Buffer.from(id,'hex'),
  size(bytes.length,width),bytes);
const mkFile=(bytes,name='tail.mkv')=>{
  const blob=new Blob([bytes]);blob.name=name;return blob;
};
const originalTagged=Buffer.from('TAGGED-ATTACHMENT-UNCHANGED');
const originalFree=Buffer.from('FREE-ATTACHMENT-FILEDATA');
function attached(uid,name,bytes,{crc=false,unknown=false,dataWidth=2}={}){
  return el('61A7',cat(
    el('466E',Buffer.from(name)),
    el('4660',Buffer.from('application/octet-stream')),
    el('465C',bytes,{width:dataWidth}),
    ...(unknown?[el('4ABC',Buffer.from([1]))]:[]),
    el('46AE',Buffer.from([uid])),
    ...(crc?[el('BF',Buffer.alloc(4))]:[]),
  ),{width:2});
}
function source({attachmentsLast=true,tagFree=false,crc=false,unknown=false,
    unknownTop=false,unknownSize=false,freeDataWidth=2}={}){
  const target=el('1254C367',el('7373',cat(
    el('63C0',el('63C6',Buffer.from([tagFree?4:3]))),
    el('67C8',cat(el('45A3',Buffer.from('KEPT')),el('4487',Buffer.from('Value')))),
  )));
  const chapters=el('1043A770',el('45B9',el('B6',cat(
    el('73C4',Buffer.from([17])),el('B6',el('73C4',Buffer.from([18]))),
  ))));
  const attachmentMaster=el('1941A469',cat(
    attached(3,'tagged.bin',originalTagged),
    attached(4,'free.bin',originalFree,{crc,unknown,dataWidth:freeDataWidth}),
  ),{width:3});
  const info=el('1549A966',el('2AD7B1',Buffer.from([15,66,64])));
  const tracks=el('1654AE6B',el('AE',el('73C5',Buffer.from([55]))));
  const cluster=el('1F43B675',Buffer.alloc(104,0xa3));
  const seek=el('114D9B74',Buffer.alloc(0));
  const children=cat(seek,info,tracks,cluster,chapters,target,
    ...(unknownTop?[el('4ABC',Buffer.from('UNRECOGNIZED'))]:[]),
    ...(attachmentsLast?[attachmentMaster,Buffer.alloc(0)]:[attachmentMaster,el('EC',Buffer.alloc(12))]));
  const segment=el('18538067',children,{width:5});
  if(unknownSize){
    const b=Buffer.from(segment);
    b.fill(0xff,4,9);
    return mkFile(cat(el('1A45DFA3',el('4282',Buffer.from('matroska'))),b));
  }
  return mkFile(cat(el('1A45DFA3',el('4282',Buffer.from('matroska'))),segment));
}
const blob=bytes=>mkFile(bytes,'changed.bin');
const prepare=(src,replacement,opts={})=>
  prepareTailAttachmentResize({source:src,replacement:blob(replacement),
    targetFileUid:'4',approveTailResize:true,...opts});
const sha=async x=>createHash('sha256').update(Buffer.from(await x.arrayBuffer())).digest('hex');

test('P0/P2 tail no-Void: grows final AttachedFile FileData, preserves nested Chapters, target Tags, other FileUID, original Cluster bytes and fixed offsets',async()=>{
  const src=source(),oldSha=await sha(src);
  const larger=Buffer.alloc(originalFree.length+70,0x58);
  const plan=await prepare(src,larger);
  assert.equal(Object.isFrozen(plan),true);
  assert.equal(plan.layout.rewrittenSizeFields,4);
  assert.equal(plan.layout.delta,70);
  assert.equal(plan.layout.noTopLevelElementMoved,true);
  assert.equal(plan.evidence.generalMatroskaWriter,false);
  const delivered=await executeTailAttachmentResize(plan);
  assert.equal(delivered.status,'TAIL_FOUR_SIZE_FIELDS_AND_MEDIA_BYTE_PROVEN_EXTERNAL_AUDIT_PENDING');
  assert.equal(delivered.output.size,src.size+70);
  assert.equal(await sha(src),oldSha);
  const [raw0,raw1]=await Promise.all([
    inspectRawSegmentPreservation(src),inspectRawSegmentPreservation(delivered.output),
  ]);
  assert.equal(raw1.state,'inspected');
  for(let i=0;i<raw0.elements.length;i++){
    assert.equal(raw0.elements[i].offset,raw1.elements[i].offset);
    if(raw0.elements[i].family==='protected')
      assert.equal(raw0.elements[i].byteCommitment,raw1.elements[i].byteCommitment);
  }
  const reader=createMatroskaAttachmentReader(delivered.output),list=await reader.inspect();
  assert.deepEqual(list.attachments.map(x=>x.fileUid),['3','4']);
  assert.deepEqual(Buffer.from(await reader.openAttachment(list.attachments[0].id).data.arrayBuffer()),originalTagged);
  assert.deepEqual(Buffer.from(await reader.openAttachment(list.attachments[1].id).data.arrayBuffer()),larger);
  assert.equal(list.attachments[1].filename,'free.bin');
});
test('P0/P2 tail no-Void: shrinks final FileData without moving any original non-Attachments raw offset',async()=>{
  const src=source();
  const output=await executeTailAttachmentResize(await prepare(src,Buffer.from('NEW')));
  assert.equal(output.output.size,src.size+3-originalFree.length);
  const a=await inspectRawSegmentPreservation(src),b=await inspectRawSegmentPreservation(output.output);
  assert.deepEqual(b.elements.map(x=>x.offset),a.elements.map(x=>x.offset));
  const r=createMatroskaAttachmentReader(output.output),inv=await r.inspect();
  assert.equal(inv.attachments[1].byteLength,3);
  assert.deepEqual(Buffer.from(await r.openAttachment(inv.attachments[1].id).data.arrayBuffer()),Buffer.from('NEW'));
});
test('P0/P2 tail no-Void: deny referenced target, CRC, unknown master, parent not final, unknown top-level, VINT overflow, no-change, forged authority',async()=>{
  await assert.rejects(prepare(source({tagFree:true}),Buffer.alloc(35)),/REFERENCED_FILEUID_DENIED/);
  await assert.rejects(prepare(source({crc:true}),Buffer.alloc(35)),/ATTACHEDFILE_CRC_DENIED/);
  await assert.rejects(prepare(source({unknown:true}),Buffer.alloc(35)),/ATTACHEDFILE_UNKNOWN_FIELD/);
  await assert.rejects(prepare(source({attachmentsLast:false}),Buffer.alloc(35)),/ATTACHMENTS_MUST_BE_FINAL_SEGMENT_CHILD/);
  await assert.rejects(prepare(source({unknownTop:true}),Buffer.alloc(35)),/RAW_SOURCE_NOT_ELIGIBLE/);
  await assert.rejects(prepare(source({unknownSize:true}),Buffer.alloc(35)),/RAW_SOURCE_NOT_ELIGIBLE/);
  await assert.rejects(prepare(source({freeDataWidth:1}),Buffer.alloc(130)),/FIXED_SIZE_FIELD_CAPACITY_EXCEEDED/);
  await assert.rejects(prepare(source(),Buffer.alloc(originalFree.length)),/EQUAL_SIZE_USE_VERIFIED_LOCAL_WRITER/);
  await assert.rejects(prepare(source(),Buffer.alloc(35),{approveTailResize:false}),/EXPLICIT_REVIEW_REQUIRED/);
  const plan=await prepare(source(),Buffer.alloc(35));
  await assert.rejects(executeTailAttachmentResize({...plan}),/FORGED_OR_DETACHED_PLAN/);
  await assert.rejects(executeTailAttachmentResize(JSON.parse(JSON.stringify(plan))),/FORGED_OR_DETACHED_PLAN/);
});
