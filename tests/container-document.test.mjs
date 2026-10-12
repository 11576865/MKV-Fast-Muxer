import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContainerDocument,
  CONTAINER_DOCUMENT_SCHEMA,
  reconcileContainerSelection,
} from '../src/container-document.js';
import { buildOutputComposition } from '../src/output-composition.js';

const file = (name, size = 321, lastModified = 123) =>
  ({ name, size, lastModified });
const source = file('show.mkv');
const mkStream = (index, codec_type, codec_name, tags = {}) =>
  ({ index, codec_type, codec_name, tags, disposition: {} });
const scanned = () => ({
  fileKey: 'show.mkv|321|123',
  streams: [
    mkStream(0, 'video', 'h264'),
    mkStream(1, 'audio', 'aac', { title: 'Japanese', language: 'jpn' }),
    mkStream(2, 'data', 'unknown-data'),
  ],
  tracks: [{
    index: 1, type: 'audio', include: true, order: 1, title: 'Japanese',
    language: 'jpn', default: false, forced: false, original: false,
    commentary: false, hearingImpaired: false,
    originalTitle: 'Japanese', originalLanguage: 'jpn',
    originalDefault: false, originalForced: false, originalOriginal: false,
    originalCommentary: false, originalHearingImpaired: false,
  }],
  attachments: [],
  chapters: [{ tags: { title: 'Opening' }, start_time: 0 }],
  format: { tags: { title: 'Show title', encoder: 'fixture' } },
});

test('P1 projection is a pure snapshot of current legacy composition without creating a second editor', () => {
  const trackState = scanned();
  const args = {
    video: source, trackState, appendMode: false,
    newSubtitles: [{ file: file('Signs.ass'), title: 'Signs', format: { assLike: true } }],
    fonts: [file('Font.otf')],
  };
  const original = JSON.stringify(trackState);
  const document = buildContainerDocument(args);
  assert.equal(document.schema, CONTAINER_DOCUMENT_SCHEMA);
  assert.equal(document.source.inspection, 'ffprobe-projected');
  assert.deepEqual(document.composition, buildOutputComposition(args));
  assert.equal(document.execution.authority, 'legacy-single-file-executor');
  assert.equal(document.execution.wholeEbmlPreservation, 'unverified');
  assert.equal(JSON.stringify(trackState), original);
  assert.equal(Object.isFrozen(document.objects), true);
  assert.equal(Object.isFrozen(document.composition.items), true);
  trackState.tracks[0].title = 'Changed later';
  assert.equal(document.objects.find(x => x.kind === 'audio').title, 'Japanese');
});

test('source-scoped identities do not reuse a former source object when stream indices overlap', () => {
  const first = buildContainerDocument({ video: source, trackState: scanned() });
  const second = buildContainerDocument({ video: file('other.mkv', 222), trackState: null });
  const selected = first.composition.items.find(x => x.kind === 'video').id;
  assert.equal(reconcileContainerSelection(first, first.sourceKey, selected), selected);
  assert.equal(reconcileContainerSelection(second, first.sourceKey, selected), '');
  assert.ok(first.objects.find(x => x.kind === 'video').id.startsWith(first.source.id + '/'));
  assert.notEqual(first.source.id, second.source.id);
  assert.equal(reconcileContainerSelection(first, first.sourceKey, 'deleted:track'), '');
});

test('unscanned header remains pending rather than becoming an invented video stream', () => {
  const old = scanned();
  old.fileKey = 'different-source|0|0';
  const doc = buildContainerDocument({ video: source, trackState: old });
  assert.equal(doc.source.inspection, 'pending');
  assert.equal(doc.composition.verifiedTrackStructure, false);
  assert.equal(doc.objects.length, 1);
  assert.equal(doc.objects[0].kind, 'source');
  assert.equal(doc.objects[0].evidence, 'header-only');
});

test('data streams, flat chapters and global metadata remain observable, not asserted preserved', () => {
  const doc = buildContainerDocument({ video: source, trackState: scanned(), appendMode: true });
  const data = doc.objects.find(x => x.kind === 'data');
  const chapter = doc.objects.find(x => x.kind === 'chapter');
  const metadata = doc.objects.find(x => x.kind === 'metadata');
  assert.equal(data.status, 'observed-only');
  assert.equal(data.included, null);
  assert.equal(chapter.evidence, 'ffprobe-flat-chapter');
  assert.equal(chapter.included, null);
  assert.deepEqual(metadata.keys, ['encoder', 'title']);
  assert.equal(doc.execution.wholeEbmlPreservation, 'unverified');
});

test('an inspectable resource-only composition does not imply existing writer support', () => {
  const doc = buildContainerDocument({
    newSubtitles: [{ file: file('one.ass'), format: { assLike: true } }],
    fonts: [file('Family.ttf')],
  });
  assert.equal(doc.source, null);
  assert.equal(doc.composition.counts.subtitle, 1);
  assert.equal(doc.execution.state, 'requires-video-source');
  assert.equal(doc.execution.supportsResourceOnlyOutput, false);
});

test('metadata-derived identity collisions are diagnosed, never claimed universally unique', () => {
  const external = file('copy.opus');
  const doc = buildContainerDocument({
    externalAudio: [{ file: external, title: 'A' }, { file: external, title: 'B' }],
  });
  assert.equal(doc.identityDiagnostics.length, 1);
  assert.equal(doc.identityDiagnostics[0].code, 'DUPLICATE_PROJECTION_ID');
});
