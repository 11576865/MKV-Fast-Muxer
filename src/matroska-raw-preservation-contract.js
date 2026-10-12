/**
 * P2 preserve-evidence v0: strictly read-only per-element byte commitments.
 * Not a Matroska writer, semantic equivalence judge, or write authorization.
 * Always report limitations involving offsets, references and unknown EBML.
 */
export const RAW_SEGMENT_CONTRACT_SCHEMA = 'matroska-raw-segment-contract-v0';
const IDS = Object.freeze({
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067,
  attachments: 0x1941a469, tracks: 0x1654ae6b,
  cluster: 0x1f43b675, chapters: 0x1043a770,
  tags: 0x1254c367, seekHead: 0x114d9b74, cues: 0x1c53bb6b,
  info: 0x1549a966, void: 0xec, crc: 0xbf,
});
const KNOWN = new Set(Object.values(IDS));
const MAX_BYTES = 64 * 1024 * 1024; // research-only; NOT a universal file limit
const CHUNK = 256 * 1024;
const MAX_HEADERS = 20000;
const freeze = object => {
  if (object && typeof object === 'object' && !Object.isFrozen(object)) {
    Object.values(object).forEach(freeze);
    Object.freeze(object);
  }
  return object;
};
const hex = bytes => Array.from(new Uint8Array(bytes))
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
function unverified(code) {
  return freeze({
    schema: RAW_SEGMENT_CONTRACT_SCHEMA,
    state: 'unverified', diagnostic: { code },
    elements: [], coverage: { byteCommitments: 'not-complete', writerSafety: 'not-proven' },
  });
}
async function readAt(blob, from, count) {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(count) ||
      from < 0 || count < 0 || from + count > blob.size) {
    throw Error('RAW_CONTRACT_RANGE_INVALID');
  }
  return new Uint8Array(await blob.slice(from, from + count).arrayBuffer());
}
async function header(blob, from, limit, counter) {
  if (++counter.count > MAX_HEADERS) throw Error('RAW_CONTRACT_HEADER_BUDGET');
  if (from >= limit) throw Error('RAW_CONTRACT_TRUNCATED_ELEMENT');
  const b = await readAt(blob, from, Math.min(12, limit - from));
  if (!b[0]) throw Error('RAW_CONTRACT_INVALID_ID');
  let idWidth = 1;
  while (idWidth <= 4 && !(b[0] & (0x80 >> (idWidth - 1)))) idWidth++;
  if (idWidth > 4 || idWidth >= b.length) throw Error('RAW_CONTRACT_ID_TRUNCATED');
  let id = 0;
  for (let i = 0; i < idWidth; i++) id = id * 256 + b[i];
  let sizeWidth = 1;
  const first = b[idWidth];
  if (!first) throw Error('RAW_CONTRACT_SIZE_INVALID');
  while (sizeWidth <= 8 && !(first & (0x80 >> (sizeWidth - 1)))) sizeWidth++;
  if (sizeWidth > 8 || idWidth + sizeWidth > b.length) {
    throw Error('RAW_CONTRACT_SIZE_TRUNCATED');
  }
  let n = BigInt(first & ((1 << (8 - sizeWidth)) - 1));
  for (let i = 1; i < sizeWidth; i++) n = (n << 8n) | BigInt(b[idWidth + i]);
  const unknown = n === (1n << BigInt(sizeWidth * 7)) - 1n;
  if (!unknown && n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw Error('RAW_CONTRACT_UNADDRESSABLE_SIZE');
  }
  const dataStart = from + idWidth + sizeWidth;
  const end = unknown ? null : dataStart + Number(n);
  if (end !== null && (!Number.isSafeInteger(end) || end > limit)) {
    throw Error('RAW_CONTRACT_ELEMENT_OUT_OF_BOUNDS');
  }
  return { id, from, dataStart, end, unknown };
}
function digestAPI() {
  const api = globalThis.crypto?.subtle;
  if (!api) throw Error('RAW_CONTRACT_WEBCRYPTO_REQUIRED');
  return api;
}
async function commitment(blob, start, end) {
  const api = digestAPI();
  const pieces = [];
  // Fixed-length chunks and an explicit content length form a deterministic
  // digest tree, NOT the SHA-256 digest of the entire raw EBML element.
  for (let offset = start; offset < end; offset += CHUNK) {
    const length = Math.min(CHUNK, end - offset);
    const hash = new Uint8Array(await api.digest('SHA-256',
      await readAt(blob, offset, length)));
    const record = new Uint8Array(4 + hash.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, length, false);
    record.set(hash, 4);
    pieces.push(record);
  }
  const data = new Uint8Array(8 + pieces.reduce((n, p) => n + p.length, 0));
  const view = new DataView(data.buffer);
  const length = BigInt(end - start);
  view.setUint32(0, Number(length >> 32n), false);
  view.setUint32(4, Number(length & 0xffffffffn), false);
  let at = 8;
  for (const record of pieces) { data.set(record, at); at += record.length; }
  return hex(await api.digest('SHA-256', data));
}
async function walk(blob, from, end, counter, callback) {
  for (let at = from; at < end;) {
    const el = await header(blob, at, end, counter);
    if (el.unknown) throw Error('RAW_CONTRACT_UNKNOWN_CHILD_SIZE');
    await callback(el);
    at = el.end;
  }
}
/**
 * Builds a bounded commitment to the real complete top-level Segment
 * element bytes (including unknown elements). No raw FileData is exported.
 * Large media is explicitly unsupported by this first evidence slice.
 */
export async function inspectRawSegmentPreservation(blob) {
  if (!blob?.slice || !Number.isSafeInteger(blob.size) || blob.size < 1) {
    return unverified('RAW_CONTRACT_SOURCE_INVALID');
  }
  if (blob.size > MAX_BYTES) return unverified('RAW_CONTRACT_SOURCE_OVER_64MIB_RESEARCH_BUDGET');
  try {
    const counter = { count: 0 };
    const ebml = await header(blob, 0, blob.size, counter);
    if (ebml.id !== IDS.ebml || ebml.unknown || ebml.end > 65536) {
      throw Error('RAW_CONTRACT_EBML_HEADER_INVALID');
    }
    let docType = null;
    await walk(blob, ebml.dataStart, ebml.end, counter, async el => {
      if (el.id === IDS.docType) {
        if (el.end - el.dataStart > 64) throw Error('RAW_CONTRACT_DOCTYPE_TOO_LONG');
        docType = new TextDecoder('utf-8', { fatal: true })
          .decode(await readAt(blob, el.dataStart, el.end - el.dataStart));
      }
    });
    if (docType !== 'matroska') throw Error('RAW_CONTRACT_DOCTYPE_NOT_MATROSKA');
    let segment = null;
    for (let at = ebml.end; at < blob.size;) {
      const el = await header(blob, at, blob.size, counter);
      if (el.id === IDS.segment) { segment = el; break; }
      if (el.unknown) throw Error('RAW_CONTRACT_UNKNOWN_PRESEGMENT_SIZE');
      at = el.end;
    }
    if (!segment) throw Error('RAW_CONTRACT_SEGMENT_MISSING');
    const end = segment.end ?? blob.size;
    if (end !== blob.size) throw Error('RAW_CONTRACT_TRAILING_OR_SECOND_SEGMENT');
    const elements = [];
    const unknownTopIds = new Set();
    await walk(blob, segment.dataStart, end, counter, async el => {
      const family = el.id === IDS.attachments ? 'attachments' : 'protected';
      const id = '0x' + el.id.toString(16);
      if (!KNOWN.has(el.id)) unknownTopIds.add(id);
      elements.push({
        ordinal: elements.length, id, family,
        offset: el.from, byteLength: el.end - el.from,
        byteCommitment: await commitment(blob, el.from, el.end),
      });
    });
    return freeze({
      schema: RAW_SEGMENT_CONTRACT_SCHEMA, state: 'inspected',
      sourceBytes: blob.size,
      ebmlHeaderCommitment: await commitment(blob, ebml.from, ebml.end),
      segmentHeaderCommitment: await commitment(blob, segment.from, segment.dataStart),
      segmentUnknownLength: segment.unknown,
      elements,
      coverage: {
        byteCommitments: 'all-top-level-element-bytes-within-64mib-budget',
        algorithm: 'sha256-of-fixed-256k-chunk-sha256-with-length-v0',
        unknownTopElementIds: [...unknownTopIds].sort(),
        headersVisited: counter.count,
        referencedOffsetsAndCues: 'unverified',
        contentSemantics: 'unverified',
        writerSafety: 'not-proven',
      },
    });
  } catch (error) {
    return unverified(error?.message || 'RAW_CONTRACT_INSPECTION_FAILED');
  }
}

/**
 * Necessary evidence only. A match CANNOT promote any real writer: SeekHead,
 * Cues, CRC, chapter/tag references, source identity and media packet semantics
 * still need separate independent audits for an authorized edit.
 */
export function compareRawSegmentPreservation(source, candidate, {
  attachmentChangesRequested = false,
} = {}) {
  if (source?.schema !== RAW_SEGMENT_CONTRACT_SCHEMA ||
      candidate?.schema !== RAW_SEGMENT_CONTRACT_SCHEMA ||
      source.state !== 'inspected' || candidate.state !== 'inspected') {
    return freeze({
      schema: 'matroska-preservation-comparison-v0', state: 'BLOCKED_UNVERIFIED',
      reasons: ['SOURCE_OR_CANDIDATE_NOT_FULLY_SCANNED'],
      approvedToWrite: false,
    });
  }
  const protectedOf = x => x.elements.filter(e => e.family === 'protected');
  const src = protectedOf(source), dst = protectedOf(candidate);
  const changedProtected = [];
  for (let i = 0; i < Math.max(src.length, dst.length); i++) {
    const a = src[i], b = dst[i];
    if (!a || !b || a.id !== b.id || a.byteLength !== b.byteLength ||
        a.byteCommitment !== b.byteCommitment) {
      changedProtected.push({
        index: i, sourceId: a?.id ?? null, candidateId: b?.id ?? null,
        sourceCommitment: a?.byteCommitment ?? null,
        candidateCommitment: b?.byteCommitment ?? null,
      });
    }
  }
  const a = source.elements.filter(e => e.family === 'attachments');
  const b = candidate.elements.filter(e => e.family === 'attachments');
  const attachmentDifference = a.length !== b.length ||
    a.some((item, i) => item.byteCommitment !== b[i]?.byteCommitment ||
      item.byteLength !== b[i]?.byteLength);
  const headerDifference = source.ebmlHeaderCommitment !== candidate.ebmlHeaderCommitment;
  const segmentHeaderDifference =
    source.segmentHeaderCommitment !== candidate.segmentHeaderCommitment;
  const noByteDelta = source.sourceBytes === candidate.sourceBytes &&
    !headerDifference && !segmentHeaderDifference &&
    !attachmentDifference && changedProtected.length === 0 &&
    source.elements.length === candidate.elements.length &&
    source.elements.every((item, i) =>
      item.id === candidate.elements[i].id &&
      item.byteCommitment === candidate.elements[i].byteCommitment);
  let state = 'PROTECTED_RAW_BYTES_MATCH_NOT_WRITE_AUTHORIZATION';
  if (headerDifference || changedProtected.length) state = 'BLOCKED_PROTECTED_BYTES_CHANGED';
  else if (attachmentDifference && !attachmentChangesRequested) {
    state = 'BLOCKED_UNREQUESTED_ATTACHMENT_DELTA';
  } else if (attachmentDifference || segmentHeaderDifference) {
    state = 'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF';
  }
  return freeze({
    schema: 'matroska-preservation-comparison-v0',
    state, approvedToWrite: false, writer: null,
    identicalScannedBytes: noByteDelta,
    protectedTopLevelEqual: !changedProtected.length,
    ebmlHeaderEqual: !headerDifference,
    segmentHeaderEqual: !segmentHeaderDifference,
    attachmentElementsEqual: !attachmentDifference,
    changedProtected,
    claim: 'raw-byte-commitments-only; not semantic equivalence or safe-writer proof',
    pending: [
      'reference-aware-existing-MKV-writer',
      'SeekHead/Cues/CRC/offset-structure-and-validity',
      'TrackUID/ChapterUID/AttachmentUID-target-relations',
      'independent-media-packet-and-attachment-byte-validation',
      'output-and-source-identity-and-save-transaction',
    ],
  });
}
