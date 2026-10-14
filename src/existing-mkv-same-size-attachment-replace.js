import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import {
  inspectRawSegmentPreservation, compareRawSegmentPreservation,
} from './matroska-raw-preservation-contract.js';

/**
 * P0/P2: byte-position-preserving edit of ONE existing AttachedFile/FileData.
 * NOT a general Matroska writer. Not valid for resized files, targeted
 * AttachmentUIDs, unknown top-level EBML, CRC-bearing ancestor masters,
 * unverified source layout, or output overwrite.
 */
export const SAME_SIZE_ATTACHMENT_REPLACE_SCHEMA =
  'existing-mkv-same-size-attachment-filedata-plan-v0';
const LIMIT_SOURCE = 60 * 1024 * 1024;
const LIMIT_FILEDATA = 4 * 1024 * 1024;
const ID = Object.freeze({ attachments: 0x1941a469, attachedFile: 0x61a7,
  fileData: 0x465c, crc: 0xbf });
const grants = new WeakMap();
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256(blob) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('SAME_SIZE_REPLACE_WEBCRYPTO_REQUIRED');
  return hex(new Uint8Array(await subtle.digest('SHA-256', await blob.arrayBuffer())));
}
const immutable = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(immutable);
    Object.freeze(x);
  }
  return x;
};
async function elementAt(file, offset, bound) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bound ||
      !Number.isSafeInteger(bound) || bound > file.size)
    throw Error('SAME_SIZE_REPLACE_BAD_RANGE');
  const bytes = new Uint8Array(await file.slice(offset, Math.min(bound, offset + 12)).arrayBuffer());
  if (!bytes[0]) throw Error('SAME_SIZE_REPLACE_MALFORMED_ID');
  let idWidth = 1;
  while (idWidth <= 4 && !(bytes[0] & (0x80 >> (idWidth - 1)))) idWidth++;
  if (idWidth > 4 || idWidth >= bytes.length) throw Error('SAME_SIZE_REPLACE_TRUNCATED_ID');
  let id = 0;
  for (let n = 0; n < idWidth; n++) id = id * 256 + bytes[n];
  const first = bytes[idWidth];
  if (!first) throw Error('SAME_SIZE_REPLACE_MALFORMED_SIZE');
  let width = 1;
  while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
  if (width > 8 || idWidth + width > bytes.length)
    throw Error('SAME_SIZE_REPLACE_TRUNCATED_SIZE');
  let size = BigInt(first & ((1 << (8 - width)) - 1));
  for (let n = 1; n < width; n++)
    size = (size << 8n) | BigInt(bytes[idWidth + n]);
  if (size === (1n << BigInt(width * 7)) - 1n ||
      size > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('SAME_SIZE_REPLACE_UNKNOWN_OR_LARGE_ELEMENT');
  const dataStart = offset + idWidth + width;
  const end = dataStart + Number(size);
  if (!Number.isSafeInteger(end) || end > bound)
    throw Error('SAME_SIZE_REPLACE_CHILD_OUT_OF_BOUNDS');
  return { id, offset, dataStart, end };
}
async function children(file, start, end) {
  const list = [];
  for (let cursor = start; cursor < end;) {
    if (list.length > 8192) throw Error('SAME_SIZE_REPLACE_CHILD_BUDGET');
    const child = await elementAt(file, cursor, end);
    list.push(child);
    cursor = child.end;
  }
  return list;
}
async function locateExactFileData(source, scan, item) {
  const masters = scan.elements.filter(e => e.id === '0x1941a469');
  if (masters.length !== 1)
    throw Error('SAME_SIZE_REPLACE_EXACT_ONE_ATTACHMENTS_MASTER_REQUIRED');
  const master = masters[0];
  const header = await elementAt(source, master.offset, master.offset + master.byteLength);
  if (header.id !== ID.attachments || header.end !== master.offset + master.byteLength)
    throw Error('SAME_SIZE_REPLACE_ATTACHMENTS_RANGE_INVALID');
  const attached = await children(source, header.dataStart, header.end);
  if (attached.some(x => x.id === ID.crc))
    throw Error('SAME_SIZE_REPLACE_ATTACHMENTS_CRC_UNSUPPORTED');
  if (attached.some(x => ![ID.attachedFile, 0xec].includes(x.id)))
    throw Error('SAME_SIZE_REPLACE_ATTACHMENTS_CHILD_UNKNOWN');
  const candidates = [];
  for (const el of attached.filter(x => x.id === ID.attachedFile)) {
    const members = await children(source, el.dataStart, el.end);
    if (members.some(x => x.id === ID.crc))
      throw Error('SAME_SIZE_REPLACE_ATTACHEDFILE_CRC_UNSUPPORTED');
    const data = members.filter(x => x.id === ID.fileData);
    if (data.length !== 1) throw Error('SAME_SIZE_REPLACE_FILEDATA_STRUCTURE_INVALID');
    candidates.push(data[0]);
  }
  const match = candidates.filter(x =>
    x.dataStart === item.dataRange.offset &&
    x.end - x.dataStart === item.dataRange.length);
  if (match.length !== 1)
    throw Error('SAME_SIZE_REPLACE_TARGET_FILEDATA_RANGE_UNVERIFIED');
  return { offset: match[0].dataStart, size: match[0].end - match[0].dataStart,
    masterOffset: master.offset, masterBytes: master.byteLength };
}
function acceptedInput(source, replacement, targetFileUid, review) {
  if (!review) throw Error('SAME_SIZE_REPLACE_EXPLICIT_REVIEW_REQUIRED');
  if (!source?.slice || !Number.isSafeInteger(source.size) ||
      source.size < 1 || source.size > LIMIT_SOURCE ||
      !replacement?.slice || !Number.isSafeInteger(replacement.size) ||
      replacement.size < 1 || replacement.size > LIMIT_FILEDATA)
    throw Error('SAME_SIZE_REPLACE_INPUT_BUDGET_REFUSED');
  if (typeof targetFileUid !== 'string' || !/^[1-9][0-9]{0,19}$/.test(targetFileUid))
    throw Error('SAME_SIZE_REPLACE_TARGET_UID_REQUIRED');
}
/** Review is required for every new plan. Only a real plan retains File grants. */
export async function prepareSameSizeAttachmentReplacement({
  source, replacement, targetFileUid, acknowledgeContentReplacement = false,
} = {}) {
  acceptedInput(source, replacement, targetFileUid, acknowledgeContentReplacement);
  const scan = await inspectRawSegmentPreservation(source);
  if (scan.state !== 'inspected' ||
      scan.segmentUnknownLength ||
      scan.coverage.unknownTopElementIds.length ||
      scan.elements.some(e => e.id === '0xbf'))
    throw Error('SAME_SIZE_REPLACE_SOURCE_RAW_OR_UNKNOWN_BLOCKED');
  if (scan.elements.filter(e => e.id === '0x1941a469').length !== 1 ||
      !scan.elements.some(e => e.id === '0x1654ae6b') ||
      !scan.elements.some(e => e.id === '0x1f43b675'))
    throw Error('SAME_SIZE_REPLACE_MEDIA_AND_ATTACHMENT_LAYOUT_REQUIRED');
  const reader = createMatroskaAttachmentReader(source);
  const inventory = await reader.inspect();
  if (inventory.state !== 'inspected' || !reader.isCurrentInspection(inventory) ||
      inventory.structure.attachmentElements !== 1 ||
      new Set(inventory.attachments.map(x => x.fileUid)).size !== inventory.attachments.length)
    throw Error('SAME_SIZE_REPLACE_INVENTORY_UNVERIFIED');
  const target = inventory.attachments.filter(x => x.fileUid === targetFileUid);
  if (target.length !== 1)
    throw Error('SAME_SIZE_REPLACE_TARGET_UID_NOT_UNIQUE');
  const item = target[0];
  if (item.byteLength !== replacement.size)
    throw Error('SAME_SIZE_REPLACE_LENGTH_MISMATCH');
  const graph = await reader.inspectRelations(inventory);
  if (!reader.isCurrentInspection(inventory) ||
      graph.state !== 'inspected' ||
      graph.coverage.tagTargets !== 'known-targets-enumerated')
    throw Error('SAME_SIZE_REPLACE_UID_GRAPH_UNVERIFIED');
  if (graph.edges.some(edge => edge.targetKind === 'attachment' &&
      edge.targetUid === targetFileUid))
    throw Error('SAME_SIZE_REPLACE_TARGETED_ATTACHMENT_UID_BLOCKED');
  const range = await locateExactFileData(source, scan, item);
  const sourceSha256 = await sha256(source);
  const priorFileDataSha256 = await sha256(reader.openAttachment(item.id).data);
  const replacementSha256 = await sha256(replacement);
  if (priorFileDataSha256 === replacementSha256)
    throw Error('SAME_SIZE_REPLACE_NO_CONTENT_CHANGE');
  if (!reader.isCurrentInspection(inventory) || await sha256(source) !== sourceSha256)
    throw Error('SAME_SIZE_REPLACE_SOURCE_CHANGED_DURING_REVIEW');
  const plan = immutable({
    schema: SAME_SIZE_ATTACHMENT_REPLACE_SCHEMA,
    state: 'REVIEWED_EXPERIMENTAL_NEW_COPY_PLAN',
    sourceName: String(source.name || 'source.mkv'),
    target: { fileUid: item.fileUid, filename: item.filename,
      mimeType: item.mimeType, byteLength: item.byteLength,
      rangeOffset: range.offset },
    evidence: { sourceSha256, priorFileDataSha256, replacementSha256,
      protectedSourceBytes: 'bounded-whole-raw-segment-evidence',
      targetUidReferences: 'independently-enumerated-none',
      writerCapability: 'same-length-existing-filedata-only',
      authorizesGeneralMatroskaWriter: false },
    execution: { originalFileOverwrite: false, autoDownload: false,
      externalCompatibilityProvedForUserFile: false },
  });
  grants.set(plan, { source, replacement, scan, inventory, target: item, range,
    sourceSha256, priorFileDataSha256, replacementSha256 });
  return plan;
}
export async function executeSameSizeAttachmentReplacement(plan) {
  if (plan?.schema !== SAME_SIZE_ATTACHMENT_REPLACE_SCHEMA ||
      !Object.isFrozen(plan) || !grants.has(plan))
    throw Error('SAME_SIZE_REPLACE_FORGED_OR_STALE_PLAN');
  const { source, replacement, scan, inventory, target, range, sourceSha256,
    priorFileDataSha256, replacementSha256 } = grants.get(plan);
  if (await sha256(source) !== sourceSha256 ||
      await sha256(replacement) !== replacementSha256 ||
      replacement.size !== range.size)
    throw Error('SAME_SIZE_REPLACE_INPUT_CHANGED_AFTER_PLAN');
  const output = new Blob([
    source.slice(0, range.offset), replacement,
    source.slice(range.offset + range.size),
  ], { type: 'application/octet-stream' });
  if (output.size !== source.size)
    throw Error('SAME_SIZE_REPLACE_OUTPUT_LENGTH_CHANGED');
  const candidateScan = await inspectRawSegmentPreservation(output);
  const comparison = compareRawSegmentPreservation(scan, candidateScan,
    { attachmentChangesRequested: true });
  if (comparison.state !== 'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF' ||
      !comparison.protectedTopLevelEqual || comparison.approvedToWrite ||
      !comparison.ebmlHeaderEqual || !comparison.segmentHeaderEqual ||
      candidateScan.state !== 'inspected' ||
      scan.elements.length !== candidateScan.elements.length ||
      scan.elements.some((el, i) => {
        const candidate = candidateScan.elements[i];
        return el.id !== candidate.id || el.offset !== candidate.offset ||
          el.byteLength !== candidate.byteLength ||
          (el.family === 'protected' && el.byteCommitment !== candidate.byteCommitment);
      }))
    throw Error('SAME_SIZE_REPLACE_PROTECTED_ELEMENTS_CHANGED');
  const outputReader = createMatroskaAttachmentReader(output);
  const observed = await outputReader.inspect();
  if (observed.state !== 'inspected' ||
      observed.attachments.length !== inventory.attachments.length)
    throw Error('SAME_SIZE_REPLACE_OUTPUT_INVENTORY_UNVERIFIED');
  const before = new Map(inventory.attachments.map(x => [x.fileUid, x]));
  for (const next of observed.attachments) {
    const orig = before.get(next.fileUid);
    if (!orig || next.id !== orig.id ||
        next.filename !== orig.filename ||
        next.mimeType !== orig.mimeType ||
        next.description !== orig.description ||
        next.byteLength !== orig.byteLength ||
        next.dataRange.offset !== orig.dataRange.offset)
      throw Error('SAME_SIZE_REPLACE_ORIGINAL_ATTACHMENT_METADATA_CHANGED');
    const digest = await sha256(outputReader.openAttachment(next.id).data);
    const expected = next.fileUid === target.fileUid ? replacementSha256 :
      await sha256(source.slice(orig.dataRange.offset,
        orig.dataRange.offset + orig.byteLength));
    if (digest !== expected)
      throw Error('SAME_SIZE_REPLACE_OUTPUT_ATTACHMENT_DATA_MISMATCH');
  }
  if (await sha256(source) !== sourceSha256 ||
      await sha256(replacement) !== replacementSha256 ||
      await sha256(source.slice(range.offset, range.offset + range.size)) !==
        priorFileDataSha256)
    throw Error('SAME_SIZE_REPLACE_INPUT_CHANGED_DURING_AUDIT');
  const outputSha256 = await sha256(output);
  const safeBase = String(source.name || 'source.mkv').split(/[\\/]/).pop()
    .replace(/\.(mkv|mka|mks|mk3d)$/i, '').replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 130) || 'Matroska';
  return Object.freeze({
    status: 'LOCAL_BYTE_AND_INVENTORY_VERIFIED_EXTERNAL_AUDIT_PENDING',
    filename: safeBase + '.one-filedata-replaced.experimental.mkv',
    output, evidence: Object.freeze({
      sourceSha256, outputSha256, priorFileDataSha256, replacementSha256,
      originalSourceUnmodified: true, originalOffsetsUnchanged: true,
      originalProtectedTopLevelByteCommitmentsMatch: true,
      originalAttachmentUidAndMetadataMatch: true,
      otherAttachedFileDataMatch: true, unreferencedTargetOnly: true,
      currentSourceExternallyAudited: false, generalWriter: false,
    }),
  });
}
