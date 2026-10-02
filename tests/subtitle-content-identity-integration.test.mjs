import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../src/batch.js', import.meta.url), 'utf8');

test('subtitle pickers no longer restrict selection by filename extension', () => {
  const single = html.match(/<input id="subInput"[^>]*>/)?.[0] || '';
  const batchInput = html.match(/<input id="batchSubtitleInput"[^>]*>/)?.[0] || '';
  assert.ok(single);
  assert.ok(batchInput);
  assert.doesNotMatch(single, /accept=/);
  assert.doesNotMatch(batchInput, /accept=/);
  assert.match(html, /按实际内容识别/);
});

test('single subtitle workflow waits for content identity before mux', () => {
  assert.match(main, /identifySubtitleInputs/);
  assert.match(main, /subtitleInspectPromise/);
  assert.match(main, /subtitleIdentityPending/);
  assert.match(main, /await subtitleInspectPromise/);
  assert.match(main, /identityMismatch/);
  assert.doesNotMatch(main, /!isSupportedSubtitleFile\(track\.file\)/);
});

test('batch subtitle pairing consumes content-derived subtitle collection', () => {
  assert.match(main, /buildBatchJobsFromCollected\(videos, subtitleRecognition\)/);
  assert.match(main, /batchSubtitleIdentityCache/);
  assert.match(main, /subtitleRecognition\.mismatches/);
  assert.match(batch, /export function buildBatchJobsFromCollected/);
});
