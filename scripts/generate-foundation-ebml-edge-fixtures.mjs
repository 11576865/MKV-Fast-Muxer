/**
 * CI-only EBML *fixture authoring*, not a production parser. Preserve real
 * MKVToolNix-authored Matroska element payloads, re-encode only outer master
 * sizes to create a genuinely valid Attachment CRC-32 and unknown Segment.
 *
 * Matroska RFC 9559 / EBML RFC 8794: a CRC-32 must be first in its parent,
 * use IEEE CRC-32 and store the checksum in little-endian byte order.
 * Keep SeekHead/Cues out of the rebuilt fixture: their old file offsets
 * would otherwise incorrectly reference the original native file.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root='.e2e/fixtures', out='.e2e/output';
const input=path.join(root,'p0-independent-attachmenttag.mkv');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const expectedId={ebml:0x1a45dfa3,segment:0x18538067,
  attachments:0x1941a469,seekHead:0x114d9b74,cues:0x1c53bb6b};

function decodeElement(buf,start,limit=buf.length){
  if(start>=limit)throw Error('FIXTURE_EBML_START_OUT_OF_BOUNDS');
  const first=buf[start];
  if(!first)throw Error('FIXTURE_EBML_ID_INVALID');
  let idWidth=1;
  while(idWidth<=4 && !(first&(0x80>>(idWidth-1))))idWidth++;
  if(idWidth>4||start+idWidth>=limit)
    throw Error('FIXTURE_EBML_ID_WIDTH_INVALID');
  let id=0;
  for(let j=0;j<idWidth;j++)id=id*256+buf[start+j];
  const sFirst=buf[start+idWidth];
  if(!sFirst)throw Error('FIXTURE_EBML_SIZE_INVALID');
  let width=1;
  while(width<=8&&!(sFirst&(0x80>>(width-1))))width++;
  if(width>8||start+idWidth+width>limit)
    throw Error('FIXTURE_EBML_SIZE_WIDTH_INVALID');
  let size=BigInt(sFirst&((1<<(8-width))-1));
  for(let j=1;j<width;j++)
    size=(size<<8n)|BigInt(buf[start+idWidth+j]);
  const unknown=size===((1n<<BigInt(width*7))-1n);
  if(unknown||size>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('FIXTURE_EBML_FINITE_SIZE_REQUIRED');
  const dataStart=start+idWidth+width;
  const end=dataStart+Number(size);
  if(end>limit)throw Error('FIXTURE_EBML_ELEMENT_OUTSIDE_PARENT');
  return {id,start,idWidth,sizeWidth:width,dataStart,end};
}
function children(buf,from,to){
  const result=[];
  for(let at=from;at<to;){
    const row=decodeElement(buf,at,to);
    result.push(row);at=row.end;
  }
  return result;
}
function uintSize(width,value,unknown=false){
  if(width<1||width>8)throw Error('FIXTURE_SIZE_WIDTH_INVALID');
  const max=(1n<<BigInt(width*7))-1n;
  if(!unknown&&(BigInt(value)<0n||BigInt(value)>=max))
    throw Error('FIXTURE_SIZE_UNREPRESENTABLE');
  const bytes=Buffer.alloc(width);
  let remaining=unknown?max:BigInt(value);
  for(let i=width-1;i>=0;i--){
    bytes[i]=Number(remaining&255n);
    remaining>>=8n;
  }
  bytes[0]|=0x80>>(width-1);
  return bytes;
}
function crc32(bytes){
  let crc=0xffffffff;
  for(const octet of bytes){
    crc^=octet;
    for(let k=0;k<8;k++)
      crc=(crc&1)?((crc>>>1)^0xedb88320):(crc>>>1);
  }
  return (crc^0xffffffff)>>>0;
}
const bytes=await fs.readFile(input);
const ebml=decodeElement(bytes,0);
if(ebml.id!==expectedId.ebml)
  throw Error('FIXTURE_ORIGINAL_EBML_MISSING');
const segment=children(bytes,ebml.end,bytes.length)
  .find(row=>row.id===expectedId.segment);
if(!segment)throw Error('FIXTURE_ORIGINAL_SEGMENT_MISSING');
const entries=children(bytes,segment.dataStart,segment.end);
const attached=entries.filter(x=>x.id===expectedId.attachments);
if(attached.length!==1)
  throw Error('FIXTURE_ATTACHMENTS_PARENT_AMBIGUOUS');
const originalAtt=attached[0];
if(children(bytes,originalAtt.dataStart,originalAtt.end)
  .some(x=>x.id===0xbf))
  throw Error('FIXTURE_SOURCE_ALREADY_HAS_CRC32');
const attPayload=bytes.subarray(originalAtt.dataStart,originalAtt.end);
const checksum=crc32(attPayload);
const crcHeader=Buffer.alloc(6);
crcHeader[0]=0xbf;crcHeader[1]=0x84;
crcHeader.writeUInt32LE(checksum,2);
const protectedPayload=Buffer.concat([crcHeader,attPayload]);
const protectedAttachments=Buffer.concat([
  bytes.subarray(originalAtt.start,originalAtt.start+originalAtt.idWidth),
  uintSize(8,protectedPayload.length),protectedPayload,
]);
const plainAttachments=bytes.subarray(originalAtt.start,originalAtt.end);
const kept=entries.filter(x=>x.id!==expectedId.seekHead &&
  x.id!==expectedId.cues);
if(kept.length<4)
  throw Error('FIXTURE_NOT_ENOUGH_NATIVE_MASTER_ELEMENTS');
function build(withCrc,unknownSegment){
  const childrenBytes=kept.map(x=>x===originalAtt?
    withCrc?protectedAttachments:plainAttachments:
    bytes.subarray(x.start,x.end));
  const payload=Buffer.concat(childrenBytes);
  return Buffer.concat([
    bytes.subarray(0,ebml.end),
    bytes.subarray(segment.start,segment.start+segment.idWidth),
    uintSize(8,payload.length,unknownSegment),
    payload,
  ]);
}
const valid=build(true,false),unknown=build(false,true);
const badCRC=Buffer.from(valid);
const crcPosition=badCRC.indexOf(crcHeader);
if(crcPosition<0)throw Error('FIXTURE_INSERTED_CRC_NOT_LOCATED');
badCRC[crcPosition+2]^=0x01;
const files=[
  ['foundation-edge-crc-valid.mkv',valid],
  ['foundation-edge-crc-corrupt.mkv',badCRC],
  ['foundation-edge-segment-unknown.mkv',unknown],
];
await fs.mkdir(out,{recursive:true});
for(const [name,data] of files){
  await fs.writeFile(path.join(root,name),data);
  if(sha(await fs.readFile(path.join(root,name)))!==sha(data))
    throw Error('FIXTURE_GENERATED_BYTES_NOT_STABLE_'+name);
}
if(sha(await fs.readFile(input))!==sha(bytes))
  throw Error('FIXTURE_ORIGINAL_SOURCE_CHANGED');
const report={
  schema:'foundation-ebml-edge-fixtures-v1',
  originalSource:path.basename(input),
  originalSha256:sha(bytes),
  crc32LittleEndian:checksum.toString(16).padStart(8,'0'),
  crcParent:'Attachments',
  crcCoversBytes:attPayload.length,
  removedStaleSeekHeadAndCues:true,
  generated:files.map(([name,data])=>({
    name,bytes:data.length,sha256:sha(data),
    unknownSegment:name.includes('unknown'),
    crcStatus:name.includes('corrupt')?'corrupt':
      name.includes('valid')?'valid':'absent',
  })),
};
await fs.writeFile(path.join(out,'foundation-ebml-edge-fixtures.json'),
  JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({
  result:'FOUNDATION_EDGE_BYTES_AUTHORED',files:report.generated,
  checksum:report.crc32LittleEndian,
}));
