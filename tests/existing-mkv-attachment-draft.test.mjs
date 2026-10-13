import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  draftLimitedAttachmentItems, validateLimitedAttachmentItems,
  snapshotLimitedAttachmentItems, matchLimitedAttachmentSnapshot,
} from '../src/existing-mkv-attachment-draft.js';

const file = (name, type = 'text/plain', bytes = 8) => ({
  name, type, size: bytes, slice() { return null; },
});

test('multi-file draft preserves exact File references and presents editable names and MIME', () => {
  const a = file('first.bin', ''), b = file('second.txt');
  const draft = draftLimitedAttachmentItems([a, b]);
  assert.equal(draft[0].file, a);
  assert.equal(draft[0].mimeType, 'application/octet-stream');
  assert.equal(draft[1].filename, 'second.txt');
  draft[0].filename = 'notes.bin';
  draft[0].mimeType = 'application/x-notes';
  const snapshot = snapshotLimitedAttachmentItems(draft);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot[0]));
  assert.equal(snapshot[0].filename, 'notes.bin');
  assert.equal(snapshot[0].mimeType, 'application/x-notes');
  assert.equal(matchLimitedAttachmentSnapshot(snapshot, draft), true);
});

test('edited name, MIME or same-metadata replacement File invalidates accepted output', () => {
  const a = file('first.bin');
  const b = file('second.bin');
  const entries = draftLimitedAttachmentItems([a, b]);
  const snapshot = snapshotLimitedAttachmentItems(entries);
  entries[1].filename = 'edited.bin';
  assert.equal(matchLimitedAttachmentSnapshot(snapshot, entries), false);
  entries[1].filename = 'second.bin';
  entries[1].mimeType = 'application/octet-stream';
  assert.equal(matchLimitedAttachmentSnapshot(snapshot, entries), false);
  entries[1].mimeType = 'text/plain';
  assert.equal(matchLimitedAttachmentSnapshot(snapshot, entries), true);
  entries[1].file = file('second.bin');
  assert.equal(matchLimitedAttachmentSnapshot(snapshot, entries), false);
});

test('duplicate, case-equivalent, unsafe and empty names are not auto-adjusted', () => {
  const a = file('a.txt'), b = file('b.txt');
  for (const [name1, name2] of [
    ['same.txt', 'same.txt'],
    ['ReadMe.txt', 'readme.txt'],
    ['a/evil.txt', 'other.txt'],
    ['CON.txt', 'other.txt'],
    ['', 'other.txt'],
  ]) {
    const draft = [
      { file: a, filename: name1, mimeType: 'text/plain' },
      { file: b, filename: name2, mimeType: 'text/plain' },
    ];
    assert.equal(validateLimitedAttachmentItems(draft).ok, false, name1);
    assert.throws(() => snapshotLimitedAttachmentItems(draft));
  }
});

test('invalid or empty MIME is rejected before the expensive writer is called', () => {
  const source = file('payload.dat', '');
  for (const mime of ['', 'bad', 'text/plain; charset=utf-8', 'a/<>']) {
    assert.equal(validateLimitedAttachmentItems([{
      file: source, filename: 'payload.dat', mimeType: mime,
    }]).ok, false);
  }
});

test('1–8 bounded items and aggregate size are validated without reading bytes', () => {
  const one = file('a.bin', 'application/octet-stream');
  assert.equal(validateLimitedAttachmentItems([]).ok, false);
  assert.equal(validateLimitedAttachmentItems(Array.from({ length: 9 }, (_, i) => ({
    file: one, filename: 'new' + i + '.bin', mimeType: 'application/octet-stream',
  }))).ok, false);
  const a = file('a.bin', 'application/octet-stream', 3 * 1024 * 1024);
  const b = file('b.bin', 'application/octet-stream', 2 * 1024 * 1024);
  assert.equal(validateLimitedAttachmentItems(draftLimitedAttachmentItems([a,b])).ok, false);
  assert.equal(validateLimitedAttachmentItems(draftLimitedAttachmentItems([one])).ok, true);
});

test('production UI binds draft snapshot, revokes previous confirmation on edit and reads DOM values at save', () => {
  const ui = readFileSync(new URL('../src/existing-mkv-limited-append-ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(ui, /snapshotLimitedAttachmentItems\(selectedMetadata\)/);
  assert.match(ui, /matchLimitedAttachmentSnapshot\(acceptedMetadata, liveItems\(\)\)/);
  assert.match(ui, /review\.checked = false;/);
  assert.match(ui, /input\.dataset\.limitedIndex = String\(index\)/);
  assert.match(ui, /inventory\?\.addEventListener\('input'/);
  assert.match(css, /\.existing-mkv-limited-file-row/);
});
