import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchFixture, pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import {
  inspectRawSegmentPreservation, compareRawSegmentPreservation,
  RAW_SEGMENT_CONTRACT_SCHEMA,
} from '../src/matroska-raw-preservation-contract.js';

const file = bytes => new Blob([bytes]);
const cat = (...parts) => Buffer.concat(parts);
function lengthVint(n) {
  const data = [];
  let width = 1;
  for (; width <= 8; width++) if (BigInt(n) < (1n << BigInt(width * 7)) - 1n) break;
  let value = BigInt(n) | (1n << BigInt(width * 7));
  for (let i = width - 1; i >= 0; i--) {
    data[i] = Number(value & 255n);
    value >>= 8n;
  }
  return Buffer.from(data);
}
const element = (id, data) => cat(Buffer.from(id, 'hex'), lengthVint(data.length), Buffer.from(data));
function complex({ clusterBytes = 768 * 1024, unknown = false } = {}) {
  const attachment = element('61A7', cat(
    element('466E', Buffer.from('license.bin')),
    element('4660', Buffer.from('application/octet-stream')),
    element('465C', pngBytes),
    element('46AE', [7]),
  ));
  const tags = element('1254C367', element('7373', cat(
    element('63C0', element('63C4', [31])),
    element('67C8', cat(element('45A3', Buffer.from('P0_KEEP')),
      element('4487', Buffer.from('present')))),
  )));
  const chapters = element('1043A770', element('45B9', element('B6',
    cat(element('73C4', [31]), element('B6', element('73C4', [32]))))));
  const children = cat(
    element('1549A966', element('2AD7B1', [15, 66, 64])),
    element('1654AE6B', element('AE', element('73C5', [77]))),
    element('1941A469', attachment),
    element('1F43B675', Buffer.alloc(clusterBytes, 0x33)),
    chapters,
    tags,
    ...(unknown ? [element('4ABC', Buffer.from('opaque unknown element'))] : []),
  );
  return cat(
    element('1A45DFA3', element('4282', Buffer.from('matroska'))),
    element('18538067', children),
  );
}
async function mutatedAttachment(bytes) {
  const copy = Buffer.from(bytes);
  const reader = createMatroskaAttachmentReader(file(copy));
  const inspected = await reader.inspect();
  assert.equal(inspected.state, 'inspected');
  const { offset, length } = inspected.attachments[0].dataRange;
  assert.ok(length > 0);
  copy[offset + Math.floor(length / 2)] ^= 0x23;
  return copy;
}
const expectInspected = async source => {
  const snapshot = await inspectRawSegmentPreservation(file(source));
  assert.equal(snapshot.state, 'inspected', JSON.stringify(snapshot.diagnostic));
  return snapshot;
};

test('all top-level source objects have distinct immutable byte commitments and raw coverage', async () => {
  const fixture = complex({ unknown: true });
  const report = await expectInspected(fixture);
  assert.equal(report.schema, RAW_SEGMENT_CONTRACT_SCHEMA);
  assert.equal(report.coverage.byteCommitments,
    'all-top-level-element-bytes-within-64mib-budget');
  assert.ok(report.elements.length >= 7);
  assert.equal(report.elements.filter(e => e.family === 'attachments').length, 1);
  assert.equal(report.elements.filter(e => e.family === 'protected').length,
    report.elements.length - 1);
  assert.ok(report.coverage.unknownTopElementIds.includes('0x4abc'));
  assert.equal(report.coverage.writerSafety, 'not-proven');
  assert.equal(report.coverage.referencedOffsetsAndCues, 'unverified');
  assert.equal(Object.isFrozen(report.elements[0]), true);
  assert.equal(Object.isFrozen(report.coverage), true);
  assert.ok(!JSON.stringify(report).includes('opaque unknown element'));
});

test('identical source bytes match exactly but NEVER authorize a writer', async () => {
  const src = await expectInspected(createResearchFixture());
  const dst = await expectInspected(createResearchFixture());
  const compared = compareRawSegmentPreservation(src, dst);
  assert.equal(compared.state, 'PROTECTED_RAW_BYTES_MATCH_NOT_WRITE_AUTHORIZATION');
  assert.equal(compared.identicalScannedBytes, true);
  assert.equal(compared.approvedToWrite, false);
  assert.equal(compared.writer, null);
  assert.equal(compared.pending.length, 5);
});

test('changed nested chapters and UID targeted tags are independently identified as protected changes', async () => {
  const bytes = complex({ clusterBytes: 2 });
  const src = await expectInspected(bytes);
  for (const [id, label] of [['0x1043a770', 'chapters'], ['0x1254c367', 'tags']]) {
    const candidate = Buffer.from(bytes);
    const item = src.elements.find(el => el.id === id);
    assert.ok(item, label);
    candidate[item.offset + item.byteLength - 1] ^= 0x01;
    const outcome = compareRawSegmentPreservation(src,
      await expectInspected(candidate), { attachmentChangesRequested: true });
    assert.equal(outcome.state, 'BLOCKED_PROTECTED_BYTES_CHANGED');
    assert.equal(outcome.protectedTopLevelEqual, false);
    assert.ok(outcome.changedProtected.some(row => row.sourceId === id));
    assert.equal(outcome.approvedToWrite, false);
  }
});

test('media Cluster corruption or Track UID changes are observed, not treated as harmless attachments', async () => {
  const bytes = complex({ clusterBytes: 100 });
  const src = await expectInspected(bytes);
  for (const id of ['0x1f43b675', '0x1654ae6b']) {
    const target = src.elements.find(el => el.id === id);
    const candidate = Buffer.from(bytes);
    candidate[target.offset + target.byteLength - 1] ^= 1;
    const outcome = compareRawSegmentPreservation(src,
      await expectInspected(candidate));
    assert.equal(outcome.state, 'BLOCKED_PROTECTED_BYTES_CHANGED');
    assert.ok(outcome.changedProtected.some(x => x.sourceId === id));
  }
});

test('attachment-only byte changes require separate explicit edit and independent reference/offset audit', async () => {
  const bytes = complex({ clusterBytes: 10 });
  const src = await expectInspected(bytes);
  const updated = await expectInspected(await mutatedAttachment(bytes));
  const noConsent = compareRawSegmentPreservation(src, updated);
  assert.equal(noConsent.state, 'BLOCKED_UNREQUESTED_ATTACHMENT_DELTA');
  assert.equal(noConsent.attachmentElementsEqual, false);
  assert.equal(noConsent.protectedTopLevelEqual, true);
  const deliberate = compareRawSegmentPreservation(src, updated, {
    attachmentChangesRequested: true,
  });
  assert.equal(deliberate.state, 'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF');
  assert.equal(deliberate.approvedToWrite, false);
  assert.ok(deliberate.pending.includes('TrackUID/ChapterUID/AttachmentUID-target-relations'));
});

test('changed EBML header always blocks despite unchanged Segment children', async () => {
  const source = createResearchFixture();
  const sourceInventory = await expectInspected(source);
  const candidate = Buffer.from(source);
  const pos = candidate.indexOf(Buffer.from('matroska'));
  assert.ok(pos > 0);
  candidate[pos] = 0x4d; // "Matroska" is not allowed; deliberate header mutation
  const scan = await inspectRawSegmentPreservation(file(candidate));
  // A changed DocType must never yield a valid source-contract.
  assert.equal(scan.state, 'unverified');
  assert.equal(compareRawSegmentPreservation(sourceInventory, scan).state,
    'BLOCKED_UNVERIFIED');
});

test('oversize, invalid and damaged EBML source do not claim byte coverage', async () => {
  const huge = { size: 64 * 1024 * 1024 + 1,
    slice() { throw Error('should not read'); } };
  assert.equal((await inspectRawSegmentPreservation(huge)).diagnostic.code,
    'RAW_CONTRACT_SOURCE_OVER_64MIB_RESEARCH_BUDGET');
  assert.equal((await inspectRawSegmentPreservation(file('not an MKV'))).state,
    'unverified');
  const corrupt = createResearchFixture().subarray(0, 40);
  assert.equal((await inspectRawSegmentPreservation(file(corrupt))).state,
    'unverified');
});

test('scans a large Cluster in bounded slices instead of eager full-media reads', async () => {
  const backing = file(complex({ clusterBytes: 3 * 1024 * 1024 }));
  let largestRead = 0, total = 0;
  const guarded = {
    size: backing.size,
    slice(start, end) {
      largestRead = Math.max(largestRead, end - start);
      total += end - start;
      return backing.slice(start, end);
    },
  };
  const result = await inspectRawSegmentPreservation(guarded);
  assert.equal(result.state, 'inspected');
  assert.ok(largestRead <= 256 * 1024, 'hashing must be bounded to 256 KiB slices');
  assert.ok(total < backing.size * 2,
    'all bytes read once plus bounded EBML headers');
  assert.ok(result.elements.some(e => e.id === '0x1f43b675'));
});
