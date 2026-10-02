import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubsetFontIdentity,
  fontIdentityMismatchMessage,
  fontMimeType,
  inspectFontFile,
  fontVirtualExtension,
  sniffFontBytes,
} from '../src/font-identity.js';

const ascii = (s) => new TextEncoder().encode(s);

test('detects TrueType SFNT from bytes regardless of filename', () => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(0, 0x00010000, false);
  const identity = sniffFontBytes(bytes);
  assert.equal(identity.kind, 'truetype-sfnt');
  assert.equal(identity.supported, true);
  assert.equal(fontMimeType(identity), 'font/ttf');
  assert.equal(fontVirtualExtension(identity), '.ttf');
  assert.equal(canSubsetFontIdentity(identity), true);
});

test('detects OpenType CFF and collection signatures', () => {
  const otf = sniffFontBytes(ascii('OTTO........'));
  const ttc = sniffFontBytes(ascii('ttcf........'));
  assert.equal(otf.kind, 'opentype-cff');
  assert.equal(fontMimeType(otf), 'font/otf');
  assert.equal(ttc.kind, 'sfnt-collection');
  assert.equal(fontMimeType(ttc), 'font/collection');
  assert.equal(canSubsetFontIdentity(ttc), false);
});

test('unknown signature is not accepted as a font', () => {
  const identity = sniffFontBytes(ascii('NOPE........'));
  assert.equal(identity.supported, false);
  assert.equal(canSubsetFontIdentity(identity), false);
});

test('mismatch diagnostic is only emitted for detected supported content', () => {
  const message = fontIdentityMismatchMessage({
    kind: 'truetype-sfnt',
    supported: true,
    collection: false,
    extension: '.otf',
    extensionMatches: false,
  });
  assert.match(message, /\.otf/);
  assert.match(message, /TrueType/);
});


test('structural inspection rejects files that only spoof a supported font signature', async () => {
  const fake = new Blob([new Uint8Array([
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])]);
  const file = {
    name: 'fake.ttf',
    size: fake.size,
    slice: (...args) => fake.slice(...args),
    arrayBuffer: () => fake.arrayBuffer(),
  };
  const identity = await inspectFontFile(file);
  assert.equal(identity.supported, false);
  assert.equal(identity.evidence, 'sfnt-parse-failed');
  assert.match(identity.inspectionError, /字体/);
});
