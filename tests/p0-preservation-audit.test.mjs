import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRoundtripFacts } from '../scripts/p0-compare-roundtrip.mjs';

const input = () => ({
  ffprobe: {
    streams: [
      { codec_type: 'video', codec_name: 'h264', disposition: { default: 1 }, tags: { language: 'und' } },
      { codec_type: 'audio', codec_name: 'aac', disposition: { default: 1 }, tags: { language: 'jpn', title: 'Main' } },
      { codec_type: 'subtitle', codec_name: 'ass', disposition: { forced: 1 }, tags: { language: 'eng', title: 'Signs' } },
      { codec_type: 'attachment', tags: { filename: 'notes.txt', mimetype: 'text/plain' } },
    ],
    chapters: [
      { start_time: '0.000', end_time: '1.500', tags: { title: 'Introduction' } },
    ],
    format: { tags: { title: 'Example', comment: 'Important metadata', ENCODER: 'ffmpeg' } },
  },
  attachments: [{ filename: 'notes.txt', mimeType: 'text/plain', sha256: 'abcd', size: 4 }],
});

test('P0 scoped oracle accepts unchanged semantic facts, ignores mux writing-application noise', () => {
  const before = input();
  const after = structuredClone(before);
  after.ffprobe.format.tags.ENCODER = 'another muxer';
  after.ffprobe.streams[0].index = 8;
  assert.deepEqual(compareRoundtripFacts(before, after), []);
});

test('P0 oracle detects deleted subtitle and changed forced flag', () => {
  const before = input();
  const after = structuredClone(before);
  after.ffprobe.streams.splice(2, 1);
  assert.ok(compareRoundtripFacts(before, after).some((e) => e.field === 'mediaTracks'));
  const flags = structuredClone(before);
  flags.ffprobe.streams[2].disposition.forced = 0;
  assert.ok(compareRoundtripFacts(before, flags).some((e) => e.field === 'mediaTracks'));
});

test('P0 oracle detects changes to chapter title or bounds, and selected global metadata', () => {
  const before = input();
  const after = structuredClone(before);
  after.ffprobe.chapters[0].end_time = '1.000';
  assert.ok(compareRoundtripFacts(before, after).some((e) => e.field === 'chapters'));
  const meta = structuredClone(before);
  meta.ffprobe.format.tags.comment = 'missing semantics';
  assert.ok(compareRoundtripFacts(before, meta).some((e) => e.field === 'globalMetadata'));
});

test('P0 oracle detects attachment byte hash, filename and MIME differences', () => {
  const before = input();
  const after = structuredClone(before);
  after.attachments[0].sha256 = 'changed';
  assert.ok(compareRoundtripFacts(before, after).some((e) => e.field === 'attachmentNamesTypesAndBytes'));
  after.attachments[0].sha256 = 'abcd';
  after.attachments[0].filename = 'report.txt';
  assert.ok(compareRoundtripFacts(before, after).some((e) => e.field === 'attachmentNamesTypesAndBytes'));
  after.attachments[0].filename = 'notes.txt';
  after.attachments[0].mimeType = 'application/octet-stream';
  assert.ok(compareRoundtripFacts(before, after).some((e) => e.field === 'attachmentNamesTypesAndBytes'));
});

test('P0 deep oracle compares nested chapter topology even when flat FFprobe facts match', () => {
  const before = input();
  const after = structuredClone(before);
  const hierarchy = [{
    editionUid: '510001', editionFlagDefault: '', editionFlagOrdered: '',
    chapters: [{ uid: '510010', start: '00:00:00.000000000', end: '00:00:02.000000000',
      displays: [{ name: 'Parent', language: 'eng', country: '' }],
      children: [{ uid: '510011', start: '00:00:00.200000000', end: '00:00:01.000000000',
        displays: [{ name: 'Nested', language: 'eng', country: '' }], children: [] }] }],
  }];
  before.deep = { chapterHierarchy: hierarchy, p0MarkedTags: [] };
  after.deep = structuredClone(before.deep);
  after.deep.chapterHierarchy[0].chapters[0].children = [];
  const differences = compareRoundtripFacts(before, after);
  assert.ok(differences.some((item) => item.field === 'chapterHierarchy'));
});

test('P0 deep oracle distinguishes targeted chapter tag missing from output', () => {
  const before = input();
  const after = structuredClone(before);
  before.deep = { chapterHierarchy: [], p0MarkedTags: [
    { name: 'P0_NESTED_CHAPTER_KEEP', string: 'linked-chapter-metadata',
      targets: { ChapterUID: '510011' }, binary: '', language: '' },
  ] };
  after.deep = { chapterHierarchy: [], p0MarkedTags: [] };
  const differences = compareRoundtripFacts(before, after);
  assert.ok(differences.some((item) => item.field === 'p0MarkedTags'));
});
