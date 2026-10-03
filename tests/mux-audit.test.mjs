import assert from 'node:assert/strict';
import test from 'node:test';

import { auditMuxProbe } from '../src/mux-audit.js';

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
