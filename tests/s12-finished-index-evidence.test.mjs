import test from 'node:test';
import assert from 'node:assert/strict';
import { auditS12FinishedIndexEvidence } from '../src/s12-finished-index-evidence.js';
const e=(hex,data)=>{
  const part=data instanceof Blob?data:new Blob([data]);let n=BigInt(part.size);
  const header=Buffer.alloc(8);header[0]=1;
  for(let i=7;i>=1;i--){header[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(hex,'hex'),header,part]);
};
const uint=n=>{
  const bytes=Buffer.alloc(8);let v=BigInt(n);
  for(let i=7;i>=0;i--){bytes[i]=Number(v&255n);v>>=8n;}
  return bytes;
};
const entry=(id,pos)=>e('4dbb',new Blob([
  e('53ab',Buffer.from(id,'hex')),e('53ac',uint(pos)),
]));
const crc32=buf=>{
  let c=0xffffffff;
  for(const b of buf){
    c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
};
async function fixture({shift=0,withCues=true,tamperCrc=false,extraVoid=false}={}){
  const info=e('1549a966',Buffer.from('info')),tracks=e('1654ae6b',Buffer.from('tracks'));
  const cluster=e('1f43b675',new Blob([e('e7',Buffer.from([0x00])),
    Buffer.alloc(1024*1024)]));
  const cue=(clusterPos)=>e('bb',new Blob([
    e('b3',uint(100)),e('b7',new Blob([
      e('f7',uint(1)),e('f1',uint(clusterPos))])),
  ]));
  // SeekHead has fixed-length 8-byte size VINTs and offset fields, so
  // compute all actual locations from a size-equivalent dry run.
  const seekIds=['1549a966','1654ae6b','1f43b675',...(withCues?['1c53bb6b']:[])];
  const sampleHead=e('114d9b74',new Blob(seekIds.map(id=>entry(id,0))));
  const padding=extraVoid?e('ec',Buffer.alloc(8)):null;
  const offsetInfo=sampleHead.size+(padding?.size||0);
  const offsetTracks=offsetInfo+info.size;
  const offsetCluster=offsetTracks+tracks.size;
  const c=cue(offsetCluster+shift);
  let cues=e('1c53bb6b',c);
  if(tamperCrc){
    const bytes=Buffer.from(await c.arrayBuffer());
    const crc=Buffer.alloc(4);
    crc.writeUInt32LE((crc32(bytes)^1)>>>0);
    cues=e('1c53bb6b',new Blob([e('bf',crc),c]));
  }
  const offsetCues=offsetCluster+cluster.size;
  const offsets=[offsetInfo,offsetTracks,offsetCluster,...(withCues?[offsetCues]:[])];
  const seek=e('114d9b74',new Blob(seekIds.map((id,i)=>entry(id,offsets[i]))));
  assert.equal(seek.size,sampleHead.size);
  const segment=new Blob([seek,...(padding?[padding]:[]),info,tracks,cluster,
    ...(withCues?[cues]:[])]);
  return new Blob([e('1a45dfa3',e('4282',Buffer.from('matroska'))),
    e('18538067',segment)]);
}
test('S12: genuinely different offsets across two fully indexed MKV files can each be independently verified',async()=>{
  const input=await fixture();const output=await fixture({extraVoid:true});
  const report=await auditS12FinishedIndexEvidence({source:input,finished:output});
  assert.equal(report.status,'FINISHED_INDEX_POINTERS_SCOPED_VERIFIED',
    report.errors.join('; '));
  assert.equal(report.source.seekComplete,true);
  assert.equal(report.source.cuesComplete,true);
  assert.equal(report.finished.seekComplete,true);
  assert.equal(report.finished.cuesComplete,true);
  assert.equal(report.source.cueMatched,1);
  assert.equal(report.finished.cueMatched,1);
  assert.equal(report.writerAuthorized,false);
  assert.equal(report.publicationAuthorized,false);
  assert.equal(report.remuxEquivalenceProven,false);
  assert.equal(report.uidGraphProven,false);
  assert.equal(report.savedFileVerified,false);
});
test('S12: finished MKV with a one-byte CueClusterPosition error is never accepted',async()=>{
  const input=await fixture(),finished=await fixture({shift:1});
  const report=await auditS12FinishedIndexEvidence({source:input,finished});
  assert.equal(report.status,'FINISHED_INDEX_CONTRADICTION');
  assert.ok(report.errors.some(x=>x.includes('CUES_CLUSTER_POINTER_MISMATCH')));
  assert.equal(report.finished.cueMatched,0);
  assert.equal(report.remuxEquivalenceProven,false);
});
test('S12: finished Cues invalid CRC remains a scoped output failure, not an unverified success',async()=>{
  const input=await fixture(),finished=await fixture({tamperCrc:true});
  const report=await auditS12FinishedIndexEvidence({source:input,finished});
  assert.equal(report.status,'FINISHED_INDEX_CONTRADICTION');
  assert.ok(report.errors.some(x=>x.includes('CUES_CRC_MISMATCH')));
});
test('S12: output without any Cues is not certified even when SeekHead remains sound',async()=>{
  const input=await fixture(),finished=await fixture({withCues:false});
  const report=await auditS12FinishedIndexEvidence({source:input,finished});
  assert.equal(report.status,'FINISHED_INDEX_UNVERIFIED');
  assert.equal(report.finished.cuesStatus,'NO_CUES');
  assert.equal(report.finished.seekComplete,true);
  assert.equal(report.finished.cuesComplete,false);
});
test('S12: forged identical input/output reference never proves an independently delivered output',async()=>{
  const source=await fixture();
  const report=await auditS12FinishedIndexEvidence({source,finished:source});
  assert.equal(report.status,'NOT_RUN_INVALID_FILE_AUTHORITY');
  assert.equal(report.savedFileVerified,false);
  assert.equal(report.writerAuthorized,false);
});
