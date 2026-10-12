import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMatroskaPreservation, preservationBlockMessage } from '../src/preservation-preflight.js';

function id(number) {
  const digits = number <= 0xff ? 1 : number <= 0xffff ? 2 : number <= 0xffffff ? 3 : 4;
  return Uint8Array.from(Array.from({ length: digits }, (_, i) => number >>> (8 * (digits - i - 1)) & 255));
}
function size(n) {
  if (n < 127) return Uint8Array.of(0x80 | n);
  if (n < 16383) return Uint8Array.of(0x40 | (n >> 8), n & 255);
  if (n < 2097151) return Uint8Array.of(0x20 | (n >> 16), (n >> 8) & 255, n & 255);
  return Uint8Array.of(0x10 | (n >>> 24), (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}
function concat(...parts) {
  const length = parts.reduce((sum, x) => sum + x.length, 0);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function e(tag, ...contents) {
  const data = concat(...contents);
  return concat(id(tag), size(data.length), data);
}
const txt = (value) => new TextEncoder().encode(value);
const ebml = () => e(0x1a45dfa3, e(0x4282, txt('matroska')));
const chapter = (inner = null) => e(0xb6, e(0x73c4, Uint8Array.of(1)), ...(inner ? [inner] : []));
const chapters = (...atoms) => e(0x1043a770, e(0x45b9, ...atoms));
const linkedTag = (tagId, uid) => e(0x1254c367, e(0x7373, e(0x63c0,
  e(tagId, Uint8Array.of(uid))), e(0x67c8, e(0x45a3, txt('TEST')))));
function source(...segmentElements) {
  const bytes = concat(ebml(), e(0x18538067, ...segmentElements));
  const blob = new Blob([bytes]);
  return { size: blob.size, slice: blob.slice.bind(blob) };
}

test('P0 accepts only a limited, explicitly scoped simple Matroska as no-known-hazard', async () => {
  const check = await inspectMatroskaPreservation(source(chapters(chapter()), e(0x1549a966, txt('info'))));
  assert.equal(check.state, 'NO_KNOWN_HAZARD');
  assert.match(check.caveat, /不等于/);
  assert.equal(preservationBlockMessage('a.mkv', check), '');
});

test('P0 detects nested chapters even without any chapter target tag', async () => {
  const check = await inspectMatroskaPreservation(source(chapters(chapter(chapter()))));
  assert.equal(check.state, 'BLOCKED_RISK');
  assert.ok(check.reasons.includes('嵌套章节'));
  assert.match(preservationBlockMessage('a.mkv', check), /结构保留预检阻断/);
});

test('P0 detects nonzero UID tag targets for chapters, tracks, editions, attachments', async () => {
  for (const tagId of [0x63c4, 0x63c5, 0x63c6, 0x63c9]) {
    const check = await inspectMatroskaPreservation(source(linkedTag(tagId, 7)));
    assert.equal(check.state, 'BLOCKED_RISK', tagId.toString(16));
    assert.ok(check.reasons.some((reason) => reason.includes('UID')));
  }
});

test('P0 does not mistake UID zero (global scope) for UID targeting', async () => {
  const check = await inspectMatroskaPreservation(source(linkedTag(0x63c4, 0)));
  assert.equal(check.state, 'NO_KNOWN_HAZARD');
});

test('P0 detects ordered and multiple editions', async () => {
  const ordered = e(0x1043a770, e(0x45b9, e(0x45dd, Uint8Array.of(1)), chapter()));
  assert.ok((await inspectMatroskaPreservation(source(ordered))).reasons.includes('有序章节版本'));
  const two = e(0x1043a770, e(0x45b9, chapter()), e(0x45b9, chapter()));
  assert.ok((await inspectMatroskaPreservation(source(two))).reasons.includes('多个章节版本'));
});

test('P0 skips a sizable Cluster by offsets instead of loading its full payload', async () => {
  const giantCluster = e(0x1f43b675, new Uint8Array(200000));
  const blob = new Blob([concat(ebml(), e(0x18538067, giantCluster, linkedTag(0x63c4, 1)))]);
  let largestSlice = 0;
  const input = { size: blob.size, slice(start, end) {
    largestSlice = Math.max(largestSlice, end - start);
    return blob.slice(start, end);
  } };
  const check = await inspectMatroskaPreservation(input);
  assert.equal(check.state, 'BLOCKED_RISK');
  assert.ok(largestSlice < 10000, 'large media cluster must not be staged in memory');
});

test('P0 refuses unreadable and unknown-size inner elements rather than claiming safe', async () => {
  const broken = source(e(0x1043a770, Uint8Array.of(0xb6, 0xff)));
  assert.equal((await inspectMatroskaPreservation(broken)).state, 'BLOCKED_UNKNOWN');
  const truncated = new Blob([concat(ebml(), Uint8Array.of(0x18, 0x53, 0x80, 0x67, 0x88, 1))]);
  const input = { size: truncated.size, slice: truncated.slice.bind(truncated) };
  assert.equal((await inspectMatroskaPreservation(input)).state, 'BLOCKED_UNKNOWN');
  assert.match(preservationBlockMessage('bad.mkv', await inspectMatroskaPreservation(input)), /阻断/);
});

test('P0 leaves WebM outside the Matroska-specific risk policy', async () => {
  const blob = new Blob([concat(e(0x1a45dfa3, e(0x4282, txt('webm'))), e(0x18538067))]);
  const result = await inspectMatroskaPreservation({ size: blob.size, slice: blob.slice.bind(blob) });
  assert.equal(result.state, 'NOT_MATROSKA');
  assert.equal(preservationBlockMessage('a.webm', result), '');
});
