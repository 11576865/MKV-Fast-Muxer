import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAttachmentPrefix, inspectAttachmentPrefix,
  ATTACHMENT_SIGNATURE_SCHEMA,
} from '../src/attachment-signature.js';

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
const check = (bytes, type) => classifyAttachmentPrefix(bytes, type);

test('matching PNG prefix is only bounded format evidence, not full content verification', () => {
  const seen = check(PNG, 'image/png');
  assert.equal(seen.schema, ATTACHMENT_SIGNATURE_SCHEMA);
  assert.equal(seen.signatureId, 'png');
  assert.equal(seen.observedMimeType, 'image/png');
  assert.equal(seen.state, 'prefix-matches');
  assert.equal(seen.contentVerified, false);
  assert.equal(seen.safeToOpen, 'unverified');
  assert.equal(Object.isFrozen(seen), true);
});

test('content/claimed MIME disagreement is explicitly flagged, never parsed using the claim', () => {
  const seen = check(PNG, 'application/pdf');
  assert.equal(seen.state, 'prefix-mismatch');
  assert.equal(seen.signatureId, 'png');
  assert.equal(seen.warningCode, 'DECLARED_MIME_DISAGREES_WITH_PREFIX');
  assert.equal(seen.observedMimeType, 'image/png');
  assert.equal(seen.declaredMimeType, 'application/pdf');
  assert.equal(seen.contentVerified, false);
});

test('known signatures cover basic images, fonts, PDF, ZIP, and suspicious MZ', () => {
  const examples = [
    [[255, 216, 255, 1], 'image/jpeg', 'jpeg'],
    [[71, 73, 70, 56, 57, 97], 'image/gif', 'gif'],
    [[37, 80, 68, 70, 45, 49], 'application/pdf', 'pdf'],
    [[80, 75, 3, 4, 9], 'application/zip', 'zip'],
    [[0, 1, 0, 0, 12], 'font/ttf', 'ttf'],
    [[79, 84, 84, 79], 'font/otf', 'otf'],
    [[119, 79, 70, 70], 'font/woff', 'woff'],
    [[119, 79, 70, 50], 'font/woff2', 'woff2'],
    [[77, 90, 90], 'application/x-msdownload', 'exe-mz'],
  ];
  for (const [bytes, mime, id] of examples) {
    const observed = check(Uint8Array.from(bytes), mime);
    assert.equal(observed.signatureId, id);
    assert.equal(observed.state, 'prefix-matches');
  }
});

test('known executable-looking prefix mismatching a declared image produces a warning', () => {
  const result = check(Uint8Array.from([77,90,0,0,1]), 'image/png');
  assert.equal(result.signatureId, 'exe-mz');
  assert.equal(result.state, 'prefix-mismatch');
  assert.equal(result.contentVerified, false);
});

test('unrecognized payload is unknown, not automatically a MIME conflict', () => {
  const seen = check(new TextEncoder().encode('plain unclassified data'), 'text/plain');
  assert.equal(seen.state, 'unknown');
  assert.equal(seen.warningCode, 'PREFIX_NOT_RECOGNIZED');
  assert.equal(seen.observedMimeType, null);
});

test('empty or truncated prefix cannot assert a format', () => {
  assert.equal(check([], 'image/png').state, 'unknown');
  assert.equal(check([137,80,78], 'image/png').state, 'unknown');
  assert.equal(check(PNG, '').state, 'declared-missing');
  assert.equal(check(PNG, ' IMAGE/PNG ; charset=UTF-8').state, 'prefix-matches');
});

test('inspection reads at most 64 bytes and leaves full FileData untouched', async () => {
  const huge = new Blob([PNG, new Uint8Array(1024 * 1024)]);
  const slices = [];
  const reader = {
    openAttachment(id) {
      assert.equal(id, 'a');
      return {
        mimeType: 'image/png', declaredSize: huge.size,
        data: {
          slice(from, to) {
            slices.push([from, to]);
            return huge.slice(from, to);
          },
        },
      };
    },
  };
  const observed = await inspectAttachmentPrefix(reader, 'a');
  assert.equal(observed.state, 'prefix-matches');
  assert.deepEqual(slices, [[0, 64]]);
  assert.equal(observed.checkedBytes, 64);
});

test('prefix read error is reported without fallback to optimistic success', async () => {
  const reader = {
    openAttachment() {
      return {
        mimeType: 'image/png', declaredSize: 10,
        data: { slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read-denied')) }) },
      };
    },
  };
  const observed = await inspectAttachmentPrefix(reader, 'a');
  assert.equal(observed.state, 'read-failed');
  assert.equal(observed.warningCode, 'PREFIX_READ_FAILED');
  assert.equal(observed.contentVerified, false);
});
