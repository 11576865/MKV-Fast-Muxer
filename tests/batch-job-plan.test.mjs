import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildBatchJobs } from '../src/batch.js';
import { BATCH_JOB_PLAN_SCHEMA, BATCH_JOB_STATES, freezeBatchJobPlan, createBatchJobLedger } from '../src/batch-job-plan.js';

const file = (name) => ({ name, size: 100, lastModified: 123 });
function validPairing() {
  const pairing = buildBatchJobs(
    [file('Series S01E01.mp4'), file('Series S01E02.mp4')],
    [file('Series S01E01.zh.ass'), file('Series S01E02.en.srt')],
  );
  pairing.fonts = [file('Font.otf')];
  pairing.fontRecognition = {
    ignored: [],
    recognized: [{ file: pairing.fonts[0], identity: {
      valid: true, container: 'single', flavor: 'truetype', descriptors: [{ family: 'Fixture Sans' }],
    } }],
  };
  pairing.videoRecognition = { ignored: [] };
  pairing.directoryConflicts = [];
  pairing.directoryCheckError = '';
  return pairing;
}

test('frozen batch plan preserves actual per-job media inputs, output and policy without editing source', () => {
  const pairing = validPairing();
  const plan = freezeBatchJobPlan(pairing, {
    generation: 17, preserveAttachments: true,
    subsetEnabled: true, subsetScope: 'group', directoryName: 'episodes',
  });
  assert.equal(plan.schema, BATCH_JOB_PLAN_SCHEMA);
  assert.equal(plan.jobs.length, 2);
  assert.equal(plan.jobs[0].subtitleTracks.length, 1);
  assert.equal(plan.jobs[0].subtitleInputFiles[0].name, 'Series S01E01.zh.ass');
  assert.equal(plan.jobs[1].outputName, 'Series S01E02.mkv');
  assert.equal(plan.policy.subsetEnabled, true);
  assert.equal(plan.policy.subsetScope, 'group');
  assert.equal(plan.policy.directoryName, 'episodes');
  assert.equal(plan.fonts[0].name, 'Font.otf');
  assert.equal(plan.fontRecognition.recognized[0].file, plan.fonts[0]);
  assert.equal(plan.fontRecognition.recognized[0].identity.flavor, 'truetype');
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.jobs));
  assert.ok(Object.isFrozen(plan.jobs[0]));
  assert.ok(Object.isFrozen(plan.jobs[0].subtitleInputFiles));
  assert.ok(Object.isFrozen(plan.policy));
  pairing.jobs[0].outputName = 'changed.mkv';
  pairing.jobs[0].subtitleInputFiles.splice(0);
  pairing.fonts.splice(0);
  pairing.fontRecognition.recognized.splice(0);
  assert.equal(plan.jobs[0].outputName, 'Series S01E01.mkv');
  assert.equal(plan.jobs[0].subtitleInputFiles.length, 1);
  assert.equal(plan.fonts.length, 1);
  assert.equal(plan.fontRecognition.recognized.length, 1);
});

test('plan freeze fails closed on ambiguous pairing, target collision and invalid inputs', () => {
  const pairing = validPairing();
  const options = { generation: 2 };
  pairing.ambiguousPairings = [{ track: file('tie.ass') }];
  assert.throws(() => freezeBatchJobPlan(pairing, options), /字幕归属未确认/);
  pairing.ambiguousPairings = [];
  pairing.outputNameCollisions = [{ outputName: 'duplicate.mkv' }];
  assert.throws(() => freezeBatchJobPlan(pairing, options), /批量输出重名/);
  pairing.outputNameCollisions = [];
  pairing.directoryCheckError = 'permission revoked';
  assert.throws(() => freezeBatchJobPlan(pairing, options), /输出目录检查失败/);
  pairing.directoryCheckError = '';
  pairing.videoRecognition.ignored = [{ file: file('other.bin') }];
  assert.equal(freezeBatchJobPlan(pairing, options).jobs.length, 2,
    'legacy categorized import continues to reject or ignore unsupported inputs at its own preflight');
  assert.throws(() => freezeBatchJobPlan(pairing, { ...options, strictVideoInputs: true }), /不支持的视频/);
});

test('a batch ledger owns lifecycle only and rejects illegal transitions', () => {
  const plan = freezeBatchJobPlan(validPairing(), { generation: 3 });
  const observed = [];
  const ledger = createBatchJobLedger(plan, (states) => observed.push(states));
  const id = plan.jobs[0].jobId;
  assert.deepEqual(ledger.snapshot().map((s) => s.state), ['queued', 'queued']);
  assert.throws(() => ledger.transition(id, 'succeeded'), /不允许的任务状态变化/);
  ledger.transition(id, 'preparing');
  ledger.transition(id, 'muxing');
  ledger.transition(id, 'saving');
  ledger.transition(id, 'awaitingSave');
  assert.equal(ledger.snapshot()[0].state, 'awaitingSave');
  assert.equal(BATCH_JOB_STATES.awaitingSave, '待下载保存');
  assert.throws(() => ledger.transition(id, 'succeeded'), /不允许的任务状态变化/);
  ledger.interruptRemaining('用户取消后尚未运行', { cancelled: true });
  assert.equal(ledger.snapshot()[1].state, 'cancelled');
  assert.ok(observed.length >= 5);
  assert.ok(Object.isFrozen(ledger.snapshot()[0]));
});

test('directory-save failure stays separate from mux failure', () => {
  const plan = freezeBatchJobPlan(validPairing(), { generation: 6 });
  const ledger = createBatchJobLedger(plan);
  const id = plan.jobs[0].jobId;
  ledger.transition(id, 'preparing');
  ledger.transition(id, 'muxing');
  ledger.transition(id, 'saving');
  ledger.transition(id, 'saveWarning', { error: 'quota exceeded' });
  assert.equal(ledger.snapshot()[0].state, 'saveWarning');
  assert.equal(ledger.snapshot()[0].error, 'quota exceeded');
});

test('running batch UI reads frozen ledger and uses the direct single-task mux result', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(main, /freezeBatchJobPlan\(pairing,/);
  assert.match(main, /const \{ pairing, frozenPlan, selectedOutputDirectory \} = preparation/);
  assert.match(main, /createBatchJobLedger\(frozenPlan, refreshBatchExecutionViews\)/);
  assert.match(main, /function indexBatchExecutionBySource\(\)/);
  assert.match(main, /new Map\(ledger\.plan\.jobs\.map\(/);
  assert.doesNotMatch(main, /ledger\.plan\.jobs\.find\(/);
  assert.match(main, /for \(let index = 0; index < frozenPlan\.jobs\.length/);
  assert.match(main, /frozenPlan\.policy\.subsetScope/);
  assert.match(main, /activeBatchJobLedger\.transition\(job\.jobId, 'saving'\)/);
  assert.match(main, /activeBatchJobLedger\?\.interruptRemaining/);
  assert.match(main, /runFrozenBatchQueue\(frozenPlan,/);
  assert.doesNotMatch(main, /muxBtn\.click\(\)/);
  assert.match(css, /\.batch-review-lifecycle/);
});
