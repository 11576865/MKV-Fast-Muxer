import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareNonterminalAttachmentRelay,executeNonterminalAttachmentRelay }
 from '../src/existing-mkv-nonterminal-attachment-relay.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';

const cat=(...xs)=>Buffer.concat(xs.map(x=>Buffer.from(x)));
function size(n,w=null){
 if(w===null){w=1;while(BigInt(n)>=(1n<<BigInt(w*7))-1n)w++;}
 let v=BigInt(n)|(1n<<BigInt(w*7));const a=Buffer.alloc(w);
 for(let i=w-1;i>=0;i--){a[i]=Number(v&255n);v>>=8n;}return a;
}
const element=(id,b,w=null)=>cat(Buffer.from(id,'hex'),size(b.length,w),b);
const uint=(n,w)=>{let v=BigInt(n);const a=Buffer.alloc(w);
 for(let i=w-1;i>=0;i--){a[i]=Number(v&255n);v>>=8n;}return a;};
const blob=(data,name='fixture.mkv')=>{const b=new Blob([data]);b.name=name;return b;};
const srcDataA=Buffer.from('TAGGED-ORIGINAL-FILEDATA-A');
const srcDataB=Buffer.from('UNREFERENCED-FILEDATA-B');
const attach=(uid,name,data,opts={})=>element('61A7',cat(
 element('466E',Buffer.from(name)),
 element('4660',Buffer.from('application/octet-stream')),
 element('465C',data,opts.fileDataWidth||2),
 ...(opts.crc?[element('BF',Buffer.alloc(4))]:[]),
 ...(opts.unknown?[element('4ABC',Buffer.from([1]))]:[]),
 element('46AE',Buffer.from([uid])),
),2);
function source({tail=false,badSeek=false,noSeek=false,seekCrc=false,
  attachedCrc=false,unknownAttached=false,unknownTop=false,tagFree=false,
  targetNotFinal=false,lowDataWidth=false}={}){
 const attachments=element('1941A469',cat(
  ...(targetNotFinal?[attach(4,'free.bin',srcDataB)]:[attach(3,'tagged.bin',srcDataA)]),
  ...(targetNotFinal?[attach(3,'tagged.bin',srcDataA)]:
   [attach(4,'free.bin',srcDataB,{crc:attachedCrc,unknown:unknownAttached,
     fileDataWidth:lowDataWidth?1:2})]),
 ),3);
 const chapter=element('1043A770',element('45B9',element('B6',cat(
  element('73C4',Buffer.from([21])),
  element('B6',element('73C4',Buffer.from([22]))),
 ))));
 const tagged=element('1254C367',element('7373',cat(
  element('63C0',element('63C6',Buffer.from([tagFree?4:3]))),
  element('67C8',cat(element('45A3',Buffer.from('KEEP')),
    element('4487',Buffer.from('original-tag')))),
 )));
 const info=element('1549A966',element('2AD7B1',Buffer.from([15,66,64])));
 const tracks=element('1654AE6B',element('AE',element('73C5',Buffer.from([55]))));
 const cluster=element('1F43B675',Buffer.alloc(90,0xa3));
 const late=cat(chapter,tagged,cluster, ...(unknownTop?[element('4ABC',Buffer.from([1]))]:[]));
 function seek(pos){
  return element('114D9B74',cat(
   element('4DBB',cat(element('53AB',Buffer.from([0x19,0x41,0xa4,0x69])),
      element('53AC',uint(pos,2)))),
   ...(seekCrc?[element('BF',Buffer.alloc(4))]:[]),
  ));
 }
 const pre=cat(info,tracks);
 const provisional=seek(0);
 const location=provisional.length+pre.length+(tail?late.length:0);
 const seekhead=noSeek?Buffer.alloc(0):seek(badSeek?location+1:location);
 const assembled=cat(seekhead,pre,
  ...(tail?[late,attachments]:[attachments,late]));
 const seg=element('18538067',assembled,5);
 return blob(cat(element('1A45DFA3',element('4282',Buffer.from('matroska'))),seg));
}
const prepare=(src,data,opts={})=>prepareNonterminalAttachmentRelay({
 source:src,replacement:blob(data,'replacement.bin'),targetFileUid:'4',
 approveRelocation:true,...opts,
});
const sha=async b=>createHash('sha256').update(Buffer.from(await b.arrayBuffer())).digest('hex');
test('indexed non-terminal: genuine relayed SeekHead keeps Cues/Chapter/Tags/Cluster offsets, original bytes and UID data unchanged',async()=>{
 const src=source(),oldHash=await sha(src),data=Buffer.alloc(srcDataB.length+67,0x42);
 const plan=await prepare(src,data);
 assert.equal(plan.geometry.seekEntriesRedirected,1);
 assert.equal(plan.geometry.originalProtectedOffsetsStayFixed,true);
 assert.equal(Object.isFrozen(plan),true);
 const output=await executeNonterminalAttachmentRelay(plan);
 assert.equal(output.status,'LOCAL_NONTERMINAL_RELAY_AND_RAW_MEDIA_VERIFIED_EXTERNAL_AUDIT_PENDING');
 assert.equal(await sha(src),oldHash);
 const s=await inspectRawSegmentPreservation(src),
  t=await inspectRawSegmentPreservation(output.output);
 assert.equal(t.state,'inspected');
 assert.equal(t.elements.length,s.elements.length+1);
 assert.equal(t.elements.at(-1).id,'0x1941a469');
 s.elements.forEach((el,i)=>{
  assert.equal(t.elements[i].offset,el.offset);
  assert.equal(t.elements[i].byteLength,el.byteLength);
  if(el.family==='protected'&&el.id!=='0x114d9b74')
   assert.equal(t.elements[i].byteCommitment,el.byteCommitment);
 });
 const reader=createMatroskaAttachmentReader(output.output),inv=await reader.inspect();
 assert.equal(inv.state,'inspected');
 assert.deepEqual(inv.attachments.map(a=>a.fileUid),['3','4']);
 assert.deepEqual(Buffer.from(await reader.openAttachment(inv.attachments[0].id).data.arrayBuffer()),srcDataA);
 assert.deepEqual(Buffer.from(await reader.openAttachment(inv.attachments[1].id).data.arrayBuffer()),data);
});
test('indexed non-terminal negative gates reject CRC, unknown, referenced UID, wrong index and non-terminal mismatch',async()=>{
 await assert.rejects(prepare(source({tail:true}),Buffer.alloc(55)),/UNIQUE_NONTERMINAL/);
 await assert.rejects(prepare(source({badSeek:true}),Buffer.alloc(55)),/STALE_OR_ALTERNATE/);
 await assert.rejects(prepare(source({noSeek:true}),Buffer.alloc(55)),/SEEK_ENTRY_REQUIRED/);
 await assert.rejects(prepare(source({seekCrc:true}),Buffer.alloc(55)),/SEEKHEAD_CRC_UNSUPPORTED/);
 await assert.rejects(prepare(source({attachedCrc:true}),Buffer.alloc(55)),/ATTACHEDFILE_CRC_BLOCKED/);
 await assert.rejects(prepare(source({unknownAttached:true}),Buffer.alloc(55)),/UNKNOWN_ATTACHEDFILE_CHILD/);
 await assert.rejects(prepare(source({unknownTop:true}),Buffer.alloc(55)),/RAW_SOURCE_INELIGIBLE/);
 await assert.rejects(prepare(source({tagFree:true}),Buffer.alloc(55)),/REFERENCED_ATTACHMENT_BLOCKED/);
 await assert.rejects(prepare(source({targetNotFinal:true}),Buffer.alloc(55)),/TARGET_NOT_FINAL_FILEDATA/);
 await assert.rejects(prepare(source(),Buffer.alloc(srcDataB.length)),/EQUAL_LENGTH_USE_LOCAL_WRITER/);
 await assert.rejects(prepare(source(),Buffer.alloc(55),{approveRelocation:false}),/EXPLICIT_REVIEW_REQUIRED/);
 const plan=await prepare(source(),Buffer.alloc(55));
 await assert.rejects(executeNonterminalAttachmentRelay({...plan}),/FORGED_OR_STALE_PLAN/);
 await assert.rejects(executeNonterminalAttachmentRelay(JSON.parse(JSON.stringify(plan))),/FORGED_OR_STALE_PLAN/);
});
