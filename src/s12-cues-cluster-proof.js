/**
 * S12 Cues->Cluster pointer evidence on the actual, still-current Blob view.
 * This module does not remux, claim Block-level identity, or grant a writer.
 * It skips all Cluster payloads and all Attachment FileData with bounded seeks.
 * RFC 9559 §5.1.5 and §16: CueClusterPosition is Segment-payload-relative.
 */
export const S12_CUES_PROOF_SCHEMA='s12-cues-cluster-location-proof-v0';
const E={ebml:0x1a45dfa3,docType:0x4282,segment:0x18538067,
  cluster:0x1f43b675,cues:0x1c53bb6b,point:0xbb,time:0xb3,
  trackPositions:0xb7,track:0xf7,clusterPosition:0xf1,
  relativePosition:0xf0,crc:0xbf,void:0xec};
const MAX_HEADERS=120000,MAX_CUE_POINTS=50000,MAX_CRC_BYTES=512*1024;
const readChunk=32;
const proof=(status,reasons=[],locations=[],cuePoints=0)=>Object.freeze({
  schema:S12_CUES_PROOF_SCHEMA,status,
  cueClusterPointersVerified:status==='CUES_CLUSTER_POINTERS_VERIFIED',
  writerAuthorized:false,publicationAuthorized:false,
  reasons:Object.freeze([...new Set(reasons)]),
  cuePoints,
  locations:Object.freeze(locations.map(x=>Object.freeze({...x}))),
  scope:'Only Segment-relative CueClusterPosition references to existing Cluster element headers; cue track UID, block bytes, timing semantics and CRC outside Cues remain unverified',
});
const no=(reason)=>proof('CUES_UNVERIFIED',[reason]);
async function read(file,start,len){
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(len)||
    len<0||start+len>file.size)throw Error('CUES_READ_RANGE');
  return new Uint8Array(await file.slice(start,start+len).arrayBuffer());
}
async function header(file,start,bound,ctx){
  if(++ctx.heads>MAX_HEADERS)throw Error('CUES_HEADER_BUDGET');
  const bytes=await read(file,start,Math.min(12,bound-start));
  if(!bytes.length||!bytes[0])throw Error('CUES_BAD_EBML_ID');
  let idWidth=1;while(idWidth<=4&&!(bytes[0]&(0x80>>(idWidth-1))))idWidth++;
  if(idWidth>4||idWidth>=bytes.length)throw Error('CUES_TRUNCATED_ID');
  let id=0;for(let i=0;i<idWidth;i++)id=id*256+bytes[i];
  let sizeWidth=1;const lead=bytes[idWidth];
  if(!lead)throw Error('CUES_INVALID_SIZE');
  while(sizeWidth<=8&&!(lead&(0x80>>(sizeWidth-1))))sizeWidth++;
  if(sizeWidth>8||idWidth+sizeWidth>bytes.length)throw Error('CUES_TRUNCATED_SIZE');
  let size=BigInt(lead&((1<<(8-sizeWidth))-1));
  for(let i=1;i<sizeWidth;i++)size=(size<<8n)+BigInt(bytes[idWidth+i]);
  const unknown=size===(1n<<BigInt(7*sizeWidth))-1n;
  if(!unknown&&size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('CUES_UNADDRESSABLE_SIZE');
  const payload=start+idWidth+sizeWidth;
  const end=unknown?null:payload+Number(size);
  if(end!==null&&(!Number.isSafeInteger(end)||end>bound))throw Error('CUES_ELEMENT_OVERFLOW');
  return {id,start,payload,end,unknown};
}
async function walk(file,from,to,ctx,fn){
  for(let at=from;at<to;){
    const e=await header(file,at,to,ctx);
    if(e.unknown)throw Error('CUES_UNKNOWN_CHILD');
    await fn(e);
    at=e.end;
  }
}
async function unsigned(file,e){
  const n=e.end-e.payload;
  if(n<1||n>8)throw Error('CUES_BAD_UINT_WIDTH');
  const bytes=await read(file,e.payload,n);let v=0n;
  for(const b of bytes)v=(v<<8n)|BigInt(b);
  if(v>BigInt(Number.MAX_SAFE_INTEGER))throw Error('CUES_UNSAFE_INTEGER');
  return Number(v);
}
async function validateCrc(file,parent,crc){
  if(crc.end-crc.payload!==4)throw Error('CUES_CRC_SIZE_INVALID');
  const b=await read(file,crc.payload,4);
  const expected=(b[0]|(b[1]<<8)|(b[2]<<16)|(b[3]<<24))>>>0;
  let sum=0xffffffff,checked=0;
  for(const [from,to] of [[parent.payload,crc.start],[crc.end,parent.end]]){
    for(let at=from;at<to;at+=readChunk){
      const data=await read(file,at,Math.min(readChunk,to-at));
      checked+=data.length;
      if(checked>MAX_CRC_BYTES)throw Error('CUES_CRC_BYTE_BUDGET');
      for(const byte of data){
        sum^=byte;
        for(let i=0;i<8;i++)sum=(sum>>>1)^((sum&1)?0xedb88320:0);
      }
    }
  }
  if(((sum^0xffffffff)>>>0)!==expected)throw Error('CUES_CRC_MISMATCH');
}
async function cueChildren(file,parent,ctx,handler){
  let pos=0,crc=false;
  await walk(file,parent.payload,parent.end,ctx,async e=>{
    if(e.id===E.crc){
      if(crc||pos!==0)throw Error('CUES_CRC_PLACEMENT');
      crc=true;
      await validateCrc(file,parent,e);
    }else if(e.id!==E.void){
      await handler(e);
    }
    pos++;
  });
}
export async function inspectS12CuesClusterLocations(file){
  if(!file||!Number.isSafeInteger(file.size)||typeof file.slice!=='function')
    return no('CUES_FILE_UNAVAILABLE');
  const ctx={heads:0};
  try{
    const ebml=await header(file,0,file.size,ctx);
    if(ebml.id!==E.ebml||ebml.unknown||ebml.end>65536)
      return no('CUES_EBML_HEADER_UNKNOWN');
    let docType='';
    await walk(file,ebml.payload,ebml.end,ctx,async e=>{
      if(e.id===E.docType){
        if(e.end-e.payload>32)throw Error('CUES_DOCTYPE_BUDGET');
        docType=new TextDecoder().decode(await read(file,e.payload,e.end-e.payload));
      }
    });
    if(docType!=='matroska')return no('CUES_NOT_MATROSKA');
    let segment=null;
    for(let off=ebml.end;off<file.size;){
      const e=await header(file,off,file.size,ctx);
      if(e.id===E.segment){segment=e;break;}
      if(e.unknown)throw Error('CUES_UNKNOWN_PRE_SEGMENT');
      off=e.end;
    }
    if(!segment||segment.unknown||segment.end!==file.size)
      return no('CUES_EXACT_FINITE_SEGMENT_REQUIRED');
    const clusters=new Map(),cueMasters=[];
    await walk(file,segment.payload,segment.end,ctx,async e=>{
      if(e.id===E.cluster)clusters.set(e.start,e);
      if(e.id===E.cues)cueMasters.push(e);
    });
    if(cueMasters.length===0)return proof('NO_CUES',[],[],0);
    if(cueMasters.length!==1)return no('CUES_MASTER_COUNT_INVALID');
    if(!clusters.size)return no('CUES_NO_CLUSTER_ELEMENTS');
    const refs=[],issues=[];let pointCount=0;
    await cueChildren(file,cueMasters[0],ctx,async cue=>{
      if(cue.id!==E.point)throw Error('CUES_UNRECOGNIZED_TOP_CHILD');
      if(++pointCount>MAX_CUE_POINTS)throw Error('CUES_POINT_BUDGET');
      let time=null,positionCount=0;
      const positions=[];
      await cueChildren(file,cue,ctx,async child=>{
        if(child.id===E.time){
          if(time!==null)throw Error('CUES_DUPLICATE_TIME');
          time=await unsigned(file,child);
        }else if(child.id===E.trackPositions){
          positionCount++;
          let track=null,clusterPos=null,relative=null;
          await cueChildren(file,child,ctx,async p=>{
            if(p.id===E.track){
              if(track!==null)throw Error('CUES_DUPLICATE_TRACK');
              track=await unsigned(file,p);
              if(track===0)throw Error('CUES_ZERO_TRACK');
            }else if(p.id===E.clusterPosition){
              if(clusterPos!==null)throw Error('CUES_DUPLICATE_CLUSTER_POSITION');
              clusterPos=await unsigned(file,p);
            }else if(p.id===E.relativePosition){
              if(relative!==null)throw Error('CUES_DUPLICATE_RELATIVE_POSITION');
              relative=await unsigned(file,p);
            }else if(![0xb2,0x5378,0xea,0xdb].includes(p.id)){
              throw Error('CUES_UNKNOWN_TRACK_POSITION_FIELD');
            }
          });
          if(track===null||clusterPos===null)
            throw Error('CUES_TRACK_OR_POSITION_MISSING');
          positions.push({track,clusterPos,relative});
        }else throw Error('CUES_UNKNOWN_CUEPOINT_FIELD');
      });
      if(time===null||!positionCount)throw Error('CUES_TIME_OR_TRACKPOSITIONS_MISSING');
      for(const p of positions){
        const offset=segment.payload+p.clusterPos;
        const cluster=clusters.get(offset);
        const matched=!!cluster;
        if(!matched)issues.push('CUES_CLUSTER_POINTER_MISMATCH:'+p.clusterPos);
        if(matched&&p.relative!==null&&
            (p.relative>=cluster.end-cluster.payload||p.relative<0))
          issues.push('CUES_RELATIVE_POSITION_OUT_OF_CLUSTER:'+p.relative);
        refs.push({cueTime:time,track:p.track,
          clusterPosition:p.clusterPos,relativePosition:p.relative,
          absoluteClusterOffset:offset,matched});
      }
    });
    if(!pointCount)issues.push('CUES_EMPTY_INDEX');
    return proof(issues.length?'CUES_UNVERIFIED':'CUES_CLUSTER_POINTERS_VERIFIED',
      issues,refs,pointCount);
  }catch(error){
    return no('CUES_SCAN_FAILED:'+(error?.message||String(error)));
  }
}
