/**
 * Optional S12 user-invoked inspection of the exact source File and the
 * generated output Blob. No second source model, no writer permission, no
 * automatic gate on normal mux or browser download.
 *
 * Each inspection is an observation of its own file. Equal validity of two
 * index graphs is NOT proof of source→output packet/UID preservation.
 */
import { auditS12FinishedIndexEvidence } from './s12-finished-index-evidence.js';
import { inspectS12CueTrackBlockEvidence } from './s12-cue-track-block-evidence.js';

export const S12_WORKBENCH_STRUCTURE_SCHEMA='s12-workbench-structure-v1';
const blobLike = value => Boolean(value &&
  Number.isSafeInteger(value.size) && value.size>0 &&
  typeof value.slice==='function');

const summarizeBlock = evidence => Object.freeze({
  status: String(evidence?.status || 'CUE_BLOCK_EVIDENCE_UNVERIFIED'),
  references: Number(evidence?.totalReferences || 0),
  checked: Number(evidence?.checkedReferences || 0),
  reasons: Object.freeze([...(evidence?.reasons || [])].slice(0,8)),
  timestampStatus: String(evidence?.cueTimestampStatus || 'CUE_BLOCK_TIMESTAMP_UNVERIFIED'),
  timestampsChecked: Number(evidence?.cueTimestampCheckedReferences || 0),
  timestampReasons: Object.freeze([...(evidence?.cueTimestampReasons || [])].slice(0,8)),
});
const nullResult = reasons => Object.freeze({
  schema:S12_WORKBENCH_STRUCTURE_SCHEMA,status:'NOT_RUN',
  source:null,finished:null,
  reasons:Object.freeze(reasons),
  writerAuthorized:false,publicationAuthorized:false,
  sourceOutputPacketParityProven:false,uidGraphProven:false,
  userDeviceSaveVerified:false,
});
const summarizeSide = (pointerSide,block) => Object.freeze({
  seekStatus:pointerSide?.seekStatus || 'INDEX_UNVERIFIED',
  cuesStatus:pointerSide?.cuesStatus || 'CUES_UNVERIFIED',
  seekReferences:Number(pointerSide?.seekReferences || 0),
  cueReferences:Number(pointerSide?.cueReferences || 0),
  seekReasons:Object.freeze([...(pointerSide?.seekReasons||[])].slice(0,8)),
  cueReasons:Object.freeze([...(pointerSide?.cueReasons||[])].slice(0,8)),
  block:summarizeBlock(block),
});

/** Override scanners solely for deterministic interface-contract tests. */
export async function auditS12WorkbenchStructure({source,finished}={},{
  pointerInspector=auditS12FinishedIndexEvidence,
  blockInspector=inspectS12CueTrackBlockEvidence,
}={}){
  if(!blobLike(source)||!blobLike(finished)||source===finished)
    return nullResult(['EXACT_DISTINCT_SOURCE_AND_FINISHED_BLOBS_REQUIRED']);
  const pointers=await pointerInspector({source,finished});
  // Independently inspect BOTH real Blobs; a proof on the source alone never
  // stands in for evidence about what the browser actually generated.
  const [sourceBlock,finishedBlock]=await Promise.all([
    blockInspector(source),blockInspector(finished),
  ]);
  const sourceResult=summarizeSide(pointers.source,sourceBlock);
  const finishedResult=summarizeSide(pointers.finished,finishedBlock);
  const independentFinishedValid=
    pointers.status==='FINISHED_INDEX_POINTERS_SCOPED_VERIFIED' &&
    finishedBlock?.status==='CUE_TRACK_BLOCK_HEADERS_VERIFIED' &&
    finishedBlock?.cueTimestampStatus==='CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED';
  const contradiction=pointers.status==='FINISHED_INDEX_CONTRADICTION';
  return Object.freeze({
    schema:S12_WORKBENCH_STRUCTURE_SCHEMA,
    status:contradiction?'FINISHED_INDEX_CONTRADICTION'
      :independentFinishedValid?'FINISHED_SCOPED_INDEX_AND_TIMESTAMP_VERIFIED'
      :'STRUCTURE_INCOMPLETE_OR_UNVERIFIED',
    source:sourceResult,finished:finishedResult,
    reasons:Object.freeze([...(pointers.errors||[])].slice(0,8)),
    writerAuthorized:false,publicationAuthorized:false,
    sourceOutputPacketParityProven:false,uidGraphProven:false,
    userDeviceSaveVerified:false,
    limitations:'仅验证每个文件独立的索引指针、实际轨道 Block 头及有限 CueTime 关系；不验证关键帧、packet 等价、任意 UID/标签保留、解码或用户设备持久保存',
  });
}

const statusLabel = (status) => ({
  FINISHED_SCOPED_INDEX_AND_TIMESTAMP_VERIFIED:'成品索引与时间戳（受限范围）通过',
  FINISHED_INDEX_CONTRADICTION:'成品索引存在可证实的矛盾',
  STRUCTURE_INCOMPLETE_OR_UNVERIFIED:'结构检查完成，但部分关系尚未验证',
  NOT_RUN:'未执行',
  INDEX_REFERENCES_VERIFIED:'指针验证通过',
  CUES_CLUSTER_POINTERS_VERIFIED:'Cluster 指向验证通过',
  CUE_TRACK_BLOCK_HEADERS_VERIFIED:'Track/Block 对应验证通过',
  CUE_BLOCK_TIMESTAMP_SCOPED_VERIFIED:'CueTime/Block 时间验证通过',
})[status] || ('未验证（'+String(status||'UNKNOWN')+'）');

export function formatS12WorkbenchStructure(audit) {
  if(!audit||audit.status==='NOT_RUN')
    return '独立结构检查未执行；需要当前真实来源与已生成的 MKV。';
  const section=(title,side)=> [
    title+':',
    'SeekHead '+statusLabel(side.seekStatus)+'（'+side.seekReferences+' 条引用）',
    'Cues '+statusLabel(side.cuesStatus)+'（'+side.cueReferences+' 条引用）',
    'Block '+statusLabel(side.block.status)+'（'+side.block.checked+'/'+side.block.references+'）',
    'CueTime '+statusLabel(side.block.timestampStatus)+
      '（'+side.block.timestampsChecked+'/'+side.block.references+'）',
    [...side.seekReasons,...side.cueReasons,...side.block.reasons,
      ...side.block.timestampReasons].length
      ? '未验证/差异原因：'+
        [...new Set([...side.seekReasons,...side.cueReasons,
          ...side.block.reasons,...side.block.timestampReasons])].slice(0,6).join('；')
      : '',
  ].filter(Boolean).join('\n');
  return [
    statusLabel(audit.status),
    section('真实来源',audit.source),
    section('实际成品',audit.finished),
    audit.reasons.length?'检查错误：'+audit.reasons.join('；'):'',
    audit.limitations,
  ].filter(Boolean).join('\n\n');
}
