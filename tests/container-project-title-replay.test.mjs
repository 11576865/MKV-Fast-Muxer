import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContainerDocument } from '../src/container-document.js';
import {
  createContainerProjectFromProjection, applyContainerProjectEdit,
  serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import {
  prepareDetachedSourceTitleReplay, commitPreparedSourceTitleReplay,
} from '../src/container-project-title-replay.js';
import { previewDetachedProjectIntentConflicts } from '../src/container-project-conflict-preview.js';

const source = { name: 'original.mkv', size: 1500, lastModified: 40 };
const verified = Object.freeze({
  state: 'digest-matches-draft', matched: true,
  sourceByteIdentityProven: true, executionAuthorized: false,
});
const state = () => ({
  fileKey: 'original.mkv|1500|40',
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', tags: {}, disposition: {} },
    { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { title: 'Original Japanese', language: 'jpn' }, disposition: {} },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { title: 'Original Signs', language: 'jpn' }, disposition: {} },
  ],
  tracks: [
    { index: 1, type: 'audio', include: true, order: 1, title: 'Original Japanese', originalTitle: 'Original Japanese', language: 'jpn' },
    { index: 2, type: 'subtitle', include: true, order: 2, title: 'Original Signs', originalTitle: 'Original Signs', language: 'jpn' },
  ],
  attachments: [], chapters: [], format: { tags: {} },
});
const projection = t => buildContainerDocument({ video: source, trackState: t });
const fixture = (titles = ['Restored Japanese', 'Restored Signs']) => {
  const tracks = state();
  const live = projection(tracks);
  const base = createContainerProjectFromProjection(live);
  const audio = base.objects.find(o => o.kind === 'audio');
  const subtitle = base.objects.find(o => o.kind === 'subtitle');
  const changed = applyContainerProjectEdit(
    applyContainerProjectEdit(base, { type: 'set-attribute', objectId: audio.id, field: 'title', value: titles[0] }),
    { type: 'set-attribute', objectId: subtitle.id, field: 'title', value: titles[1] },
  );
  return {
    tracks, live, base, audio, subtitle,
    draft: parseContainerProjectDraft(serializeContainerProject(changed)),
  };
};
const args = f => ({
  draft: f.draft, liveProjection: f.live, sourceProof: verified,
  trackState: f.tracks, sourceFileMatched: true, selectiveMode: true,
});

test('P1 real inspected original tracks are source-bound rather than misclassified as external', () => {
  const f = fixture();
  const fromComposition = f.live.objects.find(o => o.kind === 'audio');
  assert.equal(fromComposition.evidence, 'ffprobe-scanned-source-stream');
  assert.ok(f.audio.sourceId);
  assert.ok(f.subtitle.sourceId);
  const preview = previewDetachedProjectIntentConflicts({
    draft: f.draft, liveProjection: f.live, sourceProof: verified,
  });
  assert.equal(preview.status, 'READ_ONLY_PREVIEW_MATCHES');
  assert.equal(preview.proposedCount, 2);
  assert.equal(preview.changes.every(x => x.verdict === 'baseline-matches'), true);
  assert.equal(preview.changesApplied, false);
});

test('P1 explicit title-only replay updates BOTH actual editor fields atomically and no media', () => {
  const f = fixture();
  const plan = prepareDetachedSourceTitleReplay(args(f));
  assert.equal(plan.ready, true, plan.code);
  assert.equal(plan.changes.length, 2);
  assert.equal(f.tracks.tracks[0].title, 'Original Japanese', 'preview must be read-only');
  const done = commitPreparedSourceTitleReplay(f.tracks, plan);
  assert.deepEqual(f.tracks.tracks.map(t => t.title), ['Restored Japanese', 'Restored Signs']);
  assert.equal(done.appliedCount, 2);
  assert.equal(done.mediaWritten, false);
  assert.equal(done.muxStarted, false);
  assert.equal(done.runtimePreflightStillRequired, true);
  assert.equal(plan.executionAuthorized, false);
});

test('P1 source identity, SHA proof, append mode and missing scan fail closed', () => {
  const f = fixture();
  const cases = [
    { sourceFileMatched: false, expected: 'SOURCE_FILE_NOT_CURRENT' },
    { sourceProof: null, expected: 'SOURCE_OR_BASELINE_NOT_VERIFIED' },
    { selectiveMode: false, expected: 'SOURCE_APPEND_ALL_MODE' },
    { trackState: null, expected: 'TRACK_EDITOR_NOT_SCANNED' },
  ];
  for (const c of cases) {
    const plan = prepareDetachedSourceTitleReplay({ ...args(f), ...c });
    assert.equal(plan.code, c.expected);
    assert.equal(plan.ready, false);
    assert.deepEqual(f.tracks.tracks.map(t => t.title), ['Original Japanese', 'Original Signs']);
  }
});

test('P1 local title drift before planning and between planning/commit never partially applies', () => {
  const f = fixture();
  const plan = prepareDetachedSourceTitleReplay(args(f));
  f.tracks.tracks[1].title = 'Locally changed';
  assert.equal(prepareDetachedSourceTitleReplay({ ...args(f), liveProjection: projection(f.tracks) }).code, 'SOURCE_OR_BASELINE_NOT_VERIFIED');
  assert.throws(() => commitPreparedSourceTitleReplay(f.tracks, plan), /TITLE_REPLAY_EDITOR_CHANGED/);
  assert.equal(f.tracks.tracks[0].title, 'Original Japanese');
  assert.equal(f.tracks.tracks[1].title, 'Locally changed');
});

test('P1 mixed include/reorder edits are blocked in their entirety, not silently discarded', () => {
  const f = fixture();
  for (const changed of [
    applyContainerProjectEdit(f.draft, { type: 'include', objectId: f.audio.id, value: false }),
    applyContainerProjectEdit(f.draft, { type: 'reorder', objectId: f.subtitle.id, value: 0 }),
  ]) {
    const draft = parseContainerProjectDraft(serializeContainerProject(changed));
    const res = prepareDetachedSourceTitleReplay({ ...args(f), draft });
    assert.equal(res.code, 'UNSUPPORTED_REPLAY_EDIT');
    assert.deepEqual(f.tracks.tracks.map(t => t.title), ['Original Japanese', 'Original Signs']);
  }
});

test('P1 edited external resource and invalid typed title cannot be laundered into source track', () => {
  const f = fixture();
  const fake = { ...f.live,
    objects: [...f.live.objects, {
      id: 'external:subtitle:one', kind: 'subtitle', title: 'External',
      status: 'add', included: true, evidence: 'current-editor-projection',
    }],
  };
  const base = createContainerProjectFromProjection(fake);
  const other = base.objects.find(o => o.sourceId === null && o.kind === 'subtitle');
  const draft = applyContainerProjectEdit(base, {
    type: 'set-attribute', objectId: other.id, field: 'title', value: 'Changed external',
  });
  const res = prepareDetachedSourceTitleReplay({
    ...args(f), liveProjection: fake, draft,
  });
  assert.equal(res.code, 'SOURCE_OR_BASELINE_NOT_VERIFIED');
  assert.deepEqual(f.tracks.tracks.map(t => t.title), ['Original Japanese', 'Original Signs']);
  const tooLong = applyContainerProjectEdit(f.base, {
    type: 'set-attribute', objectId: f.audio.id, field: 'title', value: 'x'.repeat(161),
  });
  assert.equal(prepareDetachedSourceTitleReplay({
    ...args(f), draft: tooLong,
  }).code, 'UNSUPPORTED_REPLAY_EDIT');
});
