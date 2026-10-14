import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 prepareRoutedAttachmentReplacement,executeRoutedAttachmentReplacement,
} from '../src/p2-existing-mkv-writer-router.js';
import {createMatroskaAttachmentReader} from '../src/matroska-attachment-reader.js';

const cat=(...xs)=>Buffer.concat(xs.map(x=>Buffer.from(x)));
function vint(n,width=null){
 if(width===null){width=1;while(BigInt(n)>=(1n<<BigInt(width*7))-1n)width++;}
 let v=BigInt(n)|(1n<<BigInt(width*7));const out=Buffer.alloc(width);
 for(let i=width-1;i>=0;i--){out[i]=Number(v&255n);v>>=8n;}return out;
}
const el=(id,body,width=null)=>cat(Buffer.from(id,'hex'),vint(body.length,width),body);
const uint=(n,width=2)=>{let v=BigInt(n);const b=Buffer.alloc(width);
 for(let i=width-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}return b;};
const asFile=(bytes,name='source.mkv')=>{const x=new Blob([bytes]);x.name=name;return x;};
const oldA=Buffer.from('ORIGINAL-TAGGED-ATTACHMENT');
const oldB=Buffer.from('ORIGINAL-FREE-DATA-XYZ');
const attached=(uid,name,data,withVoid=false)=>el('61A7',cat(
 el('466E',Buffer.from(name)),el('4660',Buffer.from('application/octet-stream')),
 el('465C',data,2),...(withVoid?[el('EC',Buffer.alloc(148))]:[]),
 el('46AE',Buffer.from([uid])),
),2);
function source({voidAfterData=false,nonterminal=false,tagFree=false,
                   unknownTop=false,invalidSeek=false}={}){
 const attachments=el('1941A469',cat(
   attached(3,'tagged.bin',oldA),
   attached(4,'free.bin',oldB,voidAfterData),
 ),3);
 const info=el('1549A966',el('2AD7B1',Buffer.from([15,66,64])));
 const tracks=el('1654AE6B',el('AE',el('73C5',Buffer.from([55]))));
 const chapter=el('1043A770',el('45B9',el('B6',cat(
   el('73C4',Buffer.from([21])),el('B6',el('73C4',Buffer.from([22]))),
 ))));
 const tags=el('1254C367',el('7373',cat(
   el('63C0',el('63C6',Buffer.from([tagFree?4:3]))),
   el('67C8',cat(el('45A3',Buffer.from('KEEP')),el('4487',Buffer.from('meta')))),
 )));
 const cluster=el('1F43B675',Buffer.alloc(128,0xa3));
 const seek=(p)=>el('114D9B74',el('4DBB',cat(
   el('53AB',Buffer.from('1941a469','hex')),el('53AC',uint(p,2)),
 )));
 const seekBase=seek(0);
 const oldPos=seekBase.length+info.length+tracks.length+
   (nonterminal?0:chapter.length+tags.length+cluster.length);
 const seekhead=seek(invalidSeek?oldPos+1:oldPos);
 const unknown=unknownTop?el('4ABC',Buffer.from('opaque')):Buffer.alloc(0);
 const body=cat(seekhead,info,tracks,...(nonterminal?
  [attachments,chapter,tags,cluster,unknown]:
  [chapter,tags,cluster,attachments,unknown]));
 return asFile(cat(el('1A45DFA3',el('4282',Buffer.from('matroska'))),
   el('18538067',body,5)));
}
const sha=async blob=>createHash('sha256')
  .update(Buffer.from(await blob.arrayBuffer())).digest('hex');
const run=async (src,bytes)=>{
 const input=asFile(bytes,'new.bin');
 const plan=await prepareRoutedAttachmentReplacement({
   source:src,replacement:input,targetFileUid:'4',approveSourceModification:true,
 });
 const artifact=await executeRoutedAttachmentReplacement(plan);
 const reader=createMatroskaAttachmentReader(artifact.output);
 const inventory=await reader.inspect();
 assert.equal(inventory.state,'inspected');
 assert.deepEqual(inventory.attachments.map(x=>x.fileUid),['3','4']);
 assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[0].id).data.arrayBuffer()),oldA);
 assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[1].id).data.arrayBuffer()),bytes);
 assert.equal(artifact.evidence.allOriginalProtectedNonSeekHeadBytesPreserved,true);
 assert.equal(artifact.evidence.tagTargetGraphPreserved,true);
 assert.equal(artifact.evidence.nativeExternalOraclePassed,false);
 assert.equal(artifact.evidence.sourceOverwrite,false);
 assert.equal(await sha(src),plan.evidence.sourceSha256);
 await assert.rejects(executeRoutedAttachmentReplacement(plan),/FORGED_OR_STALE/);
 return {plan,artifact};
};

test('P2 one dispatcher: same-size source edit keeps all original protected bytes',async()=>{
 const {plan,artifact}=await run(source(),Buffer.alloc(oldB.length,0x53));
 assert.equal(plan.route,'same-size');
 assert.equal(artifact.route,'same-size');
});

test('P2 one dispatcher: neighboring Void accepts growth without moving outer elements',async()=>{
 const {plan,artifact}=await run(source({voidAfterData:true}),
   Buffer.alloc(oldB.length+45,0x51));
 assert.equal(plan.route,'adjacent-void');
 assert.equal(artifact.output.size,(source({voidAfterData:true})).size);
});

test('P2 one dispatcher: tail Attachments actual grow without spare Void',async()=>{
 const {plan,artifact}=await run(source(),Buffer.alloc(oldB.length+61,0x42));
 assert.equal(plan.route,'tail-resize');
 assert.equal(artifact.route,'tail-resize');
});

test('P2 one dispatcher: indexed NON-terminal Attachments uses chained SeekHead, preserves chapters/tag media',async()=>{
 const {plan,artifact}=await run(source({nonterminal:true}),Buffer.alloc(oldB.length+57,0x63));
 assert.equal(plan.route,'seekhead-relay');
 assert.equal(artifact.route,'seekhead-relay');
 assert.equal(artifact.evidence.backendEvidence.chainedSeekHeadAtOldAttachmentOffset,true);
});

test('P2 combined writer route never bypasses TagAttachmentUID references, unknown top EBML, or bad SeekHead',async()=>{
 const prep=(src,bytes)=>prepareRoutedAttachmentReplacement({
  source:src,replacement:asFile(bytes,'new.bin'),targetFileUid:'4',
  approveSourceModification:true,
 });
 await assert.rejects(prep(source({tagFree:true}),Buffer.alloc(80)),/TAG_REFERENCED_UID/);
 await assert.rejects(prep(source({unknownTop:true}),Buffer.alloc(80)),/RAW_UNVERIFIED/);
 // Another writer must not mask an unverified/nonmatching original SeekHead.
 await assert.rejects(prep(source({nonterminal:true,invalidSeek:true}),Buffer.alloc(80)),
  /NO_VERIFIED_WRITER|FATAL_/);
 await assert.rejects(prepareRoutedAttachmentReplacement({
  source:source(),replacement:asFile(Buffer.alloc(30)),targetFileUid:'4',
 }),/EXPLICIT_REVIEW_REQUIRED/);
 await assert.rejects(executeRoutedAttachmentReplacement({
  schema:'bounded-existing-mkv-attachment-route-v1',route:'same-size',
 }),/FORGED_OR_STALE/);
});
