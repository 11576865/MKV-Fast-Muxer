import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import {
  prepareExistingMkvAppendAttachmentCandidate,
  executeExistingMkvAppendAttachmentCandidate,
} from '../src/existing-mkv-append-attachment-candidate.js';
import { pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';

const cat = (...args) => Buffer.concat(args);
const lengthVint = n => {
  let w = 1;
  while (BigInt(n) >= (1n << BigInt(w * 7)) - 1n) w++;
  let size = BigInt(n) | (1n << BigInt(w * 7));
  const data = Buffer.alloc(w);
  for (let i = w - 1; i >= 0; i--) {
    data[i] = Number(size & 255n); size >>= 8n;
  }
  return data;
};
const elem = (id, data) => cat(Buffer.from(id, 'hex'), lengthVint(data.length), Buffer.from(data));
const asFile = (bytes, name) => {
  const file = new Blob([bytes]); file.name = name; file.lastModified = 1;
  return file;
};
function mkv({ hasAttachment = false, hasAttachmentTarget = false,
  crc = false, unknown = false, unknownSegment = false, clusterBytes = 256, voidBytes = 1000 } = {}) {
  const oneFile = elem('1941A469', elem('61A7', cat(
    elem('466E', Buffer.from('old.png')),
    elem('4660', Buffer.from('image/png')),
    elem('465C', pngBytes), elem('46AE', [3]),
  )));
  const tag = elem('1254C367', elem('7373', cat(
    elem('63C0', elem(hasAttachmentTarget ? '63C6' : '63C4', [1])),
    elem('67C8', cat(elem('45A3', Buffer.from('SAFE_KEEP')),
      elem('4487', Buffer.from('unchanged')))),
  )));
  const body = cat(
    elem('114D9B74', Buffer.alloc(0)),
    ...(voidBytes >= 0 ? [elem('EC', Buffer.alloc(voidBytes))] : []),
    elem('1549A966', elem('2AD7B1', [15, 66, 64])),
    elem('1654AE6B', elem('AE', elem('73C5', [77]))),
    elem('1F43B675', Buffer.alloc(clusterBytes, 0xa3)),
    elem('1043A770', elem('45B9', elem('B6', cat(
      elem('73C4', [1]), elem('B6', elem('73C4', [2])))))),
    tag,
    ...(hasAttachment ? [oneFile] : []),
    ...(crc ? [elem('BF', Buffer.from([0, 0, 0, 0]))] : []),
    ...(unknown ? [elem('4ABC', Buffer.from('unknown'))] : []),
  );
  return cat(elem('1A45DFA3', elem('4282', Buffer.from('matroska'))),
    unknownSegment
      ? cat(Buffer.from('18538067', 'hex'), Buffer.from([0xff]), body)
      : elem('18538067', body));
}
const text = () => asFile(Buffer.from('append-only payload\n'), 'notes.txt');
const prepare = (source, attachment = text(), opts = {}) =>
  prepareExistingMkvAppendAttachmentCandidate({
    source, attachment, mimeType: 'text/plain', ...opts,
  });

test('research-only append creates a separate attachment without altering existing media/chapter/tag raw bytes', async () => {
  const sourceBytes = mkv();
  const source = asFile(sourceBytes, 'source.mkv');
  const plan = await prepare(source);
  assert.equal(plan.state, 'PLAN_ONLY_NOT_PRODUCT_APPROVED');
  assert.equal(plan.input.preflightState, 'BLOCKED_RISK');
  assert.equal(plan.input.sourceTagUidCoverage, 'known-targets-enumerated');
  assert.equal(plan.input.observedAttachmentTagTargetCount, 0);
  assert.equal(plan.addedAttachment.fileUid, '1');
  assert.equal(plan.execution.approvedToWriteExistingFile, false);
  assert.equal(Object.isFrozen(plan.addedAttachment), true);
  assert.ok(!JSON.stringify(plan).includes('append-only payload'));
  const result = await executeExistingMkvAppendAttachmentCandidate(plan);
  assert.equal(result.status, 'CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT');
  assert.equal(result.rawComparison.protectedTopLevelEqual, false, 'strict comparator sees consumed Void');
  assert.equal(result.evidence.originalNonVoidElementByteCommitmentsAndOffsetsMatch, true);
  assert.equal(result.evidence.sourceTotalLengthUnchanged, true);
  assert.equal(result.rawComparison.approvedToWrite, false);
  assert.equal(result.rawComparison.state, 'BLOCKED_PROTECTED_BYTES_CHANGED');
  assert.equal(result.evidence.generalExistingMkvWriter, false);
  const reader = createMatroskaAttachmentReader(result.output);
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.attachments.length, 1);
  assert.equal(inventory.attachments[0].fileUid, '1');
  assert.equal(inventory.structure.hasTracksElement, true);
  assert.equal(inventory.structure.hasClusterElement, true);
  assert.equal(inventory.attachments[0].filename, 'notes.txt');
  assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[0].id)
    .data.arrayBuffer()), Buffer.from('append-only payload\n'));
  assert.deepEqual(Buffer.from(await source.arrayBuffer()), sourceBytes,
    'original source bytes must not be changed');
});

test('source with ANY existing Attachments cannot use the append-one master path', async () => {
  await assert.rejects(() => prepare(asFile(mkv({ hasAttachment: true }), 'x.mkv')),
    /APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED/);
});

test('an orphan TagAttachmentUID must not become accidentally linked to newly added FileUID', async () => {
  await assert.rejects(() => prepare(asFile(mkv({ hasAttachmentTarget: true }), 'x.mkv')),
    /APPEND_SOURCE_ATTACHMENT_UID_TARGET_EXISTS/);
});

test('unknown top-level element and Segment CRC refuse candidate before any output', async () => {
  await assert.rejects(() => prepare(asFile(mkv({ unknown: true }), 'x.mkv')),
    /APPEND_UNKNOWN_TOP_LEVEL_ELEMENT_NOT_SUPPORTED/);
  await assert.rejects(() => prepare(asFile(mkv({ crc: true }), 'x.mkv')),
    /APPEND_SEGMENT_CRC_NOT_SUPPORTED/);
});

test('unknown-length Segment cannot be resized by this bounded writer class', async () => {
  await assert.rejects(() => prepare(asFile(mkv({ unknownSegment: true }), 'x.mkv')),
    /APPEND_UNKNOWN_SEGMENT_LENGTH_UNSUPPORTED/);
});

test('source and payload budgets, MIME syntax and filename adjustments are explicit', async () => {
  const source = asFile(mkv(), 'valid.mkv');
  await assert.rejects(() => prepare(source, asFile([], 'empty.txt')),
    /APPEND_SOURCE_OR_PAYLOAD_BUDGET_INVALID/);
  await assert.rejects(() => prepare(source, text(), { mimeType: 'bad\nmime' }),
    /APPEND_MIME_DECLARATION_INVALID/);
  await assert.rejects(() => prepare(source, text(), { filename: '../../notes.txt' }),
    /APPEND_FILENAME_REVIEW_REQUIRED/);
  const approved = await prepare(source, text(), {
    filename: '../../notes.txt', approveFilenameAdjustments: true,
  });
  assert.equal(approved.addedAttachment.filename, 'notes.txt');
  assert.equal(approved.addedAttachment.filenameAdjusted, true);
  const large = { size: 60 * 1024 * 1024 + 1,
    slice() { throw Error('MUST_NOT_READ_LARGE_SOURCE'); } };
  await assert.rejects(() => prepare(large), /APPEND_SOURCE_OR_PAYLOAD_BUDGET_INVALID/);
});

test('a forged or cloned plan does not inherit real source/payload binding', async () => {
  const plan = await prepare(asFile(mkv(), 'legitimate.mkv'));
  await assert.rejects(() => executeExistingMkvAppendAttachmentCandidate(
    structuredClone(plan)), /PLAN_FORGED_OR_STALE/);
  await assert.rejects(() => executeExistingMkvAppendAttachmentCandidate(
    Object.freeze({ ...plan })), /PLAN_FORGED_OR_STALE/);
  await assert.rejects(() => executeExistingMkvAppendAttachmentCandidate(null),
    /PLAN_FORGED_OR_STALE/);
});

test('missing or too-small reserved Void is refused rather than moving original EBML offsets', async () => {
  await assert.rejects(() => prepare(asFile(mkv({ voidBytes: -1 }), 'without-reservation.mkv')),
    /APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED/);
  await assert.rejects(() => prepare(asFile(mkv({ voidBytes: 8 }), 'insufficient-reservation.mkv')),
    /APPEND_VOID_SLOT_CAPACITY_EXCEEDED/);
});


class MutableObservedBlob extends Blob {
  constructor(initial) {
    super([initial]);
    this.alternate = null;
  }
  replaceObservedBytes(value) {
    if (value.length !== this.size) throw Error('test fixture must preserve byte length');
    this.alternate = new Blob([value]);
  }
  slice(start, end, type) {
    return Blob.prototype.slice.call(this.alternate || this, start, end, type);
  }
}

test('source bytes changing only inside formerly reserved Void invalidate the authentic plan', async () => {
  const initial = mkv({ voidBytes: 1024 });
  const changed = Buffer.from(initial);
  // Find the *first* Void after a real SeekHead rather than assuming offsets.
  const scan = await inspectRawSegmentPreservation(new Blob([initial]));
  assert.equal(scan.state, 'inspected');
  const slot = scan.elements.find(el => el.id === '0xec');
  assert.ok(slot?.byteLength >= 1000);
  changed[slot.offset + slot.byteLength - 1] ^= 0x7f;
  const source = new MutableObservedBlob(initial);
  const plan = await prepare(source);
  source.replaceObservedBytes(changed);
  await assert.rejects(() => executeExistingMkvAppendAttachmentCandidate(plan),
    /APPEND_SOURCE_CHANGED_AFTER_PLAN/);
  assert.equal(plan.execution.approvedToWriteExistingFile, false);
});

test('attachment bytes swapped after plan creation are refused despite unchanged Blob reference and length', async () => {
  const original = Buffer.from('attachment-safe');
  const payload = new MutableObservedBlob(original);
  payload.name = 'safe.bin';
  const plan = await prepare(asFile(mkv(), 'stable-source.mkv'), payload, {
    mimeType: 'application/octet-stream',
  });
  const changed = Buffer.from(original);
  changed[2] ^= 0x01;
  payload.replaceObservedBytes(changed);
  await assert.rejects(() => executeExistingMkvAppendAttachmentCandidate(plan),
    /APPEND_ATTACHMENT_CHANGED_AFTER_PLAN/);
  assert.equal(plan.addedAttachment.payloadByteIdentity,
    'sha256-checked-at-plan-and-execution');
});
