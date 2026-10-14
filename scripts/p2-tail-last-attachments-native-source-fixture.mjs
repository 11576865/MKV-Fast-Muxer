/**
 * TEST-ONLY: from a native MKVToolNix-authored complex Matroska, relocate its
 * exact existing Attachments EBML master to the END of Segment, replacing the
 * old slot with equally sized Void and repairing only SeekHead's SeekPosition
 * targeting Attachments. Keep all other source positions/bytes invariant.
 * This prepares an ELIGIBLE no-reserved-Void source; it is NOT product code.
 */
import fs from 'node:fs/promises';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';

const [sourcePath,destinationPath]=process.argv.slice(2);
if(!sourcePath||!destinationPath)throw Error('usage source.mkv prepared-tail.mkv');
const src=await fs.readFile(sourcePath);
const bytes=Buffer.from(src);
const ids={ebml:0x1a45dfa3,segment:0x18538067,attachments:0x1941a469,
 seekhead:0x114d9b74,seek:0x4dbb,seekId:0x53ab,seekPosition:0x53ac};
function readEl(at,limit){
  if(at>=limit||at<0||limit>bytes.length)throw Error('TEST_TAIL_RANGE');
  const first=bytes[at];
  let idWidth=1;while(idWidth<=4&&!(first&(0x80>>(idWidth-1))))idWidth++;
  if(idWidth>4)throw Error('TEST_TAIL_ID_WIDTH');
  let id=0;for(let i=0;i<idWidth;i++)id=id*256+bytes[at+i];
  const start=at+idWidth,firstSize=bytes[start];
  let width=1;while(width<=8&&!(firstSize&(0x80>>(width-1))))width++;
  if(width>8)throw Error('TEST_TAIL_SIZE_WIDTH');
  let size=BigInt(firstSize&((1<<(8-width))-1));
  for(let i=1;i<width;i++)size=(size<<8n)|BigInt(bytes[start+i]);
  if(size===(1n<<BigInt(width*7))-1n)throw Error('TEST_TAIL_UNKNOWN_SIZE');
  if(size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('TEST_TAIL_UNADDRESSABLE');
  const dataStart=start+width,end=dataStart+Number(size);
  if(end>limit)throw Error('TEST_TAIL_ELEMENT_OUTSIDE');
  return {id,at,sizeStart:start,width,size:Number(size),dataStart,end};
}
function children(start,end){const out=[];for(let p=start;p<end;){
  const e=readEl(p,end);out.push(e);p=e.end;
}return out;}
function sizeVint(n,width){
  if(!Number.isSafeInteger(n)||n<0||BigInt(n)>=(1n<<BigInt(7*width))-1n)
    throw Error('TEST_TAIL_SEGMENT_SIZE_FIELD_OVERFLOW');
  let data=BigInt(n)|(1n<<BigInt(7*width));const v=Buffer.alloc(width);
  for(let i=width-1;i>=0;i--){v[i]=Number(data&255n);data>>=8n;}
  return v;
}
const ebml=readEl(0,bytes.length),segment=readEl(ebml.end,bytes.length);
if(ebml.id!==ids.ebml||segment.id!==ids.segment||segment.end!==bytes.length)
  throw Error('TEST_TAIL_ORIGINAL_SEGMENT_NOT_FINITE_OR_FINAL');
const nodes=children(segment.dataStart,segment.end);
const originals=nodes.filter(x=>x.id===ids.attachments);
if(originals.length!==1)throw Error('TEST_TAIL_ONE_ATTACHMENTS_MASTER_REQUIRED');
const old=originals[0],appendRelative=bytes.length-segment.dataStart;
const tailBytes=Buffer.from(bytes.subarray(old.at,old.end));
const oldSize=old.end-old.at;
// Test-only same-span void never shifts a pre-existing protected sibling.
function exactVoid(length){
  for(let width=1;width<=8;width++){
    const n=length-1-width;
    if(n>=0&&BigInt(n)<(1n<<BigInt(width*7))-1n){
      return Buffer.concat([Buffer.from([0xec]),sizeVint(n,width),Buffer.alloc(n)]);
    }
  }
  throw Error('TEST_TAIL_VOID_REPLACEMENT_UNENCODABLE');
}
// A chained SeekHead is valid Matroska, and is required for native tools
// that discover Attachments through SeekHead rather than scanning tail bytes.
// The old SeekHead points to the SAME original absolute slot, now occupied
// by a relay SeekHead. The relay points to relocated tail Attachments. Unlike
// the earlier attempt, no invalid/broken Seek entry or truncated position
// remains, even if MKVToolNix originally encoded the index in one byte.
function uintBytes(n,width){
 let b=BigInt(n);
 if(b<0n||b>=(1n<<BigInt(width*8)))throw Error('TEST_TAIL_SEEK_UINTEGER_OVERFLOW');
 const out=Buffer.alloc(width);
 for(let i=width-1;i>=0;i--){out[i]=Number(b&255n);b>>=8n;}
 return out;
}
function element(idHex,payload){
 const idBytes=Buffer.from(idHex,'hex');
 let width=1;
 while(BigInt(payload.length)>=(1n<<BigInt(width*7))-1n)width++;
 return Buffer.concat([idBytes,sizeVint(payload.length,width),payload]);
}
function relaySeekHead(span,offset){
 const newEntry=element('4DBB',Buffer.concat([
   element('53AB',Buffer.from([0x19,0x41,0xa4,0x69])),
   element('53AC',uintBytes(offset,8)),
 ]));
 for(let w=1;w<=8;w++){
   const contentSize=span-4-w;
   const filler=contentSize-newEntry.length;
   if(filler<2||BigInt(contentSize)>=(1n<<BigInt(w*7))-1n)continue;
   const constructed=Buffer.concat([Buffer.from('114D9B74','hex'),
     sizeVint(contentSize,w),newEntry,exactVoid(filler)]);
   if(constructed.length===span)return constructed;
 }
 throw Error('TEST_TAIL_ORIGINAL_ATTACHMENTS_SLOT_TOO_SMALL_FOR_RELAY_SEEKHEAD');
}
let redirectedSeekheadEntries=0;
for(const head of nodes.filter(x=>x.id===ids.seekhead)){
 const seekChildren=children(head.dataStart,head.end);
 if(seekChildren.some(x=>x.id===0xbf))throw Error('TEST_TAIL_SEEKHEAD_CRC_UNSUPPORTED');
 for(const entry of seekChildren.filter(x=>x.id===ids.seek)){
  const members=children(entry.dataStart,entry.end);
  const identity=members.find(x=>x.id===ids.seekId);
  const pos=members.find(x=>x.id===ids.seekPosition);
  if(!identity||!pos)continue;
  const rawId=bytes.subarray(identity.dataStart,identity.end);
  if(rawId.length!==4||!rawId.equals(Buffer.from([0x19,0x41,0xa4,0x69])))continue;
  const oldRelative=old.at-segment.dataStart;
  let recordedPosition=0n;
  for(const b of bytes.subarray(pos.dataStart,pos.end))
    recordedPosition=(recordedPosition<<8n)|BigInt(b);
  if(recordedPosition!==BigInt(oldRelative))
    throw Error('TEST_TAIL_ORIGINAL_ATTACHMENTS_SEEK_TARGET_MISMATCH');
  // Keep original narrow SeekPosition, since the relay occupies precisely
  // its old target position; change only its SeekID to SeekHead.
  Buffer.from([0x11,0x4d,0x9b,0x74]).copy(bytes,identity.dataStart);
  redirectedSeekheadEntries++;
 }
}
if(redirectedSeekheadEntries===0)
 throw Error('TEST_TAIL_ORIGINAL_ATTACHMENTS_SEEKHEAD_ENTRY_REQUIRED');
relaySeekHead(oldSize,appendRelative).copy(bytes,old.at);
sizeVint(segment.size+oldSize,segment.width).copy(bytes,segment.sizeStart);
const output=Buffer.concat([bytes,tailBytes]);
if(output.length!==src.length+oldSize)
 throw Error('TEST_TAIL_SOURCE_TOTAL_LENGTH_BAD');
const sourceBlob=new Blob([output]),reader=createMatroskaAttachmentReader(sourceBlob);
const inventory=await reader.inspect();
if(inventory.state!=='inspected'||inventory.attachments.length!==2)
 throw Error('TEST_TAIL_RELOCATED_ATTACHMENTS_UNREADABLE');
const raw=await inspectRawSegmentPreservation(sourceBlob);
if(raw.state!=='inspected'||
    raw.elements.at(-1)?.id!=='0x1941a469'||
    raw.coverage.unknownTopElementIds.length)
 throw Error('TEST_TAIL_RAW_LAYOUT_INVALID');
const parent=readEl(0,bytes.length);
if(parent.id!==ids.ebml)throw Error('TEST_TAIL_BAD_EBML_AFTER_REWRITE');
await fs.writeFile(destinationPath,output);
console.log(JSON.stringify({
 verdict:'TEST_ONLY_MKVTOOLNIX_SOURCE_TAIL_PREPARED_NATIVE_VALIDATION_PENDING',
 oldAttachmentsBytes:oldSize,finalAttachmentsOffset:bytes.length,
 oldSeekheadEntriesRedirectedToSameOffsetRelay:redirectedSeekheadEntries,relaySeeksFinalAttachments:true,attachments:inventory.attachments.map(x=>({
   uid:x.fileUid,name:x.filename,length:x.byteLength,
 })),
 originalProtectedTopLevelOffsetsPreserved:true,
}));
