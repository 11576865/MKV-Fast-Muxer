import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { inspectS12OriginalAttachmentSource, S12_ADMISSION_SCHEMA } from '../src/s12-original-attachment-admission.js';

const e=(hex,parts)=> {
  const data=parts instanceof Blob?parts:new Blob([parts]);
  const size=BigInt(data.size);
  const header=new Uint8Array(8);header[0]=0x01;
  let n=size;
  for(let i=7;i>=1;i--){header[i]=Number(n&255n);n>>=8n;}
  assert.equal(n,0n);
  return new Blob([Buffer.from(hex,'hex'),header,data]);
};
const attach=(filename='original.ttf',uid=7,body=Buffer.from([1,2,3]))=>
  e('61a7',new Blob([
    e('466e',Buffer.from(filename)),e('4660',Buffer.from('font/ttf')),
    e('46ae',Buffer.from([uid])),e('465c',body),
  ]));
const make=(extra=[],{tail=false,track=true,cluster=true,filenames=['original.ttf']}={})=>{
  const masters=[
    e('1549a966',e('2ad7b1',Buffer.from([0x0f,0x42,0x40]))),
    ...(track?[e('1654ae6b',new Blob([]))]:[]),
    e('1941a469',new Blob(filenames.map((name,i)=>attach(name,i+7)))),
    ...(cluster?[e('1f43b675',Buffer.from([0,1,2]))]:[]),
    ...extra,
  ];
  const blob=new Blob([
    e('1a45dfa3',e('4282',Buffer.from('matroska'))),
    e('18538067',new Blob(masters)),
    ...(tail?[Buffer.from([0xec,0x80])]:[]),
  ]);
  const slices=[];
  return {
    name:'same.mkv',size:blob.size,lastModified:55,slices,
    slice(start,end,type){slices.push([start,end]);return blob.slice(start,end,type);},
  };
};
const build=async file=>{
  const reader=createMatroskaAttachmentReader(file);
  const inventory=await reader.inspect();
  assert.equal(inventory.state,'inspected');
  const intent=inventory.attachments.map(row=>({
    ordinal:row.ordinal,fileUid:row.fileUid,include:true,
    filename:row.filename,mimeType:row.mimeType,
  }));
  return {reader,intent};
};
const examine=async (file,overrides={})=>{
  const {reader,intent}=await build(file);
  return inspectS12OriginalAttachmentSource({reader,source:file,intent,...overrides});
};

test('S12: exact source with one finite Segment, one attachments master and explicit unchanged intent is a read-only candidate',async()=>{
  const file=make();
  const out=await examine(file);
  assert.equal(out.schema,S12_ADMISSION_SCHEMA);
  assert.equal(out.status,'SOURCE_CLASS_CANDIDATE');
  assert.equal(out.sourceClassCandidate,true);
  assert.equal(out.writerAuthorized,false);
  assert.equal(out.publicationAuthorized,false);
  assert.deepEqual(out.reasons,[]);
  assert.equal(out.attachments[0].filename,'original.ttf');
  assert.ok(file.slices.length>0);
  assert.ok(file.slices.every(([a,b])=>b-a<=4096),
    'source-class gate only reads EBML headers and short text, never full FileData');
});

test('S12: equal-name, equal-length, equal-mtime is not a valid File authority',async()=>{
  const file=make();const sameMetadata=make();
  assert.equal(file.size,sameMetadata.size);
  const {reader,intent}=await build(file);
  const value=await inspectS12OriginalAttachmentSource({
    reader,source:sameMetadata,intent,
  });
  assert.equal(value.status,'BLOCKED');
  assert.deepEqual(value.reasons,['EXACT_SOURCE_FILE_AUTHORITY_MISSING']);
  assert.equal(value.writerAuthorized,false);
});

test('S12: explicit source attachment edits, reorder and missing declarations are refused',async()=>{
  const file=make([],{filenames:['a.ttf','b.ttf']});
  const {reader,intent}=await build(file);
  for(const edits of [
    [{...intent[0],include:false},intent[1]],
    [{...intent[0],filename:'renamed.ttf'},intent[1]],
    [{...intent[0],mimeType:'application/x-new'},intent[1]],
    [intent[1],intent[0]],
    [intent[0]],
    [],
  ]){
    const out=await inspectS12OriginalAttachmentSource({reader,source:file,intent:edits});
    assert.equal(out.status,'BLOCKED');
    assert.equal(out.writerAuthorized,false);
    assert.ok(out.reasons.some(v=>v.startsWith('ORIGINAL_ATTACHMENT_')));
  }
  assert.deepEqual((await inspectS12OriginalAttachmentSource({reader,source:file,intent:null})).reasons,
    ['EXPLICIT_ORIGINAL_ATTACHMENT_INTENT_REQUIRED']);
});

test('S12: even ordinary tags/chapters, Cues, SeekHead, top-level CRC and unfamiliar element fail closed',async()=>{
  const extra=[
    ['1254c367','SOURCE_TAGS_OR_CHAPTERS_NOT_PRESERVABLE'],
    ['1043a770','SOURCE_TAGS_OR_CHAPTERS_NOT_PRESERVABLE'],
    ['1c53bb6b','SOURCE_CUES_GRAPH_PROOF_REQUIRED'],
    ['114d9b74','SOURCE_SEEKHEAD_GRAPH_PROOF_REQUIRED'],
    ['bf','SOURCE_SEGMENT_CRC_UNVERIFIED'],
    ['4abc','SOURCE_TOP_LEVEL_NOT_ADMITTED:0x4ABC'],
  ];
  for(const [id,reason] of extra){
    const file=make([e(id,new Blob([]))]);
    const out=await examine(file);
    assert.equal(out.status,'BLOCKED',id);
    assert.ok(out.reasons.includes(reason),id+':'+out.reasons.join(','));
  }
});

test('S12: extra source data after finite Segment or absence of real video topology is not a source-class candidate',async()=>{
  for(const file of [
    make([],{tail:true}),make([],{track:false}),make([],{cluster:false}),
  ]){
    const out=await examine(file);
    assert.equal(out.status,'BLOCKED');
    assert.equal(out.sourceClassCandidate,false);
  }
});

test('S12: case-folded duplicate names and duplicate FileUID must be rejected',async()=>{
  const file=make([],{filenames:['a.ttf','A.TTF']});
  const out=await examine(file);
  assert.equal(out.status,'BLOCKED');
  assert.ok(out.reasons.includes('ORIGINAL_ATTACHMENT_NAME_AMBIGUOUS'));
});

test('S12: a structurally accepted source is still NOT authorized for research Blob writer',async()=>{
  const file=make();
  const out=await examine(file);
  assert.equal(out.sourceClassCandidate,true);
  assert.equal(out.writerAuthorized,false);
  assert.equal(out.publicationAuthorized,false);
  assert.match(out.limitation,/绝不授权执行/);
});

test('S12: malformed EBML returns a precise inventory refusal, not a false different-File diagnosis',async()=>{
  const blob=new Blob([Buffer.from('invalid not matroska')]);
  const file={name:'malformed.mkv',size:blob.size,lastModified:55,
    slice:(from,to,type)=>blob.slice(from,to,type)};
  const reader=createMatroskaAttachmentReader(file);
  const check=await inspectS12OriginalAttachmentSource({reader,source:file,intent:[]});
  assert.equal(check.status,'BLOCKED');
  assert.ok(check.reasons.some(reason=>reason.startsWith('ATTACHMENT_INVENTORY_UNVERIFIED:')),
    check.reasons.join(';'));
  assert.ok(check.reasons.every(reason=>!reason.startsWith('SOURCE_CHANGED_DURING_INSPECTION')));
});

test('S12: S08 broad refusal and exact structural element denial are both retained',async()=>{
  // Plain Chapters/Tags can trigger the S08 gate before the S12 whitelist.
  // Do not mask Cues/SeekHead with a generic preflight verdict.
  const file=make([e('1254c367',new Blob([])),e('114d9b74',new Blob([]))]);
  const out=await examine(file);
  assert.equal(out.status,'BLOCKED');
  assert.ok(out.reasons.includes('SOURCE_SEEKHEAD_GRAPH_PROOF_REQUIRED'));
  assert.ok(out.reasons.includes('SOURCE_TAGS_OR_CHAPTERS_NOT_PRESERVABLE'));
  assert.ok(out.reasons.some(x=>x.startsWith('SOURCE_PRESERVATION_NOT_CLEAR:')) ||
    out.reasons.some(x=>x.startsWith('SOURCE_TOP_LEVEL_NOT_ADMITTED:')),
    'generic S08 refusal may or may not fire on empty Tags; S12 exact geometry must remain');
  assert.equal(out.writerAuthorized,false);
});
