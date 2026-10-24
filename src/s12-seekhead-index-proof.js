/**
 * Matroska SeekHead location/index evidence, READ-ONLY.
 * Verify that every declared SeekID/SeekPosition points to the exact
 * top-level element header at (Segment data start + SeekPosition).
 * Validate two-SeekHead rules and coverage without ever reading a Cluster,
 * Attachment FileData, Cues body, or creating an output Blob.
 *
 * RFC 9559 §§5.1.1.1, 6.3. NOT a CRC, UID, packet, or writer proof.
 */
export const S12_SEEK_INDEX_SCHEMA = 's12-seekhead-index-proof-v0';
const ID=Object.freeze({
  ebml:0x1a45dfa3,doctype:0x4282,segment:0x18538067,
  seekHead:0x114d9b74,seek:0x4dbb,seekId:0x53ab,seekPosition:0x53ac,
  cluster:0x1f43b675,crc:0xbf,void:0xec,
});
const MAX_HEADERS=100000,MAX_SEEK_ENTRIES=1024,MAX_EBML_HEADER=65536;
const REFUSAL='INDEX_UNVERIFIED';
const receipt=(status,reasons=[],refs=[],topLevelCount=0)=>Object.freeze({
  schema:S12_SEEK_INDEX_SCHEMA,status,
  indexReferencesVerified:status==='INDEX_REFERENCES_VERIFIED',
  writerAuthorized:false,publicationAuthorized:false,
  reasons:Object.freeze([...new Set(reasons)]),
  references:Object.freeze(refs.map(x=>Object.freeze({...x}))),
  topLevelCount,
  scope:'SeekHead offsets and top-level EBML IDs only; CRC, Cues internals, UID graph and remux preservation NOT verified',
});
const issue=(s)=>receipt(REFUSAL,[s]);
const hex=id=>'0x'+id.toString(16).toUpperCase();
const blobLike=file=>file && Number.isSafeInteger(file.size)&&file.size>=0&&
  typeof file.slice==='function';
async function read(file,from,length){
  if(!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(length)||
      length<0||from+length>file.size)throw Error('INDEX_READ_RANGE_INVALID');
  return new Uint8Array(await file.slice(from,from+length).arrayBuffer());
}
async function element(file,at,bound,clock){
  if(++clock.n>MAX_HEADERS)throw Error('INDEX_HEADER_BUDGET');
  if(at>=bound)throw Error('INDEX_HEADER_OUT_OF_BOUNDS');
  const b=await read(file,at,Math.min(12,bound-at));
  const x=b[0];if(!x)throw Error('INDEX_ID_INVALID');
  let nw=1;while(nw<=4&&!(x&(0x80>>(nw-1))))nw++;
  if(nw>4||nw>=b.length)throw Error('INDEX_ID_WIDTH');
  let id=0;for(let i=0;i<nw;i++)id=id*256+b[i];
  const lead=b[nw];if(!lead)throw Error('INDEX_SIZE_INVALID');
  let sw=1;while(sw<=8&&!(lead&(0x80>>(sw-1))))sw++;
  if(sw>8||nw+sw>b.length)throw Error('INDEX_SIZE_TRUNCATED');
  let len=BigInt(lead&((1<<(8-sw))-1));
  for(let i=1;i<sw;i++)len=(len<<8n)+BigInt(b[nw+i]);
  const unknown=len===(1n<<BigInt(sw*7))-1n;
  if(!unknown&&len>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('INDEX_SIZE_UNADDRESSABLE');
  const dataStart=at+nw+sw;
  const end=unknown?null:dataStart+Number(len);
  if(end!==null&&(!Number.isSafeInteger(end)||end>bound))
    throw Error('INDEX_ELEMENT_OUT_OF_BOUNDS');
  return {id,offset:at,dataStart,end,unknown};
}
async function children(file,from,to,clock,onItem){
  for(let at=from;at<to;){
    const e=await element(file,at,to,clock);
    if(e.unknown)throw Error('INDEX_UNKNOWN_CHILD_LENGTH');
    await onItem(e);
    at=e.end;
  }
}
async function uint(file,e){
  const n=e.end-e.dataStart;
  if(n<1||n>8)throw Error('INDEX_POSITION_WIDTH_INVALID');
  const b=await read(file,e.dataStart,n);
  let value=0n;for(const x of b)value=(value<<8n)|BigInt(x);
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INDEX_POSITION_UNADDRESSABLE');
  return Number(value);
}
async function indexEntry(file,seek,clock){
  let id=null,pos=null;
  await children(file,seek.dataStart,seek.end,clock,async e=>{
    if(e.id===ID.seekId){
      if(id!==null||e.end-e.dataStart!==4)throw Error('INDEX_SEEKID_DUPLICATE_OR_WIDTH');
      const b=await read(file,e.dataStart,4);
      id=0;for(const x of b)id=id*256+x;
    }else if(e.id===ID.seekPosition){
      if(pos!==null)throw Error('INDEX_SEEKPOSITION_DUPLICATE');
      pos=await uint(file,e);
    }else throw Error('INDEX_UNRECOGNIZED_SEEK_CHILD:'+hex(e.id));
  });
  if(id===null||pos===null)throw Error('INDEX_SEEK_ENTRY_INCOMPLETE');
  return {id,position:pos};
}
async function seekHeadEntries(file,head,clock){
  const entries=[];
  await children(file,head.dataStart,head.end,clock,async el=>{
    if(el.id!==ID.seek)throw Error('INDEX_SEEKHEAD_CHILD_UNRECOGNIZED:'+hex(el.id));
    if(entries.length>=MAX_SEEK_ENTRIES)throw Error('INDEX_SEEK_ENTRIES_BUDGET');
    entries.push(await indexEntry(file,el,clock));
  });
  if(!entries.length)throw Error('INDEX_EMPTY_SEEKHEAD');
  return entries;
}
export async function inspectS12SeekHeadIndex(file){
  if(!blobLike(file))return issue('INDEX_FILE_UNAVAILABLE');
  const clock={n:0};
  try{
    const ebml=await element(file,0,file.size,clock);
    if(ebml.id!==ID.ebml||ebml.unknown||ebml.end>MAX_EBML_HEADER)
      return issue('INDEX_EBML_HEADER_UNVERIFIED');
    let docType='';
    await children(file,ebml.dataStart,ebml.end,clock,async e=>{
      if(e.id===ID.doctype){
        const n=e.end-e.dataStart;
        if(n<1||n>32)throw Error('INDEX_DOCTYPE_WIDTH');
        docType=new TextDecoder().decode(await read(file,e.dataStart,n));
      }
    });
    if(docType!=='matroska')return issue('INDEX_NOT_MATROSKA');
    let segment=null;
    for(let at=ebml.end;at<file.size;){
      const e=await element(file,at,file.size,clock);
      if(e.id===ID.segment){segment=e;break;}
      if(e.unknown)throw Error('INDEX_PRE_SEGMENT_UNKNOWN_SIZE');
      at=e.end;
    }
    if(!segment||segment.unknown||segment.end!==file.size)
      return issue('INDEX_SINGLE_FINITE_EXACT_SEGMENT_REQUIRED');
    const top=[];
    await children(file,segment.dataStart,segment.end,clock,async e=>{
      if(top.length>=MAX_HEADERS)throw Error('INDEX_TOP_LEVEL_BUDGET');
      top.push(e);
    });
    const seekHeads=top.filter(e=>e.id===ID.seekHead);
    if(seekHeads.length===0)return receipt('NO_SEEKHEAD',[],[],top.length);
    if(seekHeads.length>2)return issue('INDEX_SEEKHEAD_COUNT_EXCEEDS_TWO');
    const firstNonCrc=top.find(e=>e.id!==ID.crc);
    if(firstNonCrc!==seekHeads[0])return issue('INDEX_FIRST_SEEKHEAD_NOT_FIRST');
    const byOffset=new Map(top.map(e=>[e.offset,e]));
    const refs=[],errors=[];
    for(let i=0;i<seekHeads.length;i++){
      const entries=await seekHeadEntries(file,seekHeads[i],clock);
      for(const entry of entries){
        const absolute=segment.dataStart+entry.position;
        const target=byOffset.get(absolute);
        if(!Number.isSafeInteger(absolute)||!target||target.id!==entry.id)
          errors.push('INDEX_POINTER_MISMATCH:'+hex(entry.id)+':'+entry.position);
        if(i===1&&entry.id!==ID.cluster)
          errors.push('INDEX_SECOND_HEAD_NONCLUSTER_REFERENCE:'+hex(entry.id));
        refs.push({head:i,id:entry.id,relativePosition:entry.position,
          targetOffset:absolute,matched:!!target&&target.id===entry.id});
      }
    }
    if(seekHeads.length===2&&!refs.some(x=>x.head===0&&
        x.id===ID.seekHead&&x.targetOffset===seekHeads[1].offset))
      errors.push('INDEX_SECOND_HEAD_NOT_LINKED');
    const seen=new Set();
    for(const ref of refs){
      const key=ref.targetOffset;
      if(seen.has(key))errors.push('INDEX_DUPLICATE_TARGET:'+key);
      seen.add(key);
    }
    // RFC 9559 §6.3: the two indexes together itemize all non-initial
    // top-level elements. Void and CRC carry no seekable semantic payload.
    for(const el of top){
      if(el===seekHeads[0]||el.id===ID.void||el.id===ID.crc)continue;
      if(!seen.has(el.offset))errors.push('INDEX_MISSING_TOP_LEVEL:'+hex(el.id)+':'+el.offset);
    }
    return receipt(errors.length?REFUSAL:'INDEX_REFERENCES_VERIFIED',
      errors,refs,top.length);
  }catch(err){
    return issue('INDEX_SCAN_FAILED:'+(err?.message||String(err)));
  }
}
