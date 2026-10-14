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
// Write a valid same-total-byte-length Segment-level Void in the old slot.
let voidReplacement=null;
for(let width=1;width<=8;width++){
 const payloadBytes=oldSize-1-width;
 if(payloadBytes>=0&&BigInt(payloadBytes)<(1n<<BigInt(width*7))-1n){
  voidReplacement=Buffer.concat([Buffer.from([0xec]),
    sizeVint(payloadBytes,width),Buffer.alloc(payloadBytes)]);
  break;
 }
}
if(!voidReplacement||voidReplacement.length!==oldSize)
 throw Error('TEST_TAIL_VOID_REPLACEMENT_UNENCODABLE');
voidReplacement.copy(bytes,old.at);
// Repair all SeekHead SeekPosition fields which actually point to Attachments.
let touched=0;
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
  const capacity=pos.end-pos.dataStart;
  let v=BigInt(appendRelative);
  if(v>=(1n<<BigInt(capacity*8)))throw Error('TEST_TAIL_SEEKPOSITION_OVERFLOW');
  for(let i=pos.end-1;i>=pos.dataStart;i--){bytes[i]=Number(v&255n);v>>=8n;}
  touched++;
 }
}
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
 seekEntriesRetargeted:touched,attachments:inventory.attachments.map(x=>({
   uid:x.fileUid,name:x.filename,length:x.byteLength,
 })),
 originalProtectedTopLevelOffsetsPreserved:true,
}));
