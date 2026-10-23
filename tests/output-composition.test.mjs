import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutputComposition } from '../src/output-composition.js';

const file = (name, size = 321) => ({ name, size, lastModified: 123 });
const video = file('source.mkv');
const stream = (index, codec_type, codec_name, tags = {}, disposition = {}) => ({
  index, codec_type, codec_name, tags, disposition,
});
const sourceStreams = [
  stream(0, 'video', 'h264'),
  stream(1, 'audio', 'aac', { language: 'jpn', title: 'Japanese' }, { default: 1 }),
  stream(2, 'audio', 'opus', { language: 'eng', title: 'English' }),
  stream(3, 'subtitle', 'ass', { language: 'zho', title: 'Original Signs' }),
  stream(4, 'attachment', 'ttf', { filename: 'SubtitleFont.ttf' }),
];
const track = (stream) => ({
  index: stream.index, stream, type: stream.codec_type, include: true,
  order: stream.index, language: stream.tags?.language || 'und',
  title: stream.tags?.title || '',
  default: Boolean(stream.disposition?.default), forced: false,
  original: false, commentary: false, hearingImpaired: false,
  originalLanguage: stream.tags?.language || 'und',
  originalTitle: stream.tags?.title || '',
  originalDefault: Boolean(stream.disposition?.default),
  originalForced: false, originalOriginal: false,
  originalCommentary: false, originalHearingImpaired: false,
});
const scanned = () => ({
  streams: sourceStreams,
  tracks: [track(sourceStreams[1]), track(sourceStreams[2]), track(sourceStreams[3])],
  attachments: [{
    index: 4, filename: 'SubtitleFont.ttf', originalFilename: 'SubtitleFont.ttf',
    mimetype: 'application/x-truetype-font', originalMimetype: 'application/x-truetype-font',
    include: true, stream: sourceStreams[4],
  }],
  chapters: [{ tags: { title: 'Opening' }, start: 0 }],
  format: { tags: { title: 'Original' } },
});

test('no input yields an empty composition without inventing output tracks', () => {
  const result = buildOutputComposition();
  assert.equal(result.source, null);
  assert.equal(result.verifiedTrackStructure, false);
  assert.deepEqual(result.items, []);
  assert.equal(result.changes.length, 0);
});

test('header-recognized source is one pending media object, not fictitious known video/audio tracks', () => {
  const result = buildOutputComposition({ video });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, 'source');
  assert.equal(result.items[0].status, 'pending');
  assert.equal(result.items[0].target, null);
  assert.equal(result.counts.video, 0);
  assert.equal(result.counts.audio, 0);
  assert.equal(result.verifiedTrackStructure, false);
});

test('scanned MKV projects each source stream once, plus independent attachment, not chapter metadata as tracks', () => {
  const result = buildOutputComposition({ video, trackState: scanned(), appendMode: true });
  assert.equal(result.verifiedTrackStructure, true);
  assert.deepEqual(result.items.map(item => item.kind),
    ['video', 'audio', 'audio', 'subtitle', 'attachment']);
  assert.equal(result.counts.audio, 2);
  assert.equal(result.counts.subtitle, 1);
  assert.equal(result.counts.attachment, 1);
  assert.equal(result.counts.font, 0, 'original attachments must not be mislabeled as fonts');
  assert.equal(result.items[3].title, 'Original Signs');
  assert.equal(result.items[3].target.key, 'subtitle:3');
  assert.equal(result.changes.length, 0, 'append-only original tracks have no changes');
});

test('append mode ignores stale manual deselection while selective mode exposes excluded rows for recovery', () => {
  const state = scanned();
  state.tracks[0].include = false;
  const append = buildOutputComposition({ video, trackState: state, appendMode: true });
  assert.equal(append.items.find(item => item.id === 'source:audio:1').included, true);
  assert.equal(append.items.find(item => item.id === 'source:audio:1').status, 'keep');

  const selective = buildOutputComposition({ video, trackState: state, appendMode: false });
  const removed = selective.items.find(item => item.id === 'source:audio:1');
  assert.equal(removed.status, 'remove');
  assert.equal(removed.included, false);
  assert.equal(selective.counts.audio, 1);
  assert.equal(selective.changes.some(item => item.id === 'source:audio:1'), true);
});

test('source metadata edits, changed order and external tracks reuse stable identity, not row ordinal', () => {
  const state = scanned();
  state.tracks[1].title = 'Commentary';
  state.tracks[0].order = 2;
  state.tracks[1].order = 1;
  const subtitle = file('zh.ass');
  const external = file('english.opus', 491);
  const props = {
    video, trackState: state, appendMode: false,
    newSubtitles: [{ file: subtitle, title: 'Signs', language: 'zho', forced: true, format: { label: 'ASS', assLike: true } }],
    externalAudio: [{ file: external, title: 'English', language: 'eng', default: false }],
    fonts: [file('NotoSans.otf')],
  };
  const first = buildOutputComposition(props);
  assert.deepEqual(first.items.filter(item => item.kind === 'audio').map(item => item.title),
    ['Commentary', 'Japanese', 'English']);
  assert.equal(first.items.some(item => item.status === 'modify'), true);
  const ids = first.items.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const track = first.items.find(item => item.title === 'Signs');
  assert.equal(track.detail.includes('Forced'), true);
  assert.equal(track.target.kind, 'subtitle');
  assert.equal(track.target.fileKey, 'zh.ass|321|123');
  // Reordering changes presentation, not source/external object identity.
  state.tracks[0].order = 1;
  state.tracks[1].order = 2;
  const next = buildOutputComposition(props);
  assert.deepEqual(new Set(next.items.map(item => item.id)), new Set(ids));
});

test('force-font mode chooses one attachment only with an ASS-like target subtitle', () => {
  const fonts = [file('a.ttf'), file('b.otf')];
  const ass = { file: file('hello.ass'), format: { assLike: true } };
  assert.equal(buildOutputComposition({ fonts, newSubtitles: [ass], fontMode: 'force' }).counts.font, 1);
  assert.equal(buildOutputComposition({ fonts, fontMode: 'force' }).counts.font, 2);
});

test('unsupported assets retain actual reasons without becoming output tracks', () => {
  const bad = { key: 'bad-1', file: file('broken.bin'), detail: '无可识别的媒体结构' };
  const result = buildOutputComposition({ video, unsupportedAssets: [bad] });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.diagnostics.map(x => x.reason), ['无可识别的媒体结构']);
  assert.equal(result.counts.audio, 0);
});

test('render projection does not mutate the scanned authoring state', () => {
  const source = scanned();
  const before = JSON.stringify(source);
  const props = { video, trackState: source, appendMode: false, externalAudio: [], newSubtitles: [] };
  buildOutputComposition(props);
  assert.equal(JSON.stringify(source), before);
});

test('same-metadata external File objects receive distinct composition IDs and exact live row routes', () => {
  const one = file('same.ass');
  const two = file('same.ass');
  assert.notStrictEqual(one, two);
  const subtitleRows = [
    { file: one, title: 'First', format: { label: 'ASS', assLike: true } },
    { file: two, title: 'Second', format: { label: 'ASS', assLike: true } },
  ];
  const audioRows = [
    { file: file('same.opus'), title: 'Audio one' },
    { file: file('same.opus'), title: 'Audio two' },
  ];
  const fontRows = [file('same.ttf'), file('same.ttf')];
  const props = { video, newSubtitles: subtitleRows, externalAudio: audioRows, fonts: fontRows };
  const actual = buildOutputComposition(props);
  assert.equal(new Set(actual.items.map(row => row.id)).size, actual.items.length);
  const subtitles = actual.items.filter(row => row.kind === 'subtitle');
  assert.deepEqual(subtitles.map(row => row.target.index), [0, 1]);
  assert.equal(subtitles[0].target.fileKey, subtitles[1].target.fileKey);
  assert.notEqual(subtitles[0].id, subtitles[1].id);
  assert.deepEqual(subtitles.map(row => row.title), ['First', 'Second']);
  assert.deepEqual(actual.items.filter(row => row.kind === 'audio').map(row => row.target.index), [0, 1]);
  const fonts = actual.items.filter(row => row.kind === 'font');
  assert.deepEqual(fonts.map(row => row.target.index), [0, 1]);
  assert.notEqual(fonts[0].id, fonts[1].id);
  // Repainting the same actual File inventory must not change the row keys.
  assert.deepEqual(buildOutputComposition(props).items.map(row => row.id), actual.items.map(row => row.id));
  // A new file with equivalent metadata does not acquire a persistent byte identity.
  assert.equal(actual.items.find(row => row.title === 'First').target.fileKey,
    actual.items.find(row => row.title === 'Second').target.fileKey);
});

test('deliberately adding the same subtitle File twice preserves two editable occurrences', () => {
  const ass = file('reused.ass');
  const result = buildOutputComposition({ newSubtitles: [
    { file: ass, title: 'Primary' },
    { file: ass, title: 'Alternate' },
  ] });
  assert.equal(result.counts.subtitle, 2);
  assert.equal(new Set(result.items.map(item => item.id)).size, 2);
  assert.deepEqual(result.items.map(item => item.target.index), [0, 1]);
});
