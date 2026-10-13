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
function safeOutputName(source, count = 1) {
  const name = String(source?.name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '');
  const base = (name.replace(/\.(mkv|mka|mks|mk3d)$/i, '') || 'Matroska')
    .slice(0, 140).replace(/[. ]+$/, '');
  return (base || 'Matroska') + (count === 1
    ? '.one-new-attachment.experimental.mkv' : '.multiple-new-attachments.experimental.mkv');
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
  return prepareVerifiedLimitedAppendMultiple({
    source,
    attachments: [{ file: attachment, filename, mimeType }],
    approveFilenameAdjustments,
  });
}

/** Compatible with the single-attachment path; one bounded Attachments master. */
export async function prepareVerifiedLimitedAppendMultiple({
  source, attachments, approveFilenameAdjustments = false,
} = {}) {
  const items = Array.from(attachments || []);
  // Enforce source and aggregate payload limits *before any whole-file read*.
  if (!source?.slice || !Number.isSafeInteger(source.size) || source.size < 1 ||
      source.size > 60 * 1024 * 1024 ||
      items.length < 1 || items.length > 8 ||
      items.some(item => !item?.file?.slice ||
        !Number.isSafeInteger(item.file.size) ||
        item.file.size < 1 || item.file.size > 4 * 1024 * 1024) ||
      items.reduce((total, item) => total + item.file.size, 0) > 4 * 1024 * 1024) {
    throw Error('LIMITED_APPEND_INPUT_BUDGET_REFUSED_BEFORE_READ');
  }
  const sourceOriginalHash = await sha256(source);
  const attachmentOriginalHashes = await Promise.all(items.map(item => sha256(item.file)));
  const plan = await prepareExistingMkvAppendAttachmentCandidate({
    source, attachments: items, approveFilenameAdjustments,
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
  for (let i = 0; i < items.length; i++) {
    if (await sha256(items[i].file) !== attachmentOriginalHashes[i]) {
      throw Error('LIMITED_APPEND_PAYLOAD_CHANGED');
    }
  }

  const reader = createMatroskaAttachmentReader(candidate.output);
  const inventory = await reader.inspect();
  if (inventory.state !== 'inspected' ||
      inventory.attachments.length !== items.length ||
      !inventory.structure.hasTracksElement || !inventory.structure.hasClusterElement) {
    throw Error('LIMITED_APPEND_OUTPUT_INVENTORY_UNVERIFIED');
  }
  for (let i = 0; i < items.length; i++) {
    const wanted = plan.addedAttachments[i];
    const found = inventory.attachments.filter(item => item.fileUid === wanted.fileUid);
    if (found.length !== 1 ||
        found[0].filename !== wanted.filename ||
        found[0].mimeType.toLowerCase() !== wanted.mimeType ||
        found[0].byteLength !== items[i].file.size) {
      throw Error('LIMITED_APPEND_OUTPUT_ATTACHMENT_METADATA_MISMATCH');
    }
    if (await sha256(reader.openAttachment(found[0].id).data) !== attachmentOriginalHashes[i]) {
      throw Error('LIMITED_APPEND_OUTPUT_FILEDATA_MISMATCH');
    }
  }
  if (await sha256(source) !== sourceOriginalHash) {
    throw Error('LIMITED_APPEND_INPUTS_CHANGED_DURING_AUDIT');
  }
  for (let i = 0; i < items.length; i++) {
    if (await sha256(items[i].file) !== attachmentOriginalHashes[i]) {
      throw Error('LIMITED_APPEND_INPUTS_CHANGED_DURING_AUDIT');
    }
  }
  const result = {
    state: 'LIMITED_LOCAL_BYTES_VERIFIED_EXTERNAL_COMPATIBILITY_NOT_RECHECKED',
    filename: safeOutputName(source, items.length),
    output: candidate.output,
    sourceName: String(source.name || ''),
    attachedFilename: plan.addedAttachments[0].filename,
    attachedFilenames: Object.freeze(plan.addedAttachments.map(item => item.filename)),
    evidence: Object.freeze({
      sourceSha256: sourceOriginalHash,
      attachmentSha256: attachmentOriginalHashes[0],
      attachmentSha256s: Object.freeze([...attachmentOriginalHashes]),
      outputSha256: await sha256(candidate.output),
      byteLength: candidate.output.size,
      verifiedAttachmentCount: items.length,
      originalNonVoidBytesAndOffsetsUnchanged: true,
      originalSourceHashUnchanged: true,
      outputAttachedFileDataHashMatches: true,
      externalToolAuditForThisUserFile: false,
      generalWriter: false,
      originalFileModified: false,
    }),
  };
  return Object.freeze(result);
}
