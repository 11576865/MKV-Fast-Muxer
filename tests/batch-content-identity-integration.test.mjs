import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../src/batch.js', import.meta.url), 'utf8');

test('batch video picker does not use an extension allowlist as the source of truth', () => {
  const match = html.match(/<input id="batchVideoInput"[^>]*>/);
  assert.ok(match, 'batch video picker must exist');
  assert.doesNotMatch(match[0], /accept=/);
  assert.match(html, /按实际内容识别/);
});

test('batch planner identifies candidate files before filename pairing', () => {
  assert.match(batch, /identifyBatchVideos/);
  assert.match(batch, /sniffFileContainer/);
  assert.doesNotMatch(batch, /VIDEO_EXTENSIONS|isSupportedBatchVideo/);
  assert.match(batch, /isSupportedVideoIdentity/);
  assert.match(main, /identifyBatchVideos\(candidateVideos/);
  assert.match(main, /实际：\$\{job\.videoIdentity\.containerLabel\}/);
});

test('batch execution uses detected Matroska identity for preserve-all behavior', () => {
  assert.match(
    main,
    /batchPreserveAttachments\?\.checked && currentVideoIsMatroska\(job\.video\)/,
  );
  assert.doesNotMatch(
    main,
    /batchPreserveAttachments\?\.checked && ext\(job\.video\.name\) === '\.mkv'/,
  );
});

test('batch start awaits asynchronous content identification before execution', () => {
  assert.match(main, /const pairing = await requestBatchPlanSync\(\)/);
  assert.match(main, /batchPlanPromise = syncBatchPlan\(\)/);
});
