// Bounded, read-only Matroska Tag Targets graph for attachment impact.
// The caller must tie this to its current source inspection. This module
// NEVER certifies complete EBML semantic preservation or writer capability.
export const ATTACHMENT_RELATION_GRAPH_SCHEMA = 'matroska-attachment-tag-relation-graph-v0';

const ID = Object.freeze({
  EBML: 0x1a45dfa3, DOCTYPE: 0x4282, SEGMENT: 0x18538067,
  TAGS: 0x1254c367, TAG: 0x7373, TARGETS: 0x63c0,
  ATTACHMENT_UID: 0x63c6, TRACK_UID: 0x63c5,
  CHAPTER_UID: 0x63c4, EDITION_UID: 0x63c9,
  TARGET_TYPE_VALUE: 0x68ca, TARGET_TYPE: 0x63ca,
  SIMPLE_TAG: 0x67c8, TRACKS: 0x1654ae6b,
  CLUSTER: 0x1f43b675, ATTACHMENTS: 0x1941a469,
  CHAPTERS: 0x1043a770, INFO: 0x1549a966,
  SEEK_HEAD: 0x114d9b74, CUES: 0x1c53bb6b,
  VOID: 0xec, CRC: 0xbf,
});
const UID_KINDS = new Map([
  [ID.ATTACHMENT_UID, 'attachment'],
  [ID.TRACK_UID, 'track'],
  [ID.CHAPTER_UID, 'chapter'],
  [ID.EDITION_UID, 'edition'],
]);
const TOP_KNOWN = new Set([
  ID.INFO, ID.SEEK_HEAD, ID.CUES, ID.TRACKS, ID.CLUSTER,
  ID.ATTACHMENTS, ID.CHAPTERS, ID.TAGS, ID.VOID, ID.CRC,
]);
const MAX_HEADERS = 50000;
const MAX_TAGS = 4096;
const MAX_EDGES = 8192;
const MAX_TARGET_PAYLOAD_BYTES = 8192;
const MAX_HEADER_BYTES = 65536;
const MAX_DOC_TYPE_BYTES = 64;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
async function bytesAt(file, start, count) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) ||
      start < 0 || count < 0 || start + count > file.size) {
    throw Error('RELATION_GRAPH_RANGE_INVALID');
  }
  return new Uint8Array(await file.slice(start, start + count).arrayBuffer());
}
async function header(file, start, limit, budget) {
  if (++budget.headers > MAX_HEADERS) throw Error('RELATION_GRAPH_ELEMENT_LIMIT');
  if (start >= limit) throw Error('RELATION_GRAPH_TRUNCATED');
  const bytes = await bytesAt(file, start, Math.min(12, limit - start));
  let idWidth = 1;
  if (!bytes[0]) throw Error('RELATION_GRAPH_ID_INVALID');
  while (idWidth <= 4 && !(bytes[0] & (0x80 >> (idWidth - 1)))) idWidth++;
  if (idWidth > 4 || idWidth >= bytes.length) throw Error('RELATION_GRAPH_ID_TRUNCATED');
  let id = 0;
  for (let i = 0; i < idWidth; i++) id = id * 256 + bytes[i];
  const first = bytes[idWidth];
  if (!first) throw Error('RELATION_GRAPH_SIZE_INVALID');
  let width = 1;
  while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
  if (width > 8 || idWidth + width > bytes.length) throw Error('RELATION_GRAPH_SIZE_TRUNCATED');
  let value = BigInt(first & ((1 << (8 - width)) - 1));
  for (let i = 1; i < width; i++) value = (value << 8n) | BigInt(bytes[idWidth + i]);
  const unknown = value === (1n << BigInt(7 * width)) - 1n;
  const dataStart = start + idWidth + width;
  if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('RELATION_GRAPH_SIZE_UNADDRESSABLE');
  const end = unknown ? null : dataStart + Number(value);
  if (end !== null && (end > limit || !Number.isSafeInteger(end))) {
    throw Error('RELATION_GRAPH_ELEMENT_OUT_OF_BOUNDS');
  }
  return { id, start, dataStart, end, unknown };
}
async function children(file, from, to, budget, callback) {
  for (let pos = from; pos < to;) {
    const child = await header(file, pos, to, budget);
    if (child.unknown) throw Error('RELATION_GRAPH_UNKNOWN_CHILD_SIZE');
    await callback(child);
    pos = child.end;
  }
}
async function uint64(file, item) {
  const length = item.end - item.dataStart;
  if (length < 1 || length > 8) throw Error('RELATION_GRAPH_UID_SIZE_INVALID');
  const data = await bytesAt(file, item.dataStart, length);
  let out = 0n;
  for (const byte of data) out = (out << 8n) | BigInt(byte);
  return out.toString();
}
function partial(code) {
  return freeze({
    schema: ATTACHMENT_RELATION_GRAPH_SCHEMA,
    state: 'unverified',
    diagnostic: { code },
    nodes: [], tags: [], edges: [],
    coverage: {
      tagTargets: 'unverified',
      unknownEbmlPreservation: 'not-proven',
      semanticWriteSafety: 'not-proven',
    },
  });
}

/**
 * Enumerates known Tag/Targets UID references without reading Cluster,
 * FileData, SimpleTag value payloads or entire source bytes. All decimal
 * UIDs stay exact strings (uint64). Unknown target children are diagnostics,
 * never silently treated as clean.
 */
export async function inspectMatroskaAttachmentRelations(file, inventory) {
  if (!file?.slice || !Number.isSafeInteger(file.size) ||
      inventory?.state !== 'inspected' || !Array.isArray(inventory.attachments)) {
    return partial('RELATION_GRAPH_SOURCE_OR_INVENTORY_INVALID');
  }
  try {
    const budget = { headers: 0 };
    const ebml = await header(file, 0, file.size, budget);
    if (ebml.id !== ID.EBML || ebml.unknown || ebml.end > MAX_HEADER_BYTES) {
      throw Error('RELATION_GRAPH_EBML_HEADER_INVALID');
    }
    let docType = null;
    await children(file, ebml.dataStart, ebml.end, budget, async child => {
      if (child.id === ID.DOCTYPE) {
        if (child.end - child.dataStart > MAX_DOC_TYPE_BYTES) {
          throw Error('RELATION_GRAPH_DOCTYPE_OVERSIZED');
        }
        docType = new TextDecoder('utf-8', { fatal: true })
          .decode(await bytesAt(file, child.dataStart, child.end - child.dataStart));
      }
    });
    if (docType !== 'matroska') throw Error('RELATION_GRAPH_NOT_MATROSKA');
    let segment = null;
    for (let pos = ebml.end; pos < file.size;) {
      const item = await header(file, pos, file.size, budget);
      if (item.id === ID.SEGMENT) { segment = item; break; }
      if (item.unknown) throw Error('RELATION_GRAPH_PRESEGMENT_UNKNOWN_SIZE');
      pos = item.end;
    }
    if (!segment) throw Error('RELATION_GRAPH_SEGMENT_MISSING');
    const nodes = inventory.attachments.map(item => ({
      attachmentId: item.id, fileUid: item.fileUid,
      filename: item.filename, ordinal: item.ordinal,
      evidence: 'same-reader-current-attachment-inventory',
    }));
    const byUid = new Map();
    for (const node of nodes) {
      if (byUid.has(node.fileUid)) throw Error('RELATION_GRAPH_DUPLICATE_SOURCE_UID');
      byUid.set(node.fileUid, node);
    }
    const tags = [];
    const edges = [];
    const unknownTopLevelIds = new Set();
    const unknownTargetIds = new Set();
    const tagId = index => 'source-tag:' + index;
    const parseTargets = async (target, ordinal) => {
      const fields = [];
      await children(file, target.dataStart, target.end, budget, async field => {
        const kind = UID_KINDS.get(field.id);
        if (!kind) {
          if (![ID.TARGET_TYPE, ID.TARGET_TYPE_VALUE].includes(field.id)) {
            unknownTargetIds.add('0x' + field.id.toString(16));
          }
          return;
        }
        if (field.end - field.dataStart > MAX_TARGET_PAYLOAD_BYTES) {
          throw Error('RELATION_GRAPH_TARGET_FIELD_TOO_LARGE');
        }
        const uid = await uint64(file, field);
        if (uid === '0') return; // non-targeting/global value, not a reference
        if (edges.length >= MAX_EDGES) throw Error('RELATION_GRAPH_EDGE_LIMIT');
        const match = kind === 'attachment' ? byUid.get(uid) : null;
        const edge = {
          id: 'source-tag-target:' + edges.length,
          sourceTagId: tagId(ordinal),
          targetKind: kind,
          targetUid: uid,
          targetAttachmentId: match?.attachmentId ?? null,
          resolution: kind !== 'attachment' ? 'outside-attachment-graph'
            : match ? 'matched' : 'orphan',
          evidence: 'raw-ebml-tags-targets-uid',
        };
        edges.push(edge);
        fields.push(edge.id);
      });
      return fields;
    };
    const parseTag = async item => {
      if (tags.length >= MAX_TAGS) throw Error('RELATION_GRAPH_TAG_LIMIT');
      const ordinal = tags.length;
      const references = [];
      let targetsCount = 0;
      await children(file, item.dataStart, item.end, budget, async field => {
        if (field.id !== ID.TARGETS) {
          if (![ID.SIMPLE_TAG, ID.VOID, ID.CRC].includes(field.id)) {
            unknownTargetIds.add('tag-child:0x' + field.id.toString(16));
          }
          return; // don't inspect SimpleTag payloads
        }
        targetsCount++;
        if (targetsCount > 1) throw Error('RELATION_GRAPH_DUPLICATE_TAG_TARGETS');
        references.push(...await parseTargets(field, ordinal));
      });
      tags.push({
        id: tagId(ordinal), ordinal,
        targetsElementObserved: targetsCount === 1,
        relationEdgeIds: references,
        interpretation: targetsCount === 0 ? 'no-targets-element' : 'targets-observed',
      });
    };
    const limit = segment.end ?? file.size;
    await children(file, segment.dataStart, limit, budget, async item => {
      if (!TOP_KNOWN.has(item.id)) unknownTopLevelIds.add('0x' + item.id.toString(16));
      if (item.id !== ID.TAGS) return;
      await children(file, item.dataStart, item.end, budget, async child => {
        if (child.id === ID.TAG) await parseTag(child);
        else if (![ID.VOID, ID.CRC].includes(child.id)) {
          unknownTargetIds.add('tags-child:0x' + child.id.toString(16));
        }
      });
    });
    if (segment.end !== null && segment.end < file.size) {
      unknownTopLevelIds.add('trailing-after-segment');
    }
    return freeze({
      schema: ATTACHMENT_RELATION_GRAPH_SCHEMA,
      state: 'inspected',
      nodes, tags, edges,
      coverage: {
        tagTargets: unknownTargetIds.size || unknownTopLevelIds.size
          ? 'incomplete-unknown-target-elements' : 'known-targets-enumerated',
        unknownTargetElementIds: [...unknownTargetIds].sort(),
        unknownTopLevelElementIds: [...unknownTopLevelIds].sort(),
        unknownEbmlPreservation: 'not-proven',
        semanticWriteSafety: 'not-proven',
        elementsVisited: budget.headers,
        fileDataBytesRead: 0,
      },
    });
  } catch (err) {
    return partial(err?.message || 'RELATION_GRAPH_SCAN_FAILED');
  }
}
