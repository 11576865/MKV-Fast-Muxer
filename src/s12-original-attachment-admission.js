/**
 * S12 source-class admission, READ ONLY. This is deliberately stricter than
 * the ordinary FFmpeg source preservation preflight and is NOT a writer
 * enablement decision. A source must satisfy every declared observation
 * before future research can even consider a large original-attachment path.
 *
 * The parser and current-File guard are owned by createMatroskaAttachmentReader;
 * metadata keys, imported JSON, and ffprobe snapshots cannot grant access.
 */
export const S12_ADMISSION_SCHEMA = 's12-original-attachment-admission-v0';
const TOP = Object.freeze({
  info:0x1549a966, tracks:0x1654ae6b, cluster:0x1f43b675,
  attachments:0x1941a469, void:0xec,
  chapters:0x1043a770, tags:0x1254c367, cues:0x1c53bb6b,
  seekHead:0x114d9b74, crc32:0xbf,
});
const permitted = new Set([TOP.info,TOP.tracks,TOP.cluster,TOP.attachments,TOP.void]);
const display = id => '0x'+id.toString(16).toUpperCase();
const result = (status,reasons,attachments=[])=>Object.freeze({
  schema:S12_ADMISSION_SCHEMA, status,
  sourceClassCandidate:status==='SOURCE_CLASS_CANDIDATE',
  writerAuthorized:false, publicationAuthorized:false,
  reasons:Object.freeze(Array.from(new Set(reasons))),
  attachments:Object.freeze(attachments.map(item=>Object.freeze({
    ordinal:item.ordinal,filename:item.filename,mimeType:item.mimeType,
    fileUid:item.fileUid,byteLength:item.byteLength,
  }))),
  evidence:'seeked-original-file-ebml-headers-and-exact-browser-File-reference',
  limitation:'只识别未来受限路径的来源与未编辑原附件意图；未核验 SeekHead/Cues/嵌套 CRC、媒体包、输出写入或用户保存，绝不授权执行。',
});
const refusal = (code)=>result('BLOCKED',Array.isArray(code)?code:[code]);
const string = v=>typeof v==='string'?v:'';

/**
 * @param {object} args
 * reader: one session-owned Matroska attachment reader
 * source: the exact browser File originally used to create that reader
 * intent: explicit ordered intent for every original attachment. No implicit
 *         keep-all from absent data, renamed file or unrelated JSON evidence.
 */
export async function inspectS12OriginalAttachmentSource({
  reader=null,source=null,intent=null,
}={}) {
  if(!reader || typeof reader.inspect!=='function' ||
      typeof reader.isCurrentInspection!=='function' ||
      typeof reader.isCurrentSourceFile!=='function' ||
      !reader.isCurrentSourceFile(source))
    return refusal('EXACT_SOURCE_FILE_AUTHORITY_MISSING');
  if(!Array.isArray(intent))return refusal('EXPLICIT_ORIGINAL_ATTACHMENT_INTENT_REQUIRED');

  let inventory;
  let preservationState = 'UNKNOWN';
  try{
    inventory=await reader.inspect();
    if(!reader.isCurrentSourceFile(source))
      return refusal('SOURCE_CHANGED_DURING_INSPECTION');
    // A failed read-only scan resets the reader's current inventory; that
    // must report the actual EBML diagnostic rather than falsely claiming a
    // different File object was selected.
    if(inventory.state!=='inspected')
      return refusal('ATTACHMENT_INVENTORY_UNVERIFIED:'+
        string(inventory.diagnostic?.code||'UNKNOWN'));
    if(!reader.isCurrentInspection(inventory))
      return refusal('SOURCE_CHANGED_DURING_INSPECTION');
    const preservation=await reader.inspectPreservation();
    if(!reader.isCurrentSourceFile(source)||!reader.isCurrentInspection(inventory))
      return refusal('SOURCE_CHANGED_DURING_PRESERVATION_SCAN');
    // Accumulate the independent broad S08 result and the narrower source
    // topology refusal. S08's early BLOCKED verdict cannot suppress the
    // precise SeekHead/Cues/CRC or unknown-element denial.
    preservationState=preservation.state;
  }catch(error){
    return refusal('READ_ONLY_SOURCE_INSPECTION_FAILED:'+
      string(error?.message||error));
  }

  const shape=inventory.structure||{};
  const entries=Array.isArray(shape.topLevelElements)?shape.topLevelElements:[];
  const count=id=>entries.find(row=>row.id===id)?.count||0;
  const issues=[];
  if(preservationState!=='NO_KNOWN_HAZARD')
    issues.push('SOURCE_PRESERVATION_NOT_CLEAR:'+preservationState);
  if(!shape.segmentFiniteExact || !shape.segmentSizeKnown)
    issues.push('SOURCE_SINGLE_FINITE_EXACT_SEGMENT_REQUIRED');
  if(count(TOP.info)!==1||count(TOP.tracks)!==1||
      count(TOP.cluster)<1||count(TOP.attachments)!==1)
    issues.push('SOURCE_INFO_TRACKS_CLUSTER_ATTACHMENTS_REQUIRED');
  for(const item of entries) {
    if(!Number.isSafeInteger(item.id)||!Number.isSafeInteger(item.count)||
        item.count<1||!permitted.has(item.id))
      issues.push('SOURCE_TOP_LEVEL_NOT_ADMITTED:'+display(item.id));
  }
  if(count(TOP.seekHead))issues.push('SOURCE_SEEKHEAD_GRAPH_PROOF_REQUIRED');
  if(count(TOP.cues))issues.push('SOURCE_CUES_GRAPH_PROOF_REQUIRED');
  if(count(TOP.tags)||count(TOP.chapters))
    issues.push('SOURCE_TAGS_OR_CHAPTERS_NOT_PRESERVABLE');
  if(count(TOP.crc32))issues.push('SOURCE_SEGMENT_CRC_UNVERIFIED');
  const items=inventory.attachments||[];
  if(!items.length||items.length>1024)issues.push('ORIGINAL_ATTACHMENT_COUNT_INVALID');
  if(items.some(item=>!Number.isSafeInteger(item.byteLength)||item.byteLength<1))
    issues.push('ORIGINAL_ATTACHMENT_FILEDATA_INVALID');
  if(new Set(items.map(item=>item.fileUid)).size!==items.length)
    issues.push('ORIGINAL_ATTACHMENT_UID_AMBIGUOUS');
  if(new Set(items.map(item=>item.filename.toLowerCase())).size!==items.length)
    issues.push('ORIGINAL_ATTACHMENT_NAME_AMBIGUOUS');
  if(items.length!==intent.length)issues.push('ORIGINAL_ATTACHMENT_INTENT_COUNT_MISMATCH');
  for(let i=0;i<items.length;i++){
    const original=items[i],edit=intent[i];
    if(!edit || edit.ordinal!==original.ordinal ||
        string(edit.fileUid)!==original.fileUid ||
        edit.include!==true ||
        string(edit.filename)!==original.filename ||
        string(edit.mimeType)!==original.mimeType)
      issues.push('ORIGINAL_ATTACHMENT_EDIT_OR_REORDER_NOT_ADMITTED:'+i);
  }
  if(!reader.isCurrentSourceFile(source)||!reader.isCurrentInspection(inventory))
    issues.push('SOURCE_CHANGED_BEFORE_ADMISSION_RECEIPT');
  return result(issues.length?'BLOCKED':'SOURCE_CLASS_CANDIDATE',issues,items);
}
