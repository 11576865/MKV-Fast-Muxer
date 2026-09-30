import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAssLikeSubtitle,
  isPreviewableSubtitle,
  isSupportedSubtitleFile,
  subtitleFormatInfo,
  visibleTextForPlainSubtitle,
} from '../src/subtitle-format.js';

test('recognizes ASS SSA SRT and WebVTT', () => {
  assert.equal(isSupportedSubtitleFile('a.ass'), true);
  assert.equal(isSupportedSubtitleFile('a.ssa'), true);
  assert.equal(isSupportedSubtitleFile('a.srt'), true);
  assert.equal(isSupportedSubtitleFile('a.vtt'), true);
  assert.equal(isSupportedSubtitleFile('a.webvtt'), true);
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
