/**
 * P2 / bounded real Chapters/Tags writer.
 *
 * Changes exactly one UTF-8 TagString or ChapString of IDENTICAL encoded byte
 * length. Every EBML header, UID, Cluster/Cues/SeekHead position and every
 * other original byte is preserved. No FFmpeg remux, implicit resize, chapter
 * structure edit, unknown master rewrite or source overwrite is available.
 */
import { inspectRawSegmentPreservation } from './matroska-raw-preservation-contract.js';
export const INLINE_MATROSKA_TEXT_SCHEMA='matroska-inline-chapter-tag-text-v1';
const GRANTS=new WeakMap();
const MAX_SOURCE=60*1024*1024,MAX_HEADERS=20000,MAX_TEXT=512;
const ID={EBML:0x1a45dfa3,SEGMENT:0x18538067,CRC:0xbf,
 CHAPTERS:0x1043a770,EDITION:0x45b9,CHAPTER:0xb6,DISPLAY:0x80,CHAP_STRING:0x85,
 TAGS:0x1254c367,TAG:0x7373,SIMPLE_TAG:0x67c8,TAG_STRING:0x4487};
const childrenFor=new Map([
 [ID.CHAPTERS,new Set([ID.EDITION])],
 [ID.EDITION,new Set([ID.CHAPTER])],
 [ID.CHAPTER,new Set([ID.CHAPTER,ID.DISPLAY])],
 [ID.DISPLAY,new Set([ID.CHAP_STRING])],
 [ID.TAGS,new Set([ID.TAG])],
 [ID.TAG,new Set([ID.SIMPLE_TAG])],
 [ID.SIMPLE_TAG,new Set([ID.SIMPLE_TAG,ID.TAG_STRING])],
]);
const textEncoder=new TextEncoder();
const textDecoder=new TextDecoder('utf-8',{fatal:true});
const bytes=async(file,a,b)=>new Uint8Array(await file.slice(a,b).arrayBuffer());
function reject(code){throw Error('MATROSKA_TEXT_'+code)}
function header(data,at,limit,budget){
 if(++budget.count>MAX_HEADERS)reject('HEADER_BUDGET');
 if(at>=limit)reject('ELEMENT_TRUNCATED');
 const x=data.subarray(at,Math.min(limit,at+12));
 if(!x[0])reject('INVALID_ID');
 let idWidth=1;
 while(idWidth<=4&&!(x[0]&(0x80>>(idWidth-1))))idWidth++;
 if(idWidth>4||idWidth>=x.length)reject('ID_TRUNCATED');
 let id=0;
 for(let i=0;i<idWidth;i++)id=id*256+x[i];
 let sizeWidth=1,first=x[idWidth];
 if(!first)reject('INVALID_SIZE');
 while(sizeWidth<=8&&!(first&(0x80>>(sizeWidth-1))))sizeWidth++;
 if(sizeWidth>8||idWidth+sizeWidth>x.length)reject('SIZE_TRUNCATED');
 let n=BigInt(first&((1<<(8-sizeWidth))-1));
 for(let i=1;i<sizeWidth;i++)n=(n<<8n)|BigInt(x[idWidth+i]);
 if(n===(1n<<BigInt(sizeWidth*7))-1n)reject('UNKNOWN_SIZE');
 if(n>BigInt(Number.MAX_SAFE_INTEGER))reject('UNADDRESSABLE_SIZE');
 const dataStart=at+idWidth+sizeWidth,end=dataStart+Number(n);
 if(!Number.isSafeInteger(end)||end>limit)reject('ELEMENT_OUT_OF_BOUNDS');
 return {id,start:at,dataStart,end};
}
function children(data,parent,budget){
 const out=[];
 for(let at=parent.dataStart;at<parent.end;){
  const item=header(data,at,parent.end,budget);
  out.push(item);at=item.end;
 }
 return out;
}
const hash=async blob=>{
 const api=globalThis.crypto?.subtle;
 if(!api)reject('WEBCRYPTO_REQUIRED');
 const h=await api.digest('SHA-256',await blob.arrayBuffer());
 return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,'0')).join('');
};
async function inventory(source){
 if(!source?.slice||!Number.isSafeInteger(source.size)||
    source.size<1||source.size>MAX_SOURCE)reject('SOURCE_BUDGET');
 const raw=await inspectRawSegmentPreservation(source);
 if(raw.state!=='inspected'||raw.segmentUnknownLength||
    raw.coverage.unknownTopElementIds.length)reject('RAW_SOURCE_UNVERIFIED');
 const all=await bytes(source,0,source.size),budget={count:0};
 const ebml=header(all,0,all.length,budget);
 if(ebml.id!==ID.EBML)reject('EBML_HEADER_INVALID');
 const seg=header(all,ebml.end,all.length,budget);
 if(seg.id!==ID.SEGMENT||seg.end!==all.length)reject('FINITE_SEGMENT_REQUIRED');
 const root=children(all,seg,budget);
 if(root.length!==raw.elements.length||root.some((x,i)=>
   x.start!==raw.elements[i].offset||
   x.end-x.start!==raw.elements[i].byteLength))reject('RAW_GEOMETRY_DRIFT');
 if(root.some(x=>x.id===ID.CRC))reject('SEGMENT_CRC_UNSUPPORTED');
 const fields=[];
 function descend(parent,top,idPath,crcAncestor=false){
  const allowed=childrenFor.get(parent.id);
  if(!allowed)return;
  const parts=children(all,parent,budget);
  // CRC anywhere in the actual edit hierarchy invalidates this whole family.
  if(parts.some(x=>x.id===ID.CRC))reject('METADATA_ANCESTOR_CRC_UNSUPPORTED');
  for(const item of parts){
   if(!allowed.has(item.id))continue;
   if(item.id===ID.TAG_STRING||item.id===ID.CHAP_STRING){
    const size=item.end-item.dataStart;
    if(size>MAX_TEXT)continue;
    let value;
    try{value=textDecoder.decode(all.subarray(item.dataStart,item.end))}
    catch{reject('INVALID_UTF8_SOURCE')}
    const kind=item.id===ID.TAG_STRING?'tag':'chapter';
    fields.push(Object.freeze({
     id:kind+':'+item.dataStart,kind,text:value,
     byteLength:size,dataOffset:item.dataStart,
     topOffset:top.start,topId:'0x'+top.id.toString(16),
     parentPath:idPath.concat(item.id).map(id=>'0x'+id.toString(16)),
    }));
   }else descend(item,top,idPath.concat(item.id),crcAncestor);
  }
 }
 for(const top of root){
  if(top.id===ID.CHAPTERS||top.id===ID.TAGS)
   descend(top,top,[top.id]);
 }
 return {fields,raw};
}
export async function inspectEditableMatroskaMetadataText(source){
 const {fields}=await inventory(source);
 return Object.freeze({
  schema:'matroska-editable-text-inspection-v1',
  state:'inspected',fields:Object.freeze(fields),
  kindCounts:Object.freeze({
   chapter:fields.filter(f=>f.kind==='chapter').length,
   tag:fields.filter(f=>f.kind==='tag').length,
  }),
  writerAuthorization:false,
 });
}
export async function prepareMatroskaTextReplacement({
 source,targetId,newText,expectedOldText,confirmSameSize=false,
}={}){
 if(!confirmSameSize)reject('EXPLICIT_REVIEW_REQUIRED');
 if(typeof newText!=='string'||newText.length>MAX_TEXT||
    /[\u0000-\u001f\u007f]/.test(newText))reject('TEXT_INVALID');
 const encoded=textEncoder.encode(newText);
 if(encoded.length<1||encoded.length>MAX_TEXT)reject('TEXT_BUDGET');
 const found=await inventory(source);
 const eligible=found.fields.filter(f=>f.id===targetId);
 if(eligible.length!==1)reject('TARGET_NOT_UNIQUE_OR_ELIGIBLE');
 const target=eligible[0];
 if(target.text!==expectedOldText)reject('STALE_OLD_TEXT');
 if(target.byteLength!==encoded.length)reject('BYTE_LENGTH_MISMATCH');
 if(target.text===newText)reject('NO_CHANGE');
 const sourceSha256=await hash(source);
 if(sourceSha256!==await hash(source))reject('SOURCE_CHANGED_DURING_REVIEW');
 const plan=Object.freeze({
  schema:INLINE_MATROSKA_TEXT_SCHEMA,
  state:'REVIEWED_SAME_BYTE_TEXT_EDIT',
  targetId,kind:target.kind,oldText:target.text,newText,
  byteLength:encoded.length,topId:target.topId,
  sourceSha256,writerScope:'same-length-text-only',
  sourceOverwrite:false,externalNativeAudit:'pending',
 });
 GRANTS.set(plan,{source,encoded,target,sourceSha256,original:found});
 return plan;
}
export async function executeMatroskaTextReplacement(plan){
 if(plan?.schema!==INLINE_MATROSKA_TEXT_SCHEMA||
    !Object.isFrozen(plan)||!GRANTS.has(plan))reject('FORGED_OR_USED_PLAN');
 const grant=GRANTS.get(plan);GRANTS.delete(plan);
 const {source,encoded,target,sourceSha256,original}=grant;
 if(await hash(source)!==sourceSha256)reject('SOURCE_CHANGED_BEFORE_EXECUTION');
 const out=new Blob([source.slice(0,target.dataOffset),encoded,
  source.slice(target.dataOffset+target.byteLength)],{type:'video/x-matroska'});
 if(out.size!==source.size)reject('OUTPUT_LENGTH_CHANGED');
 const revised=await inventory(out);
 if(revised.fields.length!==original.fields.length)reject('TEXT_FIELD_COUNT_CHANGED');
 for(let i=0;i<original.fields.length;i++){
  const old=original.fields[i],now=revised.fields[i];
  if(old.id!==now.id||old.byteLength!==now.byteLength||
     old.topOffset!==now.topOffset||old.topId!==now.topId||
     JSON.stringify(old.parentPath)!==JSON.stringify(now.parentPath)||
     now.text!==(old.id===target.id?plan.newText:old.text))
    reject('OTHER_METADATA_OR_TARGET_CHANGED');
 }
 const a=original.raw,b=revised.raw;
 if(a.ebmlHeaderCommitment!==b.ebmlHeaderCommitment||
    a.segmentHeaderCommitment!==b.segmentHeaderCommitment||
    a.elements.length!==b.elements.length)reject('OUTPUT_RAW_HEADER_DRIFT');
 for(let i=0;i<a.elements.length;i++){
  const x=a.elements[i],y=b.elements[i];
  if(x.id!==y.id||x.offset!==y.offset||x.byteLength!==y.byteLength)
    reject('OUTPUT_ELEMENT_GEOMETRY_CHANGED');
  if(x.offset!==target.topOffset&&x.byteCommitment!==y.byteCommitment)
    reject('UNRELATED_RAW_ELEMENT_CHANGED');
 }
 // The only allowed byte delta in the changed Chapters/Tags element is the
 // exact identified payload. Compare its two surrounding byte regions against
 // the ORIGINAL source, rather than trusting a self-reported parser value.
 const check=async(start,end)=>{
  const old=await bytes(source,start,end),now=await bytes(out,start,end);
  if(old.length!==now.length||old.some((v,i)=>v!==now[i]))
    reject('UNAPPROVED_BYTES_CHANGED');
 };
 await check(0,target.dataOffset);
 await check(target.dataOffset+target.byteLength,source.size);
 if(await hash(source)!==sourceSha256)reject('SOURCE_CHANGED_DURING_OUTPUT_AUDIT');
 return Object.freeze({
  status:'LOCAL_SAME_BYTE_METADATA_EDIT_NATIVE_AUDIT_PENDING',
  output:out,
  filename:String(source.name||'source.mkv')
   .replace(/\.(mkv|mka|mks|mk3d)$/i,'').slice(0,100)+
   '.chapter-tag-text.experimental.mkv',
  evidence:Object.freeze({
   sourceSha256,outputSha256:await hash(out),
   kind:target.kind,targetId:target.id,
   sourceByteLength:source.size,
   changedBytesOnlyInsideSelectedString:true,
   chapterTagStructureAndUidUnchanged:true,
   clusterSeekHeadCuesAndOtherRawBytesUnchanged:true,
   sourceOverwrite:false,nativeExternalOraclePassed:false,
   generalizedMatroskaWriter:false,
  }),
 });
}
