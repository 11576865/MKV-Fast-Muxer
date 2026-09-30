import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectSubtitleInputs,
  inferLanguageFromFilename,
  inferredSubtitleMetadata,
  isAssLikeSubtitle,
  isPreviewableSubtitle,
  isSupportedSubtitleFile,
  subtitleFormatInfo,
  visibleTextForPlainSubtitle,
} from '../src/subtitle-format.js';

test('recognizes text and bitmap subtitle formats', () => {
  assert.equal(isSupportedSubtitleFile('a.ass'), true);
  assert.equal(isSupportedSubtitleFile('a.ssa'), true);
  assert.equal(isSupportedSubtitleFile('a.srt'), true);
  assert.equal(isSupportedSubtitleFile('a.vtt'), true);
  assert.equal(isSupportedSubtitleFile('a.webvtt'), true);
  assert.equal(isSupportedSubtitleFile('a.sup'), true);
  assert.equal(isSupportedSubtitleFile('a.idx'), true);
  assert.equal(isSupportedSubtitleFile('a.sub'), true);
  assert.equal(isSupportedSubtitleFile('a.txt'), false);
  assert.equal(isAssLikeSubtitle('a.ass'), true);
  assert.equal(isAssLikeSubtitle('a.ssa'), true);
  assert.equal(isAssLikeSubtitle('a.srt'), false);
  assert.equal(isPreviewableSubtitle('a.ssa'), true);
  assert.equal(isPreviewableSubtitle('a.vtt'), false);
});

test('WebVTT normalizes only its subtitle stream to SubRip', () => {
  const info = subtitleFormatInfo('captions.vtt');
  assert.equal(info.id, 'webvtt');
  assert.equal(info.ffmpegOutputCodec, 'srt');
  assert.equal(info.expectedCodec, 'subrip');
});

test('plain subtitle visible text strips timing and common markup', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n<b>Hello</b> 世界\n';
  assert.match(visibleTextForPlainSubtitle(srt, 'srt'), /Hello 世界/);
  assert.doesNotMatch(visibleTextForPlainSubtitle(srt, 'srt'), /00:00/);

  const vtt = 'WEBVTT\n\ncue-1\n00:01.000 --> 00:02.000\n<c.red>Hi</c> there\n';
  assert.match(visibleTextForPlainSubtitle(vtt, 'webvtt'), /Hi there/);
  assert.doesNotMatch(visibleTextForPlainSubtitle(vtt, 'webvtt'), /WEBVTT/);
});


test('pairs VobSub IDX and SUB as one subtitle track', () => {
  const idx = { name: 'Movie.zh.idx', size: 10, lastModified: 1 };
  const sub = { name: 'Movie.zh.sub', size: 20, lastModified: 1 };
  const result = collectSubtitleInputs([idx, sub]);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].format.id, 'vobsub');
  assert.equal(result.tracks[0].file, idx);
  assert.equal(result.tracks[0].sidecarFile, sub);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.orphanSidecars.length, 0);
});

test('rejects incomplete VobSub pair and recognizes PGS as bitmap', () => {
  const idxOnly = collectSubtitleInputs([{ name: 'Movie.idx' }]);
  assert.equal(idxOnly.tracks.length, 0);
  assert.equal(idxOnly.invalid.length, 1);

  const sup = subtitleFormatInfo('Movie.sup');
  assert.equal(sup.id, 'pgs');
  assert.equal(sup.expectedCodec, 'hdmv_pgs_subtitle');
  assert.equal(sup.text, false);
  assert.equal(sup.bitmap, true);
});

test('infers common subtitle language suffixes and metadata', () => {
  assert.equal(inferLanguageFromFilename('Show.S01E01.zh-Hans.ass'), 'zh-Hans');
  assert.equal(inferLanguageFromFilename('Show.S01E01.chs.ass'), 'zh-Hans');
  assert.equal(inferLanguageFromFilename('Show.S01E01.cht.ass'), 'zh-Hant');
  assert.equal(inferLanguageFromFilename('Show.S01E01.en.srt'), 'eng');
  assert.equal(inferLanguageFromFilename('Show.S01E01.ja.ass'), 'jpn');
  assert.equal(inferLanguageFromFilename('Show.S01E01.unknown.ass'), 'und');
  assert.deepEqual(
    inferredSubtitleMetadata('Show.S01E01.en.srt', subtitleFormatInfo('x.srt')),
    { language: 'eng', title: 'English · SRT' },
  );
});
