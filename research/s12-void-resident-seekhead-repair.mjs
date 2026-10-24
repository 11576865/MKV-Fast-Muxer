/**
 * EXPERIMENTAL, NOT PRODUCT-ENABLED: complete a SeekHead solely inside the
 * byte interval of an existing first SeekHead + immediately following Void.
 *
 * The Segment header, every Cluster/Cues/Track/Attachment byte position and
 * each other top-level payload remains at EXACTLY the same offset. No media
 * payload is decoded or copied to an ArrayBuffer: use Blob.slice composition.
 *
 * Refuse rather than relocate any Cluster/Cues/Tag or overwrite insufficient
 * Void. The source must have valid existing SeekHead pointers and CRC; only
 * missing top-level references are eligible. Never grant production writing.
 */
import { inspectS12SeekHeadIndex } from './s12-seekhead-index-proof.js';
import { inspectS12CuesClusterLocations } from './s12-cues-cluster-proof.js';

export const S12_VOID_REPAIR_SCHEMA='s12-void-resident-seekhead-repair-research-v0';
const ID={ebml:0x1a45dfa3,segment:0x18538067,head:0x114d9b74,
  crc:0xbf,void:0xec,cluster:0x1f43b675};
const MAX_CHILDREN=1024,MAX_HEADER_READ=12,MAX_REPLACEMENT=256*1024;
const receipt=(status,reasons=[],details={})=>Object.freeze({
  schema:S12_VOID_REPAIR_SCHEMA,status,
  ...details,
  reasons:Object.freeze([...new Set(reasons)]),
  writerAuthorized:false,publicationAuthorized:false,
  codeStatus:'RESEARCH_ONLY_NO_PRODUCTION_EXPORT',
  uidGraphVerified:false,packetIdentityVerified:false,
  cuesTimeVerified:false,durableSaveVerified:false,
});
const deny=(reason)=>receipt('REFUSED',[reason]);
const blobLike=b=>b&&Number.isSafeInteger(b.size)&&b.size>0&&typeof b.slice==='function';
async function read(blob,at,n){
  if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(n)||n<0||
      at+n>blob.size||n>MAX_HEADER_READ)throw Error('VOID_REPAIR_BAD_READ');
  return new Uint8Array(await blob.slice(at,at+n).arrayBuffer());
}
async function el(blob,at,bound){
  if(at>=bound)throw Error('VOID_REPAIR_BAD_ELEMENT_START');
  const b=await read(blob,at,Math.min(12,bound-at));
  if(!b[0])throw Error('VOID_REPAIR_BAD_ID');
  let iw=1;
  while(iw<=4&&!(b[0]&(0x80>>(iw-1))))iw++;
  if(iw>4||iw>=b.length)throw Error('VOID_REPAIR_ID_WIDTH');
  let id=0;
  for(let i=0;i<iw;i++)id=id*256+b[i];
  if(!b[iw])throw Error('VOID_REPAIR_BAD_SIZE');
  let sw=1;
  while(sw<=8&&!(b[iw]&(0x80>>(sw-1))))sw++;
  if(sw>8||iw+sw>b.length)throw Error('VOID_REPAIR_SIZE_WIDTH');
  let n=BigInt(b[iw]&((1<<(8-sw))-1));
  for(let i=1;i<sw;i++)n=(n<<8n)|BigInt(b[iw+i]);
  const unknown=n===(1n<<BigInt(sw*7))-1n;
  if(!unknown&&n>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('VOID_REPAIR_SIZE_UNADDRESSABLE');
  const data=at+iw+sw,end=unknown?null:data+Number(n);
  if(end!==null&&(!Number.isSafeInteger(end)||end>bound))
    throw Error('VOID_REPAIR_ELEMENT_OUT_OF_BOUNDS');
  return {id,at,data,end,unknown};
}
async function inventory(blob){
  const ebml=await el(blob,0,blob.size);
  if(ebml.id!==ID.ebml||ebml.unknown||ebml.end>65536)
    throw Error('VOID_REPAIR_EBML_HEADER_INVALID');
  let segment=null;
  for(let at=ebml.end;at<blob.size;){
    const v=await el(blob,at,blob.size);
    if(v.id===ID.segment){segment=v;break;}
    if(v.unknown)throw Error('VOID_REPAIR_UNKNOWN_ROOT');
    at=v.end;
  }
  if(!segment||segment.unknown||segment.end!==blob.size)
    throw Error('VOID_REPAIR_EXACT_FINITE_SEGMENT_REQUIRED');
  const top=[];
  for(let at=segment.data;at<segment.end;){
    if(top.length>=MAX_CHILDREN)throw Error('VOID_REPAIR_TOP_LEVEL_BUDGET');
    const v=await el(blob,at,segment.end);
    if(v.unknown)throw Error('VOID_REPAIR_UNKNOWN_TOP_LEVEL');
    top.push(v);
    at=v.end;
  }
  return {segment,top};
}
function bytesId(id){
  if(!Number.isSafeInteger(id)||id<0||id>0xffffffff)
    throw Error('VOID_REPAIR_INVALID_ID');
  const n=id>0xffffff?4:id>0xffff?3:id>0xff?2:1;
  const a=new Uint8Array(n);
  for(let i=n-1,v=id;i>=0;i--){
    a[i]=v%256;v=Math.floor(v/256);
  }
  return a;
}
function sizeVint(size){
  const n=BigInt(size);
  for(let w=1;w<=8;w++){
    if(n>((1n<<BigInt(7*w))-2n))continue;
    const out=new Uint8Array(w);let v=n;
    for(let i=w-1;i>=0;i--){out[i]=Number(v&255n);v>>=8n;}
    out[0]|=(1<<(8-w));
    return out;
  }
  throw Error('VOID_REPAIR_UNREPRESENTABLE_VINT');
}
function uint(v){
  let n=BigInt(v);
  for(let len=1;len<=8;len++){
    if(n>=(1n<<BigInt(len*8)))continue;
    const out=new Uint8Array(len);
    for(let i=len-1;i>=0;i--){out[i]=Number(n&255n);n>>=8n;}
    return out;
  }
  throw Error('VOID_REPAIR_POSITION_OVERFLOW');
}
function join(arr){
  const bytes=arr.reduce((n,x)=>n+x.length,0);
  if(bytes>MAX_REPLACEMENT)throw Error('VOID_REPAIR_PATCH_BUDGET');
  const all=new Uint8Array(bytes);
  let off=0;for(const a of arr){all.set(a,off);off+=a.length;}
  return all;
}
function encode(id,payload){
  return join([bytesId(id),sizeVint(payload.length),payload]);
}
function crc32(data){
  let x=0xffffffff;
  for(const b of data){
    x^=b;
    for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);
  }
  return (x^0xffffffff)>>>0;
}
function protect(data){
  const checksum=crc32(data),raw=new Uint8Array(4);
  raw[0]=checksum&255;raw[1]=(checksum>>>8)&255;
  raw[2]=(checksum>>>16)&255;raw[3]=checksum>>>24;
  return join([encode(ID.crc,raw),data]);
}
function makeVoid(total){
  if(total===0)return new Uint8Array(0);
  if(total<2||total>MAX_REPLACEMENT)throw Error('VOID_REPAIR_REMAINDER_UNREPRESENTABLE');
  for(let width=1;width<=8;width++){
    const payload=total-1-width;
    if(payload<0)continue;
    if(BigInt(payload)>((1n<<BigInt(7*width))-2n))continue;
    const out=new Uint8Array(total);
    out[0]=ID.void;
    let x=BigInt(payload);
    for(let i=width;i>=1;i--){out[i]=Number(x&255n);x>>=8n;}
    out[1]|=1<<(8-width);
    return out;
  }
  throw Error('VOID_REPAIR_REMAINDER_UNREPRESENTABLE');
}
export async function planS12VoidResidentSeekHeadRepair(input){
  if(!blobLike(input))return deny('VOID_REPAIR_INPUT_BLOB_REQUIRED');
  try{
    const sourceIndex=await inspectS12SeekHeadIndex(input);
    if(sourceIndex.status==='INDEX_REFERENCES_VERIFIED')
      return receipt('NOT_NEEDED',[],{sourceSize:input.size});
    if(sourceIndex.status!=='INDEX_UNVERIFIED'||
        !sourceIndex.reasons.length||
        sourceIndex.reasons.some(r=>!r.startsWith('INDEX_MISSING_TOP_LEVEL:')))
      return deny('VOID_REPAIR_PREEXISTING_INDEX_UNTRUSTED');
    const sourceCue=await inspectS12CuesClusterLocations(input);
    if(!['CUES_CLUSTER_POINTERS_VERIFIED','NO_CUES'].includes(sourceCue.status))
      return deny('VOID_REPAIR_PREEXISTING_CUES_UNTRUSTED');
    const {segment,top}=await inventory(input);
    if(top.some(v=>v.id===ID.crc))
      return deny('VOID_REPAIR_SEGMENT_CRC_NOT_SUPPORTED');
    const heads=top.filter(v=>v.id===ID.head);
    if(heads.length!==1||top[0]!==heads[0])
      return deny('VOID_REPAIR_NEEDS_SINGLE_FIRST_HEAD');
    const originalHead=heads[0],voidCell=top[1];
    if(!voidCell||voidCell.id!==ID.void||
        voidCell.at!==originalHead.end)
      return deny('VOID_REPAIR_ADJACENT_VOID_REQUIRED');
    const indexed=top.filter(v=>v!==originalHead&&v.id!==ID.void);
    if(indexed.length>MAX_CHILDREN)
      return deny('VOID_REPAIR_INDEX_ENTRY_BUDGET');
    const seeks=indexed.map(v=>encode(0x4dbb,join([
      encode(0x53ab,bytesId(v.id)),
      encode(0x53ac,uint(v.at-segment.data)),
    ])));
    const newHead=encode(ID.head,protect(join(seeks)));
    const reservedBytes=voidCell.end-originalHead.at;
    if(newHead.length>reservedBytes)
      return receipt('REFUSED',['VOID_REPAIR_NOT_ENOUGH_RESERVED_BYTES'],
        {requiredBytes:newHead.length,reservedBytes,missingBytes:newHead.length-reservedBytes});
    const remainder=reservedBytes-newHead.length;
    const patch=join([newHead,makeVoid(remainder)]);
    if(patch.length!==reservedBytes)throw Error('VOID_REPAIR_PATCH_SIZE_CHANGED');
    const result=new Blob([input.slice(0,originalHead.at),patch,
      input.slice(voidCell.end)],{type:input.type||'video/x-matroska'});
    if(result.size!==input.size)throw Error('VOID_REPAIR_FILE_SIZE_CHANGED');
    // Independent validator: repair must now cover all top-level pointers
    // without moving the original media and Cue payload positions.
    const verified=await inspectS12SeekHeadIndex(result);
    if(verified.status!=='INDEX_REFERENCES_VERIFIED')
      return receipt('REFUSED',['VOID_REPAIR_POSTVALIDATION_FAILED',
        ...verified.reasons.slice(0,4)],{reservedBytes,requiredBytes:newHead.length});
    const afterCue=await inspectS12CuesClusterLocations(result);
    if(afterCue.status!==sourceCue.status||
        afterCue.locations.length!==sourceCue.locations.length||
        afterCue.locations.some((v,i)=>v.absoluteClusterOffset!==
          sourceCue.locations[i].absoluteClusterOffset))
      return deny('VOID_REPAIR_CUES_CHANGED');
    return receipt('RESEARCH_BLOB_SCOPED_VALIDATED',[],{
      sourceSize:input.size,resultSize:result.size,
      reservedBytes,patchBytes:patch.length,newHeadBytes:newHead.length,
      remainingVoidBytes:remainder,
      indexedElementCount:indexed.length,
      originalCueStatus:sourceCue.status,
      originalCuePointers:sourceCue.locations.length,
      // This is a test/research result, NEVER proof of user-device saving or
      // consent to create a new downloadable production artifact.
      researchBlob:result,
      sourceIndexStatus:sourceIndex.status,
      resultIndexStatus:verified.status,
    });
  }catch(error){
    return deny('VOID_REPAIR_FAILED:'+(error?.message||String(error)));
  }
}
