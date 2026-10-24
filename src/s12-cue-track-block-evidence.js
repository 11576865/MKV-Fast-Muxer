/**
 * S12 CueTrack -> real TrackNumber and Block headers; bounded read-only proof.
 *
 * Existing CueClusterPosition checks locate a Cluster. That does NOT prove
 * the referenced CueTrack exists in Tracks or occurs in that Cluster, nor
 * that CueRelativePosition points at a Block. This module adds those facts
 * without reading Block payloads, decrypting, changing media or writing MKV.
 */
import { inspectS12CuesClusterLocations } from './s12-cues-cluster-proof.js';
export const S12_CUE_BLOCK_SCHEMA='s12-cue-track-block-evidence-v0';
const E=Object.freeze({ebml:0x1a45dfa3,docType:0x4282,segment:0x18538067,
  tracks:0x1654ae6b,trackEntry:0xae,trackNumber:0xd7,
  trackTimestampScale:0x23314f,codecDelay:0x56aa,
  cluster:0x1f43b675,clusterTimestamp:0xe7,
  simpleBlock:0xa3,blockGroup:0xa0,block:0xa1,
  void:0xec,crc:0xbf});
const MAX_TOP=100000,MAX_TRACKS=256,MAX_CLUSTER_CHILDREN=4096;
const MAX_VISITS=220000,MAX_REFERENCES=50000;
const MAX_REASONS=32;
const receipt=(status,errors=[],checked=0,total=0,details={})=>Object.freeze({
  schema:S12_CUE_BLOCK_SCHEMA,status,
  cueTrackBlocksVerified:status==='CUE_TRACK_BLOCK_HEADERS_VERIFIED',
  checkedReferences:checked,totalReferences:total,
  reasons:Object.freeze([...new Set(errors)].slice(0,MAX_REASONS)),
  trackNumbers:Object.freeze([...(details.tracks||[])]),
  distinctReferencedClusters:details.clusters||0,
  maxReadBytes:12,
  writerAuthorized:false,publicationAuthorized:false,
  actualPacketPayloadVerified:false,
  cueTimestampVerified:status==='CUE_TRACK_BLOCK_HEADERS_VERIFIED' &&
    total>0 && details.timedChecked===total,
  cueTimestampStatus:status==='CUE_TRACK_BLOCK_HEADERS_VERIFIED' &&
    total>0 && details.timedChecked===total
    ? 'CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED' : 'CUE_BLOCK_TIMESTAMP_UNVERIFIED',
  cueTimestampCheckedReferences:details.timedChecked||0,
  cueTimestampReasons:Object.freeze([...new Set(details.timingReasons||[])].slice(0,MAX_REASONS)),
  uidGraphVerified:false,savedFileVerified:false,
  scope:'Tracks and actual Block header with optional CueTime = Cluster Timestamp + signed Block ticks at TrackTimestampScale 1; no media payload, codec PTS or remux equivalence proof',
});
async function read(file,at,n){
  if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(n)||n<0||at+n>file.size||n>12)
    throw Error('CUE_BLOCK_READ_RANGE');
  return new Uint8Array(await file.slice(at,at+n).arrayBuffer());
}
async function element(file,at,bound,ctx){
  if(++ctx.visits>MAX_VISITS)throw Error('CUE_BLOCK_HEADER_VISIT_BUDGET');
  if(at>=bound)throw Error('CUE_BLOCK_HEADER_OUTSIDE_PARENT');
  const b=await read(file,at,Math.min(12,bound-at));
  if(!b.length||!b[0])throw Error('CUE_BLOCK_INVALID_ID');
  let iw=1;while(iw<=4&&!(b[0]&(0x80>>(iw-1))))iw++;
  if(iw>4||iw>=b.length)throw Error('CUE_BLOCK_BAD_ID_WIDTH');
  let id=0;for(let i=0;i<iw;i++)id=id*256+b[i];
  const lead=b[iw];if(!lead)throw Error('CUE_BLOCK_BAD_SIZE_WIDTH');
  let sw=1;while(sw<=8&&!(lead&(0x80>>(sw-1))))sw++;
  if(sw>8||iw+sw>b.length)throw Error('CUE_BLOCK_TRUNCATED_SIZE');
  let size=BigInt(lead&((1<<(8-sw))-1));
  for(let i=1;i<sw;i++)size=(size<<8n)|BigInt(b[iw+i]);
  const unknown=size===(1n<<BigInt(sw*7))-1n;
  if(!unknown&&size>BigInt(Number.MAX_SAFE_INTEGER))throw Error('CUE_BLOCK_SIZE_OVERFLOW');
  const data=at+iw+sw,end=unknown?null:data+Number(size);
  if(end!==null&&(!Number.isSafeInteger(end)||end>bound))
    throw Error('CUE_BLOCK_CHILD_OUTSIDE_PARENT');
  return {id,at,data,end,unknown};
}
async function walk(file,from,to,ctx,fn,max=MAX_TOP){
  let seen=0;
  for(let at=from;at<to;){
    if(++seen>max)throw Error('CUE_BLOCK_CHILD_COUNT_BUDGET');
    const e=await element(file,at,to,ctx);
    if(e.unknown)throw Error('CUE_BLOCK_UNKNOWN_CHILD_SIZE');
    await fn(e);
    at=e.end;
  }
}
async function unsigned(file,e,{allowZero=false}={}){
  const n=e.end-e.data;
  if(n<1||n>8)throw Error('CUE_BLOCK_INVALID_UINT_WIDTH');
  const v=await read(file,e.data,n);let out=0n;
  for(const b of v)out=(out<<8n)|BigInt(b);
  if((!allowZero&&out<1n)||out>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('CUE_BLOCK_INVALID_UINT_VALUE');
  return Number(out);
}
async function timingScale(file,e){
  const n=e.end-e.data;
  if(n!==4&&n!==8)throw Error('CUE_BLOCK_TRACK_SCALE_WIDTH');
  const bytes=await read(file,e.data,n);
  const view=new DataView(bytes.buffer,bytes.byteOffset,n);
  const scale=n===4?view.getFloat32(0,false):view.getFloat64(0,false);
  if(!Number.isFinite(scale)||scale<=0)throw Error('CUE_BLOCK_TRACK_SCALE_INVALID');
  return scale;
}
async function blockHeader(file,e){
  // EBML vint TrackNumber followed by signed 16-bit time offset and flags.
  // Request only 11 header bytes at most; do NOT fetch the coded packet.
  if(e.end-e.data<4)throw Error('CUE_BLOCK_TOO_SHORT');
  const a=await read(file,e.data,Math.min(11,e.end-e.data));
  let width=1;
  while(width<=8&&!(a[0]&(0x80>>(width-1))))width++;
  if(width>8||width+3>a.length)throw Error('CUE_BLOCK_TRACK_VINT_INVALID');
  let n=BigInt(a[0]&((1<<(8-width))-1));
  for(let i=1;i<width;i++)n=(n<<8n)|BigInt(a[i]);
  if(n<1n||n>BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('CUE_BLOCK_TRACK_VINT_UNADDRESSABLE');
  const raw=(a[width]<<8)|a[width+1];
  const ticks=raw&0x8000?raw-0x10000:raw;
  return {track:Number(n),ticks,flags:a[width+2]};
}
async function candidateBlock(file,el,ctx){
  if(el.id===E.simpleBlock||el.id===E.block)
    return blockHeader(file,el);
  if(el.id!==E.blockGroup)return null;
  let found=null;
  await walk(file,el.data,el.end,ctx,async x=>{
    if(x.id===E.block){
      if(found!==null)throw Error('CUE_BLOCK_DUPLICATE_IN_GROUP');
      found=await blockHeader(file,x);
    }
  },128);
  return found;
}
export async function inspectS12CueTrackBlockEvidence(file,{maxClusterChildren=MAX_CLUSTER_CHILDREN}={}){
  if(!file||!Number.isSafeInteger(file.size)||file.size<1||typeof file.slice!=='function')
    return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',['CUE_BLOCK_FILE_UNAVAILABLE']);
  if(!Number.isSafeInteger(maxClusterChildren)||maxClusterChildren<1||
    maxClusterChildren>MAX_CLUSTER_CHILDREN)
    return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',['CUE_BLOCK_INVALID_BUDGET']);
  const cues=await inspectS12CuesClusterLocations(file);
  const total=cues.locations?.length||0;
  if(cues.status!=='CUES_CLUSTER_POINTERS_VERIFIED')
    return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',
      [cues.status,...(cues.reasons||[])],0,total);
  if(total<1||total>MAX_REFERENCES)
    return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',['CUE_BLOCK_CUE_REFERENCE_COUNT'],0,total);
  const ctx={visits:0},errors=[];
  try{
    const root=await element(file,0,file.size,ctx);
    if(root.id!==E.ebml||root.unknown||root.end>65536)
      return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',['CUE_BLOCK_EBML_HEADER_INVALID'],0,total);
    let docType='';
    await walk(file,root.data,root.end,ctx,async e=>{
      if(e.id===E.docType){
        if(e.end-e.data>32)throw Error('CUE_BLOCK_DOCTYPE_LENGTH');
        docType=new TextDecoder().decode(await read(file,e.data,e.end-e.data));
      }
    });
    if(docType!=='matroska')throw Error('CUE_BLOCK_DOCTYPE_UNSUPPORTED');
    let segment=null;
    for(let off=root.end;off<file.size;){
      const e=await element(file,off,file.size,ctx);
      if(e.id===E.segment){segment=e;break;}
      if(e.unknown)throw Error('CUE_BLOCK_UNKNOWN_BEFORE_SEGMENT');
      off=e.end;
    }
    if(!segment||segment.unknown||segment.end!==file.size)
      throw Error('CUE_BLOCK_EXACT_SEGMENT_REQUIRED');
    let trackMaster=null;
    const clusters=new Map();
    await walk(file,segment.data,segment.end,ctx,async e=>{
      if(e.id===E.tracks){
        if(trackMaster)throw Error('CUE_BLOCK_DUPLICATE_TRACKS');
        trackMaster=e;
      }
      if(e.id===E.cluster)clusters.set(e.at,e);
    });
    if(!trackMaster)throw Error('CUE_BLOCK_TRACKS_ABSENT');
    const tracks=new Set(),trackTimingEligible=new Map();
    await walk(file,trackMaster.data,trackMaster.end,ctx,async t=>{
      if(t.id===E.void||t.id===E.crc)return;
      if(t.id!==E.trackEntry)throw Error('CUE_BLOCK_UNKNOWN_TRACKS_CHILD');
      if(tracks.size>=MAX_TRACKS)throw Error('CUE_BLOCK_TRACKS_BUDGET');
      let track=null,scale=1,codecDelay=0,scaleSeen=false,delaySeen=false;
      await walk(file,t.data,t.end,ctx,async field=>{
        if(field.id===E.trackNumber){
          if(track!==null)throw Error('CUE_BLOCK_DUPLICATE_TRACKNUMBER');
          track=await unsigned(file,field);
        }else if(field.id===E.trackTimestampScale){
          if(scaleSeen)throw Error('CUE_BLOCK_DUPLICATE_TRACK_SCALE');
          scaleSeen=true;
          scale=await timingScale(file,field);
        }else if(field.id===E.codecDelay){
          if(delaySeen)throw Error('CUE_BLOCK_DUPLICATE_CODEC_DELAY');
          delaySeen=true;
          codecDelay=await unsigned(file,field,{allowZero:true});
        }
      },1024);
      if(track===null)throw Error('CUE_BLOCK_TRACKNUMBER_MISSING');
      if(tracks.has(track))throw Error('CUE_BLOCK_TRACKNUMBER_COLLISION');
      tracks.add(track);
      // For the separate exact CueTime proof only: non-default per-track
      // scaling or CodecDelay requires nanosecond/rounding semantics. Retain
      // existing header proof but never award an incorrect time receipt.
      trackTimingEligible.set(track,scale===1&&codecDelay===0);
    },MAX_TRACKS+8);
    const byCluster=new Map();
    for(const cue of cues.locations){
      if(!byCluster.has(cue.absoluteClusterOffset))
        byCluster.set(cue.absoluteClusterOffset,[]);
      byCluster.get(cue.absoluteClusterOffset).push(cue);
    }
    let checked=0,timedChecked=0;
    const timingReasons=[];
    for(const [offset,refs] of byCluster){
      const cluster=clusters.get(offset);
      if(!cluster)throw Error('CUE_BLOCK_CLUSTER_LOST');
      // A CueRelativePosition must land on a REAL parsed Cluster child
      // boundary. Reading at an arbitrary offset inside compressed payload
      // can otherwise fabricate a Block-looking header.
      const neededTracks=new Set();
      const relativeTargets=new Map();
      const pendingTiming=new Set(refs.filter(r=>tracks.has(r.track)));
      const timingCandidates=[];
      let clusterTimestamp=null,seenTimestamp=false;
      for(const r of refs){
        if(!tracks.has(r.track)){
          errors.push('CUE_TRACK_NOT_IN_TRACKS:'+r.track);
          continue;
        }
        if(r.relativePosition===null){
          neededTracks.add(r.track);
        }else{
          const absolute=cluster.data+r.relativePosition;
          if(absolute<cluster.data||absolute>=cluster.end){
            errors.push('CUE_RELATIVE_OUT_OF_CLUSTER:'+r.relativePosition);
          }else{
            if(!relativeTargets.has(absolute))relativeTargets.set(absolute,[]);
            relativeTargets.get(absolute).push(r);
          }
        }
      }
      let visited=0,at=cluster.data;
      while(at<cluster.end&&(neededTracks.size||relativeTargets.size||pendingTiming.size)){
        if(++visited>maxClusterChildren){
          if(neededTracks.size||relativeTargets.size)
            errors.push('CUE_CLUSTER_BLOCK_SCAN_BUDGET:'+offset);
          timingReasons.push('CUE_TIMESTAMP_SCAN_BUDGET:'+offset);
          break;
        }
        const h=await element(file,at,cluster.end,ctx);
        if(h.unknown)throw Error('CUE_BLOCK_UNKNOWN_CLUSTER_CHILD');
        if(h.id===E.clusterTimestamp){
          if(seenTimestamp)throw Error('CUE_DUPLICATE_CLUSTER_TIMESTAMP');
          seenTimestamp=true;
          clusterTimestamp=await unsigned(file,h,{allowZero:true});
        }
        const matchingRelative=relativeTargets.get(at)||[];
        const interesting=matchingRelative.length||
          ((h.id===E.simpleBlock||h.id===E.blockGroup)&&
             (neededTracks.size||pendingTiming.size));
        const info=interesting?await candidateBlock(file,h,ctx):null;
        if(info!==null)neededTracks.delete(info.track);
        for(const r of matchingRelative){
          if(info?.track!==r.track)errors.push(
            'CUE_RELATIVE_NOT_REFERENCED_TRACK_BLOCK:'+r.track);
          else checked++;
        }
        if(info!==null&&pendingTiming.size)
          timingCandidates.push({at,track:info.track,ticks:info.ticks});
        relativeTargets.delete(at);
        // Compare when the Cluster Timestamp has been observed. This remains
        // valid even if Timestamp appears after an earlier Block, as the
        // candidate headers were retained without their payload bytes.
        if(clusterTimestamp!==null&&timingCandidates.length){
          for(const r of pendingTiming){
            if(!trackTimingEligible.get(r.track))continue;
            const target=r.relativePosition===null?null:
              cluster.data+r.relativePosition;
            if(timingCandidates.some(c=>c.track===r.track&&
              (target===null||c.at===target)&&
              clusterTimestamp+c.ticks===r.cueTime))
              pendingTiming.delete(r);
          }
          if(!pendingTiming.size)timingCandidates.length=0;
        }
        at=h.end;
      }
      timedChecked+=refs.filter(r=>tracks.has(r.track)&&
        !pendingTiming.has(r)).length;
      for(const r of pendingTiming){
        if(!seenTimestamp)timingReasons.push('CUE_CLUSTER_TIMESTAMP_MISSING:'+offset);
        else if(!trackTimingEligible.get(r.track))
          timingReasons.push('CUE_TIMING_NONDEFAULT_TRACK_SCALE_OR_DELAY:'+r.track);
        else timingReasons.push('CUE_TIME_NO_MATCHING_BLOCK:'+r.track+':'+r.cueTime);
      }
      for(const r of refs){
        if(r.relativePosition===null&&tracks.has(r.track)&&
          !neededTracks.has(r.track))checked++;
      }
      for(const track of neededTracks)
        errors.push('CUE_TRACK_NO_BLOCK_IN_CLUSTER:'+track);
      for(const [pos] of relativeTargets)
        errors.push('CUE_RELATIVE_NOT_BLOCK_BOUNDARY:'+pos);

    }
    return receipt(errors.length?'CUE_BLOCK_EVIDENCE_UNVERIFIED':
      'CUE_TRACK_BLOCK_HEADERS_VERIFIED',errors,checked,total,
      {tracks:[...tracks].sort((a,b)=>a-b),clusters:byCluster.size,
       timedChecked,timingReasons});
  }catch(error){
    return receipt('CUE_BLOCK_EVIDENCE_UNVERIFIED',
      [...errors,'CUE_BLOCK_SCAN_FAILED:'+(error?.message||String(error))],
      0,total);
  }
}
