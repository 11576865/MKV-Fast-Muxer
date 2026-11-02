import {auditProducedAttachments} from './output-attachment-payload-audit.js';

// Preserve the established font-specific report and budget contract.
export function auditProducedFontAttachments(output, stagedFonts, {
  maxPerFontBytes = 32 * 1024 * 1024,
  maxTotalBytes = 64 * 1024 * 1024,
} = {}) {
  return auditProducedAttachments(output, stagedFonts, {
    maxPerAttachmentBytes:maxPerFontBytes, maxTotalBytes,
    label:'新字体', emptyEvidence:'no-new-font-attachments',
  });
}
