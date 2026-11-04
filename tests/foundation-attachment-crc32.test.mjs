import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFoundationAttachmentCrc32}
  from '../src/foundation-attachment-crc32.js';
import {crc32IEEE,ebmlCrc32LE} from '../src/ebml-crc32-bounded.js';

const crcField=bytes=>Buffer.concat([
  Buffer.from([0xbf,0x84]),Buffer.from(ebmlCrc32LE(crc32IEEE(bytes))),
]);
const field=(name,depth,offset,endOffset,dataBytes,master,id)=>({
  name,depth,offset:String(offset),endOffset:String(endOffset),
  dataBytes:String(dataBytes),master,id,
});
const fixture=(options={})=>{
  const payload=Buffer.from('serialized native attachment element');
  const crc=crcField(payload);
  if(options.corrupt)crc[2]^=0x20;
  const header=Buffer.from([0x19,0x41,0xa4,0x69,0x80|(6+payload.length)]);
  const bytes=Buffer.concat([header,crc,payload]);
  const blob=new Blob([bytes]);
  const file={size:blob.size,slice:(a,b)=>blob.slice(a,b)};
  const nodes=[
    field('Attachments',0,0,bytes.length,bytes.length-5,true,'0x1941a469'),
    field('EBMLCrc32',1,5,11,4,false,'0x000000bf'),
    field('AttachedFile',1,11,bytes.length,payload.length,false,'0x000061a7'),
  ];
  if(options.misplaced)[nodes[1],nodes[2]]=[nodes[2],nodes[1]];
  if(options.otherScope)nodes[0].id='0x1549a966';
  if(options.overBudget){
    nodes[0].endOffset=String(4*1024*1024+100);
    nodes[0].dataBytes=String(4*1024*1024+95);
    file.size=4*1024*1024+100;
  }
  return {file,observation:{state:'inspected',nodes},crc};
};
test('valid CRC little endian validates serialized Attachments bytes',async()=>{
  const result=await verifyFoundationAttachmentCrc32(fixture());
  assert.equal(result.checked,1);
  assert.equal(result.bytesRead,36);
  assert.equal(result.fullContainerCRCVerified,false);
  assert.equal(result.writerAuthorization,false);
  assert.equal(result.coverage,'attachments-and-attached-file-only');
});
test('single-bit CRC corruption is fail-closed',async()=>{
  await assert.rejects(
    verifyFoundationAttachmentCrc32(fixture({corrupt:true})),
    /FOUNDATION_CRC32_MISMATCH/);
});
test('CRC not first child is not accepted',async()=>{
  await assert.rejects(
    verifyFoundationAttachmentCrc32(fixture({misplaced:true})),
    /FOUNDATION_CRC_MISPLACED_OR_REPEATED/);
});
test('oversized CRC-backed attachment is rejected without full payload copy',async()=>{
  await assert.rejects(
    verifyFoundationAttachmentCrc32(fixture({overBudget:true})),
    /FOUNDATION_CRC_RESOURCE_LIMIT/);
});
test('CRC outside attachment inventory is not misrepresented as verified',async()=>{
  const result=await verifyFoundationAttachmentCrc32(
    fixture({otherScope:true}));
  assert.equal(result.checked,0);
  assert.equal(result.fullContainerCRCVerified,false);
});

function nestedFixture(corruptInner=false){
  const fileData=Buffer.from([0x46,0x5c,0x83,0x21,0x43,0x65]);
  const innerCRC=crcField(fileData);
  if(corruptInner)innerCRC[2]^=0x01;
  const attachedPayload=Buffer.concat([innerCRC,fileData]);
  const attached=Buffer.concat([
    Buffer.from([0x61,0xa7,0x80|attachedPayload.length]),
    attachedPayload,
  ]);
  // Even in the negative, this outer CRC is recalculated and valid.
  const outerCRC=crcField(attached);
  const rootPayload=Buffer.concat([outerCRC,attached]);
  const buf=Buffer.concat([
    Buffer.from([0x19,0x41,0xa4,0x69,0x80|rootPayload.length]),
    rootPayload,
  ]);
  const outerCrcStart=5,attachedAt=11,innerCrcAt=attachedAt+3;
  const nodes=[
    field('Attachments',0,0,buf.length,rootPayload.length,true,'0x1941a469'),
    field('EBMLCrc32',1,outerCrcStart,outerCrcStart+6,4,false,'0xbf'),
    field('AttachedFile',1,attachedAt,buf.length,attachedPayload.length,
      true,'0x61a7'),
    field('EBMLCrc32',2,innerCrcAt,innerCrcAt+6,4,false,'0xbf'),
    field('FileData',2,innerCrcAt+6,buf.length,3,false,'0x465c'),
  ];
  const blob=new Blob([buf]);
  return {file:{size:buf.length,slice:(a,b)=>blob.slice(a,b)},
    observation:{state:'inspected',nodes}};
}
test('nested Attachments/AttachedFile CRCs both execute',async()=>{
  const result=await verifyFoundationAttachmentCrc32(nestedFixture());
  assert.equal(result.checked,2);
  assert.equal(result.bytesRead,15+6);
  assert.equal(result.fullContainerCRCVerified,false);
});
test('a correct outer CRC cannot conceal an invalid inner AttachedFile CRC',async()=>{
  await assert.rejects(
    verifyFoundationAttachmentCrc32(nestedFixture(true)),
    /FOUNDATION_CRC32_MISMATCH/);
});
