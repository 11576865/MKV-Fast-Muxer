import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectMatroskaTarget,
  resolveLegacyTargetCapability,
  TARGET_DRAFT_SCHEMA,
} from '../src/container-target-draft.js';

const file = (name, size = 42, lastModified = 12) =>
  ({ name, size, lastModified });

test('R-02 target describes exactly one PNG attachment with zero media tracks', () => {
  const png = file('illustration.png', 67);
  const draft = projectMatroskaTarget({
    sourceAssets: [{ file: png, kind: 'attachment' }],
    attachments: [{
      file: png, sourceAssetId: 'asset:0',
      filename: 'illustration.png', mimeType: 'image/png',
    }],
  });
  assert.equal(draft.schema, TARGET_DRAFT_SCHEMA);
  assert.equal(draft.kind, 'attachments-only');
  assert.equal(draft.output.tracks.length, 0);
  assert.equal(draft.output.attachments.length, 1);
  assert.equal(draft.output.attachments[0].mimeType, 'image/png');
  assert.equal(draft.output.attachments[0].declaredSize, 67);
  assert.equal(draft.output.attachments[0].bytesEvidence, 'not-inspected');
  assert.deepEqual(draft.diagnostics, []);
  assert.deepEqual(resolveLegacyTargetCapability(draft), {
    state: 'cannot-execute', code: 'LEGACY_VIDEO_ROOT_REQUIRED',
    backend: 'browser-ffmpeg-legacy',
    matroskaConformance: 'not-validated',
  });
  assert.equal(draft.claims.readableByIndependentTools, 'not-tested');
  assert.equal(Object.isFrozen(draft.output.attachments[0]), true);
  assert.equal(Object.isFrozen(png), false, 'File-like input is not frozen');
});

test('audio-only output draft is real domain intent and not a fake video', () => {
  const draft = projectMatroskaTarget({
    tracks: [{ kind: 'audio', codec: 'opus', title: 'Commentary' }],
  });
  assert.equal(draft.kind, 'non-video-tracks');
  assert.deepEqual(draft.output.tracks.map(x => x.kind), ['audio']);
  assert.equal(resolveLegacyTargetCapability(draft).code, 'LEGACY_VIDEO_ROOT_REQUIRED');
});

test('normal video + audio + subtitle still projects explicitly without upgrading its proof', () => {
  const draft = projectMatroskaTarget({
    tracks: [{ kind: 'video', codec: 'h264' }, { kind: 'audio', codec: 'aac' },
      { kind: 'subtitle', codec: 'ass' }],
  });
  assert.equal(draft.kind, 'video-containing');
  assert.deepEqual(draft.output.tracks.map(x => x.kind), ['video','audio','subtitle']);
  assert.equal(resolveLegacyTargetCapability(draft).state, 'requires-runtime-preflight');
  assert.equal(draft.claims.sourcePreservation, 'not-validated');
});

test('arbitrary attachments are independent objects, not forced into fonts or videos', () => {
  const draft = projectMatroskaTarget({
    attachments: [
      { filename: 'notes.json', mimeType: 'application/json', sourceKey: 'local:notes' },
      { filename: 'license.txt', mimeType: 'text/plain', sourceKey: 'local:license' },
    ],
  });
  assert.equal(draft.kind, 'attachments-only');
  assert.deepEqual(draft.output.attachments.map(x => x.filename),
    ['notes.json', 'license.txt']);
  assert.equal(draft.output.tracks.length, 0);
  assert.equal(draft.output.attachments[1].fileUid, 'not-assigned');
});

test('a plan with chapters/tags never implies complete EBML target relationships', () => {
  const draft = projectMatroskaTarget({
    chapters: [{ title: 'Part A', uid: 12 }],
    tags: [{ name: 'Custom', chapterUid: 12 }],
  });
  assert.equal(draft.kind, 'metadata-only');
  assert.equal(draft.output.chapters[0].uidRelations, 'unverified');
  assert.equal(draft.output.tags[0].targetRelations, 'unverified');
  assert.equal(resolveLegacyTargetCapability(draft).state, 'cannot-execute');
});

test('missing attachment filename / MIME or unresolved source cannot be promoted to executable', () => {
  const draft = projectMatroskaTarget({
    attachments: [{ filename: '', mimeType: '', sourceAssetId: 'asset:99' }],
  });
  assert.deepEqual(draft.diagnostics.map(x => x.code), [
    'ATTACHMENT_FILENAME_MISSING', 'ATTACHMENT_MEDIA_TYPE_MISSING',
    'ATTACHMENT_SOURCE_UNRESOLVED',
  ]);
  assert.equal(resolveLegacyTargetCapability(draft).code, 'TARGET_DRAFT_INCOMPLETE');
  const badTrack = projectMatroskaTarget({
    tracks: [{ kind: 'blob', sourceAssetId: 'missing' }],
  });
  assert.deepEqual(badTrack.diagnostics.map(x => x.code),
    ['TRACK_KIND_UNRECOGNIZED', 'TRACK_SOURCE_UNRESOLVED']);
});

test('empty target does not get an invented media source or false runnable status', () => {
  const target = projectMatroskaTarget();
  assert.equal(target.kind, 'empty');
  assert.equal(target.assets.length, 0);
  assert.deepEqual(target.output.tracks, []);
  assert.deepEqual(target.output.attachments, []);
  assert.equal(resolveLegacyTargetCapability(target).state, 'cannot-execute');
  assert.equal(resolveLegacyTargetCapability(null).code, 'INVALID_TARGET_DRAFT');
});
