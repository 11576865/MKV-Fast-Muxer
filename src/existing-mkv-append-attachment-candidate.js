import { planAttachmentExportNames } from './attachment-export-policy.js';
import {
  inspectRawSegmentPreservation, compareRawSegmentPreservation,
} from './matroska-raw-preservation-contract.js';
import { inspectMatroskaPreservation } from './preservation-preflight.js';

export const APPEND_EXISTING_ATTACHMENT_SCHEMA =
  'existing-mkv-append-one-attachment-research-plan-v0';
const bindings = new WeakMap();
const encoder = new TextEncoder();
const ID = { ebml: 0x1a45dfa3, segment: 0x18538067 };
const MAX_SOURCE = 60 * 1024 * 1024;
const MAX_PAYLOAD = 4 * 1024 * 1024;
const mimetypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
};
const idBytes = hex => Uint8Array.from(hex.match(/.{2}/g).map(x => parseInt(x, 16)));
function vint(value, fixedWidth = null) {
  let size = BigInt(value);
  if (size < 0n) throw Error('APPEND_VINT_NEGATIVE');
  let width = fixedWidth;
  if (width === null) {
    for (width = 1; width <= 8; width++) {
      if (size < (1n << BigInt(width * 7)) - 1n) break;
    }
  }
  if (!Number.isInteger(width) || width < 1 || width > 8 ||
      size >= (1n << BigInt(width * 7)) - 1n) {
    throw Error('APPEND_SEGMENT_SIZE_VINT_CAPACITY_EXCEEDED');
  }
  const result = new Uint8Array(width);
  size |= 1n << BigInt(width * 7);
  for (let i = width - 1; i >= 0; i--) {
    result[i] = Number(size & 255n);
    size >>= 8n;
  }
  return result;
}
function unsigned(number) {
  let n = BigInt(number);
  const values = [];
  do {
    values.unshift(Number(n & 255n));
    n >>= 8n;
  } while (n > 0n);
  return Uint8Array.from(values);
}
const element = (id, payload) => {
  const value = payload instanceof Blob ? payload : new Blob([payload]);
  return new Blob([idBytes(id), vint(value.size), value]);
};
const str = (id, value) => element(id, encoder.encode(value));
const uint = (id, value) => element(id, unsigned(value));

async function sourceHeader(source, scan) {
  const prefix = new Uint8Array(await source.slice(0, 12).arrayBuffer());
  if (prefix.length < 6) throw Error('APPEND_EBML_PREFIX_TRUNCATED');
  let id = ((prefix[0] << 24) >>> 0) + (prefix[1] << 16) +
    (prefix[2] << 8) + prefix[3];
  if (id !== ID.ebml) throw Error('APPEND_EBML_ID_MISSING');
  function sizeAt(bytes, pos) {
    const first = bytes[pos];
    if (!first) throw Error('APPEND_VINT_INVALID');
    let width = 1;
    while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
    if (width > 8 || pos + width > bytes.length) {
      throw Error('APPEND_VINT_TRUNCATED');
    }
    let result = BigInt(first & ((1 << (8 - width)) - 1));
    for (let i = 1; i < width; i++) {
      result = (result << 8n) | BigInt(bytes[pos + i]);
    }
    return { width, value: result,
      unknown: result === (1n << BigInt(width * 7)) - 1n };
  }
  const ebmlLength = sizeAt(prefix, 4);
  if (ebmlLength.unknown || ebmlLength.value > 65536n) {
    throw Error('APPEND_EBML_HEADER_NOT_BOUNDED');
  }
  const segmentStart = 4 + ebmlLength.width + Number(ebmlLength.value);
  const hdr = new Uint8Array(await source.slice(segmentStart, segmentStart + 12)
    .arrayBuffer());
  if (hdr.length < 6) throw Error('APPEND_SEGMENT_HEADER_TRUNCATED');
  id = ((hdr[0] << 24) >>> 0) + (hdr[1] << 16) +
    (hdr[2] << 8) + hdr[3];
  if (id !== ID.segment) throw Error('APPEND_SEGMENT_NOT_IMMEDIATELY_AFTER_EBML');
  const segmentSize = sizeAt(hdr, 4);
  if (segmentSize.unknown) throw Error('APPEND_UNKNOWN_SEGMENT_LENGTH_UNSUPPORTED');
  const bodyStart = segmentStart + 4 + segmentSize.width;
  const bytes = source.size - bodyStart;
  if (segmentSize.value !== BigInt(bytes) ||
      scan.elements[0]?.offset !== bodyStart) {
    throw Error('APPEND_SEGMENT_SIZE_OR_CHILD_LAYOUT_INCONSISTENT');
  }
  return { segmentStart, bodyStart,
    sizeWidth: segmentSize.width, oldBodyBytes: bytes };
}

/**
 * Only for an existing small Matroska with Tracks + Cluster but absolutely
 * NO existing Attachments and no unknown top-level children/Segment CRC.
 * Creates a NEW candidate Blob. No UI, download, source mutation or
 * production capability grant.
 */
export async function prepareExistingMkvAppendAttachmentCandidate({
  source, attachment, filename, mimeType, approveFilenameAdjustments = false,
} = {}) {
  if (!source?.slice || !Number.isSafeInteger(source.size) ||
      source.size < 1 || source.size > MAX_SOURCE ||
      !attachment?.slice || !Number.isSafeInteger(attachment.size) ||
      attachment.size < 1 || attachment.size > MAX_PAYLOAD) {
    throw Error('APPEND_SOURCE_OR_PAYLOAD_BUDGET_INVALID');
  }
  const declaredType = String(mimeType || '').trim().toLowerCase();
  if (!mimetypePattern.test(declaredType) || declaredType.length > 100) {
    throw Error('APPEND_MIME_DECLARATION_INVALID');
  }
  const proposal = planAttachmentExportNames([{
    id: 'new:0', filename: String(filename ?? attachment.name ?? ''),
    mimeType: declaredType,
  }]).entries[0];
  if (proposal.originalName !== proposal.proposedSaveName &&
      !approveFilenameAdjustments) {
    throw Error('APPEND_FILENAME_REVIEW_REQUIRED');
  }
  const sourceScan = await inspectRawSegmentPreservation(source);
  if (sourceScan.state !== 'inspected') {
    throw Error('APPEND_SOURCE_RAW_SCAN_UNVERIFIED:' + sourceScan.diagnostic?.code);
  }
  const ids = sourceScan.elements.map(x => x.id);
  if (!ids.includes('0x1654ae6b') || !ids.includes('0x1f43b675')) {
    throw Error('APPEND_MEDIA_TRACKS_AND_CLUSTER_REQUIRED');
  }
  if (ids.includes('0x1941a469')) throw Error('APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED');
  if (ids.includes('0xbf')) throw Error('APPEND_SEGMENT_CRC_NOT_SUPPORTED');
  if (sourceScan.coverage.unknownTopElementIds.length) {
    throw Error('APPEND_UNKNOWN_TOP_LEVEL_ELEMENT_NOT_SUPPORTED');
  }
  const header = await sourceHeader(source, sourceScan);
  const preflight = await inspectMatroskaPreservation(source);
  if (preflight.state === 'BLOCKED_UNKNOWN' || preflight.state === 'NOT_MATROSKA') {
    throw Error('APPEND_P0_SOURCE_UNVERIFIED');
  }
  const plan = freeze({
    schema: APPEND_EXISTING_ATTACHMENT_SCHEMA,
    mode: 'experimental-new-copy-only',
    state: 'PLAN_ONLY_NOT_PRODUCT_APPROVED',
    input: {
      sourceSize: source.size,
      rawScanByteCoverage: sourceScan.coverage.byteCommitments,
      originalElementCount: sourceScan.elements.length,
      originalUidAndChaptersPreservation: 'requires-independent-candidate-audit',
      preflightState: preflight.state,
    },
    addedAttachment: {
      filename: proposal.proposedSaveName,
      originalFilename: proposal.originalName,
      filenameAdjusted: proposal.originalName !== proposal.proposedSaveName,
      mimeType: declaredType, byteLength: attachment.size,
      fileUid: '1', // no AttachedFile exists in permitted source Segment
      mimeAuthenticity: 'not-tested', executableSafety: 'not-tested',
    },
    output: {
      filename: 'append-one-attachment-research-candidate.mkv',
      sourceBytesReusedWithoutModification: true,
      writerProof: 'not-proven',
      outputPublicationAuthorized: false,
    },
    execution: { approvedToWriteExistingFile: false, autoDownload: false },
  });
  bindings.set(plan, { source, attachment, sourceScan, header });
  return plan;
}

export async function executeExistingMkvAppendAttachmentCandidate(plan) {
  if (plan?.schema !== APPEND_EXISTING_ATTACHMENT_SCHEMA ||
      !Object.isFrozen(plan) || !bindings.has(plan)) {
    throw Error('APPEND_CANDIDATE_PLAN_FORGED_OR_STALE');
  }
  const { source, attachment, sourceScan, header } = bindings.get(plan);
  const newAttachedFile = element('61A7', new Blob([
    str('466E', plan.addedAttachment.filename),
    str('4660', plan.addedAttachment.mimeType),
    element('465C', attachment),
    uint('46AE', 1),
  ]));
  const attachments = element('1941A469', newAttachedFile);
  if (source.size + attachments.size > 64 * 1024 * 1024) {
    throw Error('APPEND_CANDIDATE_TOTAL_RESEARCH_BUDGET');
  }
  const newSize = header.oldBodyBytes + attachments.size;
  const newSizeBytes = vint(newSize, header.sizeWidth);
  const output = new Blob([
    source.slice(0, header.segmentStart + 4),
    newSizeBytes,
    source.slice(header.bodyStart),
    attachments,
  ], { type: 'application/octet-stream' });
  const candidateScan = await inspectRawSegmentPreservation(output);
  const compared = compareRawSegmentPreservation(sourceScan, candidateScan, {
    attachmentChangesRequested: true,
  });
  if (compared.state !== 'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF' ||
      !compared.protectedTopLevelEqual || compared.approvedToWrite ||
      candidateScan.elements.at(-1)?.id !== '0x1941a469') {
    throw Error('APPEND_ORIGINAL_PROTECTED_BYTES_NOT_PRESERVED');
  }
  return Object.freeze({
    schema: 'existing-mkv-append-attachment-candidate-artifact-v0',
    status: 'CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT',
    filename: plan.output.filename, output, byteLength: output.size,
    sourceBytesRemainUntouched: true,
    rawComparison: compared,
    evidence: Object.freeze({
      sourceByteCommitmentsMatch: true,
      externalMkvmerge: 'not-yet-run',
      externalMkvextract: 'not-yet-run',
      chapterTagRelations: 'not-yet-verified',
      seekOffsetsAndCues: 'not-yet-independently-verified',
      generalExistingMkvWriter: false,
    }),
  });
}
