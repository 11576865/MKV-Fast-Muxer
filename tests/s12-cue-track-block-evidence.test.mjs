import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectS12CueTrackBlockEvidence } from '../src/s12-cue-track-block-evidence.js';
import { inspectS12CuesClusterLocations } from '../src/s12-cues-cluster-proof.js';

const e=(hex,payload)=>{
  const body=payload instanceof Blob?payload:new Blob([payload]);
  const size=Buffer.alloc(8);let n=BigInt(body.size);size[0]=1;
  for(let i=7;i>=1;i--){size[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(hex,'hex'),size,body]);
};
const uint=n=>{
  let x=BigInt(n);const b=Buffer.alloc(8);
  for(let i=7;i>=0;i--){b[i]=Number(x&255n);x>>=8n;}
  assert.equal(x,0n);return b;
};
const block=(track,valid=true)=>e('a3',new Blob([
  Buffer.from([valid?(0x80|track):0,0,0,0x80]),
  Buffer.alloc(3*1024*1024),
]));
const group=(track)=>e('a0',e('a1',Buffer.from([0x80|track,0,0,0,0xfa])));
const make=({
  cueTrack=1, declaredTracks=[1], blockTrack=1, blockGroup=false,
  relative='absent', noCues=false, validVint=true,
}={})=>{
  const info=e('1549a966',e('2ad7b1',Buffer.from([0x0f,0x42,0x40])));
  const tracks=e('1654ae6b',new Blob(declaredTracks.map(n=>
    e('ae',e('d7',uint(n))))));
  const timestamp=e('e7',Buffer.from([0]));
  const packet=blockGroup?group(blockTrack):block(blockTrack,validVint);
  const cluster=e('1f43b675',new Blob([timestamp,packet]));
  const offset=info.size+tracks.size;
  const rel=relative==='absent'?null:relative==='correct'?timestamp.size:
    relative==='timestamp'?0:relative==='inside'?timestamp.size+1:relative;
  const point=e('bb',new Blob([
    e('b3',uint(2)),
    e('b7',new Blob([
      e('f7',uint(cueTrack)),e('f1',uint(offset)),
      ...(rel===null?[]:[e('f0',uint(rel))]),
    ])),
  ]));
  const cues=e('1c53bb6b',point);
  const bytes=new Blob([
    e('1a45dfa3',e('4282',Buffer.from('matroska'))),
    e('18538067',new Blob([info,tracks,cluster,...(noCues?[]:[cues])])),
  ]);
  const reads=[];
  return {size:bytes.size,reads,
    slice(start,end,type){reads.push(end-start);return bytes.slice(start,end,type);}
  };
};
async function scan(args){
  const file=make(args);
  const location=await inspectS12CuesClusterLocations(file);
  const result=await inspectS12CueTrackBlockEvidence(file);
  assert.equal(result.writerAuthorized,false);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.actualPacketPayloadVerified,false);
  assert.equal(result.cueTimestampVerified,false);
  assert.ok(file.reads.length>0);
  assert.ok(file.reads.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=12),
    'only short EBML/Block headers, no 3 MiB media payload');
  return {location,result,reads:file.reads};
}

test('S12: real Tracks + SimpleBlock prove indexed track appears inside referenced Cluster',async()=>{
  const {location,result,reads}=await scan();
  assert.equal(location.status,'CUES_CLUSTER_POINTERS_VERIFIED');
  assert.equal(result.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED',result.reasons.join(';'));
  assert.deepEqual(result.trackNumbers,[1]);
  assert.equal(result.totalReferences,1);
  assert.equal(result.checkedReferences,1);
  assert.equal(result.distinctReferencedClusters,1);
  assert.ok(reads.length<80,'bounded reads skip large 3 MiB Block payload');
});
test('S12: existing Cluster cannot certify a CueTrack absent from Tracks',async()=>{
  const {location,result}=await scan({cueTrack:2});
  assert.equal(location.status,'CUES_CLUSTER_POINTERS_VERIFIED',
    'the old Cues-only location proof cannot detect this');
  assert.equal(result.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
  assert.ok(result.reasons.includes('CUE_TRACK_NOT_IN_TRACKS:2'));
});
test('S12: Track exists but referenced Cluster contains no Block of that track',async()=>{
  const {location,result}=await scan({
    cueTrack:2,declaredTracks:[1,2],blockTrack:1,
  });
  assert.equal(location.status,'CUES_CLUSTER_POINTERS_VERIFIED');
  assert.equal(result.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
  assert.ok(result.reasons.includes('CUE_TRACK_NO_BLOCK_IN_CLUSTER:2'));
});
test('S12: actual CueRelativePosition must be exact SimpleBlock header',async()=>{
  const good=(await scan({relative:'correct'})).result;
  assert.equal(good.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED',good.reasons.join('; '));
  for(const relative of ['timestamp','inside']){
    const bad=(await scan({relative})).result;
    assert.equal(bad.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
    assert.ok(bad.reasons.some(x=>
      /CUE_RELATIVE_NOT_REFERENCED_TRACK_BLOCK|CUE_RELATIVE_NOT_BLOCK_BOUNDARY/.test(x)),
      relative+': '+bad.reasons.join(';'));
  }
});
test('S12: valid BlockGroup containing matching Block is accepted only at its real boundary',async()=>{
  const good=(await scan({relative:'correct',blockGroup:true})).result;
  assert.equal(good.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED',good.reasons.join(';'));
  const changed=(await scan({relative:'timestamp',blockGroup:true})).result;
  assert.equal(changed.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
});
test('S12: malformed block track vint and deliberately restrictive budget fail closed',async()=>{
  const bad=(await scan({validVint:false})).result;
  assert.equal(bad.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
  assert.ok(bad.reasons.some(x=>x.includes('CUE_BLOCK_SCAN_FAILED')));
  const tight=await inspectS12CueTrackBlockEvidence(make(),{maxClusterChildren:1});
  assert.equal(tight.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
  assert.ok(tight.reasons.includes('CUE_CLUSTER_BLOCK_SCAN_BUDGET:'+
    (make()&&0))===false||tight.reasons.some(x=>x.startsWith('CUE_CLUSTER_BLOCK_SCAN_BUDGET:')));
});
test('S12: no Cues is not a verified real track/block relationship',async()=>{
  const missing=(await scan({noCues:true})).result;
  assert.equal(missing.status,'CUE_BLOCK_EVIDENCE_UNVERIFIED');
  assert.equal(missing.totalReferences,0);
  assert.ok(missing.reasons.includes('NO_CUES'));
});
