import assert from 'node:assert/strict';
import test from 'node:test';

import { batchSubtitleSummary, buildBatchJobs, stem } from '../src/batch.js';

function file(name) {
  return { name };
}

test('pairs same-stem and language-suffixed subtitles to videos', () => {
  const result = buildBatchJobs(
    [file('Show S01E01.mkv'), file('Show S01E02.mp4')],
    [
      file('Show S01E01.zh-Hans.ass'),
      file('Show S01E01.en.srt'),
      file('Show S01E02.vtt'),
    ],
  );

  assert.equal(result.jobs.length, 2);
  assert.equal(result.jobs[0].subtitles.length, 2);
  assert.equal(result.jobs[1].subtitles.length, 1);
  assert.equal(result.unmatchedSubtitles.length, 0);
});

test('reports unmatched batch inputs without inventing a pairing', () => {
  const result = buildBatchJobs(
    [file('episode-01.mkv'), file('episode-02.mkv')],
    [file('totally-different.ass')],
  );
  assert.equal(result.jobs.length, 0);
  assert.equal(result.unmatchedVideos.length, 2);
  assert.equal(result.unmatchedSubtitles.length, 1);
});

test('batch summary distinguishes subtitle formats', () => {
  assert.equal(
    batchSubtitleSummary({ subtitles: [file('a.ass'), file('a.srt'), file('a.vtt')] }),
    '1 ASS · 1 SRT · 1 VTT'
  );
  assert.equal(stem(' Episode 01.MKV '), 'episode 01');
});
