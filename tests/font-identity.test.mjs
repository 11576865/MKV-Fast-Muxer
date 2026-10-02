import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fontIdentityMismatchMessage,
  fontMimeType,
  fontVirtualSuffix,
  identifyFontFile,
  isSupportedFontIdentity,
  sniffFontBytes,
} from '../src/font-identity.js';

const enc = new TextEncoder();
function tag(text) { return [...enc.encode(text)]; }

test('sniffs TrueType and OpenType single-font scaler types', () => {
  assert.equal(sniffFontBytes(new Uint8Array([0x00, 0x01, 0x00, 0x00])).flavor, 'truetype');
  assert.equal(sniffFontBytes(new Uint8Array(tag('OTTO'))).flavor, 'opentype-cff');
});

test('sniffs TTC/OTC collection container independent of filename', () => {
  const bytes = new Uint8Array(32);
  bytes.set(tag('ttcf'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 1, false);
  view.setUint32(12, 20, false);
  bytes.set(tag('OTTO'), 20);
  const sniffed = sniffFontBytes(bytes);
  assert.equal(sniffed.container, 'collection');
  assert.equal(sniffed.flavor, 'opentype-cff');
});

test('renamed valid TrueType is accepted and mismatch is explicit', async () => {
  const file = { name: 'font.mmmmmm', type: 'application/octet-stream' };
  const identity = await identifyFontFile(file, {
    sniff: async () => ({ container: 'single', flavor: 'truetype', evidence: 'test' }),
    parseDescriptors: async () => [{ family: 'Fixture Sans' }],
  });
  assert.equal(isSupportedFontIdentity(identity), true);
  assert.equal(identity.extensionMatches, false);
  assert.equal(fontMimeType(identity), 'font/ttf');
  assert.equal(fontVirtualSuffix(identity), '.ttf');
  assert.match(fontIdentityMismatchMessage(identity), /\.mmmmmm/);
});

test('correct-looking extension cannot make invalid bytes a font', async () => {
  const identity = await identifyFontFile({ name: 'fake.ttf' }, {
    sniff: async () => ({ container: 'single', flavor: 'truetype', evidence: 'test' }),
    parseDescriptors: async () => { throw new Error('字体 name 表损坏'); },
  });
  assert.equal(isSupportedFontIdentity(identity), false);
  assert.match(identity.parseError, /损坏/);
});

test('collection identity drives attachment MIME and virtual suffix', async () => {
  const identity = await identifyFontFile({ name: 'collection.bin' }, {
    sniff: async () => ({ container: 'collection', flavor: 'opentype-cff', evidence: 'test' }),
    parseDescriptors: async () => [{ family: 'A' }, { family: 'B' }],
  });
  assert.equal(identity.faceCount, 2);
  assert.equal(fontMimeType(identity), 'font/collection');
  assert.equal(fontVirtualSuffix(identity), '.otc');
});
