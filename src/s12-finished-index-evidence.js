/**
 * S12 real finished-file index observation, not a source-to-output remux
 * equivalence proof and never a writer permission grant.
 *
 * The same bounded EBML SeekHead and Cues/Cluster scanners evaluate BOTH the
 * unmodified source and the actual materialized finished MKV. They do not
 * compare byte offsets between files: remuxing necessarily relocates them.
 * An exact mismatch or bad CRC on finished output is a genuine negative,
 * while omitted indexes/incomplete coverage simply provide no proof.
 */
import { inspectS12SeekHeadIndex } from './s12-seekhead-index-proof.js';
import { inspectS12CuesClusterLocations } from './s12-cues-cluster-proof.js';

export const S12_FINISHED_INDEX_SCHEMA='s12-finished-file-index-evidence-v0';
const BAD_SEEK=/INDEX_POINTER_MISMATCH|INDEX_SEEKHEAD_CRC_MISMATCH|INDEX_SECOND_HEAD_NOT_LINKED|INDEX_SECOND_HEAD_NONCLUSTER_REFERENCE|INDEX_DUPLICATE_TARGET/;
const BAD_CUES=/CUES_CLUSTER_POINTER_MISMATCH|CUES_RELATIVE_POSITION_OUT_OF_CLUSTER|CUES_CRC_MISMATCH/;
const summarize=(seek,cues)=>Object.freeze({
  seekStatus:seek.status,cuesStatus:cues.status,
  seekReferences:seek.references?.length||0,
  seekMatched:seek.references?.filter(item=>item.matched).length||0,
  cueReferences:cues.locations?.length||0,
  cueMatched:cues.locations?.filter(item=>item.matched).length||0,
  seekReasons:Object.freeze([...(seek.reasons||[])]),
  cueReasons:Object.freeze([...(cues.reasons||[])]),
  seekComplete:seek.status==='INDEX_REFERENCES_VERIFIED',
  cuesComplete:cues.status==='CUES_CLUSTER_POINTERS_VERIFIED',
});
const actualBlob=v=>v && Number.isSafeInteger(v.size)&&v.size>=0&&typeof v.slice==='function';
export async function auditS12FinishedIndexEvidence({source,finished}={}){
  if(!actualBlob(source)||!actualBlob(finished)||source===finished)
    return Object.freeze({schema:S12_FINISHED_INDEX_SCHEMA,
      status:'NOT_RUN_INVALID_FILE_AUTHORITY',source:null,finished:null,
      writerAuthorized:false,publicationAuthorized:false,
      remuxEquivalenceProven:false,uidGraphProven:false,
      savedFileVerified:false,errors:Object.freeze(['SOURCE_AND_FINISHED_BLOBS_REQUIRED'])});
  try{
    const [sSeek,sCue,fSeek,fCue]=await Promise.all([
      inspectS12SeekHeadIndex(source),inspectS12CuesClusterLocations(source),
      inspectS12SeekHeadIndex(finished),inspectS12CuesClusterLocations(finished),
    ]);
    const src=summarize(sSeek,sCue),out=summarize(fSeek,fCue);
    const wrong=(out.seekReasons.filter(x=>BAD_SEEK.test(x)).map(x=>'FINISHED_SEEK:'+x))
      .concat(out.cueReasons.filter(x=>BAD_CUES.test(x)).map(x=>'FINISHED_CUES:'+x));
    const complete=out.seekComplete&&out.cuesComplete;
    return Object.freeze({
      schema:S12_FINISHED_INDEX_SCHEMA,
      status:wrong.length?'FINISHED_INDEX_CONTRADICTION'
        :complete?'FINISHED_INDEX_POINTERS_SCOPED_VERIFIED':'FINISHED_INDEX_UNVERIFIED',
      source:src,finished:out,
      // Correct individual source and output offsets don't prove their cue
      // track/time coverage, packet identity or relationship survived remux.
      remuxEquivalenceProven:false,uidGraphProven:false,
      writerAuthorized:false,publicationAuthorized:false,
      savedFileVerified:false,errors:Object.freeze(wrong),
      limitation:'Only independent on-disk SeekHead and Cues pointer structure; no cross-file packet/UID/Tag/CRC-of-other-elements or durable user-save proof',
    });
  }catch(error){
    return Object.freeze({schema:S12_FINISHED_INDEX_SCHEMA,
      status:'FINISHED_INDEX_PROBE_FAILED',source:null,finished:null,
      writerAuthorized:false,publicationAuthorized:false,
      remuxEquivalenceProven:false,uidGraphProven:false,
      savedFileVerified:false,errors:Object.freeze([String(error?.message||error)])});
  }
}
