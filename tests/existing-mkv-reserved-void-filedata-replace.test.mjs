import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  prepareReservedVoidFileDataReplacement,executeReservedVoidFileDataReplacement,
} from '../src/existing-mkv-reserved-void-filedata-replace.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';

const cat=(...parts)=>Buffer.concat(parts.map(x=>Buffer.from(x)));
function vint(n,width=null) {
  if(width===null){width=1;while(BigInt(n)>=(1n<<BigInt(7*width))-1n)width++;}
  let v=BigInt(n)|(1n<<BigInt(7*width)),b=Buffer.alloc(width);
  for(let i=width-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}
  return b;
}
const e=(id,p)=>cat(Buffer.from(id,'hex'),vint(p.length),p);
const voidElement=total=>e('EC',Buffer.alloc(total-2));
const mkFile=(bytes,name='source.mkv')=>{
  const b=new Blob([bytes]);b.name=name;b.lastModified=1;return b;
};
const payloadA=Buffer.from('TAGGED-FIRST-ATTACHMENT');
const payloadB=Buffer.from('UNTAGGED-SECOND-ATTACHMENT');
const sha=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
function mkv({slotBytes=150,tagSecond=false,crc=false,unknown=false,
  secondSlot=false,malformed=false}={}) {
  const attached=(uid,name,payload,withVoid)=>{
    const fields=cat(
      e('466E',Buffer.from(name)),
      e('4660',Buffer.from('application/octet-stream')),
      e('465C',payload),
      ...(withVoid?[voidElement(slotBytes)]:[]),
      e('46AE',Buffer.from([uid])),
      ...(crc?[e('BF',Buffer.alloc(4))]:[]),
    );
    return e('61A7',fields);
  };
  const content=cat(
    attached(3,'tagged.bin',payloadA,false),
    attached(4,'free.bin',payloadB,slotBytes>0),
  );
  const tagged=e('1254C367',e('7373',cat(
    e('63C0',e('63C6',Buffer.from([tagSecond?4:3]))),
    e('67C8',cat(e('45A3',Buffer.from('KEPT')),e('4487',Buffer.from('value')))),
  )));
  const chap=e('1043A770',e('45B9',e('B6',cat(
    e('73C4',Buffer.from([42])),
    e('B6',e('73C4',Buffer.from([43]))),
  ))));
  const body=cat(
    e('114D9B74',Buffer.alloc(0)),
    e('1549A966',e('2AD7B1',Buffer.from([15,66,64]))),
    e('1654AE6B',e('AE',e('73C5',Buffer.from([66])))),
    e('1F43B675',Buffer.alloc(96,0xa3)),
    chap,tagged,e('1941A469',content),
    ...(unknown?[e('4ABC',Buffer.from('opaque'))]:[]),
  );
  return mkFile(cat(e('1A45DFA3',e('4282',Buffer.from('matroska'))),
    e('18538067',body)));
}
async function prepare(source,replacement,opts={}){
  return prepareReservedVoidFileDataReplacement({
    source,replacement:mkFile(replacement,'replacement.bin'),targetFileUid:'4',
    approveVariableLength:true,...opts,
  });
}
test('P0/P2 larger replacement consumes only reserved Void and keeps protected original hierarchy, metadata and offsets',async()=>{
  const source=mkv(),sourceHash=await sha(source);
  const larger=Buffer.alloc(payloadB.length+65,0x51);
  const plan=await prepare(source,larger);
  assert.ok(Object.isFrozen(plan));
  assert.equal(plan.target.fileUid,'4');
  assert.equal(plan.target.newDataLength,larger.length);
  assert.equal(plan.slot.totalLength>larger.length,true);
  assert.equal(plan.execution.generalWriter,false);
  assert.ok(!JSON.stringify(plan).includes('QQQQQQ'));
  const out=await executeReservedVoidFileDataReplacement(plan);
  assert.equal(out.status,'LOCAL_RESERVED_VOID_VARIABLE_DATA_VERIFIED_EXTERNAL_AUDIT_PENDING');
  assert.equal(out.output.size,source.size);
  assert.equal(await sha(source),sourceHash);
  const before=await inspectRawSegmentPreservation(source),
    after=await inspectRawSegmentPreservation(out.output);
  assert.equal(after.state,'inspected');
  before.elements.forEach((x,i)=>{
    assert.equal(x.offset,after.elements[i].offset);
    assert.equal(x.byteLength,after.elements[i].byteLength);
    if(x.family==='protected')assert.equal(x.byteCommitment,after.elements[i].byteCommitment);
  });
  const reader=createMatroskaAttachmentReader(out.output),inventory=await reader.inspect();
  assert.equal(inventory.state,'inspected');
  assert.deepEqual(inventory.attachments.map(x=>x.fileUid),['3','4']);
  const actualA=await reader.openAttachment(inventory.attachments[0].id).data.arrayBuffer();
  const actualB=await reader.openAttachment(inventory.attachments[1].id).data.arrayBuffer();
  assert.deepEqual(Buffer.from(actualA),payloadA);
  assert.deepEqual(Buffer.from(actualB),larger);
});
test('P0/P2 smaller replacement expands reserved Void and keeps all unrelated objects byte-exact',async()=>{
  const source=mkv(),smaller=Buffer.from('short');
  const plan=await prepare(source,smaller);
  const out=await executeReservedVoidFileDataReplacement(plan);
  assert.equal(out.evidence.oldDataLength,payloadB.length);
  assert.equal(out.evidence.newDataLength,5);
  assert.equal(out.output.size,source.size);
  const reader=createMatroskaAttachmentReader(out.output);
  const inventory=await reader.inspect();
  assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[1].id).data.arrayBuffer()),smaller);
});
test('P0/P2 linked target, missing Void, CRC, unknown top-level, fake plan, no review or equal size refuse',async()=>{
  await assert.rejects(prepare(mkv({tagSecond:true}),Buffer.alloc(35)),/TAGGED_ATTACHMENT_BLOCKED/);
  await assert.rejects(prepare(mkv({slotBytes:0}),Buffer.alloc(35)),/ADJACENT_SLOT_REQUIRED/);
  await assert.rejects(prepare(mkv({crc:true}),Buffer.alloc(35)),/ATTACHED_CRC_REFUSED/);
  await assert.rejects(prepare(mkv({unknown:true}),Buffer.alloc(35)),/UNKNOWN_OR_UNVERIFIED_SOURCE/);
  await assert.rejects(prepare(mkv(),Buffer.alloc(payloadB.length)),/EQUAL_LENGTH_USE_EXISTING_WRITER/);
  await assert.rejects(prepare(mkv(),Buffer.alloc(35),{approveVariableLength:false}),/REVIEW_REQUIRED/);
  await assert.rejects(prepare(mkv(),Buffer.alloc(2_000)),/SIZE_VINT_CAPACITY|REMAINDER_TOO_SMALL/);
  const plan=await prepare(mkv(),Buffer.alloc(35));
  await assert.rejects(executeReservedVoidFileDataReplacement({...plan}),/FORGED_OR_STALE_PLAN/);
});
