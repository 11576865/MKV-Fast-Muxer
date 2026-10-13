import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareVerifiedLimitedAppend } from '../src/existing-mkv-limited-append-workflow.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';

const cat = (...a) => Buffer.concat(a.map(x => Buffer.from(x)));
function vint(n) {
  let w = 1;
  while (BigInt(n) >= (1n << BigInt(w * 7)) - 1n) w++;
  let x = BigInt(n) | (1n << BigInt(w * 7));
  const b = Buffer.alloc(w);
  for (let j = w - 1; j >= 0; j--) { b[j] = Number(x & 255n); x >>= 8n; }
  return b;
}
const elem = (id, value) => cat(Buffer.from(id, 'hex'), vint(value.length), value);
function mkv({ existing = false, voidSize = 2000 } = {}) {
  const head = elem('1A45DFA3', elem('4282', Buffer.from('matroska')));
  const children = [
    elem('114D9B74', Buffer.alloc(0)),
    ...(voidSize >= 0 ? [elem('EC', Buffer.alloc(voidSize))] : []),
    elem('1549A966', elem('2AD7B1', Buffer.from([15, 66, 64]))),
    elem('1654AE6B', elem('AE', elem('73C5', Buffer.from([77])))),
    elem('1F43B675', Buffer.alloc(300, 0xa3)),
    elem('1043A770', elem('45B9', elem('B6', cat(
      elem('73C4', Buffer.from([1])), elem('B6', elem('73C4', Buffer.from([2]))
    ))))),
    elem('1254C367', elem('7373', cat(
      elem('63C0', elem('63C4', Buffer.from([1]))),
      elem('67C8', cat(elem('45A3', Buffer.from('SAFE_KEEP')),
        elem('4487', Buffer.from('unchanged'))))
    ))),
    ...(existing ? [elem('1941A469', elem('61A7', cat(
      elem('466E', Buffer.from('original.txt')),
      elem('4660', Buffer.from('text/plain')),
      elem('465C', Buffer.from('original')),
      elem('46AE', Buffer.from([2])),
    )))] : []),
  ];
  return cat(head, elem('18538067', cat(...children)));
}
const file = (bytes, name) => Object.assign(new Blob([bytes]), { name, lastModified: 1 });
const run = (source, attachment, filename = attachment?.name, mimeType = 'text/plain') =>
  prepareVerifiedLimitedAppend({ source, attachment, filename, mimeType });
const digest = b => createHash('sha256').update(Buffer.from(b)).digest('hex');

test('independent existing MKV copy writes one attachment and verifies exact FileData while preserving nested source bytes', async () => {
  const input = mkv(), source = file(input, 'source.mkv');
  const attachmentBytes = Buffer.from('new resource bytes');
  const resource = file(attachmentBytes, 'notes.txt');
  const out = await run(source, resource);
  assert.equal(out.state, 'LIMITED_LOCAL_BYTES_VERIFIED_EXTERNAL_COMPATIBILITY_NOT_RECHECKED');
  assert.equal(out.filename, 'source.one-new-attachment.experimental.mkv');
  assert.equal(out.output.size, source.size);
  assert.equal(out.evidence.originalNonVoidBytesAndOffsetsUnchanged, true);
  assert.equal(out.evidence.originalSourceHashUnchanged, true);
  assert.equal(out.evidence.sourceSha256, digest(input));
  assert.equal(out.evidence.attachmentSha256, digest(attachmentBytes));
  assert.equal(out.evidence.externalToolAuditForThisUserFile, false);
  assert.deepEqual(Buffer.from(await source.arrayBuffer()), input);
  const reader = createMatroskaAttachmentReader(out.output);
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.attachments.length, 1);
  assert.equal(inventory.attachments[0].filename, 'notes.txt');
  assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[0].id).data.arrayBuffer()), attachmentBytes);
});

test('missing reserved Void or existing attachments refuse; no unsupported writer fallback', async () => {
  const resource = file(Buffer.from('notes'), 'notes.txt');
  await assert.rejects(run(file(mkv({ voidSize: -1 }), 'no-slot.mkv'), resource), /APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED/);
  await assert.rejects(run(file(mkv({ existing: true }), 'has-attachments.mkv'), resource), /APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED/);
  await assert.rejects(run(file(mkv({ voidSize: 2 }), 'too-small.mkv'), resource), /APPEND_VOID_SLOT_CAPACITY_EXCEEDED/);
});

test('oversized source and payload refuse before any data read', async () => {
  const neverRead = size => ({ size, slice() { throw Error('READ_SHOULD_NOT_HAPPEN'); }, arrayBuffer() { throw Error('READ_SHOULD_NOT_HAPPEN'); } });
  const tiny = file(Buffer.from('small'), 'small.txt');
  await assert.rejects(run(neverRead(60 * 1024 * 1024 + 1), tiny), /LIMITED_APPEND_INPUT_BUDGET_REFUSED_BEFORE_READ/);
  await assert.rejects(run(file(mkv(), 'valid.mkv'), neverRead(4 * 1024 * 1024 + 1)), /LIMITED_APPEND_INPUT_BUDGET_REFUSED_BEFORE_READ/);
});

test('unsafe proposed filename is not auto-approved without the user revising the proposal', async () => {
  const source = file(mkv(), 'source.mkv'), resource = file(Buffer.from('text'), 'safe.txt');
  await assert.rejects(run(source, resource, '../unexpected/safe.txt'), /APPEND_FILENAME_REVIEW_REQUIRED/);
});

test('production main and semantic UI reference limited workflow rather than invoking generic FFmpeg mux', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/existing-mkv-limited-append-ui.js', import.meta.url), 'utf8');
  assert.match(main, /setupExistingMkvLimitedAppendUI\(\{/);
  assert.match(ui, /prepareVerifiedLimitedAppend\(\{/);
  assert.doesNotMatch(ui, /muxBtn\.click|ffmpeg\.exec|batchStartBtn/);
  for (const id of ['existingMkvLimitedSource','existingMkvLimitedAttachment',
    'existingMkvLimitedFilename','existingMkvLimitedMime','existingMkvLimitedReview',
    'existingMkvLimitedPrepare','existingMkvLimitedSave','existingMkvLimitedStatus']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
});
