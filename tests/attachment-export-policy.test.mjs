import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeAttachmentFilename,
  planAttachmentExportNames,
  ATTACHMENT_EXPORT_NAME_SCHEMA,
} from '../src/attachment-export-policy.js';

test('path traversal and Windows paths cannot control destination directories', () => {
  for (const [untrusted, expected] of [
    ['../../private.txt', 'private.txt'],
    ['C:\\Users\\Alice\\secret.png', 'secret.png'],
    ['..\\..\\data.json', 'data.json'],
    ['nested／sub／fullwidth.txt', 'fullwidth.txt'],
    ['evil/path/', 'attachment'],
  ]) {
    const result = sanitizeAttachmentFilename(untrusted);
    assert.equal(result.saveName, expected, untrusted);
    assert.doesNotMatch(result.saveName, /[\\/]/u);
    assert.equal(result.contentVerified, false);
  }
});

test('reserved system device names and special input become safe basenames', () => {
  for (const value of ['CON', 'con.txt', 'AUX.json', 'LPT1', 'COM9.log', 'NUL']) {
    const item = sanitizeAttachmentFilename(value);
    assert.ok(item.saveName.startsWith('_'));
    assert.ok(item.reasons.includes('reserved-device-name'));
  }
  assert.equal(sanitizeAttachmentFilename(' . . ').saveName, 'attachment');
  assert.equal(sanitizeAttachmentFilename('..').saveName, 'attachment');
  assert.equal(sanitizeAttachmentFilename('<>:"?*').saveName, '______');
});

test('bidirectional override, NUL and hidden control characters are removed', () => {
  const result = sanitizeAttachmentFilename('invoice\u202Egnp.exe\u0000.png');
  assert.doesNotMatch(result.saveName, /[\u202e\u0000]/u);
  assert.ok(result.reasons.includes('unsafe-characters-replaced'));
  assert.equal(result.contentVerified, false);
});

test('UTF-8 name length is bounded by bytes, not JS UTF-16 code units', () => {
  const filename = '字'.repeat(120) + '.png';
  const sanitized = sanitizeAttachmentFilename(filename);
  assert.ok(sanitized.byteLength <= 180);
  assert.ok(sanitized.saveName.endsWith('.png'));
  assert.ok(sanitized.reasons.includes('utf8-length-limited'));
});

test('deduped candidates reserve canonical and case-insensitive names', () => {
  const plan = planAttachmentExportNames([
    { id: 'a', filename: 'cover.png', mimeType: 'image/png' },
    { id: 'b', filename: 'COVER.PNG', mimeType: 'image/png' },
    { id: 'c', filename: 'cover.png', mimeType: 'application/octet-stream' },
    { id: 'd', filename: 'readme.txt', mimeType: 'text/plain' },
  ], { existingNames: ['readme.txt'] });
  assert.equal(plan.schema, ATTACHMENT_EXPORT_NAME_SCHEMA);
  assert.deepEqual(plan.entries.map(x => x.proposedSaveName),
    ['cover.png', 'COVER (2).PNG', 'cover (3).png', 'readme (2).txt']);
  assert.equal(plan.entries[1].claimedContentType, 'unverified');
  assert.equal(plan.entries[1].overwriteAuthorized, false);
  assert.equal(plan.entries[1].requiresUserSaveApproval, true);
  assert.equal(plan.readyToWrite, false);
  assert.equal(plan.destinationRecheckRequired, true);
});

test('filename collision after truncation remains bounded', () => {
  const tooLong = '汉'.repeat(100) + '.txt';
  const plan = planAttachmentExportNames([
    { filename: tooLong }, { filename: tooLong },
  ]);
  assert.equal(plan.entries.length, 2);
  assert.notEqual(plan.entries[0].proposedSaveName, plan.entries[1].proposedSaveName);
  assert.ok(new TextEncoder().encode(plan.entries[1].proposedSaveName).byteLength <= 180);
});

test('declared MIME and original filename are not content, permissions or a verified save path', () => {
  const raw = { id: 'a', filename: '../untrusted.exe', mimeType: 'image/png' };
  const old = structuredClone(raw);
  const plan = planAttachmentExportNames([raw]);
  assert.deepEqual(raw, old);
  assert.equal(plan.entries[0].originalName, '../untrusted.exe');
  assert.equal(plan.entries[0].proposedSaveName, 'untrusted.exe');
  assert.equal(plan.entries[0].declaredMimeType, 'image/png');
  assert.equal(plan.payloadIntegrity, 'not-checked');
  assert.equal(plan.existingNamesEvidence, 'caller-provided-snapshot-only');
  assert.equal(Object.isFrozen(plan.entries[0]), true);
  assert.equal(Object.isFrozen(raw), false);
});

test('reject malformed input without writing or defaulting to an external directory', () => {
  assert.throws(() => planAttachmentExportNames('one'), /INPUT_INVALID/);
  assert.throws(() => planAttachmentExportNames([null]), /ITEM_INVALID/);
  assert.deepEqual(planAttachmentExportNames([]).entries, []);
});
