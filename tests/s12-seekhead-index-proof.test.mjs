import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectS12SeekHeadIndex } from '../src/s12-seekhead-index-proof.js';

const element=(id,body)=>{
  const data=body instanceof Blob?body:new Blob([body]);
  let n=BigInt(data.size);
  const size=new Uint8Array(8);size[0]=1;
  for(let i=7;i>=1;i--){size[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(id,'hex'),size,data]);
};
const idBytes=id=>Buffer.from(id,'hex');
const posBytes=n=>{
  let v=BigInt(n);const bytes=Buffer.alloc(8);
  for(let i=7;i>=0;i--){bytes[i]=Number(v&255n);v>>=8n;}
  assert.equal(v,0n);return bytes;
};
const entry=(id,pos)=>element('4dbb',new Blob([
  element('53ab',idBytes(id)),element('53ac',posBytes(pos)),
]));
const seekHead=entries=>element('114d9b74',new Blob(entries.map(x=>entry(...x))));
const plain=()=>[
  ['1549a966',element('1549a966',Buffer.from('info'))],
  ['1654ae6b',element('1654ae6b',Buffer.from('tracks'))],
  ['1941a469',element('1941a469',new Blob([element('61a7',Buffer.from('attachment'))]))],
  // Actual 3 MiB unread Cluster payload: probe must never materialize it.
  ['1f43b675',element('1f43b675',new Blob([Buffer.alloc(3*1024*1024)]))],
];
const make=({omit=[],mispoint=null,wrongId=null,repeat=null,headAfterVoid=false,
  twoHeads=false,secondPointsToInfo=false,extra=null}={})=>{
  const contents=plain();
  if(extra)contents.push(extra);
  const selected=contents.filter(([id])=>!omit.includes(id));
  const seekTargets=selected.map(x=>x[0]);
  if(twoHeads){
    const firstTemplate=seekHead([['114d9b74',0],...seekTargets.filter(id=>id!=='1f43b675').map(id=>[id,0])]);
    const secondTemplate=seekHead([[secondPointsToInfo?'1549a966':'1f43b675',0]]);
    let offset=firstTemplate.size+secondTemplate.size;
    const locations=new Map();
    for(const [id,blob] of contents){locations.set(id,offset);offset+=blob.size;}
    const first=seekHead([['114d9b74',firstTemplate.size],
      ...seekTargets.filter(id=>id!=='1f43b675').map(id=>[id,locations.get(id)])]);
    const second=seekHead([[secondPointsToInfo?'1549a966':'1f43b675',
      locations.get('1f43b675')]]);
    assert.equal(first.size,firstTemplate.size);
    assert.equal(second.size,secondTemplate.size);
    return file(new Blob([first,second,...contents.map(x=>x[1])]));
  }
  const template=seekHead(seekTargets.map(id=>[id,0]));
  const start=template.size+(headAfterVoid?element('ec',new Blob([])).size:0);
  let at=start;
  const positions=new Map();
  for(const [id,blob] of contents){positions.set(id,at);at+=blob.size;}
  const declarations=seekTargets.map((id,i)=>[
    wrongId?.index===i?wrongId.id:id,
    mispoint?.index===i?mispoint.position:
      repeat?.index===i?positions.get(repeat.otherId):positions.get(id),
  ]);
  const head=seekHead(declarations);
  assert.equal(head.size,template.size);
  return file(new Blob([
    ...(headAfterVoid?[element('ec',new Blob([]))]:[]),
    head,...contents.map(x=>x[1]),
  ]));
};
const file=segmentData=>{
  const ebml=element('1a45dfa3',element('4282',Buffer.from('matroska')));
  const segment=element('18538067',segmentData);
  const bytes=new Blob([ebml,segment]);
  const reads=[];
  const source={
    size:bytes.size,reads,
    slice(from,to,type){reads.push(to-from);return bytes.slice(from,to,type);},
  };
  return source;
};
const verify=async f=>{
  const receipt=await inspectS12SeekHeadIndex(f);
  assert.equal(receipt.schema,'s12-seekhead-index-proof-v0');
  assert.equal(receipt.writerAuthorized,false);
  assert.equal(receipt.publicationAuthorized,false);
  assert.ok(f.reads.every(x=>x>=0&&x<=32),
    'SeekHead graph scan may inspect only bounded EBML headers/fields');
  return receipt;
};

test('S12 SeekHead: full exact offset and identity coverage is read-only verified',async()=>{
  const f=make();
  const result=await verify(f);
  assert.equal(result.status,'INDEX_REFERENCES_VERIFIED',result.reasons.join('; '));
  assert.equal(result.indexReferencesVerified,true);
  assert.equal(result.references.length,4);
  assert.ok(result.references.every(x=>x.matched));
  assert.ok(result.references.every(x=>x.relativePosition>=0));
  assert.ok(f.reads.length>0);
});

test('S12 SeekHead: one-byte-drift target offset blocks index proof',async()=>{
  const result=await verify(make({mispoint:{index:2,position:133}}));
  assert.equal(result.status,'INDEX_UNVERIFIED');
  assert.ok(result.reasons.some(x=>x.startsWith('INDEX_POINTER_MISMATCH:')));
  assert.ok(result.reasons.some(x=>x.startsWith('INDEX_MISSING_TOP_LEVEL:')));
});

test('S12 SeekHead: correct offset pointing to the wrong SeekID is blocked',async()=>{
  const result=await verify(make({wrongId:{index:0,id:'1654ae6b'}}));
  assert.equal(result.status,'INDEX_UNVERIFIED');
  assert.ok(result.reasons.some(x=>x.startsWith('INDEX_POINTER_MISMATCH:')));
});

test('S12 SeekHead: missing top-level index entry and duplicated pointer never prove complete coverage',async()=>{
  for(const source of [make({omit:['1941a469']}),make({repeat:{index:2,otherId:'1549a966'}})]){
    const result=await verify(source);
    assert.equal(result.status,'INDEX_UNVERIFIED');
    assert.ok(result.reasons.some(x=>/INDEX_MISSING_TOP_LEVEL|INDEX_DUPLICATE_TARGET/.test(x)));
  }
});

test('S12 SeekHead: index must be first non-CRC element of Segment',async()=>{
  const result=await verify(make({headAfterVoid:true}));
  assert.equal(result.status,'INDEX_UNVERIFIED');
  assert.ok(result.reasons.includes('INDEX_FIRST_SEEKHEAD_NOT_FIRST'));
});

test('S12 SeekHead: valid chained second head indexes Cluster only',async()=>{
  const r=await verify(make({twoHeads:true}));
  assert.equal(r.status,'INDEX_REFERENCES_VERIFIED',r.reasons.join('; '));
  assert.ok(r.references.some(x=>x.head===0&&x.id===0x114d9b74));
  assert.ok(r.references.some(x=>x.head===1&&x.id===0x1f43b675));
});

test('S12 SeekHead: chained second head cannot advertise Info',async()=>{
  const r=await verify(make({twoHeads:true,secondPointsToInfo:true}));
  assert.equal(r.status,'INDEX_UNVERIFIED');
  assert.ok(r.reasons.some(x=>x.startsWith('INDEX_SECOND_HEAD_NONCLUSTER_REFERENCE')));
});

test('S12 SeekHead: no SeekHead is NO_SEEKHEAD, never an implicit pass',async()=>{
  const r=await verify(file(new Blob(plain().map(x=>x[1]))));
  assert.equal(r.status,'NO_SEEKHEAD');
  assert.equal(r.indexReferencesVerified,false);
});

test('S12 SeekHead: malformed unknown-size root and invalid seek children fail closed',async()=>{
  const header=element('1a45dfa3',element('4282',Buffer.from('matroska')));
  const body=new Blob(plain().map(x=>x[1]));
  const unknown=new Blob([header,Buffer.from('18538067ffffffffffffffff','hex'),body]);
  const result=await verify({size:unknown.size,reads:[],slice:(a,b)=>unknown.slice(a,b)});
  assert.equal(result.status,'INDEX_UNVERIFIED');
  assert.ok(result.reasons.includes('INDEX_SINGLE_FINITE_EXACT_SEGMENT_REQUIRED'));
  const broken=seekHead([['1549a966',0]]);
  const bad=file(new Blob([element('114d9b74',new Blob([element('4dbb',
    element('53ac',Buffer.from([0])))])),...plain().map(x=>x[1])]));
  const failure=await verify(bad);
  assert.equal(failure.status,'INDEX_UNVERIFIED');
  assert.ok(failure.reasons.some(x=>x.includes('INDEX_SEEK_ENTRY_INCOMPLETE')));
  assert.ok(broken.size>0);
});

test('S12 SeekHead: a real unseen top-level element also needs graph coverage',async()=>{
  const r=await verify(make({extra:['1abcdef0',element('1abcdef0',Buffer.from('unknown'))]}));
  assert.equal(r.status,'INDEX_REFERENCES_VERIFIED',
    'this module proves declared pointers only, not semantic compatibility');
  assert.equal(r.writerAuthorized,false);
});
