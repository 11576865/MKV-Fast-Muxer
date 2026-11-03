/**
 * RESEARCH ONLY: original Matroska Attachments byte-lane reinsertion into an
 * independent no-attachments FFmpeg output. No product UI, permission or
 * approved general EBML writer. Never mutate either source.
 *
 * This deliberately accepts only a small, FFmpeg-like output structure with
 * an initial indexed CRC-protected SeekHead and a directly adjacent Void
 * reservation. Large-file, Tags/UID graph and Cues/player conformance gates
 * are NOT qualified by this fixture research.
 */
import { crc32IEEE, ebmlCrc32LE } from '../src/ebml-crc32-bounded.js';

export const S12_REATTACH_RESEARCH_SCHEMA='s12-raw-attachments-seekhead-research-v0';
const I=Object.freeze({
 ebml:0x1a45dfa3, docType:0x4282, segment:0x18538067,
 seekHead:0x114d9b74, seek:0x4dbb, seekId:0x53ab,
 seekPos:0x53ac, void:0xec, crc:0xbf, attachments:0x1941a469,
 tags:0x1254c367,chapters:0x1043a770
});
// Research budget only: this is a Blob-backed range parser, never an
// authorization to persist arbitrary ≥256MiB source Matroska.
const MAX_BYTES=1280*1024*1024,MAX_ELEMENTS=5000,MAX_SEEK_BYTES=65536;
const reject=reason=>{throw Error('S12_REATTACH_'+reason)};
const idBytes=id=>{
 const w=id>0xffffff?4:id>0xffff?3:id>0xff?2:1;
 const b=new Uint8Array(w);
 for(let k=w-1,v=id;k>=0;k--){b[k]=v&255;v>>>=8;}
 return b;
};
const joined=(...values)=>Uint8Array.from(values.flatMap(x=>Array.from(x)));
function vint(n,width=null){
 let v=BigInt(n);if(v<0n)reject('NEGATIVE_SIZE');
 if(width==null)for(width=1;width<=8&&v>=(1n<<BigInt(7*width))-1n;width++){}
 if(!Number.isInteger(width)||width<1||width>8||
    v>=(1n<<BigInt(7*width))-1n)reject('VINT_CAPACITY');
 v|=1n<<BigInt(7*width);
 const b=new Uint8Array(width);
 for(let k=width-1;k>=0;k--){b[k]=Number(v&255n);v>>=8n;}
 return b;
}
const unsigned=n=>{
 let value=BigInt(n);if(value<0n)reject('NEGATIVE_POSITION');
 const b=[];do{b.unshift(Number(value&255n));value>>=8n;}while(value>0n);
 return Uint8Array.from(b);
};
const element=(id,data)=>joined(idBytes(id),vint(data.length),data);
async function header(blob,offset,limit){
 if(offset<0||offset>=limit||limit>blob.size)reject('HEADER_RANGE');
 const bytes=new Uint8Array(await blob.slice(offset,Math.min(offset+12,limit)).arrayBuffer());
 if(!bytes[0])reject('INVALID_ID');
 let idWidth=1;
 while(idWidth<=4&&!(bytes[0]&(0x80>>(idWidth-1))))idWidth++;
 if(idWidth>4||idWidth>=bytes.length)reject('ID_WIDTH');
 let id=0;for(let j=0;j<idWidth;j++)id=id*256+bytes[j];
 let sizeWidth=1;
 while(sizeWidth<=8&&!(bytes[idWidth]&(0x80>>(sizeWidth-1))))sizeWidth++;
 if(sizeWidth>8||idWidth+sizeWidth>bytes.length)reject('SIZE_WIDTH');
 let length=BigInt(bytes[idWidth]&((1<<(8-sizeWidth))-1));
 for(let j=1;j<sizeWidth;j++)length=(length<<8n)|BigInt(bytes[idWidth+j]);
 if(length===(1n<<BigInt(7*sizeWidth))-1n||
    length>BigInt(Number.MAX_SAFE_INTEGER))reject('UNKNOWN_OR_UNADDRESSABLE_SIZE');
 const dataStart=offset+idWidth+sizeWidth,end=dataStart+Number(length);
 if(end>limit||!Number.isSafeInteger(end))reject('ELEMENT_OVERRUN');
 return {id,offset,sizeStart:offset+idWidth,sizeWidth,dataStart,end,size:Number(length)};
}
async function children(blob,from,to,budget=MAX_ELEMENTS){
 const result=[];
 for(let at=from;at<to;){
  if(result.length>=budget)reject('HEADER_BUDGET');
  const el=await header(blob,at,to);result.push(el);at=el.end;
 }
 return result;
}
async function segment(blob){
 if(!blob?.slice||!Number.isSafeInteger(blob.size)||blob.size<16||
    blob.size>MAX_BYTES)reject('RESEARCH_SOURCE_OVER_1280MIB');
 const ebml=await header(blob,0,blob.size);
 if(ebml.id!==I.ebml||ebml.end>65536)reject('EBML_HEADER');
 const ebmlChildren=await children(blob,ebml.dataStart,ebml.end,100);
 const doc=ebmlChildren.filter(x=>x.id===I.docType);
 if(doc.length!==1||doc[0].end-doc[0].dataStart>24)reject('DOCTYPE');
 const docType=await blob.slice(doc[0].dataStart,doc[0].end).text();
 if(docType!=='matroska')reject('NOT_MATROSKA');
 const seg=await header(blob,ebml.end,blob.size);
 if(seg.id!==I.segment||seg.end!==blob.size)
  reject('FINITE_EXACT_SINGLE_SEGMENT_REQUIRED');
 const nodes=await children(blob,seg.dataStart,seg.end);
 if(nodes.some(x=>x.id===I.crc))reject('SEGMENT_CRC_UNSUPPORTED');
 return {seg,nodes};
}
/**
 * RESEARCH-ONLY bounded source index audit.
 *
 * A same-span Void input intentionally invalidates the ORIGINAL source
 * Attachments SeekHead target. Before constructing that transient view we
 * must independently prove that the untouched File's existing index points
 * to its real on-disk master, and any source SeekHead CRC is valid.
 *
 * This checks top-level index pointers only; it does NOT validate Cues
 * references, ChapterUID, TagAttachmentUID, or any general EBML graph.
 */
async function validateResearchOriginalSeekHead(original,parsed){
 const {seg,nodes}=parsed;
 const heads=nodes.filter(x=>x.id===I.seekHead);
 if(heads.length!==1)reject('SOURCE_SEEKHEAD_UNIQUE_REQUIRED');
 const byOffset=new Map(nodes.map(x=>[x.offset,x]));
 let checked=0,attachmentRefs=0,crcChecked=0;
 let attachmentSeekPositionByteOffset=null;
 for(const head of heads){
  if(head.size>MAX_SEEK_BYTES)reject('SOURCE_SEEKHEAD_BUDGET');
  const entries=await children(original,head.dataStart,head.end,96);
  let crc=entries.find(x=>x.id===I.crc);
  if(crc){
   if(entries[0]!==crc||entries.filter(x=>x.id===I.crc).length!==1||
       crc.end-crc.dataStart!==4)
    reject('SOURCE_SEEKHEAD_CRC_LAYOUT');
   const rest=new Uint8Array(await original.slice(crc.end,head.end).arrayBuffer());
   const stored=new Uint8Array(await original.slice(crc.dataStart,crc.end).arrayBuffer());
   const expected=ebmlCrc32LE(crc32IEEE(rest));
   if(stored.some((v,i)=>v!==expected[i]))reject('SOURCE_SEEKHEAD_CRC_INVALID');
   crcChecked++;
  }
  for(const entry of entries){
   if(entry.id===I.crc)continue;
   if(entry.id!==I.seek)reject('SOURCE_SEEKHEAD_UNEXPECTED_CHILD');
   const fields=await children(original,entry.dataStart,entry.end,6);
   const ids=fields.filter(x=>x.id===I.seekId);
   const positions=fields.filter(x=>x.id===I.seekPos);
   if(fields.length!==2||ids.length!==1||positions.length!==1||
       ids[0].size<1||ids[0].size>4||
       positions[0].size<1||positions[0].size>8)
    reject('SOURCE_SEEKHEAD_ENTRY_LAYOUT');
   const rawId=new Uint8Array(await original.slice(ids[0].dataStart,ids[0].end).arrayBuffer());
   let targetId=0;
   for(const byte of rawId)targetId=targetId*256+byte;
   const rawPosition=new Uint8Array(await original.slice(
      positions[0].dataStart,positions[0].end).arrayBuffer());
   let relative=0n;
   for(const byte of rawPosition)relative=(relative<<8n)+BigInt(byte);
   if(relative>BigInt(Number.MAX_SAFE_INTEGER))
    reject('SOURCE_SEEKHEAD_POSITION_OVERFLOW');
   const absolute=seg.dataStart+Number(relative);
   const target=byOffset.get(absolute);
   if(!target||target.id!==targetId)
    reject('SOURCE_SEEKHEAD_TARGET_MISMATCH');
   checked++;
   if(targetId===I.attachments){
    attachmentRefs++;
    attachmentSeekPositionByteOffset=positions[0].end-1;
   }
  }
 }
 if(attachmentRefs!==1)reject('SOURCE_ATTACHMENTS_SEEK_INDEX_REQUIRED');
 return Object.freeze({
  seekHeadCount:heads.length,checkedEntries:checked,
  attachmentReferences:attachmentRefs,crcValidated:crcChecked,
  // Diagnostic locator only for native negative tests: never output write
  // authorization or a dynamic browser patch/override capability.
  attachmentSeekPositionByteOffset,
  authority:'RESEARCH_ONLY'
 });
}

export async function inspectResearchOriginalSeekHead(original){
 const parsed=await segment(original);
 const attachments=parsed.nodes.filter(x=>x.id===I.attachments);
 if(attachments.length!==1)reject('EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED');
 return validateResearchOriginalSeekHead(original,parsed);
}

/**
 * Preflight an actual original File BEFORE loading FFmpeg.wasm. This is only
 * the narrow source-layout guard for the research route: one Attachments
 * master, no source Tags/Chapters, finite exact Segment and no Segment CRC.
 * Full remuxed output validation is independently repeated later.
 */
export async function preflightResearchOriginalAttachments(original){
 const source=await segment(original);
 const attachments=source.nodes.filter(x=>x.id===I.attachments);
 if(attachments.length!==1)
  reject('EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED');
 if(source.nodes.some(x=>x.id===I.tags||x.id===I.chapters))
  reject('SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE');
 const seekIndex=await validateResearchOriginalSeekHead(original,source);
 return Object.freeze({
  sourceBytes:original.size,
  seekIndex:Object.freeze({entries:seekIndex.checkedEntries,
    attachmentReferences:seekIndex.attachmentReferences,
    crcValidated:seekIndex.crcValidated}),
  attachmentMasterBytes:attachments[0].end-attachments[0].offset,
  sourceSegmentFinite:true,
  authorization:'NONE_RESEARCH_ONLY'
 });
}


/**
 * RESEARCH-ONLY temporary FFmpeg input view, NEVER an archival output.
 *
 * Swap exactly one original Attachments master for an equally long EBML
 * Void using a nine-byte header and original bytes as the ignored Void
 * payload. Segment size and every other offset stay unchanged. This
 * prevents the Wasm demuxer from creating original attached-file streams,
 * while the real original File remains available for later exact reinsert.
 *
 * The temporary input can retain a source SeekHead entry that points to
 * what is now a Void rather than an Attachments element. That alone is
 * why this cannot be reused as a general MKV output/preservation API.
 * Only genuine A/V stream parity tests may accept the experiment.
 */
export async function prepareResearchMediaOnlyShadow(original){
 const source=await segment(original);
 const masters=source.nodes.filter(x=>x.id===I.attachments);
 if(masters.length!==1)
  reject('EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED');
 if(source.nodes.some(x=>x.id===I.tags||x.id===I.chapters))
  reject('SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE');
 // Temporary Void deliberately leaves this index stale. Verify the
 // original's real index FIRST, then only the transient media view may
 // carry the stale pointer; never dispatch that shadow as a final file.
 await validateResearchOriginalSeekHead(original,source);
 const master=masters[0];
 const total=master.end-master.offset;
 // 1-byte EBML Void ID + 8-byte VINT size. A same-size substitution
 // requires no Seeker/Cluster/Cues position shifts and no whole FileData
 // materialization. All other source bytes are Blob views.
 if(total<=9)reject('SHADOW_ATTACHMENTS_TOO_SHORT');
 const emptyHeader=joined(Uint8Array.of(I.void),vint(total-9,8));
 if(emptyHeader.length!==9)reject('SHADOW_VINT_LAYOUT');
 const file=new File([
  original.slice(0,master.offset),
  emptyHeader,
  original.slice(master.offset+emptyHeader.length,master.end),
  original.slice(master.end)
 ],'s12-research-media-input.mkv',{
  type:'video/x-matroska',
  lastModified:original.lastModified||0
 });
 if(file.size!==original.size)reject('SHADOW_CHANGES_BYTE_LENGTH');
 return Object.freeze({
  file,
  evidence:Object.freeze({
   schema:'s12-temporary-attachments-void-shadow-v0',
   originalBytes:original.size,shadowBytes:file.size,
   attachmentsRange:Object.freeze({offset:master.offset,length:total}),
   unchangedElementOffsets:true,
   noOriginalLargeFileDataArrayBuffer:true,
   sourceReadMode:'browser Blob.slice + nine-byte Void header',
   seekHeadOriginalAttachmentsIndexMayBeStale:true,
   archivalValidity:'UNVERIFIED_TEMPORARY_FFMPEG_INPUT_ONLY',
   authorization:'NONE_RESEARCH_ONLY'
  })
 });
}

function voidSameLength(total){
 for(let width=1;width<=8;width++){
  const len=total-1-width;
  if(len>=0&&BigInt(len)<(1n<<BigInt(7*width))-1n){
   if(len>MAX_SEEK_BYTES)reject('VOID_ALLOCATION_BUDGET');
   return joined(Uint8Array.of(I.void),vint(len,width),new Uint8Array(len));
  }
 }
 reject('VOID_REMAINDER_UNENCODABLE');
}

/**
 * Returns a new Blob with source original Attachments bytes used by view.
 * Only header/SeekHead/CRC bytes are ever loaded into JS memory.
 *
 * IMPORTANT: the output's metadata is NOT claimed equivalent to the source
 * (source chapters, tags, UID targets or Cues may be absent in remuxed).
 * This never confers production write authorization.
 */
export async function prepareResearchSeekHeadReattachment({original,remuxed}={}){
 const a=await segment(original),b=await segment(remuxed);
 const originals=a.nodes.filter(x=>x.id===I.attachments);
 if(originals.length!==1||b.nodes.some(x=>x.id===I.attachments))
  reject('EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED');
 // Once the source/output attachment shape is established, reject actual
 // source tag and chapter graph metadata. This is a validation-order-only
 // change: both kinds of unsafe input still reject before any Blob output.
 if(a.nodes.some(x=>x.id===I.tags||x.id===I.chapters))
  reject('SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE');
 await validateResearchOriginalSeekHead(original,a);
 const [seek,voidItem]=b.nodes;
 if(seek?.id!==I.seekHead||voidItem?.id!==I.void||
    seek.end!==voidItem.offset||voidItem.end-seek.offset>MAX_SEEK_BYTES)
  reject('SEEKHEAD_PLUS_ADJACENT_VOID_REQUIRED');
 const sub=await children(remuxed,seek.dataStart,seek.end,66);
 const crc=sub[0];
 if(crc?.id!==I.crc||crc.offset!==seek.dataStart||
    crc.end-crc.dataStart!==4||sub.slice(1).some(x=>x.id!==I.seek))
  reject('INDEX_CRC_OR_ENTRY_LAYOUT');
 const originalSeekBody=new Uint8Array(
   await remuxed.slice(crc.end,seek.end).arrayBuffer());
 const writtenCrc=new Uint8Array(
   await remuxed.slice(crc.dataStart,crc.end).arrayBuffer());
 const expectedCrc=ebmlCrc32LE(crc32IEEE(originalSeekBody));
 if(writtenCrc.some((x,j)=>x!==expectedCrc[j]))reject('SEEKHEAD_CRC_INVALID');
 for(const entry of sub.slice(1)){
  const fields=await children(remuxed,entry.dataStart,entry.end,4);
  const seekIds=fields.filter(x=>x.id===I.seekId);
  if(seekIds.length!==1||seekIds[0].end-seekIds[0].dataStart!==4)
   reject('SOURCE_SEEKID_LAYOUT');
  const seekId=new Uint8Array(
    await remuxed.slice(seekIds[0].dataStart,seekIds[0].end).arrayBuffer());
  if(seekId.every((byte,j)=>byte===idBytes(I.attachments)[j]))
   reject('REMUXED_ALREADY_INDEXES_ATTACHMENTS');
 }
 const relativeEOF=remuxed.size-b.seg.dataStart;
 const newIndex=element(I.seek,joined(
   element(I.seekId,idBytes(I.attachments)),
   element(I.seekPos,unsigned(relativeEOF))));
 const newBody=joined(originalSeekBody,newIndex);
 const patchedSeek=element(I.seekHead,joined(
   Uint8Array.of(I.crc,0x84),ebmlCrc32LE(crc32IEEE(newBody)),newBody));
 const reserved=voidItem.end-seek.offset;
 if(reserved-patchedSeek.length<2)reject('INDEX_RESERVED_VOID_EXHAUSTED');
 const replacement=joined(patchedSeek,voidSameLength(reserved-patchedSeek.length));
 if(replacement.length!==reserved)reject('INDEX_OFFSET_CHANGED');
 const raw=originals[0],rawLen=raw.end-raw.offset;
 const newSegLength=vint(b.seg.size+rawLen,b.seg.sizeWidth);
 const candidate=new Blob([
   remuxed.slice(0,b.seg.sizeStart),newSegLength,
   remuxed.slice(b.seg.dataStart,seek.offset),replacement,
   remuxed.slice(voidItem.end),original.slice(raw.offset,raw.end)
 ],{type:'video/x-matroska'});
 if(candidate.size!==remuxed.size+rawLen)reject('OUTPUT_BYTE_LENGTH_DRIFT');
 return Object.freeze({
   schema:S12_REATTACH_RESEARCH_SCHEMA,blob:candidate,
   evidence:Object.freeze({
    inputBytes:original.size,remuxedBytes:remuxed.size,
    rawAttachmentsElementBytes:rawLen,outputBytes:candidate.size,
    sourceRange:Object.freeze({offset:raw.offset,length:rawLen}),
    seekHeadRewritten:true,seekHeadCRC32Recomputed:true,
    sourceFileReadScope:'EBML headers and SeekHead only; raw FileData is Blob.slice',
    authorization:'NONE_RESEARCH_ONLY'
   })
 });
}
