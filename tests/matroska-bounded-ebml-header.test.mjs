import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedEbmlHeader,rethrowBoundedHeaderError}
  from '../src/matroska-bounded-ebml-header.js';

const id=Buffer.from('1941a469','hex');
function vint(value,width) {
  let n=BigInt(value) | (1n<<BigInt(width*7));
  const bytes=Buffer.alloc(width);
  for(let i=width-1;i>=0;i--){bytes[i]=Number(n&255n);n>>=8n;}
  return bytes;
}
const bytes=(...parts)=>Buffer.concat(parts.map(x=>Buffer.from(x)));
function virtualSource(prefix,total=prefix.length) {
  return {
    size:total,
    slice(start,end) {
      return new Blob([prefix.subarray(start,Math.min(end,prefix.length))]);
    },
  };
}
const expectReason=async(file,at,bound,reason)=>{
  await assert.rejects(readBoundedEbmlHeader(file,at,bound),
    e=>e?.reason===reason && e.message==='EBML_BOUNDED_HEADER_'+reason);
};

test('bounded EBML header consumes only a small prefix, even with huge payload',async()=>{
  for(const [width,length] of [[1,0],[1,12],[2,200],[3,20_000],
    [4,2_100_000],[7,4_000_000_000],[8,8_000_000_000]]){
    const hdr=bytes(id,vint(length,width));
    const file=virtualSource(hdr,hdr.length+length);
    const result=await readBoundedEbmlHeader(file,0,file.size);
    assert.equal(result.id,0x1941a469);
    assert.equal(result.idWidth,4);
    assert.equal(result.sizeWidth,width);
    assert.equal(result.dataStart,hdr.length);
    assert.equal(result.end,file.size);
    assert.equal(result.size,length);
    assert.equal(Object.isFrozen(result),true);
  }
});

test('bounded EBML headers reject bad ranges, unknown VINT, huge & truncated sizes',async()=>{
  const valid=bytes(id,vint(1,1),[0x77]);
  await expectReason(virtualSource(valid),-1,valid.length,'RANGE');
  await expectReason(virtualSource(valid),0,valid.length+1,'RANGE');
  await expectReason(virtualSource(Buffer.from([0x00])),0,1,'ID_INVALID');
  await expectReason(virtualSource(Buffer.from([0x10])),0,1,'ID_TRUNCATED');
  await expectReason(virtualSource(bytes(id,[0])),0,5,'SIZE_INVALID');
  await expectReason(virtualSource(bytes(id,[0x01])),0,5,'SIZE_TRUNCATED');
  await expectReason(virtualSource(bytes(id,[0xff])),0,5,'UNKNOWN_OR_UNADDRESSABLE_SIZE');
  await expectReason(virtualSource(bytes(id,vint(1n<<54n,8)),Number.MAX_SAFE_INTEGER),
    0,Number.MAX_SAFE_INTEGER,'UNKNOWN_OR_UNADDRESSABLE_SIZE');
  await expectReason(virtualSource(bytes(id,vint(100,1))),0,5,'ELEMENT_OUT_OF_BOUNDS');
});

test('writer error translation preserves exact public code and does not hide unexpected errors',()=>{
  const original=Error('EBML_BOUNDED_HEADER_SIZE_INVALID');
  original.reason='SIZE_INVALID';
  assert.throws(()=>rethrowBoundedHeaderError(original,'RELAY_',{
    SIZE_INVALID:'INVALID_SIZE',
  }),e=>e?.message==='RELAY_INVALID_SIZE'&&e.cause===original);
  const unrelated=Error('BUG_IN_UNRELATED_CODE');
  assert.throws(()=>rethrowBoundedHeaderError(unrelated,'RELAY_',{
    SIZE_INVALID:'INVALID_SIZE',
  }),e=>e===unrelated);
  const unknown=Error('EBML_BOUNDED_HEADER_FUTURE_REASON');
  unknown.reason='FUTURE_REASON';
  assert.throws(()=>rethrowBoundedHeaderError(unknown,'RELAY_',{
    SIZE_INVALID:'INVALID_SIZE',
  }),e=>e===unknown);
});
