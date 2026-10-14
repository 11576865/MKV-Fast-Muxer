// Test-only fixture transform: start with a source produced independently by
// MKVToolNix/mkvpropedit, then reserve extra EBML Void inside exactly one
// previously existing AttachedFile's FileData slot. Never a product writer:
// the fixture is itself checked independently via mkvmerge/mkvextract.
import fs from 'node:fs/promises';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';

const [inputPath,outputPath,attachmentName,reserveRaw]=process.argv.slice(2);
if(!inputPath||!outputPath||!attachmentName||!reserveRaw)
  throw Error('usage: source.mkv output.mkv existing-filename reserveBytes');
const reserve=Number(reserveRaw);
if(!Number.isSafeInteger(reserve)||reserve<8||reserve>16384)
  throw Error('FIXTURE_RESERVE_INVALID');
const original=await fs.readFile(inputPath);
const source=new Blob([original]);
const reader=createMatroskaAttachmentReader(source),inventory=await reader.inspect();
if(inventory.state!=='inspected')throw Error('FIXTURE_SOURCE_INVENTORY_INVALID');
const matches=inventory.attachments.filter(x=>x.filename===attachmentName);
if(matches.length!==1)throw Error('FIXTURE_TARGET_UNIQUE_NAME_REQUIRED');
const file=matches[0],dataOffset=file.dataRange.offset,dataLength=file.dataRange.length;
if(dataLength<reserve+16)throw Error('FIXTURE_INSUFFICIENT_ORIGINAL_FILEDATA');
// Preserve the original FileData SIZE VINT width. The original field's byte
// span now contains a shorter FileData and a legal, directly following Void.
function sizeVint(value,width){
  const v=BigInt(value);
  if(v<0n||v>=(1n<<BigInt(7*width))-1n)throw Error('FIXTURE_VINT_OVERFLOW');
  let n=v|(1n<<BigInt(7*width));const bytes=Buffer.alloc(width);
  for(let i=width-1;i>=0;i--){bytes[i]=Number(n&255n);n>>=8n;}
  return bytes;
}
let filedataStart=null,sizeWidth=0;
for(let w=1;w<=8;w++){
  const at=dataOffset-2-w;
  if(at<0||original[at]!==0x46||original[at+1]!==0x5c)continue;
  const b=original.subarray(at+2,at+2+w);
  let n=BigInt(b[0]&((1<<(8-w))-1));
  for(let j=1;j<w;j++)n=(n<<8n)|BigInt(b[j]);
  if(n===BigInt(dataLength)){filedataStart=at;sizeWidth=w;break;}
}
if(filedataStart===null)throw Error('FIXTURE_ORIGINAL_FILEDATA_ELEMENT_NOT_FOUND');
let voidHeader=null;
for(let w=1;w<=8;w++){
  const payloadLength=reserve-1-w;
  if(payloadLength>=0 && BigInt(payloadLength)<(1n<<BigInt(7*w))-1n){
    voidHeader=Buffer.concat([Buffer.from([0xec]),sizeVint(payloadLength,w),
      Buffer.alloc(payloadLength)]);
    break;
  }
}
if(!voidHeader||voidHeader.length!==reserve)
  throw Error('FIXTURE_RESERVED_VOID_UNENCODABLE');
const smallerData=original.subarray(dataOffset,dataOffset+dataLength-reserve);
const newElement=Buffer.concat([Buffer.from([0x46,0x5c]),
  sizeVint(smallerData.length,sizeWidth),smallerData,voidHeader]);
if(newElement.length!==dataLength+2+sizeWidth)throw Error('FIXTURE_EXACT_SLOT_FAILED');
const transformed=Buffer.concat([
  original.subarray(0,filedataStart),newElement,
  original.subarray(dataOffset+dataLength),
]);
if(transformed.length!==original.length)throw Error('FIXTURE_FILE_LENGTH_CHANGED');
const output=new Blob([transformed]);
const check=createMatroskaAttachmentReader(output);
const next=await check.inspect();
if(next.state!=='inspected')throw Error('FIXTURE_TRANSFORMED_EBML_REJECTED');
const newer=next.attachments.find(x=>x.fileUid===file.fileUid);
if(!newer||newer.dataRange.offset!==file.dataRange.offset||
    newer.byteLength!==dataLength-reserve||newer.filename!==file.filename)
  throw Error('FIXTURE_TARGET_NOT_PRESERVED');
for(const item of inventory.attachments.filter(x=>x.fileUid!==file.fileUid)){
  const outputItem=next.attachments.find(x=>x.fileUid===item.fileUid);
  if(!outputItem||outputItem.dataRange.offset!==item.dataRange.offset||
      outputItem.byteLength!==item.byteLength)
    throw Error('FIXTURE_OTHER_ATTACHMENTS_MOVED');
}
await fs.writeFile(outputPath,transformed);
console.log(JSON.stringify({verdict:'RESERVED_VOID_FIXTURE_LAYOUT_CONSTRUCTED_PENDING_EXTERNAL_NATIVE_CHECK',
  targetFileUid:file.fileUid,filename:file.filename,
  originalDataLength:dataLength,availableBytes:reserve,
  currentDataLength:newer.byteLength,unchangedTotalBytes:true}));
