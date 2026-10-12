import { createSourceAssetSession } from './source-asset-session.js';

// P2 bounded, seek-based *inspection*. Does not run FFmpeg, mutate the
// source, deserialize chapters/tags, or certify Matroska conformance.
export const ATTACHMENT_INVENTORY_SCHEMA = 'matroska-attachment-inventory-v0';
const ID = Object.freeze({
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067,
  tracks: 0x1654ae6b, cluster: 0x1f43b675, attachments: 0x1941a469,
  attachedFile: 0x61a7, fileName: 0x466e, mediaType: 0x4660,
  description: 0x467e, fileData: 0x465c, fileUid: 0x46ae,
});
const MAX_HEADERS = 40000;
const MAX_ATTACHMENTS = 1024;
const MAX_TEXT_BYTES = 4096;
const MAX_EBML_HEADER = 65536;
const decoder = new TextDecoder('utf-8', { fatal: true });

function freezePlain(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezePlain);
    Object.freeze(value);
  }
  return value;
}

async function readAt(file, offset, length) {
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(length) || length < 0 ||
      offset + length > file.size) throw new Error('EBML_RANGE_INVALID');
  return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}

// At most 12 header bytes are read, even if the EBML payload is gigabytes.
async function readElement(file, offset, parentEnd, budget) {
  if (++budget.headers > MAX_HEADERS) throw new Error('EBML_ELEMENT_BUDGET_EXCEEDED');
  if (offset >= parentEnd) throw new Error('EBML_HEADER_OUT_OF_BOUNDS');
  const bytes = await readAt(file, offset, Math.min(12, parentEnd - offset));
  const first = bytes[0];
  if (!first) throw new Error('EBML_ID_INVALID');
  let idWidth = 1;
  while (idWidth <= 4 && !(first & (0x80 >> (idWidth - 1)))) idWidth++;
  if (idWidth > 4 || idWidth >= bytes.length) throw new Error('EBML_ID_TRUNCATED');
  let id = 0;
  for (let i = 0; i < idWidth; i++) id = id * 256 + bytes[i];

  const sizeFirst = bytes[idWidth];
  if (!sizeFirst) throw new Error('EBML_SIZE_INVALID');
  let width = 1;
  while (width <= 8 && !(sizeFirst & (0x80 >> (width - 1)))) width++;
  if (width > 8 || idWidth + width > bytes.length) throw new Error('EBML_SIZE_TRUNCATED');
  let size = BigInt(sizeFirst & ((1 << (8 - width)) - 1));
  for (let i = 1; i < width; i++) {
    size = (size << 8n) | BigInt(bytes[idWidth + i]);
  }
  const unknown = size === (1n << BigInt(7 * width)) - 1n;
  const dataStart = offset + idWidth + width;
  if (!unknown && size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('EBML_SIZE_UNADDRESSABLE');
  }
  const end = unknown ? null : dataStart + Number(size);
  if (end !== null && (end > parentEnd || !Number.isSafeInteger(end))) {
    throw new Error('EBML_ELEMENT_OUT_OF_BOUNDS');
  }
  return { id, offset, dataStart, end, unknown };
}

async function visitChildren(file, from, to, budget, fn) {
  for (let at = from; at < to;) {
    const el = await readElement(file, at, to, budget);
    if (el.unknown) throw new Error('EBML_UNKNOWN_CHILD_SIZE');
    await fn(el);
    at = el.end;
  }
}

async function readText(file, el) {
  const size = el.end - el.dataStart;
  if (size > MAX_TEXT_BYTES) throw new Error('ATTACHMENT_TEXT_TOO_LARGE');
  return decoder.decode(await readAt(file, el.dataStart, size)).replace(/\u0000+$/, '');
}
async function readUid(file, el) {
  const size = el.end - el.dataStart;
  if (size < 1 || size > 8) throw new Error('ATTACHMENT_UID_INVALID');
  const data = await readAt(file, el.dataStart, size);
  let uid = 0n;
  for (const byte of data) uid = (uid << 8n) | BigInt(byte);
  return uid.toString();
}

async function inspectOneAttachment(file, el, ordinal, budget) {
  const fields = {};
  const seen = new Set();
  const mappings = new Map([
    [ID.fileName, 'filename'], [ID.mediaType, 'mimeType'],
    [ID.fileUid, 'fileUid'], [ID.fileData, 'fileData'],
    [ID.description, 'description'],
  ]);
  await visitChildren(file, el.dataStart, el.end, budget, async child => {
    const name = mappings.get(child.id);
    if (!name) return;
    if (seen.has(name)) throw new Error('ATTACHMENT_DUPLICATE_' + name.toUpperCase());
    seen.add(name);
    if (child.id === ID.fileData) {
      fields.rangeStart = child.dataStart;
      fields.byteLength = child.end - child.dataStart;
    } else if (child.id === ID.fileUid) {
      fields.fileUid = await readUid(file, child);
    } else {
      fields[name] = await readText(file, child);
    }
  });
  if (!fields.filename || !fields.mimeType || !fields.fileUid ||
      fields.rangeStart === undefined || fields.byteLength === undefined) {
    throw new Error('ATTACHMENT_REQUIRED_FIELD_MISSING');
  }
  return {
    id: 'attachment:' + ordinal + ':uid:' + fields.fileUid,
    ordinal, filename: fields.filename, mimeType: fields.mimeType,
    description: fields.description || '',
    fileUid: fields.fileUid,
    byteLength: fields.byteLength,
    dataRange: { offset: fields.rangeStart, length: fields.byteLength },
    evidence: 'raw-ebml-header-observed',
    hash: null,
    targetTagRelations: 'unverified',
  };
}

/**
 * Keep the source File/Blob only in the reader's closure; its public immutable
 * snapshot has an operation-local asset ID and observed EBML facts, not blobs.
 *
 * Does not assume any video/Tracks/Cluster; recognizes non-playing Matroska.
 * No output-write capability is implied.
 */
export function createMatroskaAttachmentReader(file, {
  sourceSession = createSourceAssetSession(),
} = {}) {
  const asset = sourceSession.register(file, { kind: 'container' });
  let latest = null;
  async function inspect() {
    const budget = { headers: 0 };
    const attachments = [];
    let hasTracks = false;
    let hasCluster = false;
    let attachmentElements = 0;
    try {
      const ebml = await readElement(file, 0, file.size, budget);
      if (ebml.id !== ID.ebml || ebml.unknown ||
          ebml.end > MAX_EBML_HEADER) throw new Error('EBML_HEADER_UNRECOGNIZED');
      let docType = '';
      await visitChildren(file, ebml.dataStart, ebml.end, budget, async child => {
        if (child.id === ID.docType) docType = await readText(file, child);
      });
      if (docType !== 'matroska') throw new Error('NOT_MATROSKA_DOCTYPE');
      let segment = null;
      for (let at = ebml.end; at < file.size;) {
        const el = await readElement(file, at, file.size, budget);
        if (el.id === ID.segment) { segment = el; break; }
        if (el.unknown) throw new Error('UNKNOWN_PRE_SEGMENT_SIZE');
        at = el.end;
      }
      if (!segment) throw new Error('MATROSKA_SEGMENT_MISSING');
      const end = segment.end ?? file.size;
      await visitChildren(file, segment.dataStart, end, budget, async el => {
        if (el.id === ID.tracks) hasTracks = true;
        if (el.id === ID.cluster) hasCluster = true;
        if (el.id !== ID.attachments) return;
        attachmentElements++;
        await visitChildren(file, el.dataStart, el.end, budget, async child => {
          if (child.id !== ID.attachedFile) return;
          if (attachments.length >= MAX_ATTACHMENTS) {
            throw new Error('ATTACHMENT_COUNT_BUDGET_EXCEEDED');
          }
          attachments.push(await inspectOneAttachment(
            file, child, attachments.length, budget,
          ));
        });
      });
      const inventory = freezePlain({
        schema: ATTACHMENT_INVENTORY_SCHEMA,
        state: 'inspected',
        source: asset,
        docType,
        structure: { hasTracksElement: hasTracks, hasClusterElement: hasCluster,
          attachmentElements, nonPlayingStructure: !hasTracks && !hasCluster },
        attachments,
        scanning: { headerCount: budget.headers, fileDataBytesRead: 0,
          dataMode: 'seek-only-no-filedata-read' },
        claims: { wholeEbmlPreservation: 'unverified',
          readerCompatibility: 'not-proven-by-this-inspector',
          playable: 'not-tested' },
      });
      latest = inventory;
      return inventory;
    } catch (error) {
      latest = null; // fail closed: do not extract from partially parsed input
      return freezePlain({
        schema: ATTACHMENT_INVENTORY_SCHEMA,
        state: 'unverified',
        source: asset,
        attachments: [],
        diagnostic: { code: error?.message || 'INSPECTION_FAILED' },
        claims: { wholeEbmlPreservation: 'unverified' },
      });
    }
  }

  function openAttachment(id) {
    if (!latest || !sourceSession.isCurrent(asset, file)) {
      throw new Error('ATTACHMENT_INSPECTION_REQUIRED');
    }
    const item = latest.attachments.find(x => x.id === id);
    if (!item) throw new Error('ATTACHMENT_NOT_FOUND');
    const { offset, length } = item.dataRange;
    // Blob.slice returns a view; no filedata bytes or output are preloaded.
    return Object.freeze({
      filename: item.filename, mimeType: item.mimeType,
      declaredSize: length,
      sourceAssetId: asset.id,
      data: file.slice(offset, offset + length, item.mimeType),
      integrity: 'not-hashed',
    });
  }
  return Object.freeze({ source: asset, inspect, openAttachment });
}
