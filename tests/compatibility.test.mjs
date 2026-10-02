import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPATIBILITY_STATE,
  compatibilityPlanMessages,
  resolveMuxCompatibility,
  summarizeCompatibility,
} from '../src/compatibility.js';

test('known Matroska stream-copy combination resolves to DIRECT_COPY', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'h264' }],
    sourceAudioStreams: [{ codec_name: 'aac' }],
    externalAudioTracks: [{ codec: 'flac' }],
    newSubtitles: [{ format: { id: 'ass', assLike: true } }],
    fontAttachments: [{ name: 'font.ttf' }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.DIRECT_COPY);
  assert.equal(result.mediaPolicy.silentTranscode, false);
  assert.deepEqual(result.mediaPolicy.subtitleConversions, []);
});

test('WebVTT is an explicit subtitle-only conversion requirement', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'av1' }],
    sourceAudioStreams: [{ codec_name: 'opus' }],
    newSubtitles: [{ format: { id: 'webvtt', assLike: false } }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.CONVERSION_REQUIRED);
  assert.equal(result.mediaPolicy.subtitleConversions.length, 1);
  assert.deepEqual(result.mediaPolicy.subtitleConversions[0], {
    code: 'webvtt-to-subrip',
    from: 'webvtt',
    to: 'subrip',
    builtIn: true,
  });
  assert.match(result.issues[0].message, /视频和音频保持 Stream Copy/);
});

test('unknown media codec is UNVERIFIED rather than silently transcoded or rejected', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'future_video_codec' }],
    sourceAudioStreams: [{ codec_name: 'future_audio_codec' }],
    newSubtitles: [{ format: { id: 'srt' } }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.UNVERIFIED);
  assert.equal(result.counts.UNVERIFIED, 2);
  assert.equal(result.mediaPolicy.silentTranscode, false);
});

test('undefined subtitle strategy is UNSUPPORTED', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'vp9' }],
    newSubtitles: [{ format: { id: 'mystery' } }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.UNSUPPORTED);
  assert.match(result.issues[0].message, /没有已定义的 MKV 写入策略/);
});

test('font attachment without ASS-like subtitle is a compatibility warning', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'mpeg4' }],
    newSubtitles: [{ format: { id: 'pgs', bitmap: true } }],
    fontAttachments: [{ name: 'font.ttf' }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.COMPATIBILITY_WARNING);
  assert.equal(result.counts.COMPATIBILITY_WARNING, 1);
  assert.match(result.issues[0].message, /不会改变 SRT \/ WebVTT \/ PGS \/ VobSub/);
});

test('source ASS makes uploaded fonts relevant even without new ASS', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'h264' }],
    newSubtitles: [{ format: { id: 'srt' } }],
    sourceSubtitleStreams: [{ codec_name: 'ass' }],
    fontAttachments: [{ name: 'font.ttf' }],
  });

  assert.equal(result.state, COMPATIBILITY_STATE.DIRECT_COPY);
});

test('playback compatibility remains explicitly separate from mux compatibility', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'h264' }],
    newSubtitles: [{ format: { id: 'srt' } }],
  });

  assert.equal(result.playback.verified, false);
  assert.equal(result.playback.profile, null);
  assert.match(result.playback.note, /不等同于播放器兼容性保证/);
});

test('selection plan surfaces subtitle conversion and irrelevant fonts without guessing codecs', () => {
  const messages = compatibilityPlanMessages({
    newSubtitles: [{ format: { id: 'webvtt' } }],
    fontCount: 2,
    hasKnownAssLikeSource: false,
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0], /WebVTT.*SubRip/);
  assert.match(messages[1], /没有 ASS \/ SSA/);
});

test('summary includes conversion warning and unverified counts', () => {
  const result = resolveMuxCompatibility({
    videoStreams: [{ codec_name: 'future_video_codec' }],
    newSubtitles: [{ format: { id: 'webvtt' } }],
    fontAttachments: [{ name: 'font.ttf' }],
  });

  assert.match(summarizeCompatibility(result), /^CONVERSION_REQUIRED/);
  assert.match(summarizeCompatibility(result), /1 conversion/);
  assert.match(summarizeCompatibility(result), /1 warning/);
  assert.match(summarizeCompatibility(result), /1 unverified/);
});
