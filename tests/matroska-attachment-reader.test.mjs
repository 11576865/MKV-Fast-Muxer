import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceAssetSession } from '../src/source-asset-session.js';
import {
  createMatroskaAttachmentReader, ATTACHMENT_INVENTORY_SCHEMA,
} from '../src/matroska-attachment-reader.js';

const bytes = value => Buffer.from(value, 'utf8');
const elem = (id, value) => {
  const body = Buffer.from(value);
  assert.ok(body.length < 0x0fffffff);
  const size = Buffer.from([
    0x10 | ((body.length >>> 24) & 0x0f),
    (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255,
  ]);
  return Buffer.concat([Buffer.from(id, 'hex'), size, body]);
};
const concat = (...value) => Buffer.concat(value);
const ebmlHeader = docType => elem('1a45dfa3', concat(
  elem('4286', [1]), elem('42f7', [1]),
  elem('4282', bytes(docType)), elem('4287', [4]), elem('4285', [2]),
));
const attachedFile = ({ filename = 'pixel.png', mimeType = 'image/png', data = [1,2,3],
  uid = 7, description = '' } = {}) => elem('61a7', concat(
  elem('466e', bytes(filename)), elem('4660', bytes(mimeType)),
  elem('46ae', [uid]), ...(description ? [elem('467e', bytes(description))] : []),
  elem('465c', Buffer.from(data)),
));
const fixture = ({ docType = 'matroska', files = [attachedFile()],
  hasTracks = false, hasCluster = false } = {}) => {
  const segment = elem('18538067', concat(
    elem('1549a966', elem('2ad7b1', [0x0f,0x42,0x40])),
    ...(hasTracks ? [elem('1654ae6b', [])] : []),
    ...files.length ? [elem('1941a469', concat(...files))] : [],
    ...(hasCluster ? [elem('1f43b675', [0, 1, 2])] : []),
  ));
  return concat(ebmlHeader(docType), segment);
};
const makeFile = (buffer, name = 'same.mkv', changed = 24) => {
  const backing = new Blob([buffer]);
  const reads = [];
  const file = {
    name, lastModified: changed, size: backing.size, reads,
    slice(from, to, type) {
      reads.push({ from, to });
      return backing.slice(from, to, type);
    },
  };
  return file;
};

test('R-02 source is inspectable: zero tracks, one generic PNG, no FileData read', async () => {
  const file = makeFile(fixture());
  const session = createSourceAssetSession();
  const reader = createMatroskaAttachmentReader(file, { sourceSession: session });
  const inventory = await reader.inspect();
  assert.equal(inventory.schema, ATTACHMENT_INVENTORY_SCHEMA);
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.structure.nonPlayingStructure, true);
  assert.equal(inventory.structure.hasTracksElement, false);
  assert.equal(inventory.structure.hasClusterElement, false);
  assert.equal(inventory.attachments.length, 1);
  assert.equal(inventory.attachments[0].filename, 'pixel.png');
  assert.equal(inventory.attachments[0].mimeType, 'image/png');
  assert.equal(inventory.attachments[0].byteLength, 3);
  assert.equal(inventory.attachments[0].fileUid, '7');
  assert.equal(inventory.scanning.fileDataBytesRead, 0);
  assert.equal(Object.isFrozen(inventory.attachments[0]), true);
  assert.equal(session.isCurrent(inventory.source, file), true);
  const before = file.reads.length;
  const opened = reader.openAttachment(inventory.attachments[0].id);
  assert.equal(opened.filename, 'pixel.png');
  assert.equal(opened.integrity, 'not-hashed');
  assert.equal(file.reads.length, before + 1, 'one slice view, no eager payload read');
  assert.deepEqual([...new Uint8Array(await opened.data.arrayBuffer())], [1,2,3]);
});

test('multiple generic attachments preserve observed order, MIME and raw bytes', async () => {
  const a = bytes('{"hello":true}');
  const b = Buffer.from([0,255,12,0,23]);
  const file = makeFile(fixture({ files: [
    attachedFile({ filename: 'manifest.json', mimeType: 'application/json',
      data: a, uid: 11 }),
    attachedFile({ filename: 'notes.bin', mimeType: 'application/octet-stream',
      data: b, uid: 12, description: 'Non-font resource' }),
  ] }));
  const reader = createMatroskaAttachmentReader(file);
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.deepEqual(inventory.attachments.map(x => x.mimeType),
    ['application/json', 'application/octet-stream']);
  assert.equal(inventory.attachments[1].description, 'Non-font resource');
  assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[0].id)
    .data.arrayBuffer()), a);
  assert.deepEqual(Buffer.from(await reader.openAttachment(inventory.attachments[1].id)
    .data.arrayBuffer()), b);
  assert.equal(inventory.claims.wholeEbmlPreservation, 'unverified');
});

test('top-level tracks and Cluster are observed but not represented as playable proof', async () => {
  const reader = createMatroskaAttachmentReader(makeFile(
    fixture({ hasTracks: true, hasCluster: true })));
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.structure.hasTracksElement, true);
  assert.equal(inventory.structure.hasClusterElement, true);
  assert.equal(inventory.structure.nonPlayingStructure, false);
  assert.equal(inventory.claims.playable, 'not-tested');
});

test('large attachment is skipped with seeked element headers; filedata not loaded', async () => {
  const payload = Buffer.alloc(1024 * 1024 + 13, 0xab);
  const file = makeFile(fixture({ files: [
    attachedFile({ filename: 'payload.bin', mimeType: 'application/octet-stream',
      data: payload }),
  ] }));
  const inventory = await createMatroskaAttachmentReader(file).inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.attachments[0].byteLength, payload.length);
  assert.equal(inventory.scanning.fileDataBytesRead, 0);
  assert.ok(file.reads.length < 70);
  assert.ok(file.reads.every(x => x.to - x.from <= 4096));
});

test('same metadata is not the same SourceAsset when the File object changes', async () => {
  const buf = fixture();
  const old = makeFile(buf, 'source.mkv', 100);
  const replacement = makeFile(buf, 'source.mkv', 100);
  const session = createSourceAssetSession();
  const a = session.register(old, { kind: 'container' });
  const again = session.register(old, { kind: 'container' });
  const b = session.register(replacement, { kind: 'container' });
  assert.equal(a, again);
  assert.equal(a.metadataKey, b.metadataKey);
  assert.notEqual(a.id, b.id);
  assert.equal(session.isCurrent(a, replacement), false);
  const reader = createMatroskaAttachmentReader(old, { sourceSession: session });
  const inventory = await reader.inspect();
  assert.equal(inventory.source, a);
  assert.equal(a.contentIdentity, 'unverified');
  assert.equal(a.persistent, false);
});

test('WebM, malformed EBML and incomplete attachment fail closed and block extraction', async () => {
  for (const buf of [
    fixture({ docType: 'webm' }),
    fixture().subarray(0, 14),
    fixture({ files: [elem('61a7', elem('466e', bytes('name-only.png')))] }),
  ]) {
    const reader = createMatroskaAttachmentReader(makeFile(buf));
    assert.throws(() => reader.openAttachment('attachment:0:uid:7'),
      /ATTACHMENT_INSPECTION_REQUIRED/);
    const inventory = await reader.inspect();
    assert.equal(inventory.state, 'unverified');
    assert.equal(inventory.attachments.length, 0);
    assert.ok(inventory.diagnostic.code);
    assert.throws(() => reader.openAttachment('attachment:0:uid:7'),
      /ATTACHMENT_INSPECTION_REQUIRED/);
  }
});

test('duplicate FileData field is rejected rather than guessing attachment bytes', async () => {
  const dup = elem('61a7', concat(
    elem('466e', bytes('x.png')), elem('4660', bytes('image/png')),
    elem('46ae', [4]), elem('465c', [1]), elem('465c', [2]),
  ));
  const reader = createMatroskaAttachmentReader(makeFile(fixture({ files: [dup] })));
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'unverified');
  assert.equal(inventory.diagnostic.code, 'ATTACHMENT_DUPLICATE_FILEDATA');
});

test('no attachments is a valid inspected result, not invented font or video', async () => {
  const reader = createMatroskaAttachmentReader(makeFile(fixture({ files: [] })));
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.deepEqual(inventory.attachments, []);
  assert.equal(inventory.structure.attachmentElements, 0);
  assert.throws(() => reader.openAttachment('attachment:0:uid:7'),
    /ATTACHMENT_NOT_FOUND/);
});
