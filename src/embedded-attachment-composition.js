import {sanitizeAttachmentFilename} from './attachment-export-policy.js';
import {MAX_SINGLE_ATTACHMENT_BYTES} from './multi-attachment-only-job-plan.js';

/**
 * Convert an already inspected AttachedFile in a *different* source MKV into
 * an ordinary, mutable inclusion candidate for the current output draft.
 * The data is a Blob slice of the exact source; no user download or FS copy
 * is required. This does not change, claim to preserve, or rewrite source A.
 */
export function embeddedAttachmentEligibility(item, existingEntries = [], sourceFile = null) {
  if (!item || !Number.isSafeInteger(item.byteLength) || item.byteLength < 1 ||
      item.byteLength > MAX_SINGLE_ATTACHMENT_BYTES)
    return {allowed:false,reason:'当前普通附件输出仅支持非空且不超过 16 MiB 的内容。'};
  if (sanitizeAttachmentFilename(item.filename).transformed)
    return {allowed:false,reason:'来源附件名称包含路径或不安全字符；当前不能直接加入。'};
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(item.mimeType||'') ||
      item.mimeType.length > 100)
    return {allowed:false,reason:'来源附件 MIME 不符合当前普通附件写入器要求。'};
  if (!/^[1-9][0-9]*$/.test(String(item.fileUid || '')))
    return {allowed:false,reason:'无法证明来源 FileUID。'};
  if (existingEntries.some(row =>
    row.embeddedOrigin?.sourceFile === sourceFile &&
    row.embeddedOrigin.fileUid === item.fileUid))
    return {allowed:false,reason:'此来源附件已在拟输出中。'};
  return {allowed:true,reason:''};
}

export function createEmbeddedAttachmentOutputEntry({
  sourceEntry, reader, inventory, attachmentId, existingEntries = [],
  createFile = (parts,name,options) => new File(parts,name,options),
}) {
  if (sourceEntry?.kind !== 'container' || !sourceEntry.file || !sourceEntry.key ||
      !reader?.isCurrentSourceFile?.(sourceEntry.file) ||
      !reader?.isCurrentInspection?.(inventory))
    throw Error('EMBEDDED_ATTACHMENT_SOURCE_CHANGED');
  const item = inventory.attachments.find(x => x.id === attachmentId);
  if (!item) throw Error('EMBEDDED_ATTACHMENT_NOT_FOUND');
  const eligibility=embeddedAttachmentEligibility(item,existingEntries,sourceEntry.file);
  if (!eligibility.allowed) throw Error('EMBEDDED_ATTACHMENT_NOT_ELIGIBLE: '+eligibility.reason);
  const extracted=reader.openAttachment(item.id);
  if (extracted.declaredSize!==item.byteLength ||
      extracted.filename!==item.filename ||
      extracted.mimeType!==item.mimeType ||
      extracted.data.size!==item.byteLength)
    throw Error('EMBEDDED_ATTACHMENT_INSPECTION_STALE');
  const file=createFile([extracted.data],item.filename,{
    type:item.mimeType,lastModified:sourceEntry.file.lastModified || 0,
  });
  if (!file?.slice || file.name!==item.filename || file.size!==item.byteLength)
    throw Error('EMBEDDED_ATTACHMENT_FILE_BINDING_FAILED');
  return {
    kind:'attachment',status:'recognized',mimeType:item.mimeType,
    file,include:true,
    key:'embedded:'+sourceEntry.key+':'+item.fileUid,
    label:'MKV 内封附件',
    evidence:'source-embedded-attachedfile-raw-ebml',
    detail:'来自 '+sourceEntry.file.name+' · FileUID '+item.fileUid+'；实际成品仍需完整字节回读。',
    embeddedOrigin:Object.freeze({
      sourceFile:sourceEntry.file,sourceKey:sourceEntry.key,
      sourceName:sourceEntry.file.name,fileUid:item.fileUid,
      originalName:item.filename,sourceAssetId:extracted.sourceAssetId,
    }),
  };
}

export const pruneEmbeddedAttachmentsForRemovedSource = (entries, removedSource) =>
  entries.filter(entry => entry.embeddedOrigin?.sourceFile !== removedSource);
