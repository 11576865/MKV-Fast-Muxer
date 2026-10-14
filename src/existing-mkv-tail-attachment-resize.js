import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { inspectRawSegmentPreservation } from './matroska-raw-preservation-contract.js';

/**
 * P0/P2-T: no-Void FileData resize by rewriting exactly four EBML size
 * fields. This is NOT a general Matroska structural writer.
 *
 * Eligible source: fully length-delimited Segment whose FINAL top-level
 * child is Attachments; the target is the FINAL AttachedFile in that master.
 * No top-level children move; no SeekHead/Cues/Chapter/Tag/Cluster byte or
 * offset can change. The target's subsequent fields may move, but preserve
 * their bytes and FileUID. CRC and targeted FileUID edits are denied.
 */
export const TAIL_FILEDATA_RESIZE_SCHEMA =
  'existing-mkv-tail-attachment-filedata-resize-plan-v0';
const MAX_SOURCE=60*1024*1024,MAX_DATA=4*1024*1024;
const ID=Object.freeze({ebml:0x1a45dfa3,segment:0x18538067,
  attachments:0x1941a469,attached:0x61a7,fileData:0x465c,
  void:0xec,crc:0xbf,filename:0x466e,mime:0x4660,uid:0x46ae,description:0x467e});
const ALLOWED_ATTACHED=new Set([ID.fileData,ID.filename,ID.mime,ID.uid,ID.description,ID.void]);
const grants=new WeakMap();
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
async function digest(blob){
  if(!globalThis.crypto?.subtle)throw Error('TAIL_RESIZE_WEBCRYPTO_REQUIRED');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
  return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
function vintSize(n,width){
  if(!Number.isSafeInteger(n)||n<0||!Number.isInteger(width)||width<1||width>8||
     BigInt(n)>=(1n<<BigInt(7*width))-1n)
    throw Error('TAIL_RESIZE_FIXED_SIZE_FIELD_CAPACITY_EXCEEDED');
  let bits=BigInt(n)|(1n<<BigInt(width*7));
  const out=new Uint8Array(width);
  for(let k=width-1;k>=0;k--){out[k]=Number(bits&255n);bits>>=8n;}
  return out;
}
async function header(blob,at,end){
  if(!Number.isSafeInteger(at)||!Number.isSafeInteger(end)||at<0||at>=end||
      end>blob.size)throw Error('TAIL_RESIZE_ELEMENT_RANGE');
  const bytes=new Uint8Array(await blob.slice(at,Math.min(at+12,end)).arrayBuffer());
  const first=bytes[0];
  if(!first)throw Error('TAIL_RESIZE_ID_INVALID');
  let idWidth=1;
  while(idWidth<=4&&!(first&(0x80>>(idWidth-1))))idWidth++;
  if(idWidth>4||idWidth>=bytes.length)throw Error('TAIL_RESIZE_ID_TRUNCATED');
  let id=0;for(let i=0;i<idWidth;i++)id=id*256+bytes[i];
  const sz=bytes[idWidth];
  if(!sz)throw Error('TAIL_RESIZE_SIZE_INVALID');
  let width=1;while(width<=8&&!(sz&(0x80>>(width-1))))width++;
  if(width>8||idWidth+width>bytes.length)throw Error('TAIL_RESIZE_SIZE_TRUNCATED');
  let num=BigInt(sz&((1<<(8-width))-1));
  for(let i=1;i<width;i++)num=(num<<8n)|BigInt(bytes[idWidth+i]);
  if(num===(1n<<BigInt(width*7))-1n||num>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('TAIL_RESIZE_UNKNOWN_OR_UNADDRESSABLE_SIZE');
  const size=Number(num),sizeStart=at+idWidth,dataStart=sizeStart+width;
  const tail=dataStart+size;
  if(!Number.isSafeInteger(tail)||tail>end)
    throw Error('TAIL_RESIZE_CHILD_OUT_OF_BOUNDS');
  return {id,start:at,idWidth,width,sizeStart,dataStart,size,end:tail};
}
async function children(blob,start,end){
  const all=[];
  for(let at=start;at<end;){
    if(all.length>=8192)throw Error('TAIL_RESIZE_CHILD_HEADER_BUDGET');
    const e=await header(blob,at,end);all.push(e);at=e.end;
  }
  return all;
}
async function locateTail(source,raw,target){
  const ebml=await header(source,0,source.size);
  if(ebml.id!==ID.ebml)throw Error('TAIL_RESIZE_EBML_HEADER_REQUIRED');
  const segment=await header(source,ebml.end,source.size);
  if(segment.id!==ID.segment||segment.end!==source.size)
    throw Error('TAIL_RESIZE_FINITE_FINAL_SEGMENT_REQUIRED');
  const top=await children(source,segment.dataStart,segment.end);
  if(top.length!==raw.elements.length||top.some((e,i)=>
      e.start!==raw.elements[i].offset||e.end-e.start!==raw.elements[i].byteLength))
    throw Error('TAIL_RESIZE_RAW_TOP_LEVEL_MISMATCH');
  const terminal=top.at(-1);
  if(terminal?.id!==ID.attachments ||
      top.filter(x=>x.id===ID.attachments).length!==1)
    throw Error('TAIL_RESIZE_ATTACHMENTS_MUST_BE_FINAL_SEGMENT_CHILD');
  const attachedChildren=await children(source,terminal.dataStart,terminal.end);
  if(attachedChildren.some(e=>e.id===ID.crc))
    throw Error('TAIL_RESIZE_ATTACHMENTS_CRC_DENIED');
  if(attachedChildren.some(e=>e.id!==ID.attached&&e.id!==ID.void))
    throw Error('TAIL_RESIZE_ATTACHMENTS_UNKNOWN_CHILD');
  const attached=attachedChildren.filter(e=>e.id===ID.attached);
  const last=attached.at(-1);
  if(!last||attachedChildren.at(-1)!==last)
    throw Error('TAIL_RESIZE_FINAL_ATTACHEDFILE_REQUIRED');
  const fields=await children(source,last.dataStart,last.end);
  if(fields.some(x=>x.id===ID.crc))throw Error('TAIL_RESIZE_ATTACHEDFILE_CRC_DENIED');
  if(fields.some(x=>!ALLOWED_ATTACHED.has(x.id)))
    throw Error('TAIL_RESIZE_ATTACHEDFILE_UNKNOWN_FIELD');
  const datas=fields.filter(x=>x.id===ID.fileData);
  if(datas.length!==1)throw Error('TAIL_RESIZE_FILEDATA_NOT_UNIQUE');
  const data=datas[0];
  if(data.dataStart!==target.dataRange.offset||data.size!==target.byteLength)
    throw Error('TAIL_RESIZE_TARGET_IS_NOT_FINAL_ATTACHEDFILE');
  return {segment,master:terminal,attached:last,data};
}
function basic(source,replacement,uid,reviewed){
  if(!reviewed)throw Error('TAIL_RESIZE_EXPLICIT_REVIEW_REQUIRED');
  if(!source?.slice||!replacement?.slice||
      !Number.isSafeInteger(source.size)||source.size<1||source.size>MAX_SOURCE||
      !Number.isSafeInteger(replacement.size)||replacement.size<1||
      replacement.size>MAX_DATA)
    throw Error('TAIL_RESIZE_INPUT_BUDGET');
  if(typeof uid!=='string'||!/^[1-9][0-9]{0,19}$/.test(uid))
    throw Error('TAIL_RESIZE_FILEUID_REQUIRED');
}
/** Frozen plan has NO serialized File grant and is not executable when cloned. */
export async function prepareTailAttachmentResize({
  source,replacement,targetFileUid,approveTailResize=false,
}={}){
  basic(source,replacement,targetFileUid,approveTailResize);
  const raw=await inspectRawSegmentPreservation(source);
  if(raw.state!=='inspected'||raw.segmentUnknownLength||
      raw.coverage.unknownTopElementIds.length||
      raw.elements.some(x=>x.id==='0xbf')||
      !raw.elements.some(x=>x.id==='0x1654ae6b')||
      !raw.elements.some(x=>x.id==='0x1f43b675'))
    throw Error('TAIL_RESIZE_RAW_SOURCE_NOT_ELIGIBLE');
  const original=createMatroskaAttachmentReader(source);
  const stock=await original.inspect();
  if(stock.state!=='inspected'||stock.structure.attachmentElements!==1||
      new Set(stock.attachments.map(x=>x.fileUid)).size!==stock.attachments.length)
    throw Error('TAIL_RESIZE_ATTACHMENT_INVENTORY_INVALID');
  const matches=stock.attachments.filter(x=>x.fileUid===targetFileUid);
  if(matches.length!==1)throw Error('TAIL_RESIZE_TARGET_FILEUID_NOT_UNIQUE');
  const item=matches[0];
  if(item.byteLength===replacement.size)
    throw Error('TAIL_RESIZE_EQUAL_SIZE_USE_VERIFIED_LOCAL_WRITER');
  const graph=await original.inspectRelations(stock);
  if(!original.isCurrentInspection(stock)||graph.state!=='inspected'||
      graph.coverage.tagTargets!=='known-targets-enumerated')
    throw Error('TAIL_RESIZE_UID_GRAPH_NOT_COMPLETE');
  if(graph.edges.some(x=>x.targetKind==='attachment'&&x.targetUid===targetFileUid))
    throw Error('TAIL_RESIZE_REFERENCED_FILEUID_DENIED');
  const positions=await locateTail(source,raw,item);
  const delta=replacement.size-item.byteLength;
  for(const e of Object.values(positions))vintSize(e.size+delta,e.width);
  const sourceHash=await digest(source);
  const oldDataHash=await digest(original.openAttachment(item.id).data);
  const replacementHash=await digest(replacement);
  if(sourceHash!==await digest(source)||!original.isCurrentInspection(stock))
    throw Error('TAIL_RESIZE_SOURCE_CHANGED_DURING_REVIEW');
  const plan=freeze({
    schema:TAIL_FILEDATA_RESIZE_SCHEMA,
    state:'REVIEWED_TAIL_ATTACHMENT_SIZE_FIELD_REWRITE_NEW_COPY_ONLY',
    sourceName:String(source.name||'source.mkv'),
    target:{uid:targetFileUid,filename:item.filename,mime:item.mimeType,
      originalLength:item.byteLength,replacementLength:replacement.size,
      originalDataOffset:item.dataRange.offset},
    layout:{delta,segmentOffset:positions.segment.start,
      attachmentsOffset:positions.master.start,
      attachedFileOffset:positions.attached.start,
      originalFiledataOffset:positions.data.dataStart,
      originalSourceBytes:source.size,newSourceBytes:source.size+delta,
      rewrittenSizeFields:4,noTopLevelElementMoved:true},
    evidence:{sourceSha256:sourceHash,oldFileDataSha256:oldDataHash,
      replacementSha256:replacementHash,sourceTagTarget:'unreferenced',
      sourceProtectedTopLevelProof:'raw-byte-commitment-required',
      generalMatroskaWriter:false},
    execution:{originalSourceOverwrite:false,autoDownload:false,
      independentNativePlayerAudit:'pending'},
  });
  grants.set(plan,{source,replacement,raw,stock,item,positions,sourceHash,
    oldDataHash,replacementHash,sourceEdges:graph.edges});
  return plan;
}
function patchedBlob(source,patches){
  patches.sort((a,b)=>a.from-b.from);
  const fragments=[];let at=0;
  for(const item of patches){
    if(item.from<at||item.from>item.to||item.to>source.size)
      throw Error('TAIL_RESIZE_OVERLAPPING_PATCHES');
    fragments.push(source.slice(at,item.from),item.payload);at=item.to;
  }
  fragments.push(source.slice(at));
  return new Blob(fragments,{type:'application/octet-stream'});
}
export async function executeTailAttachmentResize(plan){
  if(plan?.schema!==TAIL_FILEDATA_RESIZE_SCHEMA||!Object.isFrozen(plan)||
      !grants.has(plan))throw Error('TAIL_RESIZE_FORGED_OR_DETACHED_PLAN');
  const {source,replacement,raw,stock,item,positions,sourceHash,oldDataHash,
    replacementHash,sourceEdges}=grants.get(plan);
  if(await digest(source)!==sourceHash||await digest(replacement)!==replacementHash)
    throw Error('TAIL_RESIZE_INPUT_CHANGED_AFTER_REVIEW');
  const delta=plan.layout.delta;
  const patches=Object.values(positions).map(e=>({
    from:e.sizeStart,to:e.dataStart,payload:vintSize(e.size+delta,e.width),
  }));
  const data=positions.data;
  patches.push({from:data.dataStart,to:data.end,payload:replacement});
  const output=patchedBlob(source,patches);
  if(output.size!==source.size+delta)
    throw Error('TAIL_RESIZE_OUTPUT_TOTAL_LENGTH_INVALID');
  const observedRaw=await inspectRawSegmentPreservation(output);
  if(observedRaw.state!=='inspected'||observedRaw.segmentUnknownLength||
      observedRaw.elements.length!==raw.elements.length||
      observedRaw.ebmlHeaderCommitment!==raw.ebmlHeaderCommitment||
      observedRaw.elements.some((next,i)=>{
        const prev=raw.elements[i];
        return next.id!==prev.id||next.offset!==prev.offset||
          (prev.family==='protected'&&(
            next.byteLength!==prev.byteLength||
            next.byteCommitment!==prev.byteCommitment))||
          (prev.family==='attachments'&&
            next.byteLength!==prev.byteLength+delta);
      }))
    throw Error('TAIL_RESIZE_PROTECTED_TOP_LEVEL_CHANGED');
  // The expected Segment-size-field delta is intentional, never promoted to
  // permission from the generic preservation comparator.
  const parsed=createMatroskaAttachmentReader(output);
  const after=await parsed.inspect();
  if(after.state!=='inspected'||after.attachments.length!==stock.attachments.length)
    throw Error('TAIL_RESIZE_OUTPUT_INVENTORY_INVALID');
  const oldByUid=new Map(stock.attachments.map(x=>[x.fileUid,x]));
  for(const present of after.attachments){
    const before=oldByUid.get(present.fileUid);
    if(!before||present.filename!==before.filename||
        present.mimeType!==before.mimeType||
        present.description!==before.description||present.id!==before.id)
      throw Error('TAIL_RESIZE_ATTACHMENT_METADATA_CHANGED');
    if(present.fileUid===item.fileUid){
      if(present.byteLength!==replacement.size||
          present.dataRange.offset!==item.dataRange.offset)
        throw Error('TAIL_RESIZE_TARGET_LENGTH_OR_OFFSET_CHANGED');
    }else if(present.byteLength!==before.byteLength||
        present.dataRange.offset!==before.dataRange.offset)
      throw Error('TAIL_RESIZE_OTHER_ATTACHMENT_MOVED');
    const expected=present.fileUid===item.fileUid?replacementHash:
      await digest(source.slice(before.dataRange.offset,
        before.dataRange.offset+before.byteLength));
    if(await digest(parsed.openAttachment(present.id).data)!==expected)
      throw Error('TAIL_RESIZE_ATTACHMENT_SHA_MISMATCH');
  }
  const outGraph=await parsed.inspectRelations(after);
  if(outGraph.state!=='inspected'||
      JSON.stringify(outGraph.edges)!==JSON.stringify(sourceEdges))
    throw Error('TAIL_RESIZE_TARGET_GRAPH_CHANGED');
  if(await digest(source)!==sourceHash||
      await digest(replacement)!==replacementHash||
      await digest(source.slice(item.dataRange.offset,
        item.dataRange.offset+item.byteLength))!==oldDataHash)
    throw Error('TAIL_RESIZE_INPUT_CHANGED_DURING_AUDIT');
  const base=String(source.name||'source.mkv').split(/[\\/]/).pop()
    .replace(/\.(mkv|mka|mks|mk3d)$/i,'')
    .replace(/[\u0000-\u001f\u007f]/g,'').slice(0,130)||'Matroska';
  return Object.freeze({
    status:'TAIL_FOUR_SIZE_FIELDS_AND_MEDIA_BYTE_PROVEN_EXTERNAL_AUDIT_PENDING',
    filename:base+'.tail-attachment-resized.experimental.mkv',
    output,
    evidence:Object.freeze({
      sourceSha256:sourceHash,outputSha256:await digest(output),
      originalFileDataSha256:oldDataHash,newFileDataSha256:replacementHash,
      resizedDataBytes:delta,sourceBytes:source.size,outputBytes:output.size,
      originalNonAttachmentElementsOffsetsAndBytesMatch:true,
      originalOtherAttachmentOffsetsAndDataMatch:true,
      originalTargetUidAndMetadataMatch:true,
      originalTagAttachmentRelationsMatch:true,
      generalWriter:false,independentNativeOutputAudit:false,
    }),
  });
}
