/**
 * Pure export-name policy for untrusted Matroska FileName metadata.
 * No automatic save, MIME-based trust, file-system writes or content decoding.
 * The caller must still use a user-approved destination and collision-safe
 * atomic save semantics when a future UI adds the export action.
 */
export const ATTACHMENT_EXPORT_NAME_SCHEMA = 'attachment-export-names-v0';
const MAX_UTF8_BYTES = 180;
const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const disallowed = /[<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\ufeff]/gu;
const encoder = new TextEncoder();

function utf8Trim(value, budget) {
  let text = '';
  let bytes = 0;
  for (const ch of value) {
    const count = encoder.encode(ch).byteLength;
    if (bytes + count > budget) break;
    bytes += count;
    text += ch;
  }
  return text;
}
const unsafeKey = value => String(value).normalize('NFKC').toLowerCase();

export function sanitizeAttachmentFilename(untrustedName) {
  const raw = String(untrustedName ?? '');
  const reasons = [];
  // Normalize before splitting: fullwidth slash/backslash must not sneak
  // through as harmless-looking path characters.
  const normalized = raw.normalize('NFKC');
  if (normalized !== raw) reasons.push('unicode-normalized');
  const parts = normalized.split(/[\\/]/u);
  if (parts.length > 1) reasons.push('path-components-stripped');
  let name = parts.at(-1) || '';
  const replaced = name.replace(disallowed, '_');
  if (replaced !== name) reasons.push('unsafe-characters-replaced');
  name = replaced.trim().replace(/^[. ]+|[. ]+$/gu, '');
  if (!name) {
    name = 'attachment';
    reasons.push('fallback-name');
  }
  if (reserved.test(name)) {
    name = '_' + name;
    reasons.push('reserved-device-name');
  }
  if (encoder.encode(name).byteLength > MAX_UTF8_BYTES) {
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '';
    const safeExt = encoder.encode(extension).byteLength <= 24 ? extension : '';
    const root = safeExt ? name.slice(0, -safeExt.length) : name;
    name = utf8Trim(root, MAX_UTF8_BYTES - encoder.encode(safeExt).byteLength)
      .replace(/[. ]+$/gu, '') + safeExt;
    reasons.push('utf8-length-limited');
  }
  return Object.freeze({
    originalName: raw,
    saveName: name,
    transformed: name !== raw,
    reasons: Object.freeze(reasons),
    byteLength: encoder.encode(name).byteLength,
    contentVerified: false,
  });
}

function insertSuffix(name, ordinal) {
  const suffix = ' (' + ordinal + ')';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const root = ext ? name.slice(0, -ext.length) : name;
  const cap = MAX_UTF8_BYTES - encoder.encode(suffix + ext).byteLength;
  if (cap < 1) throw new Error('ATTACHMENT_EXPORT_SUFFIX_BUDGET_EXCEEDED');
  return utf8Trim(root, cap).replace(/[. ]+$/gu, '') + suffix + ext;
}

/**
 * Detect common case-insensitive/Unicode-normalization collisions and
 * proactively reserve a distinct suggested filename. This does NOT inspect
 * actual destination directory contents or authorize overwriting.
 */
export function planAttachmentExportNames(attachments, { existingNames = [] } = {}) {
  if (!Array.isArray(attachments) || !Array.isArray(existingNames)) {
    throw new Error('ATTACHMENT_EXPORT_INPUT_INVALID');
  }
  const used = new Set(existingNames.map(unsafeKey));
  const results = attachments.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error('ATTACHMENT_EXPORT_ITEM_INVALID');
    }
    const sanitized = sanitizeAttachmentFilename(item.filename);
    const base = sanitized.saveName;
    let name = base;
    let ordinal = 2;
    while (used.has(unsafeKey(name))) {
      if (ordinal > 10000) throw new Error('ATTACHMENT_EXPORT_NAME_COLLISION_LIMIT');
      name = insertSuffix(base, ordinal++);
    }
    used.add(unsafeKey(name));
    const renamedForCollision = name !== base;
    return Object.freeze({
      id: String(item.id ?? 'attachment:' + index),
      originalName: sanitized.originalName,
      proposedSaveName: name,
      declaredMimeType: String(item.mimeType || ''),
      claimedContentType: 'unverified',
      requiresUserSaveApproval: true,
      overwriteAuthorized: false,
      reasons: Object.freeze([
        ...sanitized.reasons,
        ...(renamedForCollision ? ['collision-renamed'] : []),
      ]),
    });
  });
  return Object.freeze({
    schema: ATTACHMENT_EXPORT_NAME_SCHEMA,
    entries: Object.freeze(results),
    existingNamesEvidence: 'caller-provided-snapshot-only',
    destinationRecheckRequired: true,
    payloadIntegrity: 'not-checked',
    readyToWrite: false,
  });
}
