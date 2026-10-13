import {
  prepareExistingMkvAppendAttachmentCandidate,
  executeExistingMkvAppendAttachmentCandidate,
} from './existing-mkv-append-attachment-candidate.js';
import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';

// Deliberately narrow and experimental: it does NOT amend the general
// preservation preflight/FFmpeg path or turn a research EBML writer into one.
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
async function sha256(blob) {
  if (!blob?.arrayBuffer) throw Error('LIMITED_APPEND_BLOB_REQUIRED');
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',
    await blob.arrayBuffer())));
}
function safeOutputName(source) {
  const name = String(source?.name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '');
  const base = (name.replace(/\.(mkv|mka|mks|mk3d)$/i, '') || 'Matroska')
    .slice(0, 140).replace(/[. ]+$/, '');
  return (base || 'Matroska') + '.one-new-attachment.experimental.mkv';
}

/**
 * No source overwrite, automatic download or generalized eligibility.
 * A writer-generated candidate only becomes exportable after matching its
 * actual output FileData, MIME, UID and source byte identity. Semantic
 * confidence remains limited to externally tested source layout classes.
 */
export async function prepareVerifiedLimitedAppend({
  source, attachment, filename, mimeType, approveFilenameAdjustments = false,
} = {}) {
  const sourceOriginalHash = await sha256(source);
  const attachmentOriginalHash = await sha256(attachment);
  const plan = await prepareExistingMkvAppendAttachmentCandidate({
    source, attachment, filename, mimeType, approveFilenameAdjustments,
  });
  const candidate = await executeExistingMkvAppendAttachmentCandidate(plan);
  if (candidate.status !== 'CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT' ||
      candidate.output.size !== source.size ||
      !candidate.evidence.originalNonVoidElementByteCommitmentsAndOffsetsMatch ||
      !candidate.evidence.originalSeekHeadAndSegmentHeaderBytesUntouched ||
      !candidate.evidence.sourceTotalLengthUnchanged) {
    throw Error('LIMITED_APPEND_PROTECTED_SOURCE_CONTRACT_FAILED');
  }
  if (await sha256(source) !== sourceOriginalHash) {
    throw Error('LIMITED_APPEND_SOURCE_CHANGED');
  }
  if (await sha256(attachment) !== attachmentOriginalHash) {
    throw Error('LIMITED_APPEND_PAYLOAD_CHANGED');
  }

  const reader = createMatroskaAttachmentReader(candidate.output);
  const inventory = await reader.inspect();
  if (inventory.state !== 'inspected' || inventory.attachments.length !== 1 ||
      !inventory.structure.hasTracksElement || !inventory.structure.hasClusterElement) {
    throw Error('LIMITED_APPEND_OUTPUT_INVENTORY_UNVERIFIED');
  }
  const actual = inventory.attachments[0];
  if (actual.filename !== plan.addedAttachment.filename ||
      actual.mimeType.toLowerCase() !== plan.addedAttachment.mimeType ||
      actual.fileUid !== plan.addedAttachment.fileUid ||
      actual.byteLength !== attachment.size) {
    throw Error('LIMITED_APPEND_OUTPUT_ATTACHMENT_METADATA_MISMATCH');
  }
  if (await sha256(reader.openAttachment(actual.id).data) !== attachmentOriginalHash) {
    throw Error('LIMITED_APPEND_OUTPUT_FILEDATA_MISMATCH');
  }
  if (await sha256(source) !== sourceOriginalHash ||
      await sha256(attachment) !== attachmentOriginalHash) {
    throw Error('LIMITED_APPEND_INPUTS_CHANGED_DURING_AUDIT');
  }
  return Object.freeze({
    state: 'LIMITED_LOCAL_BYTES_VERIFIED_EXTERNAL_COMPATIBILITY_NOT_RECHECKED',
    filename: safeOutputName(source),
    output: candidate.output,
    sourceName: String(source.name || ''),
    attachedFilename: plan.addedAttachment.filename,
    evidence: Object.freeze({
      sourceSha256: sourceOriginalHash,
      attachmentSha256: attachmentOriginalHash,
      outputSha256: await sha256(candidate.output),
      byteLength: candidate.output.size,
      originalNonVoidBytesAndOffsetsUnchanged: true,
      originalSourceHashUnchanged: true,
      outputAttachedFileDataHashMatches: true,
      externalToolAuditForThisUserFile: false,
      generalWriter: false,
      originalFileModified: false,
    }),
  });
}
