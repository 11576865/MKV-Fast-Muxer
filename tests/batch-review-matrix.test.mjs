import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildBatchJobsFromCollected } from '../src/batch.js';

const video = (name) => ({ name, size: 12, lastModified: 1 });
const subtitle = (name) => ({ file: video(name), format: { label: 'ASS' } });
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('tie is blocked until an explicit per-session selection is made', () => {
  const a = video('Series A S01E01.mkv');
  const b = video('Series B S01E01.mkv');
  const track = subtitle('S01E01.zh.ass');
  const sourceTracks = { tracks: [track] };
  const initial = buildBatchJobsFromCollected([a, b], sourceTracks);
  assert.equal(initial.jobs.length, 0);
  assert.equal(initial.ambiguousPairings.length, 1);
  assert.equal(initial.manuallyAssignedPairings.length, 0);

  const assignments = new Map([[track.file, b]]);
  const reviewed = buildBatchJobsFromCollected([a, b], sourceTracks, { manualAssignments: assignments });
  assert.equal(reviewed.ambiguousPairings.length, 0);
  assert.equal(reviewed.manuallyAssignedPairings.length, 1);
  assert.equal(reviewed.manuallyAssignedPairings[0].video, b);
  assert.equal(reviewed.jobs.length, 1);
  assert.equal(reviewed.jobs[0].video, b);
  assert.equal(reviewed.jobs[0].subtitleTracks[0].file, track.file);
  assert.equal(reviewed.jobs[0].outputName, 'Series B S01E01.mkv');
  assert.equal(assignments.get(track.file), b);
});

test('an explicit choice never invents an out-of-candidate or stale assignment', () => {
  const a = video('Series A S01E01.mkv');
  const b = video('Series B S01E01.mkv');
  const track = subtitle('S01E01.zh.ass');
  const fromOldBatch = video('Series B S01E01.mkv');
  const invalid = buildBatchJobsFromCollected([a, b], { tracks: [track] }, {
    manualAssignments: new Map([[track.file, fromOldBatch]]),
  });
  assert.equal(invalid.ambiguousPairings.length, 1);
  assert.equal(invalid.jobs.length, 0);
});

test('manual assignment is only consulted for a genuine tie', () => {
  const a = video('Series A S01E01.mkv');
  const b = video('Series B S01E01.mkv');
  const track = subtitle('Series B S01E01.zh.ass');
  const result = buildBatchJobsFromCollected([a, b], { tracks: [track] }, {
    manualAssignments: new Map([[track.file, a]]),
  });
  assert.equal(result.ambiguousPairings.length, 0);
  assert.equal(result.manuallyAssignedPairings.length, 0);
  assert.equal(result.jobs[0].video, b);
});

test('batch review UI uses the same pairing and existing execution gate', () => {
  const main = source('../src/main.js');
  const html = source('../index.html');
  const css = source('../src/workbench.css');
  assert.match(main, /manualAssignments: batchManualAssignments/);
  assert.match(main, /batchManualAssignments\.set\(ambiguous\.track\.file, video\)/);
  assert.match(main, /batchManualAssignments\.delete\(confirmed\.track\.file\)/);
  assert.match(main, /batchManualAssignments\.clear\(\)/);
  assert.match(main, /batchPlanGeneration/);
  assert.match(main, /pairing\.ambiguousPairings\.length > 0/);
  assert.match(main, /pairing\.ambiguousPairings\.length \|\|/);
  assert.match(main, /const pairing = await requestBatchPlanSync\(\)/);
  assert.match(html, /id="batchReviewSummary"/);
  assert.match(html, /id="batchJobInspector"/);
  assert.match(html, /id="batchPlan" class="mux-plan batch-review-matrix"/);
  assert.match(css, /\.batch-review-layout/);
  assert.match(css, /@media \(max-width: 960px\)/);
});
