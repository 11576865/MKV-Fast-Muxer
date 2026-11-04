import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFoundationAttachmentCrc32}
  from '../src/foundation-attachment-crc32.js';

const crc32=buf=>{
  let value=0xffffffff;
  for(const byte of buf){
    value^=byte;
    for(let i=0;i<8;i++)
      value=value&1?(value>>>1)^0xedb88320:value>>>1;
  }
  return (value^0xffffffff)>>>0;
};
const field=(name,depth,offset,endOffset,dataBytes,master,id)=>({
  name,depth,offset:String(offset),endOffset:String(endOffset),
  dataBytes:String(dataBytes),master,id,
});
const fixture=(options={})=>{
  const payload=Buffer.from('serialized native attachment element');
  const crc=Buffer.alloc(6);
  crc[0]=0xbf;crc[1]=0x84;crc.writeUInt32LE(crc32(payload),2);
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
