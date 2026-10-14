import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  inspectEditableMatroskaMetadataText,prepareMatroskaTextReplacement,
  executeMatroskaTextReplacement,
} from '../src/p2-matroska-inline-metadata-writer.js';
import {inspectRawSegmentPreservation} from '../src/matroska-raw-preservation-contract.js';
const concat=(...parts)=>Buffer.concat(parts.map(x=>Buffer.from(x)));
function size(n,w=null){if(w===null){w=1;while(BigInt(n)>=(1n<<BigInt(w*7))-1n)w++;}
 let v=BigInt(n)|(1n<<BigInt(w*7));const b=Buffer.alloc(w);
 for(let i=w-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}return b;
}
const e=(id,p,w)=>concat(Buffer.from(id,'hex'),size(p.length,w),p);
const v=(s)=>Buffer.from(s,'utf8');
const asFile=bytes=>{const b=new Blob([bytes]);b.name='no-video-attachments.mka';return b;};
const sha=async file=>createHash('sha256')
 .update(Buffer.from(await file.arrayBuffer())).digest('hex');
function fixture({crc=false,segmentCrc=false,unknownTop=false,invalid=false,unknownSize=false}={}){
 const display=e('80',concat(e('85',v('Chapter A'))));
 const child=e('B6',concat(e('73C4',Buffer.from([2])),display));
 const chapter=e('1043A770',e('45B9',e('B6',concat(
   e('73C4',Buffer.from([1])),e('80',e('85',v('Start ABC'))),child,
 ))));
 const tags=e('1254C367',e('7373',concat(
  e('63C0',e('63C4',Buffer.from([2]))),
  e('67C8',concat(e('45A3',v('TITLE')),e('4487',invalid?Buffer.from([0xff]):v('Before ABC')))),
  ...(crc?[e('BF',Buffer.alloc(4))]:[]),
 )));
 const info=e('1549A966',e('2AD7B1',Buffer.from([15,66,64])));
 const content=concat(info,chapter,tags,
  ...(segmentCrc?[e('BF',Buffer.alloc(4))]:[]),
  ...(unknownTop?[e('4ABC',Buffer.from('opaque'))]:[]));
 const segment=e('18538067',content,5);
 if(unknownSize)segment.fill(0xff,4,9);
 return asFile(concat(e('1A45DFA3',e('4282',v('matroska'))),segment));
}
const prepare=(source,target,newText)=>prepareMatroskaTextReplacement({
 source,targetId:target.id,expectedOldText:target.text,newText,
 confirmSameSize:true,
});

test('R5 actual trackless Matroska Chapters and TagString edits preserve every other byte',async()=>{
 const original=fixture(),originalSha=await sha(original);
 const scan=await inspectEditableMatroskaMetadataText(original);
 assert.equal(scan.kindCounts.chapter,2);
 assert.equal(scan.kindCounts.tag,1);
 const first=scan.fields.find(x=>x.kind==='chapter'&&x.text==='Chapter A');
 const a=await executeMatroskaTextReplacement(await prepare(original,first,'Chapter B'));
 assert.equal(a.evidence.chapterTagStructureAndUidUnchanged,true);
 assert.equal(a.output.size,original.size);
 assert.equal(await sha(original),originalSha);
 const next=await inspectEditableMatroskaMetadataText(a.output);
 assert.equal(next.fields.find(x=>x.id===first.id).text,'Chapter B');
 assert.equal(next.fields.find(x=>x.kind==='tag').text,'Before ABC');
 const tag=next.fields.find(x=>x.kind==='tag');
 const b=await executeMatroskaTextReplacement(await prepare(a.output,tag,'After  ABC'));
 const final=await inspectEditableMatroskaMetadataText(b.output);
 assert.equal(final.fields.find(x=>x.id===first.id).text,'Chapter B');
 assert.equal(final.fields.find(x=>x.id===tag.id).text,'After  ABC');
 assert.equal(await sha(original),originalSha);
 const raw0=await inspectRawSegmentPreservation(original),raw1=await inspectRawSegmentPreservation(b.output);
 assert.equal(raw0.state,'inspected');assert.equal(raw1.state,'inspected');
 assert.deepEqual(raw0.elements.map(x=>[x.id,x.offset,x.byteLength]),
  raw1.elements.map(x=>[x.id,x.offset,x.byteLength]));
 assert.equal(b.evidence.nativeExternalOraclePassed,false);
});
test('Chapter and Tag edit cannot expand/shrink UTF-8, skip review or silently no-op',async()=>{
 const src=fixture(),list=(await inspectEditableMatroskaMetadataText(src)).fields;
 const target=list.find(f=>f.kind==='tag');
 await assert.rejects(prepare(src,target,'longer than original'),/BYTE_LENGTH_MISMATCH/);
 await assert.rejects(prepare(src,target,'短'),/BYTE_LENGTH_MISMATCH/);
 await assert.rejects(prepare(src,target,target.text),/NO_CHANGE/);
 await assert.rejects(prepareMatroskaTextReplacement({source:src,targetId:target.id,
  newText:'After  ABC',expectedOldText:target.text}),/EXPLICIT_REVIEW/);
 await assert.rejects(prepareMatroskaTextReplacement({source:src,targetId:target.id,
  newText:'After  ABC',expectedOldText:'stale',confirmSameSize:true}),/STALE_OLD_TEXT/);
});
test('CRC in the touched metadata ancestor, CRC in Segment, unknown top-level and size risks refuse',async()=>{
 await assert.rejects(inspectEditableMatroskaMetadataText(fixture({crc:true})),
  /METADATA_ANCESTOR_CRC_UNSUPPORTED/);
 await assert.rejects(inspectEditableMatroskaMetadataText(fixture({segmentCrc:true})),
  /SEGMENT_CRC_UNSUPPORTED/);
 await assert.rejects(inspectEditableMatroskaMetadataText(fixture({unknownTop:true})),
  /RAW_SOURCE_UNVERIFIED/);
 await assert.rejects(inspectEditableMatroskaMetadataText(fixture({unknownSize:true})),
  /RAW_SOURCE_UNVERIFIED/);
 await assert.rejects(inspectEditableMatroskaMetadataText(fixture({invalid:true})),
  /INVALID_UTF8_SOURCE/);
});
test('no unauthorized second execution, forged JSON plan or mutation of original source',async()=>{
 const src=fixture(),field=(await inspectEditableMatroskaMetadataText(src)).fields[0];
 const plan=await prepare(src,field,'Start XYZ');
 await assert.rejects(executeMatroskaTextReplacement({...plan}),/FORGED_OR_USED_PLAN/);
 await executeMatroskaTextReplacement(plan);
 await assert.rejects(executeMatroskaTextReplacement(plan),/FORGED_OR_USED_PLAN/);
});
