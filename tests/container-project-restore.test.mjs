import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContainerDocument } from '../src/container-document.js';
import {
  createContainerProjectFromProjection, applyContainerProjectEdit,
  serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import {
  prepareVerifiedTrackReplay as prepare, applyPreparedTrackReplay as apply,
} from '../src/container-project-restore.js';

const proof = Object.freeze({
  state: 'digest-matches-draft',
  matched: true, sourceByteIdentityProven: true,
});
const mkTrack = (index, type, stream) => ({
  index, type, stream, include: true, order: index,
  title: stream.tags?.title || '', language: stream.tags?.language || 'und',
  default: Boolean(stream.disposition?.default),
  forced: Boolean(stream.disposition?.forced),
  original: true, commentary: false, hearingImpaired: false,
});
function fixture() {
  const file = { name: 'verified.mkv', size: 123, lastModified: 7 };
  const streams = [
    { index: 0, codec_type: 'video', codec_name: 'h264', tags: {}, disposition: {} },
    { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { language: 'jpn' }, disposition: { default: 1 } },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { title: 'Chinese', language: 'zho' }, disposition: {} },
    { index: 3, codec_type: 'attachment', codec_name: 'ttf',
      tags: { filename: 'Font.ttf', mimetype: 'font/ttf' }, disposition: {} },
  ];
  const state = {
    fileKey: 'verified.mkv|123|7', streams,
    tracks: [mkTrack(1, 'audio', streams[1]), mkTrack(2, 'subtitle', streams[2])],
    attachments: [{ index: 3, stream: streams[3], filename: 'Font.ttf', originalFilename: 'Font.ttf',
      mimetype: 'font/ttf', originalMimetype: 'font/ttf', include: true }],
    chapters: [], format: { tags: {} },
  };
  const live = buildContainerDocument({ video: file, trackState: state });
  return { file, state, live };
}
function editProject(live, specs) {
  let project = createContainerProjectFromProjection(live);
  for (const [kind, type, field, value] of specs) {
    const object = project.objects.find(item => item.kind === kind);
    assert.ok(object, 'missing test object ' + kind);
    project = applyContainerProjectEdit(project, {
      type, objectId: object.id, ...(field ? { field } : {}), value,
    });
  }
  return parseContainerProjectDraft(serializeContainerProject(project));
}
const title = ['audio', 'set-attribute', 'title', 'Japanese commentary'];
const language = ['audio', 'set-attribute', 'language', 'eng'];
const include = ['subtitle', 'include', null, false];

test('inspected source projects exact editable values, provenance and scan binding', () => {
  const { live } = fixture();
  const project = createContainerProjectFromProjection(live);
  const audio = project.objects.find(o => o.kind === 'audio');
  assert.equal(audio.attributes.title, '', 'do not confuse display codec with real empty title');
  assert.equal(audio.attributes.language, 'jpn');
  assert.equal(audio.attributes.default, true);
  assert.equal(audio.sourceId, project.sources[0].id);
  assert.equal(live.sourceScanKey, 'verified.mkv|123|7');
  assert.equal(project.objects.find(o => o.kind === 'attachment').attributes.name, 'Font.ttf');
});

test('a verified multi-track detached change commits in one explicit transaction without a media write', () => {
  const { state, live, file } = fixture();
  const draft = editProject(live, [title, language, include]);
  const plan = prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state });
  assert.equal(plan.proposedCount, 3);
  assert.equal(plan.tracks.length, 2);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(state.tracks[0].title, '');
  const beforeFile = JSON.stringify(file);
  const receipt = apply(plan, state);
  assert.equal(receipt.status, 'applied-to-current-edit-plan');
  assert.equal(receipt.updatedTracks, 2);
  assert.equal(receipt.fileWritten, false);
  assert.equal(receipt.muxStarted, false);
  assert.equal(state.tracks[0].title, 'Japanese commentary');
  assert.equal(state.tracks[0].language, 'eng');
  assert.equal(state.tracks[1].include, false);
  assert.equal(state.tracks[1].original, false, 'legacy track exclusion clears dispositions');
  assert.equal(JSON.stringify(file), beforeFile);
  const afterLive = buildContainerDocument({ video: file, trackState: state });
  assert.equal(afterLive.objects.find(o => o.kind === 'audio').attributes.title, 'Japanese commentary');
});

test('a stale track change rejects the ENTIRE prepared transaction', () => {
  const { state, live } = fixture();
  const draft = editProject(live, [title, include]);
  const plan = prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state });
  state.tracks[1].title = 'changed after preview';
  const before = JSON.stringify(state.tracks);
  assert.throws(() => apply(plan, state), /TRACK_REPLAY_LIVE_STATE_CHANGED/);
  assert.equal(JSON.stringify(state.tracks), before);
  assert.equal(state.tracks[0].title, '');
});

test('a user edit after import blocks new preparation, not just final application', () => {
  const { state, file, live } = fixture();
  const draft = editProject(live, [title]);
  state.tracks[0].title = 'current UI';
  const now = buildContainerDocument({ video: file, trackState: state });
  assert.throws(() => prepare({
    draft, liveProjection: now, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_BASELINE_NOT_VERIFIED/);
});

test('hash proof, source scan, valid state and selective mode are independent gates', () => {
  const { state, file, live } = fixture();
  const draft = editProject(live, [title]);
  const args = { draft, liveProjection: live, sourceProof: proof, trackState: state };
  assert.throws(() => prepare({ ...args, sourceProof: null }), /BASELINE_NOT_VERIFIED/);
  assert.throws(() => prepare({ ...args, appendMode: true }), /SELECTIVE_MODE_REQUIRED/);
  assert.throws(() => prepare({ ...args, trackState: { ...state, fileKey: 'stale' } }), /SOURCE_SCAN_STALE/);
  const headerOnly = buildContainerDocument({ video: file, trackState: null });
  assert.throws(() => prepare({ ...args, liveProjection: headerOnly }), /BASELINE_NOT_VERIFIED/);
});

test('unsupported source modifications reject the full mixed import', () => {
  const { state, live } = fixture();
  for (const unsupported of [
    ['attachment', 'set-attribute', 'name', 'renamed.ttf'],
    ['audio', 'reorder', null, 0],
    ['video', 'set-attribute', 'title', 'new title'],
  ]) {
    const draft = editProject(live, [title, unsupported]);
    const before = JSON.stringify(state.tracks);
    assert.throws(() => prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state }),
      /TRACK_REPLAY_UNSUPPORTED_/);
    assert.equal(JSON.stringify(state.tracks), before);
  }
});

test('track exclusion plus field replay cannot silently edit an excluded object', () => {
  const { state, live } = fixture();
  const draft = editProject(live, [include, ['subtitle', 'set-attribute', 'title', 'Invisible edit']]);
  assert.throws(() => prepare({
    draft, liveProjection: live, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_EXCLUDED_FIELD_EDIT/);
});

test('invalid title and language values cannot bypass the editor constraints', () => {
  const { state, live } = fixture();
  for (const spec of [
    ['audio', 'set-attribute', 'title', 'x'.repeat(161)],
    ['audio', 'set-attribute', 'language', '!!invalid!!'],
  ]) {
    const draft = editProject(live, [spec]);
    assert.throws(() => prepare({
      draft, liveProjection: live, sourceProof: proof, trackState: state,
    }), /TRACK_REPLAY_(TITLE|LANGUAGE)_INVALID/);
  }
});

test('an unbound external subtitle is never allowed to mutate a source track', () => {
  const { state, file, live } = fixture();
  const ext = { name: 'extra.ass', size: 3, lastModified: 4 };
  const full = buildContainerDocument({ video: file, trackState: state,
    newSubtitles: [{ file: ext, title: 'external', format: { assLike: true } }] });
  let draft = editProject(full, [['subtitle', 'set-attribute', 'title', 'changed']]);
  // The fixture above selects the first source subtitle; make an external-only draft.
  let project = createContainerProjectFromProjection(full);
  const external = project.objects.find(o => o.sourceId === null && o.kind === 'subtitle');
  assert.ok(external);
  project = applyContainerProjectEdit(project, {
    type: 'set-attribute', objectId: external.id, field: 'title', value: 'external edit',
  });
  draft = parseContainerProjectDraft(serializeContainerProject(project));
  assert.throws(() => prepare({
    draft, liveProjection: full, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_BASELINE_NOT_VERIFIED/);
});
