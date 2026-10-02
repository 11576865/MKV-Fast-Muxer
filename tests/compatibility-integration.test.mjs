import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const report = fs.readFileSync(new URL('../src/mux-report.js', import.meta.url), 'utf8');

test('runtime mux path resolves compatibility after actual probes and before ffmpeg exec', () => {
  const resolver = main.indexOf('const compatibility = resolveMuxCompatibility({');
  const exec = main.indexOf('const code = await ffmpeg.exec(args);', resolver);
  assert.ok(resolver >= 0, 'compatibility resolver must be called');
  assert.ok(exec > resolver, 'compatibility must be resolved before the real mux');
  assert.match(main, /videoStreams: sourceVideos/);
  assert.match(main, /externalAudioTracks: runtimeExternalAudio/);
  assert.match(main, /newSubtitles: runtimeSubtitles/);
  assert.match(main, /silent transcode=false/);
});

test('UNSUPPORTED compatibility blocks execution while UNVERIFIED does not imply transcode', () => {
  assert.match(
    main,
    /if \(compatibility\.state === COMPATIBILITY_STATE\.UNSUPPORTED\)/,
  );
  assert.doesNotMatch(main, /compatibility\.state === COMPATIBILITY_STATE\.UNVERIFIED[\s\S]{0,160}throw/);
});

test('mux report carries both rule result and actual execution evidence', () => {
  assert.match(report, /compatibility = null/);
  assert.match(main, /compatibility:\s*\{[\s\S]*muxSucceeded: true/);
  assert.match(main, /evidence: 'actual-ffmpeg-mux'/);
});

test('selection plan surfaces compatibility notes before execution', () => {
  assert.match(main, /compatibilityPlanMessages\(/);
  assert.match(main, /sourceSubtitleKnowledge:/);
});
