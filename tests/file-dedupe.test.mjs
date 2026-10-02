import assert from 'node:assert/strict';
import test from 'node:test';

import { assignUniqueAttachmentNames, dedupeFilesBySha256 } from '../src/file-dedupe.js';

function fakeFile(name, text) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test('identical font payloads are deduplicated by SHA-256', async () => {
  const a = fakeFile('A.ttf', 'same-font');
  const b = fakeFile('B.ttf', 'same-font');
  const c = fakeFile('C.otf', 'different-font');

  const result = await dedupeFilesBySha256([a, b, c]);
  assert.equal(result.unique.length, 2);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].file.name, 'B.ttf');
  assert.equal(result.duplicates[0].duplicateOf.name, 'A.ttf');
});

test('different files with colliding attachment names receive deterministic suffixes', () => {
  const items = assignUniqueAttachmentNames([
    { file: { name: 'Font.ttf' }, sha256: '11111111aaaaaaaa' },
    { file: { name: 'font.ttf' }, sha256: '22222222bbbbbbbb' },
  ]);

  assert.equal(items[0].attachmentName, 'Font.ttf');
  assert.equal(items[1].attachmentName, 'font-mkvfm-22222222.ttf');
});

test('reserved original attachment names force deterministic font renaming', () => {
  const items = assignUniqueAttachmentNames([
    { file: { name: 'Font.ttf' }, sha256: 'abcdef1234567890' },
    { file: { name: 'Other.otf' }, sha256: '99999999aaaaaaaa' },
  ], ['font.ttf', 'cover.jpg']);

  assert.equal(items[0].attachmentName, 'Font-mkvfm-abcdef12.ttf');
  assert.equal(items[1].attachmentName, 'Other.otf');
});


test('precomputed content-derived attachment names participate in collision handling', () => {
  const items = assignUniqueAttachmentNames([
    { file: { name: 'Renamed.mmmmmm' }, attachmentName: 'Renamed.ttf', sha256: '12345678aaaaaaaa' },
  ], ['renamed.ttf']);

  assert.equal(items[0].attachmentName, 'Renamed-mkvfm-12345678.ttf');
});
