import { planAttachmentExportNames } from './attachment-export-policy.js';
import {
  inspectRawSegmentPreservation, compareRawSegmentPreservation,
} from './matroska-raw-preservation-contract.js';
import { inspectMatroskaPreservation } from './preservation-preflight.js';
import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';

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
const makeAttachment = (name, type, payload) => element('1941A469',
  element('61A7', new Blob([
    str('466E', name), str('4660', type),
    element('465C', payload), uint('46AE', 1),
  ])));
// Encode a replacement Void with EXACTLY the remaining original slot bytes,
// not a changed offset for the following Info/Tracks/Cluster/Chapters/Tags.
function replacementVoid(totalBytes) {
  for (let width = 1; width <= 8; width++) {
    const payloadSize = totalBytes - 1 - width;
    if (payloadSize >= 0 &&
        BigInt(payloadSize) < (1n << BigInt(width * 7)) - 1n) {
      return new Blob([Uint8Array.of(0xec), vint(payloadSize, width),
        new Uint8Array(payloadSize)]);
    }
  }
  throw Error('APPEND_VOID_REMAINDER_UNENCODABLE');
}

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
  // A previously orphaned TagAttachmentUID must not silently become a valid
  // relationship merely because the added AttachedFile receives FileUID=1.
  const reader = createMatroskaAttachmentReader(source);
  const inventory = await reader.inspect();
  if (inventory.state !== 'inspected' || inventory.attachments.length !== 0) {
    throw Error('APPEND_SOURCE_ATTACHMENT_INVENTORY_UNVERIFIED');
  }
  const graph = await reader.inspectRelations(inventory);
  if (graph.state !== 'inspected' ||
      graph.coverage.tagTargets !== 'known-targets-enumerated') {
    throw Error('APPEND_TAG_TARGET_GRAPH_UNVERIFIED');
  }
  if (graph.edges.some(edge => edge.targetKind === 'attachment')) {
    throw Error('APPEND_SOURCE_ATTACHMENT_UID_TARGET_EXISTS');
  }
  const header = await sourceHeader(source, sourceScan);
  // SeekHead is retained byte-exactly. Replacing a *pre-Info* Void slot
  // preserves every existing EBML child byte offset. A tail append proved
  // insufficient for discovery by external MKVToolNix on independent source.
  const prefixIds = sourceScan.elements.slice(0, 3).map(x => x.id);
  if (prefixIds[0] !== '0x114d9b74' ||
      prefixIds[1] !== '0xec' || prefixIds[2] !== '0x1549a966') {
    throw Error('APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED');
  }
  const slot = sourceScan.elements[1];
  const requiredElement = makeAttachment(
    proposal.proposedSaveName, declaredType, attachment);
  if (slot.byteLength < requiredElement.size + 2) {
    throw Error('APPEND_VOID_SLOT_CAPACITY_EXCEEDED');
  }
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
      sourceTagUidCoverage: graph.coverage.tagTargets,
      observedAttachmentTagTargetCount: 0,
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
      filename: 'reserved-void-one-attachment-research-candidate.mkv',
      originalFileByteLengthPreserved: true,
      originalSegmentSizeHeaderPreserved: true,
      originalNonVoidElementOffsetsPreserved: true,
      consumedVoidOffset: slot.offset,
      consumedVoidBytes: slot.byteLength,
      untouchedOriginalVoidBytes: false,
      writerProof: 'not-proven',
      outputPublicationAuthorized: false,
    },
    execution: { approvedToWriteExistingFile: false, autoDownload: false },
  });
  bindings.set(plan, { source, attachment, sourceScan, header, slot });
  return plan;
}

export async function executeExistingMkvAppendAttachmentCandidate(plan) {
  if (plan?.schema !== APPEND_EXISTING_ATTACHMENT_SCHEMA ||
      !Object.isFrozen(plan) || !bindings.has(plan)) {
    throw Error('APPEND_CANDIDATE_PLAN_FORGED_OR_STALE');
  }
  const { source, attachment, sourceScan, slot } = bindings.get(plan);
  const attachedMaster = makeAttachment(
    plan.addedAttachment.filename, plan.addedAttachment.mimeType, attachment);
  const remaining = slot.byteLength - attachedMaster.size;
  if (remaining < 2) throw Error('APPEND_VOID_SLOT_CAPACITY_EXCEEDED');
  const tailVoid = replacementVoid(remaining);
  if (tailVoid.size !== remaining) throw Error('APPEND_VOID_LENGTH_MISMATCH');
  const output = new Blob([
    source.slice(0, slot.offset),
    attachedMaster,
    tailVoid,
    source.slice(slot.offset + slot.byteLength),
  ], { type: 'application/octet-stream' });
  if (output.size !== source.size) throw Error('APPEND_OUTPUT_SOURCE_LENGTH_DIFFER');
  const candidateScan = await inspectRawSegmentPreservation(output);
  const rawComparison = compareRawSegmentPreservation(sourceScan, candidateScan, {
    attachmentChangesRequested: true,
  });
  // The strict v0 comparator MUST report protected changes because the
  // former Void is deliberately consumed. Never override its result to
  // "all protected equal". Instead compare all other original elements
  // by original absolute offset, EBML ID, byte length and commitment.
  if (rawComparison.state !== 'BLOCKED_PROTECTED_BYTES_CHANGED' ||
      rawComparison.approvedToWrite || candidateScan.state !== 'inspected' ||
      sourceScan.ebmlHeaderCommitment !== candidateScan.ebmlHeaderCommitment ||
      sourceScan.segmentHeaderCommitment !== candidateScan.segmentHeaderCommitment) {
    throw Error('APPEND_RAW_VOID_REPLACEMENT_CONTRACT_INVALID');
  }
  const beforeProtected = sourceScan.elements.filter(el => el.id !== '0xec');
  const afterProtected = candidateScan.elements.filter(el =>
    el.id !== '0xec' && el.id !== '0x1941a469');
  if (beforeProtected.length !== afterProtected.length ||
      beforeProtected.some((before, i) => {
        const after = afterProtected[i];
        return before.id !== after.id || before.offset !== after.offset ||
          before.byteLength !== after.byteLength ||
          before.byteCommitment !== after.byteCommitment;
      })) {
    throw Error('APPEND_ORIGINAL_NONVOID_ELEMENTS_CHANGED');
  }
  if (candidateScan.elements.filter(el => el.id === '0x1941a469').length !== 1 ||
      candidateScan.elements.find(el => el.id === '0x1941a469')?.offset !== slot.offset) {
    throw Error('APPEND_ATTACHMENT_NOT_EXACT_VOID_SLOT');
  }
  return Object.freeze({
    schema: 'existing-mkv-append-attachment-candidate-artifact-v0',
    status: 'CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT',
    filename: plan.output.filename,
    output,
    byteLength: output.size,
    sourceBytesRemainUntouched: true,
    rawComparison,
    evidence: Object.freeze({
      originalNonVoidElementByteCommitmentsAndOffsetsMatch: true,
      originalVoidConsumedAsAuthorizedResearchChange: true,
      sourceTotalLengthUnchanged: true,
      originalSeekHeadAndSegmentHeaderBytesUntouched: true,
      externalMkvmerge: 'not-yet-run',
      externalMkvextract: 'not-yet-run',
      chapterTagRelations: 'not-yet-verified',
      seekOffsetsAndCues: 'not-yet-independently-verified',
      generalExistingMkvWriter: false,
    }),
  });
}
