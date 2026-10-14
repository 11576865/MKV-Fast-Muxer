import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { inspectRawSegmentPreservation, compareRawSegmentPreservation } from './matroska-raw-preservation-contract.js';

export const RESERVED_VOID_FILEDATA_PLAN_SCHEMA = 'existing-mkv-reserved-void-filedata-replace-plan-v0';
const permits = new WeakMap();
const MAX_SOURCE = 60 * 1024 * 1024, MAX_PAYLOAD = 4 * 1024 * 1024;
const ID = Object.freeze({ attachments:0x1941a469, attached:0x61a7, filedata:0x465c,
  uid:0x46ae, name:0x466e, mime:0x4660, description:0x467e, void:0xec, crc:0xbf });
const memberIds = new Set([ID.uid,ID.name,ID.mime,ID.description,ID.filedata,ID.void]);
const freeze = object => {
  if(object && typeof object==='object' && !Object.isFrozen(object)){
    Object.values(object).forEach(freeze);Object.freeze(object);
  }
  return object;
};
const toHex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const sha256 = async blob => {
  if(!globalThis.crypto?.subtle)throw Error('RESERVED_VOID_WEBCRYPTO_REQUIRED');
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())));
};
function sizeVint(value,width){
  const n=BigInt(value);
  if(!Number.isInteger(width)||width<1||width>8 ||
      n<0n || n >= (1n<<BigInt(width*7))-1n)
    throw Error('RESERVED_VOID_SIZE_VINT_CAPACITY');
  let encoded=n|(1n<<BigInt(width*7));
  const data=new Uint8Array(width);
  for(let p=width-1;p>=0;p--){data[p]=Number(encoded&255n);encoded>>=8n;}
  return data;
}
function constructVoid(total){
  for(let w=1;w<=8;w++){
    const value=total-w-1;
    if(value>=0 && BigInt(value)<(1n<<BigInt(w*7))-1n){
      return new Blob([Uint8Array.of(ID.void),sizeVint(value,w),new Uint8Array(value)]);
    }
  }
  throw Error('RESERVED_VOID_REMAINDER_TOO_SMALL');
}
async function readElement(blob,start,limit){
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(limit)||
      start<0||start>=limit||limit>blob.size)
    throw Error('RESERVED_VOID_RANGE');
  const bytes=new Uint8Array(await blob.slice(start,Math.min(start+12,limit)).arrayBuffer());
  if(!bytes[0])throw Error('RESERVED_VOID_ID_INVALID');
  let idWidth=1;while(idWidth<=4 && !(bytes[0]&(0x80>>(idWidth-1))))idWidth++;
  if(idWidth>4||idWidth>=bytes.length)throw Error('RESERVED_VOID_ID_TRUNCATED');
  let id=0;for(let i=0;i<idWidth;i++)id=id*256+bytes[i];
  const first=bytes[idWidth];
  if(!first)throw Error('RESERVED_VOID_SIZE_INVALID');
  let sizeWidth=1;while(sizeWidth<=8 && !(first&(0x80>>(sizeWidth-1))))sizeWidth++;
  if(sizeWidth>8||idWidth+sizeWidth>bytes.length)throw Error('RESERVED_VOID_SIZE_TRUNCATED');
  let size=BigInt(first&((1<<(8-sizeWidth))-1));
  for(let i=1;i<sizeWidth;i++)size=(size<<8n)|BigInt(bytes[idWidth+i]);
  if(size===(1n<<BigInt(sizeWidth*7))-1n||size>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('RESERVED_VOID_UNSUPPORTED_UNKNOWN_SIZE');
  const dataStart=start+idWidth+sizeWidth,end=dataStart+Number(size);
  if(!Number.isSafeInteger(end)||end>limit)throw Error('RESERVED_VOID_ELEMENT_OUT_OF_BOUNDS');
  return {id,start,idWidth,sizeWidth,dataStart,end};
}
async function children(blob,from,to) {
  const rows=[];for(let offset=from;offset<to;){
    if(rows.length>=8192)throw Error('RESERVED_VOID_ELEMENT_BUDGET');
    const el=await readElement(blob,offset,to);
    rows.push(el);offset=el.end;
  }
  return rows;
}
async function locateSlot(source,raw,target){
  const masters=raw.elements.filter(x=>x.id==='0x1941a469');
  if(masters.length!==1)throw Error('RESERVED_VOID_ATTACHMENTS_MASTER_NOT_UNIQUE');
  const m=masters[0],master=await readElement(source,m.offset,m.offset+m.byteLength);
  if(master.id!==ID.attachments||master.end!==m.offset+m.byteLength)
    throw Error('RESERVED_VOID_MASTER_NOT_EXACT');
  const attached=await children(source,master.dataStart,master.end);
  if(attached.some(x=>x.id===ID.crc))
    throw Error('RESERVED_VOID_ATTACHMENTS_CRC_REFUSED');
  if(attached.some(x=>![ID.attached,ID.void].includes(x.id)))
    throw Error('RESERVED_VOID_ATTACHMENTS_UNKNOWN_CHILD');
  const slots=[];
  for(const a of attached.filter(x=>x.id===ID.attached)){
    const fields=await children(source,a.dataStart,a.end);
    if(fields.some(x=>x.id===ID.crc))
      throw Error('RESERVED_VOID_ATTACHED_CRC_REFUSED');
    if(fields.some(x=>!memberIds.has(x.id)))
      throw Error('RESERVED_VOID_ATTACHED_UNKNOWN_CHILD');
    const data=fields.filter(x=>x.id===ID.filedata);
    if(data.length!==1)throw Error('RESERVED_VOID_FILEDATA_AMBIGUOUS');
    const position=fields.indexOf(data[0]);
    const next=fields[position+1];
    slots.push({a,data:data[0],void:next?.id===ID.void?next:null});
  }
  const matched=slots.filter(slot=>slot.data.dataStart===target.dataRange.offset &&
    slot.data.end-slot.data.dataStart===target.dataRange.length);
  if(matched.length!==1)throw Error('RESERVED_VOID_TARGET_OFFSET_UNVERIFIED');
  if(!matched[0].void)throw Error('RESERVED_VOID_ADJACENT_SLOT_REQUIRED');
  return matched[0];
}
function budget(source,replacement,targetFileUid,confirmed){
  if(!confirmed)throw Error('RESERVED_VOID_REVIEW_REQUIRED');
  if(!source?.slice||!Number.isSafeInteger(source.size)||
      source.size<=0||source.size>MAX_SOURCE||
      !replacement?.slice||!Number.isSafeInteger(replacement.size)||
      replacement.size<=0||replacement.size>MAX_PAYLOAD)
    throw Error('RESERVED_VOID_SOURCE_OR_PAYLOAD_BUDGET');
  if(typeof targetFileUid!=='string'||!/^[1-9][0-9]{0,19}$/.test(targetFileUid))
    throw Error('RESERVED_VOID_TARGET_UID_INVALID');
}
/**
 * Changes two adjacent children, FileData followed by Void, entirely inside
 * the same original AttachedFile byte span. No parent/Segment/header size or
 * external top-level offset is rewritten. The target's FileUID must be
 * unreferenced by any TagAttachmentUID.
 */
export async function prepareReservedVoidFileDataReplacement({
  source,replacement,targetFileUid,approveVariableLength=false,
}={}) {
  budget(source,replacement,targetFileUid,approveVariableLength);
  const raw=await inspectRawSegmentPreservation(source);
  if(raw.state!=='inspected'||raw.segmentUnknownLength||
      raw.coverage.unknownTopElementIds.length||
      raw.elements.some(x=>x.id==='0xbf')||
      raw.elements.filter(x=>x.id==='0x1941a469').length!==1)
    throw Error('RESERVED_VOID_UNKNOWN_OR_UNVERIFIED_SOURCE');
  if(!raw.elements.some(x=>x.id==='0x1654ae6b')||
      !raw.elements.some(x=>x.id==='0x1f43b675'))
    throw Error('RESERVED_VOID_MEDIA_REQUIRED');
  const reader=createMatroskaAttachmentReader(source);
  const inventory=await reader.inspect();
  if(inventory.state!=='inspected'||inventory.structure.attachmentElements!==1||
      new Set(inventory.attachments.map(x=>x.fileUid)).size!==inventory.attachments.length)
    throw Error('RESERVED_VOID_SOURCE_INVENTORY_UNVERIFIED');
  const matches=inventory.attachments.filter(x=>x.fileUid===targetFileUid);
  if(matches.length!==1)throw Error('RESERVED_VOID_TARGET_UID_MISSING');
  const target=matches[0];
  if(target.byteLength===replacement.size)
    throw Error('RESERVED_VOID_EQUAL_LENGTH_USE_EXISTING_WRITER');
  const graph=await reader.inspectRelations(inventory);
  if(!reader.isCurrentInspection(inventory)||
      graph.state!=='inspected'||
      graph.coverage.tagTargets!=='known-targets-enumerated')
    throw Error('RESERVED_VOID_REFERENCE_GRAPH_UNVERIFIED');
  if(graph.edges.some(x=>x.targetKind==='attachment'&&x.targetUid===targetFileUid))
    throw Error('RESERVED_VOID_TAGGED_ATTACHMENT_BLOCKED');
  const slot=await locateSlot(source,raw,target);
  // Keep original FileData element ID and SIZE VINT width. The immediately
  // trailing Void takes the opposite byte delta, including its own header.
  sizeVint(replacement.size,slot.data.sizeWidth);
  const total=slot.void.end-slot.data.start;
  const remaining=total-slot.data.idWidth-slot.data.sizeWidth-replacement.size;
  const unused=constructVoid(remaining);
  if(unused.size!==remaining)throw Error('RESERVED_VOID_REMAINDER_INCONSISTENT');
  const originalSha=await sha256(source);
  const oldDataSha=await sha256(reader.openAttachment(target.id).data);
  const replacementSha=await sha256(replacement);
  const plan=freeze({
    schema:RESERVED_VOID_FILEDATA_PLAN_SCHEMA,
    state:'REVIEWED_SOURCE_BOUND_EXPERIMENTAL_ONLY',
    target:{fileUid:target.fileUid,filename:target.filename,mimeType:target.mimeType,
      oldDataLength:target.byteLength,newDataLength:replacement.size,
      oldDataOffset:target.dataRange.offset},
    slot:{start:slot.data.start,end:slot.void.end,totalLength:total,
      fileDataSizeWidth:slot.data.sizeWidth,
      originalVoidBytes:slot.void.end-slot.void.start,
      remainingVoidBytes:remaining},
    evidence:{sourceSha256:originalSha,oldDataSha256:oldDataSha,
      requestedDataSha256:replacementSha,
      rawProtectedByteCommitments:'required-unchanged',
      graph:'all-observed-targets-verified-unreferenced-fileUid',
      variableLengthOnlyWithinExistingVoid:true},
    execution:{sourceOverwrite:false,autoDownload:false,generalWriter:false},
  });
  permits.set(plan,{source,replacement,raw,inventory,target,slot,originalSha,
    oldDataSha,replacementSha});
  return plan;
}
export async function executeReservedVoidFileDataReplacement(plan){
  if(plan?.schema!==RESERVED_VOID_FILEDATA_PLAN_SCHEMA ||
      !Object.isFrozen(plan)||!permits.has(plan))
    throw Error('RESERVED_VOID_FORGED_OR_STALE_PLAN');
  const {source,replacement,raw,inventory,target,slot,originalSha,oldDataSha,
    replacementSha}=permits.get(plan);
  if(await sha256(source)!==originalSha ||
      await sha256(replacement)!==replacementSha ||
      replacement.size!==plan.target.newDataLength)
    throw Error('RESERVED_VOID_SOURCE_OR_PAYLOAD_CHANGED');
  const dataSize=sizeVint(replacement.size,slot.data.sizeWidth);
  const remaining=slot.void.end-slot.data.start-slot.data.idWidth-dataSize.length-replacement.size;
  const filler=constructVoid(remaining);
  const idBytes=new Uint8Array(await source.slice(slot.data.start,
    slot.data.start+slot.data.idWidth).arrayBuffer());
  const middle=new Blob([idBytes,dataSize,replacement,filler]);
  if(middle.size!==slot.void.end-slot.data.start)
    throw Error('RESERVED_VOID_SLOT_SPAN_CHANGED');
  const output=new Blob([
    source.slice(0,slot.data.start),middle,
    source.slice(slot.void.end),
  ],{type:'application/octet-stream'});
  if(output.size!==source.size)throw Error('RESERVED_VOID_TOTAL_FILE_LENGTH_CHANGED');
  const scanned=await inspectRawSegmentPreservation(output);
  const comparison=compareRawSegmentPreservation(raw,scanned,{attachmentChangesRequested:true});
  if(scanned.state!=='inspected'||comparison.approvedToWrite ||
      comparison.state!=='ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF'||
      !comparison.protectedTopLevelEqual ||
      !comparison.ebmlHeaderEqual||!comparison.segmentHeaderEqual ||
      raw.elements.length!==scanned.elements.length||
      raw.elements.some((old,i)=>{
        const next=scanned.elements[i];
        return !next||old.id!==next.id||old.offset!==next.offset||
          old.byteLength!==next.byteLength||
          (old.family==='protected'&&old.byteCommitment!==next.byteCommitment);
      }))
    throw Error('RESERVED_VOID_PROTECTED_BYTES_CHANGED');
  const reader=createMatroskaAttachmentReader(output);
  const observed=await reader.inspect();
  if(observed.state!=='inspected'||observed.attachments.length!==inventory.attachments.length)
    throw Error('RESERVED_VOID_OUTPUT_INVENTORY_UNVERIFIED');
  const prior=new Map(inventory.attachments.map(x=>[x.fileUid,x]));
  for(const current of observed.attachments){
    const old=prior.get(current.fileUid);
    if(!old||current.id!==old.id||current.filename!==old.filename||
        current.mimeType!==old.mimeType||current.description!==old.description)
      throw Error('RESERVED_VOID_ORIGINAL_ATTACHMENT_METADATA_CHANGED');
    if(current.fileUid===target.fileUid){
      if(current.byteLength!==replacement.size||
          current.dataRange.offset!==plan.slot.start+slot.data.idWidth+slot.data.sizeWidth)
        throw Error('RESERVED_VOID_REPLACED_DATA_OFFSET_OR_LENGTH_CHANGED');
    }else if(current.byteLength!==old.byteLength||
             current.dataRange.offset!==old.dataRange.offset)
      throw Error('RESERVED_VOID_OTHER_ATTACHMENT_OFFSET_CHANGED');
    const actual=await sha256(reader.openAttachment(current.id).data);
    const expected=current.fileUid===target.fileUid?replacementSha:
      await sha256(source.slice(old.dataRange.offset,
        old.dataRange.offset+old.byteLength));
    if(actual!==expected)throw Error('RESERVED_VOID_OUTPUT_FILEDATA_HASH_INVALID');
  }
  if(await sha256(source)!==originalSha||await sha256(replacement)!==replacementSha||
      await sha256(source.slice(target.dataRange.offset,
        target.dataRange.offset+target.byteLength))!==oldDataSha)
    throw Error('RESERVED_VOID_INPUT_CHANGED_DURING_AUDIT');
  const originalPrefix=await sha256(source.slice(0,slot.data.start));
  const outputPrefix=await sha256(output.slice(0,slot.data.start));
  const originalSuffix=await sha256(source.slice(slot.void.end));
  const outputSuffix=await sha256(output.slice(slot.void.end));
  if(originalPrefix!==outputPrefix||originalSuffix!==outputSuffix)
    throw Error('RESERVED_VOID_OUTSIDE_SLOT_BYTES_CHANGED');
  const base=String(source.name||'source.mkv').split(/[\\/]/).pop()
    .replace(/\.(mkv|mka|mks|mk3d)$/i,'')
    .replace(/[\u0000-\u001f\u007f]/g,'').slice(0,140)||'Matroska';
  return Object.freeze({
    status:'LOCAL_RESERVED_VOID_VARIABLE_DATA_VERIFIED_EXTERNAL_AUDIT_PENDING',
    filename:base+'.void-filedata-replaced.experimental.mkv',
    output,
    evidence:Object.freeze({
      sourceSha256:originalSha,outputSha256:await sha256(output),
      oldFileDataSha256:oldDataSha,newFileDataSha256:replacementSha,
      oldDataLength:target.byteLength,newDataLength:replacement.size,
      originalBlobUnmodified:true,originalFileLengthUnchanged:true,
      originalProtectedTopLevelBytesAndOffsetsMatch:true,
      allOtherAttachmentBytesAndOffsetsMatch:true,
      sourceOutsideChangedSlotByteIdentical:true,
      generalWriter:false,externalCurrentFileAudit:false,
    }),
  });
}
