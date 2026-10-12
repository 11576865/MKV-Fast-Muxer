// Bounded *prefix evidence* for generic Matroska attachments.
// This is not a codec parser, full file validation, malware scan, or MIME proof.
export const ATTACHMENT_SIGNATURE_SCHEMA = 'attachment-prefix-observation-v0';
const MAX_PREFIX_BYTES = 64;
const signatures = Object.freeze([
  { id: 'png', label: 'PNG 文件头', mime: 'image/png', aliases: ['image/png'],
    prefix: [137, 80, 78, 71, 13, 10, 26, 10] },
  { id: 'jpeg', label: 'JPEG 文件头', mime: 'image/jpeg', aliases: ['image/jpeg', 'image/jpg'],
    prefix: [255, 216, 255] },
  { id: 'gif', label: 'GIF 文件头', mime: 'image/gif', aliases: ['image/gif'],
    ascii: 'GIF8' },
  { id: 'pdf', label: 'PDF 文件头', mime: 'application/pdf', aliases: ['application/pdf'],
    ascii: '%PDF-' },
  { id: 'zip', label: 'ZIP 文件头', mime: 'application/zip',
    aliases: ['application/zip', 'application/x-zip-compressed'],
    prefix: [80, 75, 3, 4] },
  { id: 'ttf', label: 'TrueType 文件头', mime: 'font/ttf',
    aliases: ['font/ttf', 'application/x-font-ttf'],
    prefix: [0, 1, 0, 0] },
  { id: 'otf', label: 'OpenType 文件头', mime: 'font/otf',
    aliases: ['font/otf', 'application/vnd.ms-opentype'],
    ascii: 'OTTO' },
  { id: 'woff', label: 'WOFF 文件头', mime: 'font/woff',
    aliases: ['font/woff', 'application/font-woff'],
    ascii: 'wOFF' },
  { id: 'woff2', label: 'WOFF2 文件头', mime: 'font/woff2',
    aliases: ['font/woff2'], ascii: 'wOF2' },
  { id: 'exe-mz', label: 'MZ 可执行文件头（初步）',
    mime: 'application/x-msdownload',
    aliases: ['application/x-msdownload', 'application/vnd.microsoft.portable-executable'],
    ascii: 'MZ' },
]);
function startsWith(bytes, prefix) {
  return bytes.length >= prefix.length &&
    prefix.every((byte, index) => bytes[index] === byte);
}
function prefixFor(sig) {
  return sig.prefix || [...sig.ascii].map(ch => ch.charCodeAt(0));
}
function cleanMime(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}
function result(fields) {
  return Object.freeze({
    schema: ATTACHMENT_SIGNATURE_SCHEMA,
    evidence: 'bounded-filedata-prefix',
    contentVerified: false,
    safeToOpen: 'unverified',
    ...fields,
  });
}

/**
 * Only declares a conflict if a *known signature* disagrees with the
 * container-declared type. Unknown text/JSON/other files remain "unknown".
 */
export function classifyAttachmentPrefix(bytes, declaredMimeType = '') {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const claimed = cleanMime(declaredMimeType);
  const found = signatures.find(sig => startsWith(input, prefixFor(sig)));
  if (!found) return result({
    state: 'unknown',
    signatureId: null,
    signatureLabel: null,
    observedMimeType: null,
    declaredMimeType: claimed,
    checkedBytes: input.length,
    warningCode: 'PREFIX_NOT_RECOGNIZED',
  });
  const matches = claimed && found.aliases.includes(claimed);
  const state = !claimed ? 'declared-missing' : matches ? 'prefix-matches' : 'prefix-mismatch';
  return result({
    state, signatureId: found.id, signatureLabel: found.label,
    observedMimeType: found.mime, declaredMimeType: claimed,
    checkedBytes: input.length,
    warningCode: state === 'prefix-mismatch' ? 'DECLARED_MIME_DISAGREES_WITH_PREFIX' : null,
  });
}

/**
 * Uses only a Blob.slice prefix; deliberately does not read the full attachment.
 * A rejected read returns an explicit failure instead of fabricating "match".
 */
export async function inspectAttachmentPrefix(reader, id) {
  const opened = reader.openAttachment(id);
  const size = Math.min(MAX_PREFIX_BYTES, opened.declaredSize);
  try {
    const bytes = new Uint8Array(await opened.data.slice(0, size).arrayBuffer());
    return classifyAttachmentPrefix(bytes, opened.mimeType);
  } catch {
    return result({
      state: 'read-failed',
      signatureId: null,
      signatureLabel: null,
      observedMimeType: null,
      declaredMimeType: cleanMime(opened.mimeType),
      checkedBytes: 0,
      warningCode: 'PREFIX_READ_FAILED',
    });
  }
}
