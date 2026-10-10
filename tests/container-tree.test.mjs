import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContainerTreeModel } from '../src/container-tree.js';

const fixture = () => ({
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'hevc' },
    { index: 1, codec_type: 'audio', codec_name: 'opus' },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass' },
    { index: 3, codec_type: 'attachment', codec_name: 'ttf' },
    { index: 4, codec_type: 'data', codec_name: 'bin_data' },
  ],
  tracks: [
    { index: 1, order: 1, type: 'audio', include: true, language: 'eng', originalLanguage: 'eng',
      title: 'Audio', originalTitle: 'Audio', default: true, originalDefault: true },
    { index: 2, order: 2, type: 'subtitle', include: true, language: 'zho', originalLanguage: 'zho',
      title: 'Signs', originalTitle: 'Signs', forced: false, originalForced: false },
  ],
  attachments: [{ index: 3, include: true, filename: 'font.ttf', originalFilename: 'font.ttf',
    mimetype: 'font/ttf', originalMimetype: 'font/ttf' }],
  chapters: [{ start_time: '0.000', end_time: '10.000', tags: { title: 'Intro' } }],
  format: { tags: { title: 'Episode' } },
});

const item = (model, kind) => model.groups.find(group => group.key === kind)?.items[0];

test('tree is unavailable without a verified source scan', () => {
  assert.equal(buildContainerTreeModel(null), null);
});

test('groups every source stream with attachments, chapters and global metadata', () => {
  const model = buildContainerTreeModel(fixture(), { metadataTags: { title: 'Episode' } });
  assert.equal(model.streamCount, 5);
  assert.equal(model.attachmentCount, 1);
  assert.equal(model.chapterCount, 1);
  assert.deepEqual(model.groups.map(group => group.key),
    ['video', 'audio', 'subtitle', 'data', 'attachment', 'chapter', 'metadata']);
  assert.deepEqual(item(model, 'metadata').tags, [['title', 'Episode']]);
  assert.equal(item(model, 'chapter').chapter.tags.title, 'Intro');
});

test('direct metadata and include mutations are projected from shared trackState', () => {
  const state = fixture();
  state.tracks[0].include = false;
  state.tracks[1].title = 'Edited Signs';
  state.attachments[0].filename = 'renamed.ttf';
  const tree = buildContainerTreeModel(state);
  assert.equal(item(tree, 'video').status, 'keep');
  assert.equal(item(tree, 'audio').status, 'remove');
  assert.equal(item(tree, 'subtitle').status, 'modify');
  assert.equal(item(tree, 'attachment').status, 'modify');
  assert.equal(item(tree, 'subtitle').track, state.tracks[1], 'tree must not clone edit state');
});

test('preserve-all mode reports source content as retained, without changing edit objects', () => {
  const state = fixture();
  state.tracks[0].include = false;
  const tree = buildContainerTreeModel(state, { appendMode: true });
  assert.equal(item(tree, 'audio').status, 'keep');
  assert.equal(state.tracks[0].include, false, 'rendering must never mutate track state');
  assert.equal(tree.appendMode, true);
});

test('unknown streams are not omitted; their editability remains read-only', () => {
  const state = fixture();
  state.streams.push({ index: 5, codec_type: 'unknown_media', codec_name: 'mystery' });
  const tree = buildContainerTreeModel(state);
  assert.equal(tree.streamCount, 6);
  assert.equal(item(tree, 'other').status, 'remove');
  assert.equal(item(tree, 'other').track, null);
});

test('tree sorts included audio by editable order and exposes bounded moves', () => {
  const state = fixture();
  state.streams.push({ index: 6, codec_type: 'audio', codec_name: 'flac' });
  state.tracks.push({
    index: 6, order: 6, type: 'audio', include: true,
    language: 'jpn', originalLanguage: 'jpn',
    title: 'Second', originalTitle: 'Second',
    default: false, originalDefault: false,
    forced: false, originalForced: false,
    original: false, originalOriginal: false,
    commentary: false, originalCommentary: false,
    hearingImpaired: false, originalHearingImpaired: false,
  });
  const initial = buildContainerTreeModel(state);
  const initialAudio = initial.groups.find(group => group.key === 'audio').items;
  assert.deepEqual(initialAudio.map(item => item.index), [1, 6]);
  assert.equal(initialAudio[0].canMoveUp, false);
  assert.equal(initialAudio[0].canMoveDown, true);
  assert.equal(initialAudio[1].canMoveUp, true);
  assert.equal(initialAudio[1].canMoveDown, false);

  [state.tracks[0].order, state.tracks[2].order] =
    [state.tracks[2].order, state.tracks[0].order];
  const reordered = buildContainerTreeModel(state).groups.find(group => group.key === 'audio').items;
  assert.deepEqual(reordered.map(item => item.index), [6, 1]);
  assert.equal(reordered[0].status, 'modify');
  assert.equal(reordered[1].status, 'modify');

  state.tracks[2].include = false;
  const excluded = buildContainerTreeModel(state).groups.find(group => group.key === 'audio').items;
  assert.equal(excluded.find(item => item.index === 1).canMoveUp, false);
  assert.equal(excluded.find(item => item.index === 1).canMoveDown, false);
  assert.equal(buildContainerTreeModel(state, { appendMode: true }).groups
    .find(group => group.key === 'audio').items[0].canMoveDown, false);
});
