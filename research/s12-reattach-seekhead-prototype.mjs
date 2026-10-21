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
const MAX_BYTES=340*1024*1024,MAX_ELEMENTS=5000,MAX_SEEK_BYTES=65536;
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
    blob.size>MAX_BYTES)reject('RESEARCH_SOURCE_OVER_340MIB');
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
 // A remuxed output is not source metadata-identical: refuse original
 // ChapterUID / TagAttachmentUID relationships entirely in this research
 // class. No silent graph downgrade or universal preservation claim.
 if(a.nodes.some(x=>x.id===I.tags||x.id===I.chapters))
  reject('SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE');
 const originals=a.nodes.filter(x=>x.id===I.attachments);
 if(originals.length!==1||b.nodes.some(x=>x.id===I.attachments))
  reject('EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED');
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
