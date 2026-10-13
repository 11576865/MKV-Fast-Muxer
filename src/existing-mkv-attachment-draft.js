import { planAttachmentExportNames } from './attachment-export-policy.js';

/**
 * The file identities are retained; only the proposed metadata is editable.
 * Validation is advisory and mirrors (but never replaces) the writer's
 * independently checked filename and MIME contracts.
 */
export function draftLimitedAttachmentItems(files) {
  return Array.from(files || [], file => ({
    file,
    filename: String(file?.name || ''),
    mimeType: String(file?.type || 'application/octet-stream'),
  }));
}

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export function validateLimitedAttachmentItems(items) {
  const entries = Array.from(items || []);
  if (!entries.length || entries.length > 8) {
    return { ok: false, reason: '新增附件数量必须为 1–8 个。' };
  }
  let bytes = 0;
  for (const [index, item] of entries.entries()) {
    if (!item?.file?.slice || !Number.isSafeInteger(item.file.size) ||
      item.file.size < 1 || item.file.size > 4 * 1024 * 1024) {
      return { ok: false, reason: `第 ${index + 1} 项文件字节数不符合单附件预算。` };
    }
    bytes += item.file.size;
    if (bytes > 4 * 1024 * 1024) {
      return { ok: false, reason: '新增附件合计不得超过 4 MiB。' };
    }
    const mimeType = String(item.mimeType || '').trim().toLowerCase();
    if (!MIME_RE.test(mimeType) || mimeType.length > 100) {
      return { ok: false, reason: `第 ${index + 1} 项 MIME 类型无效。` };
    }
    if (!String(item.filename || '').trim()) {
      return { ok: false, reason: `第 ${index + 1} 项附件名称为空。` };
    }
  }
  const proposals = planAttachmentExportNames(entries.map((item, index) => ({
    id: 'new:' + index,
    filename: String(item.filename),
    mimeType: String(item.mimeType).trim().toLowerCase(),
  }))).entries;
  if (proposals.some(p => p.originalName !== p.proposedSaveName)) {
    return { ok: false, reason: '附件名存在重复或不安全字符。请逐项手动修改，不会自动重命名。' };
  }
  if (new Set(proposals.map(p => p.proposedSaveName)).size !== proposals.length) {
    return { ok: false, reason: '新增附件名称重复，请逐项手动更正。' };
  }
  return { ok: true, reason: '', totalBytes: bytes };
}

export function snapshotLimitedAttachmentItems(items) {
  const result = validateLimitedAttachmentItems(items);
  if (!result.ok) throw new Error(result.reason);
  return Object.freeze(items.map(item => Object.freeze({
    file: item.file,
    filename: String(item.filename),
    mimeType: String(item.mimeType).trim().toLowerCase(),
  })));
}

export function matchLimitedAttachmentSnapshot(snapshot, liveItems) {
  if (!Array.isArray(snapshot) || snapshot.length !== liveItems?.length) return false;
  return snapshot.every((item, index) =>
    item.file === liveItems[index].file &&
    item.filename === liveItems[index].filename &&
    item.mimeType === String(liveItems[index].mimeType).trim().toLowerCase());
}
