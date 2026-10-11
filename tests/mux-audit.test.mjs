import assert from 'node:assert/strict';
import test from 'node:test';

import { auditMuxProbe, chapterAuditExpectation } from '../src/mux-audit.js';

test('audit validates codecs, metadata, chapters and attachment filenames', () => {
  const probe = {
    streams: [
      { codec_type: 'video', codec_name: 'hevc', tags: {}, disposition: {} },
      { codec_type: 'audio', codec_name: 'aac', tags: { language: 'jpn', title: 'JP' }, disposition: { default: 1 } },
      { codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'zho', title: '简体中文' }, disposition: { default: 1, forced: 0 } },
      { codec_type: 'attachment', codec_name: 'ttf', tags: { filename: 'A.ttf' }, disposition: {} },
      { codec_type: 'attachment', codec_name: 'otf', tags: { filename: 'B.otf' }, disposition: {} },
    ],
    chapters: [{ id: 0 }, { id: 1 }],
    format: { tags: { title: 'Movie' } },
  };

  const result = auditMuxProbe(probe, {
    video: [{ codec: 'hevc' }],
    audio: [{ codec: 'aac', language: 'jpn', title: 'JP', default: true }],
    subtitles: [{ codec: 'ass', language: 'zho', title: '简体中文', default: true, forced: false }],
    chapterCount: 2,
    formatTitle: 'Movie',
    attachmentCount: 2,
    attachmentFilenames: ['A.ttf'],
    newFontFilenames: ['B.otf'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.counts.chapter, 2);
});

test('audit detects stream-copy codec drift and lost chapter/attachment', () => {
  const result = auditMuxProbe({
    streams: [
      { codec_type: 'video', codec_name: 'h264', tags: {}, disposition: {} },
      { codec_type: 'audio', codec_name: 'opus', tags: { language: 'eng', title: '' }, disposition: { default: 0 } },
    ],
    chapters: [],
    format: { tags: { title: '' } },
  }, {
    video: [{ codec: 'av1' }],
    audio: [{ codec: 'opus', language: 'eng', title: '', default: false }],
    subtitles: [],
    chapterCount: 1,
    attachmentCount: 1,
    attachmentFilenames: ['font.ttf'],
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('视频 #1 codec')));
  assert.ok(result.issues.some((issue) => issue.includes('章节数量')));
  assert.ok(result.issues.some((issue) => issue.includes('附件数量')));
  assert.ok(result.issues.some((issue) => issue.includes('font.ttf')));
});

test('audit validates advanced track dispositions', () => {
  const result = auditMuxProbe({
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        tags: {},
        disposition: {},
      },
      {
        codec_type: 'audio',
        codec_name: 'flac',
        tags: { language: 'eng', title: 'Commentary' },
        disposition: { default: 0, original: 1, comment: 1, hearing_impaired: 0 },
      },
      {
        codec_type: 'subtitle',
        codec_name: 'ass',
        tags: { language: 'zh-Hans', title: '简体中文' },
        disposition: { default: 1, forced: 0, original: 0, comment: 0, hearing_impaired: 1 },
      },
    ],
    chapters: [],
    format: { tags: {} },
  }, {
    video: [{ codec: 'h264' }],
    audio: [{
      codec: 'flac',
      language: 'eng',
      title: 'Commentary',
      default: false,
      original: true,
      commentary: true,
      hearingImpaired: false,
    }],
    subtitles: [{
      codec: 'ass',
      language: 'zh-Hans',
      title: '简体中文',
      default: true,
      forced: false,
      original: false,
      commentary: false,
      hearingImpaired: true,
    }],
  });

  assert.equal(result.ok, true);
});

test('audit validates attachment MIME and global metadata preservation', () => {
  const result = auditMuxProbe({
    streams: [
      { codec_type: 'video', codec_name: 'h264', tags: {}, disposition: {} },
      { codec_type: 'attachment', codec_name: 'unknown', tags: { filename: 'notes-renamed.txt', mimetype: 'text/x-notes' }, disposition: {} },
      { codec_type: 'attachment', codec_name: 'ttf', tags: { filename: 'Font-mkvfm-abcdef12.ttf', mimetype: 'font/ttf' }, disposition: {} },
    ],
    chapters: [{ id: 0 }],
    format: { tags: { TITLE: 'Fixture Container', COMMENT: 'Keep me' } },
  }, {
    video: [{ codec: 'h264' }],
    audio: [],
    subtitles: [],
    chapterCount: 1,
    formatTitle: 'Fixture Container',
    formatTags: { title: 'Fixture Container', comment: 'Keep me' },
    attachments: [
      { filename: 'notes-renamed.txt', mimetype: 'text/x-notes' },
      { filename: 'Font-mkvfm-abcdef12.ttf', mimetype: 'font/ttf' },
    ],
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues));
});


test('audit includes Matroska data streams in the verified container inventory', () => {
  const result = auditMuxProbe({
    streams: [
      { codec_type: 'video', codec_name: 'h264' },
      { codec_type: 'data', codec_name: 'bin_data' },
    ],
    chapters: [],
    format: { tags: {} },
  }, {
    video: [{ codec: 'h264' }],
    data: [{ codec: 'bin_data' }],
    audio: [],
    subtitles: [],
    attachments: [],
    chapterCount: 0,
  });

  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.counts.data, 1);

  const missing = auditMuxProbe({
    streams: [{ codec_type: 'video', codec_name: 'h264' }],
    chapters: [],
    format: { tags: {} },
  }, {
    video: [{ codec: 'h264' }],
    data: [{ codec: 'bin_data' }],
  });
  assert.equal(missing.ok, false);
  assert.match(missing.issues.join('\n'), /数据轨数量不一致|数据 #1 缺失/);
});


test('audit preserves otherwise unclassified source stream types', () => {
  const result = auditMuxProbe({
    streams: [
      { codec_type: 'video', codec_name: 'h264' },
      { codec_type: 'unknown_type', codec_name: 'mystery' },
    ],
    chapters: [],
    format: { tags: {} },
  }, {
    video: [{ codec: 'h264' }],
    otherStreams: [{ type: 'unknown_type', codec: 'mystery' }],
  });

  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.counts.other, 1);
});


test('chapter audit detects timing drift even when chapter count stays the same', () => {
  const source = [
    { id: 3, start_time: '0.000000', end_time: '12.345000', tags: { title: 'Opening', LANGUAGE: 'eng' } },
    { id: 4, start_time: '12.345000', end_time: '24.000000', tags: { title: 'Main part' } },
  ];
  const expected = { video: [{ codec: 'h264' }], chapters: source.map(chapterAuditExpectation) };
  const result = auditMuxProbe({
    streams: [{ codec_type: 'video', codec_name: 'h264' }],
    chapters: [
      { id: 1, start_time: '0.000000', end_time: '12.345000', tags: { title: 'Opening', language: 'eng' } },
      { id: 2, start_time: '12.370000', end_time: '24.000000', tags: { title: 'Main part' } },
    ],
  }, expected);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /章节 #2 起点/);
  assert.equal(result.issues.some((issue) => issue.includes('章节数量不一致')), false);
});

test('chapter audit verifies source titles and language regardless of ffprobe tag casing', () => {
  const source = { start_time: '0', end_time: '5', tags: { TITLE: 'Opening', LANGUAGE: 'jpn' } };
  const expected = { chapters: [chapterAuditExpectation(source)], videoMin: 0 };
  const good = auditMuxProbe({
    streams: [],
    chapters: [{ start_time: '0', end_time: '5', tags: { title: 'Opening', language: 'jpn' } }],
  }, expected);
  assert.equal(good.ok, true, good.issues.join('\n'));

  const changed = auditMuxProbe({
    streams: [],
    chapters: [{ start_time: '0', end_time: '5', tags: { title: 'Outro', language: 'eng' } }],
  }, expected);
  assert.equal(changed.ok, false);
  assert.match(changed.issues.join('\n'), /章节 #1 title/);
  assert.match(changed.issues.join('\n'), /章节 #1 language/);
});

test('chapter remux audit permits small timestamp quantization and ignores reassigned chapter IDs', () => {
  const source = {
    id: 8, start_time: '1.000000', end_time: '4.125000', tags: { title: 'Part A' },
  };
  const result = auditMuxProbe({
    streams: [],
    chapters: [{ id: 1, start_time: '1.001000', end_time: '4.124000', tags: { TITLE: 'Part A' } }],
  }, { videoMin: 0, chapters: [chapterAuditExpectation(source)] });
  assert.equal(result.ok, true, result.issues.join('\n'));
});

test('chapter audit rejects a missing timestamp and extra chapters', () => {
  const expected = { videoMin: 0, chapters: [chapterAuditExpectation({ start_time: '0', end_time: '3' })] };
  const missingTime = auditMuxProbe({
    streams: [], chapters: [{ start_time: '0', tags: {} }],
  }, expected);
  assert.match(missingTime.issues.join('\n'), /章节 #1 终点/);

  const extra = auditMuxProbe({
    streams: [], chapters: [
      { start_time: '0', end_time: '3' },
      { start_time: '3', end_time: '4' },
    ],
  }, expected);
  assert.match(extra.issues.join('\n'), /章节数量不一致/);
});
