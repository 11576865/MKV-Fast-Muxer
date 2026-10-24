import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectS12CuesClusterLocations } from '../src/s12-cues-cluster-proof.js';

const e=(id,body)=>{
  const part=body instanceof Blob?body:new Blob([body]);
  let n=BigInt(part.size);
  const size=Buffer.alloc(8);size[0]=1;
  for(let i=7;i>=1;i--){size[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(id,'hex'),size,part]);
};
const uint=n=>{
  let v=BigInt(n);const b=Buffer.alloc(8);
  for(let i=7;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}
  assert.equal(v,0n);return b;
};
const info=e('1549a966',Buffer.from('info'));
const tracks=e('1654ae6b',Buffer.from('tracks'));
const cluster=e('1f43b675',new Blob([e('e7',Buffer.from([0])),Buffer.alloc(4*1024*1024)]));
const goodPosition=info.size+tracks.size;
const cue=(location,{time=2,track=1,relative=null}={})=>
  e('bb',new Blob([
    e('b3',uint(time)),
    e('b7',new Blob([
      e('f7',uint(track)),
      e('f1',uint(location)),
      ...(relative===null?[]:[e('f0',uint(relative))]),
    ])),
  ]));
const crc32=bytes=>{
  let x=0xffffffff;
  for(const byte of bytes){
    x^=byte;
    for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);
  }
  return (x^0xffffffff)>>>0;
};
async function cues(payload,{withCrc=false,badCrc=false}={}){
  if(!withCrc)return e('1c53bb6b',payload);
  const bytes=Buffer.from(await payload.arrayBuffer());
  const crc=Buffer.alloc(4);crc.writeUInt32LE(crc32(bytes)^(badCrc?1:0));
  return e('1c53bb6b',new Blob([e('bf',crc),payload]));
}
const actual=async ({cuePos=goodPosition,time=2,track=1,relative=null,
    cueAbsent=false,cueTwice=false,withCrc=false,badCrc=false,
    unknownSegment=false}={})=>{
  const points=new Blob([cue(cuePos,{time,track,relative})]);
  const c=await cues(points,{withCrc,badCrc});
  const segments=[info,tracks,cluster,...(cueAbsent?[]:[c]),...(cueTwice?[c]:[])];
  const header=e('1a45dfa3',e('4282',Buffer.from('matroska')));
  const seg=e('18538067',new Blob(segments));
  const b=unknownSegment
    ?new Blob([header,Buffer.from('18538067ffffffffffffffff','hex'),new Blob(segments)])
    :new Blob([header,seg]);
  const reads=[];
  return {size:b.size,reads,slice(from,to,type){reads.push(to-from);return b.slice(from,to,type);}};
};
const inspect=async args=>{
  const file=await actual(args);
  const result=await inspectS12CuesClusterLocations(file);
  assert.equal(result.schema,'s12-cues-cluster-location-proof-v0');
  assert.equal(result.writerAuthorized,false);
  assert.equal(result.publicationAuthorized,false);
  assert.ok(file.reads.length>0);
  assert.ok(file.reads.every(n=>Number.isSafeInteger(n)&&n<=32&&n>=0),
    'Cues proof must never load whole Cluster or Attachment FileData');
  return result;
};
test('S12: a real EBML CuePoint points to exact Segment-relative Cluster offset',async()=>{
  const r=await inspect();
  assert.equal(r.status,'CUES_CLUSTER_POINTERS_VERIFIED',r.reasons.join('; '));
  assert.equal(r.cuePoints,1);
  assert.equal(r.locations.length,1);
  assert.equal(r.locations[0].matched,true);
  assert.equal(r.locations[0].clusterPosition,goodPosition);
});
test('S12: a CueClusterPosition shifted by one byte cannot be reported as verified',async()=>{
  const r=await inspect({cuePos:goodPosition+1});
  assert.equal(r.status,'CUES_UNVERIFIED');
  assert.ok(r.reasons.some(x=>x.startsWith('CUES_CLUSTER_POINTER_MISMATCH')));
});
test('S12: CueRelativePosition outside the pointed Cluster is blocked',async()=>{
  const r=await inspect({relative:cluster.size+10});
  assert.equal(r.status,'CUES_UNVERIFIED');
  assert.ok(r.reasons.some(x=>x.startsWith('CUES_RELATIVE_POSITION_OUT_OF_CLUSTER')));
});
test('S12: a valid Cues CRC-32 proves only its own bytes and referenced Cluster location',async()=>{
  const r=await inspect({withCrc:true});
  assert.equal(r.status,'CUES_CLUSTER_POINTERS_VERIFIED',r.reasons.join('; '));
  assert.equal(r.writerAuthorized,false);
});
test('S12: flipped checksum must not report the Cues as proven',async()=>{
  const r=await inspect({withCrc:true,badCrc:true});
  assert.equal(r.status,'CUES_UNVERIFIED');
  assert.ok(r.reasons.some(x=>x.includes('CUES_CRC_MISMATCH')));
});
test('S12: zero track and malformed duplicate Cues refuse',async()=>{
  for(const args of [{track:0},{cueTwice:true}]){
    const r=await inspect(args);
    assert.equal(r.status,'CUES_UNVERIFIED');
  }
});
test('S12: absent Cues is not successful evidence; unknown Segment cannot authorize writer',async()=>{
  const missing=await inspect({cueAbsent:true});
  assert.equal(missing.status,'NO_CUES');
  assert.equal(missing.cueClusterPointersVerified,false);
  const unknown=await inspect({unknownSegment:true});
  assert.equal(unknown.status,'CUES_UNVERIFIED');
  assert.ok(unknown.reasons.includes('CUES_EXACT_FINITE_SEGMENT_REQUIRED'));
});
