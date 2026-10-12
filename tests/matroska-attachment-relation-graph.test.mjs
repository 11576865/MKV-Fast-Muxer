import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { createExistingAttachmentEditIntent } from '../src/existing-attachment-edit-intent.js';
import { pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';

const element = (id, data) => {
  const bytes = Buffer.from(data);
  const n = bytes.length;
  return Buffer.concat([
    Buffer.from(id, 'hex'),
    Buffer.from([0x10 | ((n >>> 24) & 0xf), n >>> 16 & 255, n >>> 8 & 255, n & 255]),
    bytes,
  ]);
};
const concat = (...parts) => Buffer.concat(parts);
function uint(n) {
  let value = BigInt(n);
  const bytes = [];
  do {
    bytes.unshift(Number(value & 255n));
    value >>= 8n;
  } while (value > 0n);
  return Buffer.from(bytes);
}
const attached = (uid, name) => element('61A7', concat(
  element('466E', Buffer.from(name)),
  element('4660', Buffer.from('image/png')),
  element('465C', pngBytes),
  element('46AE', uint(uid)),
));
function mkv({
  target = '7', extraTarget = null, unknownTarget = false,
  useHugeUid = false, addCluster = false, invalidTag = false,
} = {}) {
  const uid = useHugeUid ? '18446744073709551610' : '7';
  const attachments = element('1941A469', concat(
    attached(uid, 'selected.png'),
    attached(useHugeUid ? '18446744073709551611' : '8', 'decoy.png'),
  ));
  const fields = [
    element('63C6', uint(useHugeUid ? uid : target)),
    ...(extraTarget ? [element('63C6', uint(extraTarget))] : []),
    element('63C5', uint(90)),
    ...(unknownTarget ? [element('4ABC', Buffer.from([1]))] : []),
  ];
  const targets = element('63C0', concat(...fields));
  const tags = element('1254C367', element('7373',
    invalidTag ? element('63C0', Buffer.from([0])) : targets));
  const segment = element('18538067', concat(
    element('1549A966', element('2AD7B1', uint(1000000))),
    attachments,
    ...(addCluster ? [element('1F43B675', Buffer.alloc(900000, 0xab))] : []),
    tags,
  ));
  return concat(
    element('1A45DFA3', element('4282', Buffer.from('matroska'))),
    segment,
  );
}
const file = bytes => {
  const out = new Blob([bytes]);
  out.name = 'relations.mkv';
  out.lastModified = 1;
  return out;
};

test('exact FileUID Tag target resolves to only the matching attachment; decoy stays unrelated', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv({ addCluster: true })));
  const inventory = await reader.inspect();
  const graph = await reader.inspectRelations(inventory);
  assert.equal(graph.state, 'inspected');
  assert.equal(graph.tags.length, 1);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.coverage.fileDataBytesRead, 0);
  assert.equal(graph.coverage.tagTargets, 'known-targets-enumerated');
  assert.equal(graph.coverage.unknownEbmlPreservation, 'not-proven');
  assert.deepEqual(graph.edges.map(e => e.targetKind), ['attachment', 'track']);
  assert.equal(graph.edges[0].targetUid, '7');
  assert.equal(graph.edges[0].targetAttachmentId, 'attachment:0:uid:7');
  assert.equal(graph.edges[0].resolution, 'matched');
  assert.equal(graph.edges[1].resolution, 'outside-attachment-graph');
  assert.ok(Object.isFrozen(graph.edges[0]));
  assert.ok(Object.isFrozen(graph.nodes));
});

test('removing/replacing tagged attachment reports a precise dangling reference impact', async () => {
  for (const action of ['remove', 'replace']) {
    const reader = createMatroskaAttachmentReader(file(mkv()));
    const draft = await createExistingAttachmentEditIntent({
      reader, actions: [{
        type: action, attachmentId: 'attachment:0:uid:7',
        ...(action === 'replace' ? {
          file: file(Buffer.from('replacement')), mimeType: 'application/octet-stream',
          filename: 'replacement.bin',
        } : {}),
      }],
    });
    assert.equal(draft.impactSummary.targetedAttachmentCount, 1);
    assert.equal(draft.impactSummary.orphanedTagTargetCountIfApplied, 1);
    assert.equal(draft.proposedChanges.effects[0].tagImpact,
      'would-orphan-tag-attachment-uid');
    assert.deepEqual(draft.proposedChanges.effects[0].observedTargetedTags.map(x => x.uid), ['7']);
    assert.equal(draft.proposedChanges.effects[1].tagImpact,
      'no-targeted-tag-observed-not-proof-of-safety');
    assert.equal(draft.capability.code, 'SOURCE_UID_RELATIONS_UNVERIFIED');
    assert.equal(draft.execution.approvedToWrite, false);
  }
});

test('removing decoy does not break the observed tag edge but remains writer-blocked', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv()));
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: 'attachment:1:uid:8' }],
  });
  assert.equal(draft.impactSummary.orphanedTagTargetCountIfApplied, 0);
  assert.equal(draft.proposedChanges.effects[0].tagImpact, 'observed-target-is-retained');
  assert.equal(draft.execution.approvedToWrite, false);
  assert.equal(draft.capability.code, 'SOURCE_UID_RELATIONS_UNVERIFIED');
});

test('uint64 FileUID identity stays exact through graph and reference impact', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv({ useHugeUid: true })));
  const inventory = await reader.inspect();
  const graph = await reader.inspectRelations(inventory);
  assert.equal(graph.state, 'inspected');
  assert.equal(graph.edges[0].targetUid, '18446744073709551610');
  assert.equal(graph.edges[0].targetAttachmentId, 'attachment:0:uid:18446744073709551610');
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{
      type: 'remove', attachmentId: 'attachment:0:uid:18446744073709551610',
    }],
  });
  assert.equal(draft.impactSummary.orphanedTagTargetCountIfApplied, 1);
});

test('orphan attachment UID target is observed, not silently mapped to a decoy', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv({ target: '9999' })));
  const inventory = await reader.inspect();
  const graph = await reader.inspectRelations(inventory);
  assert.equal(graph.state, 'inspected');
  assert.equal(graph.edges[0].targetUid, '9999');
  assert.equal(graph.edges[0].targetAttachmentId, null);
  assert.equal(graph.edges[0].resolution, 'orphan');
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: inventory.attachments[0].id }],
  });
  assert.equal(draft.impactSummary.unresolvedTagTargetCount, 1);
  assert.equal(draft.execution.approvedToWrite, false);
});

test('unknown Targets fields preserve visible edges but mark graph incomplete and deny writing', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv({ unknownTarget: true })));
  const inventory = await reader.inspect();
  const graph = await reader.inspectRelations(inventory);
  assert.equal(graph.state, 'inspected');
  assert.equal(graph.coverage.tagTargets, 'incomplete-unknown-target-elements');
  assert.deepEqual(graph.coverage.unknownTargetElementIds, ['0x4abc']);
  assert.equal(graph.edges[0].targetUid, '7');
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: inventory.attachments[0].id }],
  });
  assert.equal(draft.capability.code, 'SOURCE_REFERENCE_GRAPH_UNVERIFIED');
  assert.equal(draft.execution.approvedToWrite, false);
});

test('malformed tag field fails closed instead of returning a false clean graph', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv({ invalidTag: true })));
  const snapshot = await reader.inspect();
  const graph = await reader.inspectRelations(snapshot);
  assert.equal(graph.state, 'unverified');
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: snapshot.attachments[0].id }],
  });
  assert.equal(draft.capability.code, 'SOURCE_REFERENCE_GRAPH_UNVERIFIED');
  assert.equal(draft.execution.approvedToWrite, false);
});

test('expired inspection cannot be used to request a new graph', async () => {
  const reader = createMatroskaAttachmentReader(file(mkv()));
  const first = await reader.inspect();
  await reader.inspect();
  assert.throws(() => reader.inspectRelations(first), /CURRENT_INSPECTION_REQUIRED/);
});

test('bounded parser skips FileData and Cluster payloads during graph inspection', async () => {
  const source = file(mkv({ addCluster: true }));
  const original = source.slice.bind(source);
  let bytesRequested = 0;
  source.slice = (start, end, ...rest) => {
    bytesRequested += end - start;
    return original(start, end, ...rest);
  };
  const reader = createMatroskaAttachmentReader(source);
  const snapshot = await reader.inspect();
  bytesRequested = 0;
  const graph = await reader.inspectRelations(snapshot);
  assert.equal(graph.state, 'inspected');
  assert.ok(bytesRequested < 20_000,
    'graph scanning must not load the media Cluster or FileData payload');
});
