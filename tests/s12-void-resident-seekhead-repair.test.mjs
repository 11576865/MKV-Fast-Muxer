import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planS12VoidResidentSeekHeadRepair } from '../research/s12-void-resident-seekhead-repair.mjs';
import { inspectS12SeekHeadIndex } from '../src/s12-seekhead-index-proof.js';
import { inspectS12CuesClusterLocations } from '../src/s12-cues-cluster-proof.js';

const el=(hex,part)=>{
  const blob=part instanceof Blob?part:new Blob([part]);
  let n=BigInt(blob.size);
  const size=Buffer.alloc(8);size[0]=1;
  for(let i=7;i>=1;i--){size[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(hex,'hex'),size,blob]);
};
const eight=v=>{
  const b=Buffer.alloc(8);let n=BigInt(v);
  for(let i=7;i>=0;i--){b[i]=Number(n&255n);n>>=8n;}return b;
};
const ieeeCRC=data=>{
  let c=0xffffffff;
  for(const x of data){
    c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
};
const posEntry=(id,pos)=>el('4dbb',new Blob([
  el('53ab',Buffer.from(id,'hex')),el('53ac',eight(pos)),
]));
async function head(entries,{badCRC=false}={}){
  const payload=new Blob(entries.map(x=>posEntry(...x)));
  const crc=Buffer.alloc(4);
  crc.writeUInt32LE((ieeeCRC(new Uint8Array(await payload.arrayBuffer()))^(badCRC?1:0))>>>0);
  return el('114d9b74',new Blob([el('bf',crc),payload]));
}
const make=async ({reserve=4096,noVoid=false,badCRC=false,badPointer=false,
  withCues=true,segmentCRC=false}={})=>{
  const info=el('1549a966',Buffer.from('metadata'));
  const tracks=el('1654ae6b',el('ae',el('d7',Buffer.from([1]))));
  const blockPayload=Buffer.alloc(3*1024*1024+4,0x42);
  blockPayload.set([0x81,0,0,0x80],0);
  const cluster=el('1f43b675',new Blob([
    el('e7',Buffer.from([0])),el('a3',blockPayload),
  ]));
  const placeholder=await head([['1549a966',0],['1654ae6b',0],
    ...(withCues?[['1c53bb6b',0]]:[])],{badCRC});
  const reserveEl=noVoid?null:el('ec',Buffer.alloc(reserve));
  const first=placeholder.size+(reserveEl?.size||0)+(segmentCRC?el('bf',Buffer.alloc(4)).size:0);
  const i=first,t=i+info.size,c=t+tracks.size;
  const cuePoint=el('bb',new Blob([
    el('b3',eight(0)),el('b7',new Blob([
      el('f7',eight(1)),el('f1',eight(c)),
    ])),
  ]));
  const cues=el('1c53bb6b',cuePoint);
  const cu=c+cluster.size;
  const realHead=await head([
    ['1549a966',i+(badPointer?1:0)],['1654ae6b',t],
    ...(withCues?[['1c53bb6b',cu]]:[]),
  ],{badCRC});
  assert.equal(realHead.size,placeholder.size);
  const segmentPayload=new Blob([
    ...(segmentCRC?[el('bf',Buffer.alloc(4))]:[]),
    realHead,...(reserveEl?[reserveEl]:[]),info,tracks,cluster,
    ...(withCues?[cues]:[]),
  ]);
  const source=new Blob([
    el('1a45dfa3',el('4282',Buffer.from('matroska'))),
    el('18538067',segmentPayload),
  ],{type:'video/x-matroska'});
  return {source,cluster,offset:c,info,tracks,cues,head:realHead,void:reserveEl};
};
async function hash(blob){
  return createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
}
test('S12 research: normalize missing Cluster SeekHead inside reserved Void with zero relocation',async()=>{
  const {source,cluster,offset,head:old,void:v}=await make();
  const before=await inspectS12SeekHeadIndex(source);
  assert.equal(before.status,'INDEX_UNVERIFIED');
  assert.ok(before.reasons.some(x=>x.startsWith('INDEX_MISSING_TOP_LEVEL:')));
  const inputCues=await inspectS12CuesClusterLocations(source);
  assert.equal(inputCues.status,'CUES_CLUSTER_POINTERS_VERIFIED');
  const received=[];
  const wrapped={size:source.size,type:source.type,slice(a,b,t){
    received.push(b-a);return source.slice(a,b,t);
  }};
  const repair=await planS12VoidResidentSeekHeadRepair(wrapped);
  assert.equal(repair.status,'RESEARCH_BLOB_SCOPED_VALIDATED',repair.reasons.join('; '));
  assert.equal(repair.writerAuthorized,false);
  assert.equal(repair.publicationAuthorized,false);
  assert.equal(repair.sourceSize,repair.resultSize);
  assert.equal(repair.sourceIndexStatus,'INDEX_UNVERIFIED');
  assert.equal(repair.resultIndexStatus,'INDEX_REFERENCES_VERIFIED');
  assert.equal(repair.patchBytes,old.size+v.size);
  assert.ok(repair.remainingVoidBytes>0);
  assert.ok(received.length>0&&received.every(n=>n>=0&&n<=12),
    'all content inspection must use bounded header/field slices');
  const after=await inspectS12SeekHeadIndex(repair.researchBlob);
  assert.equal(after.status,'INDEX_REFERENCES_VERIFIED',after.reasons.join(';'));
  assert.equal((await inspectS12CuesClusterLocations(repair.researchBlob)).status,
    'CUES_CLUSTER_POINTERS_VERIFIED');
  const clusterStart=source.size-
    (cluster.size+(await make()).cues.size);
  assert.ok(clusterStart>=0);
  assert.equal(await hash(source.slice(clusterStart,clusterStart+cluster.size)),
    await hash(repair.researchBlob.slice(clusterStart,clusterStart+cluster.size)),
    'the entire 3 MiB media element must remain exactly byte-for-byte identical');
  assert.equal(await hash(source.slice(source.size-1000)),
    await hash(repair.researchBlob.slice(repair.researchBlob.size-1000)),
    'Cues/EOF bytes and offsets remain identical');
});
test('S12 research: insufficient contiguous Void refuses without producing a partial Blob',async()=>{
  const {source}=await make({reserve:3});
  const r=await planS12VoidResidentSeekHeadRepair(source);
  assert.equal(r.status,'REFUSED',r.reasons.join(';'));
  assert.ok(r.reasons.includes('VOID_REPAIR_NOT_ENOUGH_RESERVED_BYTES'));
  assert.ok(r.missingBytes>0);
  assert.equal(r.researchBlob,undefined);
});
test('S12 research: absence of immediately adjacent Void cannot silently move the Cluster',async()=>{
  const {source}=await make({noVoid:true});
  const r=await planS12VoidResidentSeekHeadRepair(source);
  assert.equal(r.status,'REFUSED');
  assert.ok(r.reasons.includes('VOID_REPAIR_ADJACENT_VOID_REQUIRED'));
});
test('S12 research: changed original seek pointer or invalid CRC is never an eligible repair source',async()=>{
  for(const args of [{badPointer:true},{badCRC:true}]){
    const {source}=await make(args);
    const r=await planS12VoidResidentSeekHeadRepair(source);
    assert.equal(r.status,'REFUSED');
    assert.ok(r.reasons.includes('VOID_REPAIR_PREEXISTING_INDEX_UNTRUSTED'));
  }
});
test('S12 research: parent Segment CRC cannot be kept valid by patching only SeekHead',async()=>{
  const {source}=await make({segmentCRC:true});
  const r=await planS12VoidResidentSeekHeadRepair(source);
  assert.equal(r.status,'REFUSED');
  assert.equal(r.writerAuthorized,false);
});
test('S12 research: no Cues still allows precise SeekHead coverage without inventing cue proof',async()=>{
  const {source}=await make({withCues:false});
  const r=await planS12VoidResidentSeekHeadRepair(source);
  assert.equal(r.status,'RESEARCH_BLOB_SCOPED_VALIDATED',r.reasons.join(';'));
  assert.equal(r.originalCueStatus,'NO_CUES');
  assert.equal(r.originalCuePointers,0);
  assert.equal((await inspectS12SeekHeadIndex(r.researchBlob)).status,
    'INDEX_REFERENCES_VERIFIED');
  assert.equal((await inspectS12CuesClusterLocations(r.researchBlob)).status,'NO_CUES');
});
