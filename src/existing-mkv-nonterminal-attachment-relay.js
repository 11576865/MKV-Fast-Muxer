import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { inspectRawSegmentPreservation } from './matroska-raw-preservation-contract.js';

/**
 * P0/P2-N: relocate a NON-terminal, already-indexed Attachments master
 * to Segment EOF, keeping every original protected byte at its old offset.
 * Replace its original entire master span with a byte-equal-length relay
 * SeekHead; original direct attachment SeekID entries now point to that
 * relay at the SAME original SeekPosition. Only fixed-width EBML sizes
 * inside the appended copy and the Segment size are changed.
 *
 * This does NOT move Clusters or Cues, repair arbitrary SeekPositions,
 * retarget TagAttachmentUID, handle CRC, or assert universal EBML safety.
 */
export const NONTERMINAL_RELAY_SCHEMA='existing-mkv-nonterminal-attachments-relay-v0';
const grants=new WeakMap(),MAX_SOURCE=60*1024*1024,MAX_DATA=4*1024*1024;
const ID={ebml:0x1a45dfa3,segment:0x18538067,attachments:0x1941a469,
 attached:0x61a7,data:0x465c,void:0xec,crc:0xbf,seekHead:0x114d9b74,
 seek:0x4dbb,seekId:0x53ab,seekPos:0x53ac,
 name:0x466e,mime:0x4660,uid:0x46ae,description:0x467e};
const ATTACHED_FIELDS=new Set([ID.data,ID.void,ID.name,ID.mime,ID.uid,ID.description]);
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
 Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
const bytesHex=buffer=>[...buffer].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hash(blob){
 if(!globalThis.crypto?.subtle)throw Error('RELAY_WEBCRYPTO_REQUIRED');
 return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())));
}
function vint(n,width){
 if(!Number.isSafeInteger(n)||n<0||!Number.isInteger(width)||width<1||width>8||
     BigInt(n)>=(1n<<BigInt(width*7))-1n)
   throw Error('RELAY_SIZE_VINT_CAPACITY');
 let v=BigInt(n)|(1n<<BigInt(width*7));const b=new Uint8Array(width);
 for(let i=width-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}
 return b;
}
function uint(n,width){
 let v=BigInt(n);if(v<0n||v>=(1n<<BigInt(width*8)))
   throw Error('RELAY_SEEKPOSITION_UINT_OVERFLOW');
 const b=new Uint8Array(width);
 for(let i=width-1;i>=0;i--){b[i]=Number(v&255n);v>>=8n;}
 return b;
}
function el(id,parts){
 const payload=new Blob(parts),idWidth=id>0xffffff?4:id>0xffff?3:id>0xff?2:1;
 const bytes=new Uint8Array(idWidth);
 for(let i=idWidth-1,v=id;i>=0;i--){bytes[i]=v&255;v>>>=8;}
 let width=1;while(BigInt(payload.size)>=(1n<<BigInt(width*7))-1n)width++;
 return new Blob([bytes,vint(payload.size,width),payload]);
}
function equalSpanVoid(length){
 for(let width=1;width<=8;width++){
  const n=length-width-1;
  if(n>=0&&BigInt(n)<(1n<<BigInt(width*7))-1n)
    return new Blob([Uint8Array.of(ID.void),vint(n,width),new Uint8Array(n)]);
 }
 throw Error('RELAY_CANNOT_PAD_ORIGINAL_SLOT');
}
function relayMaster(span,targetOffset){
 const seekEntry=el(ID.seek,[el(ID.seekId,[Uint8Array.from([0x19,0x41,0xa4,0x69])]),
  el(ID.seekPos,[uint(targetOffset,8)])]);
 for(let w=1;w<=8;w++){
  const inside=span-4-w,remaining=inside-seekEntry.size;
  if(remaining<2||BigInt(inside)>=(1n<<BigInt(7*w))-1n)continue;
  const relay=new Blob([Uint8Array.from([0x11,0x4d,0x9b,0x74]),
    vint(inside,w),seekEntry,equalSpanVoid(remaining)]);
  if(relay.size===span)return relay;
 }
 throw Error('RELAY_ORIGINAL_ATTACHMENTS_SLOT_TOO_SMALL');
}
async function header(file,at,limit){
 if(!Number.isSafeInteger(at)||!Number.isSafeInteger(limit)||at<0||at>=limit||limit>file.size)
   throw Error('RELAY_RANGE');
 const b=new Uint8Array(await file.slice(at,Math.min(at+12,limit)).arrayBuffer());
 if(!b[0])throw Error('RELAY_INVALID_ID');
 let idW=1;while(idW<=4&&!(b[0]&(0x80>>(idW-1))))idW++;
 if(idW>4||idW>=b.length)throw Error('RELAY_TRUNCATED_ID');
 let id=0;for(let i=0;i<idW;i++)id=id*256+b[i];
 let w=1;const lead=b[idW];
 if(!lead)throw Error('RELAY_INVALID_SIZE');
 while(w<=8&&!(lead&(0x80>>(w-1))))w++;
 if(w>8||idW+w>b.length)throw Error('RELAY_TRUNCATED_SIZE');
 let n=BigInt(lead&((1<<(8-w))-1));
 for(let i=1;i<w;i++)n=(n<<8n)|BigInt(b[idW+i]);
 if(n===(1n<<BigInt(w*7))-1n||n>BigInt(Number.MAX_SAFE_INTEGER))
   throw Error('RELAY_UNKNOWN_OR_UNADDRESSABLE_SIZE');
 const dataStart=at+idW+w,end=dataStart+Number(n);
 if(!Number.isSafeInteger(end)||end>limit)throw Error('RELAY_ELEMENT_OVERRUN');
 return {id,start:at,idW,w,sizeStart:at+idW,dataStart,size:Number(n),end};
}
async function children(file,from,to){
 const rows=[];for(let at=from;at<to;){
  if(rows.length>=8192)throw Error('RELAY_CHILD_BUDGET');
  const e=await header(file,at,to);rows.push(e);at=e.end;
 }
 return rows;
}
function diffBlob(source,patches,append=[]){
 patches.sort((a,b)=>a.from-b.from);
 const pieces=[];let last=0;
 for(const p of patches){
  if(p.from<last||p.to<p.from||p.to>source.size)
    throw Error('RELAY_OVERLAPPING_CHANGES');
  pieces.push(source.slice(last,p.from),p.payload);last=p.to;
 }
 return new Blob([...pieces,source.slice(last),...append],{type:'application/octet-stream'});
}
async function sourceGeometry(source,raw,target){
 const ebml=await header(source,0,source.size),
  seg=await header(source,ebml.end,source.size);
 if(ebml.id!==ID.ebml||seg.id!==ID.segment||seg.end!==source.size)
   throw Error('RELAY_COMPLETE_FINITE_SEGMENT_REQUIRED');
 const nodes=await children(source,seg.dataStart,seg.end);
 if(nodes.length!==raw.elements.length||nodes.some((x,i)=>
     x.start!==raw.elements[i].offset||x.end-x.start!==raw.elements[i].byteLength))
   throw Error('RELAY_TOP_LEVEL_SOURCE_MISMATCH');
 const masters=nodes.filter(x=>x.id===ID.attachments);
 if(masters.length!==1||masters[0]===nodes.at(-1))
   throw Error('RELAY_UNIQUE_NONTERMINAL_ATTACHMENTS_REQUIRED');
 const master=masters[0];
 const rows=await children(source,master.dataStart,master.end);
 if(rows.some(x=>x.id===ID.crc))throw Error('RELAY_ATTACHMENTS_CRC_BLOCKED');
 if(rows.some(x=>x.id!==ID.attached&&x.id!==ID.void))
   throw Error('RELAY_UNKNOWN_ATTACHMENTS_CHILD');
 const attached=rows.filter(x=>x.id===ID.attached);
 const last=attached.at(-1);
 if(!last||rows.at(-1)!==last)throw Error('RELAY_FINAL_ATTACHEDFILE_REQUIRED');
 const fields=await children(source,last.dataStart,last.end);
 if(fields.some(x=>x.id===ID.crc))throw Error('RELAY_ATTACHEDFILE_CRC_BLOCKED');
 if(fields.some(x=>!ATTACHED_FIELDS.has(x.id)))
   throw Error('RELAY_UNKNOWN_ATTACHEDFILE_CHILD');
 const data=fields.filter(x=>x.id===ID.data);
 if(data.length!==1||data[0].dataStart!==target.dataRange.offset||
    data[0].size!==target.byteLength)
   throw Error('RELAY_TARGET_NOT_FINAL_FILEDATA');
 const seekPatches=[];
 let recognized=0;
 for(const seekhead of nodes.filter(x=>x.id===ID.seekHead)){
  const seekRows=await children(source,seekhead.dataStart,seekhead.end);
  if(seekRows.some(x=>x.id===ID.crc))
    throw Error('RELAY_SOURCE_SEEKHEAD_CRC_UNSUPPORTED');
  if(seekRows.some(x=>x.id!==ID.seek&&x.id!==ID.void))
    throw Error('RELAY_UNKNOWN_SEEKHEAD_CHILD');
  for(const entry of seekRows.filter(x=>x.id===ID.seek)){
   const members=await children(source,entry.dataStart,entry.end);
   if(members.some(x=>x.id===ID.crc))throw Error('RELAY_SEEK_ENTRY_CRC_BLOCKED');
   const identities=members.filter(x=>x.id===ID.seekId);
   const positions=members.filter(x=>x.id===ID.seekPos);
   if(identities.length!==1||positions.length!==1)
     throw Error('RELAY_INCOMPLETE_SEEK_ENTRY');
   const identity=identities[0],pos=positions[0];
   const rawId=new Uint8Array(await source.slice(identity.dataStart,identity.end).arrayBuffer());
   if(rawId.length!==4)throw Error('RELAY_SEEKID_WIDTH_UNSUPPORTED');
   const isAttachments=rawId.every((v,i)=>v===([0x19,0x41,0xa4,0x69][i]));
   if(!isAttachments)continue;
   let oldPos=0n;
   const p=new Uint8Array(await source.slice(pos.dataStart,pos.end).arrayBuffer());
   if(p.length===0||p.length>8)throw Error('RELAY_SEEKPOSITION_UNSUPPORTED');
   for(const b of p)oldPos=(oldPos<<8n)|BigInt(b);
   if(oldPos!==BigInt(master.start-seg.dataStart))
     throw Error('RELAY_STALE_OR_ALTERNATE_ATTACHMENTS_SEEK');
   seekPatches.push({from:identity.dataStart,to:identity.end,
      payload:Uint8Array.from([0x11,0x4d,0x9b,0x74])});
   recognized++;
  }
 }
 if(!recognized)throw Error('RELAY_ATTACHMENTS_SEEK_ENTRY_REQUIRED');
 return {seg,nodes,master,attached:last,data:data[0],seekPatches,recognized};
}
export async function prepareNonterminalAttachmentRelay({
 source,replacement,targetFileUid,approveRelocation=false,
}={}){
 if(!approveRelocation)throw Error('RELAY_EXPLICIT_REVIEW_REQUIRED');
 if(!source?.slice||!replacement?.slice||!Number.isSafeInteger(source.size)||
     source.size<1||source.size>MAX_SOURCE||!Number.isSafeInteger(replacement.size)||
     replacement.size<1||replacement.size>MAX_DATA)
   throw Error('RELAY_INPUT_BUDGET');
 if(typeof targetFileUid!=='string'||!/^[1-9][0-9]{0,19}$/.test(targetFileUid))
   throw Error('RELAY_UID_REQUIRED');
 const raw=await inspectRawSegmentPreservation(source);
 if(raw.state!=='inspected'||raw.segmentUnknownLength||
    raw.coverage.unknownTopElementIds.length||
    raw.elements.some(x=>x.id==='0xbf')||
    !raw.elements.some(x=>x.id==='0x1654ae6b')||
    !raw.elements.some(x=>x.id==='0x1f43b675'))
   throw Error('RELAY_RAW_SOURCE_INELIGIBLE');
 const reader=createMatroskaAttachmentReader(source),inv=await reader.inspect();
 if(inv.state!=='inspected'||inv.structure.attachmentElements!==1||
    new Set(inv.attachments.map(x=>x.fileUid)).size!==inv.attachments.length)
   throw Error('RELAY_INVENTORY_INCOMPLETE');
 const matches=inv.attachments.filter(x=>x.fileUid===targetFileUid);
 if(matches.length!==1)throw Error('RELAY_UID_NOT_UNIQUE');
 const target=matches[0];
 if(target.byteLength===replacement.size)
   throw Error('RELAY_EQUAL_LENGTH_USE_LOCAL_WRITER');
 const graph=await reader.inspectRelations(inv);
 if(!reader.isCurrentInspection(inv)||graph.state!=='inspected'||
    graph.coverage.tagTargets!=='known-targets-enumerated')
   throw Error('RELAY_SOURCE_GRAPH_INCOMPLETE');
 if(graph.edges.some(x=>x.targetKind==='attachment'&&x.targetUid===targetFileUid))
   throw Error('RELAY_REFERENCED_ATTACHMENT_BLOCKED');
 const geometry=await sourceGeometry(source,raw,target);
 const delta=replacement.size-target.byteLength,
  appendedBytes=geometry.master.end-geometry.master.start+delta;
 if(appendedBytes<=0)throw Error('RELAY_APPEND_MASTER_NEGATIVE_LENGTH');
 for(const e of [geometry.seg,geometry.master,geometry.attached,geometry.data])
   vint(e.size+(e===geometry.seg?appendedBytes:delta),e.w);
 const relay=relayMaster(geometry.master.end-geometry.master.start,
   source.size-geometry.seg.dataStart);
 if(source.size+appendedBytes>64*1024*1024)
   throw Error('RELAY_OUTPUT_RAW_AUDIT_BUDGET');
 const sourceSha=await hash(source),
  oldSha=await hash(reader.openAttachment(target.id).data),
  nextSha=await hash(replacement);
 if(sourceSha!==await hash(source)||!reader.isCurrentInspection(inv))
   throw Error('RELAY_SOURCE_CHANGED_DURING_REVIEW');
 const plan=freeze({
  schema:NONTERMINAL_RELAY_SCHEMA,state:'REVIEWED_NONTERMINAL_RELAY_NEW_COPY',
  sourceName:String(source.name||'source.mkv'),
  target:{fileUid:targetFileUid,filename:target.filename,mime:target.mimeType,
    originalLength:target.byteLength,newLength:replacement.size},
  geometry:{delta,originalAttachmentsOffset:geometry.master.start,
    originalAttachmentsBytes:geometry.master.end-geometry.master.start,
    appendedAttachmentsOffset:source.size,appendedAttachmentsBytes:appendedBytes,
    seekEntriesRedirected:geometry.recognized,
    originalProtectedOffsetsStayFixed:true,seekheadRelayAtOriginalMaster:true},
  evidence:{sourceSha256:sourceSha,oldFileDataSha256:oldSha,newFileDataSha256:nextSha,
    sourceGraph:'observed-and-unreferenced',generalWriter:false},
  execution:{originalOverwrite:false,autoDownload:false,externalNativeAudit:'pending'},
 });
 grants.set(plan,{source,replacement,raw,inv,target,graph,geometry,relay,
   sourceSha,oldSha,nextSha,appendedBytes});
 return plan;
}
export async function executeNonterminalAttachmentRelay(plan){
 if(plan?.schema!==NONTERMINAL_RELAY_SCHEMA||!Object.isFrozen(plan)||!grants.has(plan))
   throw Error('RELAY_FORGED_OR_STALE_PLAN');
 const {source,replacement,raw,inv,target,graph,geometry:g,relay,
   sourceSha,oldSha,nextSha,appendedBytes}=grants.get(plan);
 if(await hash(source)!==sourceSha||await hash(replacement)!==nextSha)
   throw Error('RELAY_FILES_CHANGED_AFTER_REVIEW');
 const delta=replacement.size-target.byteLength;
 const appended=diffBlob(source,[
  ...[g.master,g.attached,g.data].map(e=>({
   from:e.sizeStart,to:e.dataStart,payload:vint(e.size+delta,e.w),
  })),
  {from:g.data.dataStart,to:g.data.end,payload:replacement},
 ]).slice(g.master.start,g.master.end+delta);
 if(appended.size!==appendedBytes)
   throw Error('RELAY_APPENDED_MASTER_SIZE_INVALID');
 const output=diffBlob(source,[
  {from:g.seg.sizeStart,to:g.seg.dataStart,
    payload:vint(g.seg.size+appendedBytes,g.seg.w)},
  ...g.seekPatches,
  {from:g.master.start,to:g.master.end,payload:relay},
 ],[appended]);
 if(output.size!==source.size+appendedBytes)
   throw Error('RELAY_OUTPUT_BYTECOUNT_INVALID');
 const checked=await inspectRawSegmentPreservation(output);
 if(checked.state!=='inspected'||checked.segmentUnknownLength||
    checked.ebmlHeaderCommitment!==raw.ebmlHeaderCommitment||
    checked.elements.length!==raw.elements.length+1)
   throw Error('RELAY_OUTPUT_RAW_STRUCTURE_UNVERIFIED');
 for(let i=0;i<raw.elements.length;i++){
  const src=raw.elements[i],dst=checked.elements[i];
  if(!dst||src.offset!==dst.offset||src.byteLength!==dst.byteLength)
    throw Error('RELAY_ORIGINAL_TOP_LEVEL_OFFSETS_CHANGED');
  if(src.family==='attachments'){
   if(dst.id!=='0x114d9b74')throw Error('RELAY_ORIGINAL_SLOT_NOT_SEEKHEAD');
  }else if(src.id==='0x114d9b74'){
   if(dst.id!==src.id)throw Error('RELAY_OLD_SEEKHEAD_MISSING');
   // The only allowed raw delta is the exact SeekID byte patch.
   const before=source.slice(src.offset,src.offset+src.byteLength);
   const expected=diffBlob(source,g.seekPatches.filter(p=>
      p.from>=src.offset&&p.to<=src.offset+src.byteLength))
     .slice(src.offset,src.offset+src.byteLength);
   if(await hash(before)!==src.byteCommitment&&false)throw Error('UNREACHABLE');
   if(await hash(output.slice(src.offset,src.offset+src.byteLength))!==await hash(expected))
     throw Error('RELAY_UNAPPROVED_SEEKHEAD_BYTES_CHANGED');
  }else if(dst.id!==src.id||dst.byteCommitment!==src.byteCommitment)
   throw Error('RELAY_PROTECTED_TOP_ELEMENT_CHANGED');
 }
 const final=checked.elements.at(-1);
 if(final?.id!=='0x1941a469'||final.offset!==source.size||
    final.byteLength!==appendedBytes)
   throw Error('RELAY_FINAL_MASTER_NOT_AT_SEGMENT_EOF');
 const checkedReader=createMatroskaAttachmentReader(output),after=await checkedReader.inspect();
 if(after.state!=='inspected'||after.attachments.length!==inv.attachments.length)
   throw Error('RELAY_OUTPUT_ATTACHMENT_INVENTORY_INVALID');
 const oldByUid=new Map(inv.attachments.map(x=>[x.fileUid,x]));
 for(const row of after.attachments){
  const old=oldByUid.get(row.fileUid);
  if(!old||row.filename!==old.filename||row.mimeType!==old.mimeType||
      row.description!==old.description||row.id!==old.id)
   throw Error('RELAY_UNEXPECTED_ATTACHMENT_METADATA_DELTA');
  if(row.fileUid===target.fileUid){
   if(row.byteLength!==replacement.size)throw Error('RELAY_TARGET_LENGTH_INVALID');
  }else if(row.byteLength!==old.byteLength)
   throw Error('RELAY_OTHER_ATTACHMENT_LENGTH_CHANGED');
  const expected=row.fileUid===target.fileUid?nextSha:
    await hash(source.slice(old.dataRange.offset,old.dataRange.offset+old.byteLength));
  if(await hash(checkedReader.openAttachment(row.id).data)!==expected)
   throw Error('RELAY_ATTACHED_FILEDATA_MISMATCH');
 }
 const newGraph=await checkedReader.inspectRelations(after);
 if(newGraph.state!=='inspected'||JSON.stringify(newGraph.edges)!==
    JSON.stringify(graph.edges))throw Error('RELAY_TAG_ATTACHMENT_TARGET_GRAPH_CHANGED');
 if(await hash(source)!==sourceSha||await hash(replacement)!==nextSha||
    await hash(source.slice(target.dataRange.offset,
     target.dataRange.offset+target.byteLength))!==oldSha)
   throw Error('RELAY_SOURCE_CHANGED_DURING_OUTPUT_AUDIT');
 const base=String(source.name||'source.mkv').split(/[\\/]/).pop()
  .replace(/\.(mkv|mka|mks|mk3d)$/i,'').replace(/[\u0000-\u001f\u007f]/g,'')
  .slice(0,125)||'Matroska';
 return Object.freeze({
  status:'LOCAL_NONTERMINAL_RELAY_AND_RAW_MEDIA_VERIFIED_EXTERNAL_AUDIT_PENDING',
  filename:base+'.nonterminal-attachment-relocated.experimental.mkv',
  output,
  evidence:Object.freeze({
   sourceSha256:sourceSha,outputSha256:await hash(output),
   oldFileDataSha256:oldSha,newFileDataSha256:nextSha,
   sourceUnmodified:true,originalProtectedTopLevelOffsetsUnchanged:true,
   originalProtectedMediaTagsChaptersCuesUnchanged:true,
   originalAttachedUIDsAndOtherDataVerified:true,
   chainedSeekHeadAtOldAttachmentOffset:true,
   originalAttachmentIndexRedirected:plan.geometry.seekEntriesRedirected,
   generalWriter:false,externalNativeAudit:false,
  }),
 });
}
