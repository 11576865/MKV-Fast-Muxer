import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBatchJobLedger, freezeBatchJobPlan } from '../src/batch-job-plan.js';
import { buildBatchJobs } from '../src/batch.js';
import { runFrozenBatchQueue } from '../src/batch-runner.js';

const file = (name) => ({ name, size: 12, lastModified: 1234 });
function fixture() {
  const pairing = buildBatchJobs([
    file('Batch S01E01.mp4'), file('Batch S01E02.mp4'), file('Batch S01E03.mp4'),
  ], [
    file('Batch S01E01.zh.ass'), file('Batch S01E02.en.ass'), file('Batch S01E03.zh.ass'),
  ]);
  pairing.fonts = [];
  pairing.fontRecognition = { recognized: [], ignored: [] };
  pairing.videoRecognition = { recognized: [], ignored: [] };
  pairing.directoryConflicts = [];
  pairing.directoryCheckError = '';
  const plan = freezeBatchJobPlan(pairing, { generation: 8 });
  const ledger = createBatchJobLedger(plan);
  return { plan, ledger };
}
const artifact = (job) => ({
  blob: new Blob([job.outputName]),
  outputName: job.outputName,
  reportBlob: new Blob(['{}']),
  reportName: job.outputName + '.report.json',
  auditStatus: 'ok',
  outputSha256: 'abc',
});

test('headless queue executes frozen jobs in order, preserving audit evidence and save identities', async () => {
  const { plan, ledger } = fixture();
  const phases = [];
  const visible = [];
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    prepare: async (job) => phases.push('prepare:' + job.outputName),
    execute: async (job) => { phases.push('mux:' + job.outputName); return artifact(job); },
    publish: async (job) => { phases.push('save:' + job.outputName); return {
      savedToDirectory: false, url: 'blob:test-' + job.outputName,
      reportUrl: 'blob:report', reportName: job.outputName + '.report.json',
      directorySaveError: '',
    }; },
    onResults: (entries) => visible.push(entries.map((e) => e.job.jobId)),
  });
  assert.equal(outcome.fatalError, '');
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.results.length, 3);
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state), [
    'awaitingSave', 'awaitingSave', 'awaitingSave',
  ]);
  assert.equal(outcome.results[0].auditStatus, 'ok');
  assert.equal(outcome.results[0].outputSha256, 'abc');
  assert.deepEqual(phases, plan.jobs.flatMap((job) => [
    'prepare:' + job.outputName, 'mux:' + job.outputName, 'save:' + job.outputName,
  ]));
  assert.deepEqual(visible.map((x) => x.length), [1, 2, 3]);
});

test('one mux error fails only that job; another verified output remains accessible', async () => {
  const { plan, ledger } = fixture();
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    prepare: async () => {},
    execute: async (job, index) => {
      if (index === 1) throw new Error('bad subtitle payload');
      return artifact(job);
    },
    publish: async () => ({ savedToDirectory: true }),
  });
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state), [
    'succeeded', 'failed', 'succeeded',
  ]);
  assert.deepEqual(outcome.results.map((entry) => entry.ok), [true, false, true]);
  assert.match(outcome.results[1].error, /bad subtitle/);
  assert.equal(outcome.fatalError, '');
});

test('adapter preparation error aborts the rest because its staging state is unknown', async () => {
  const { plan, ledger } = fixture();
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    prepare: async (_job, index) => {
      if (index === 1) throw new Error('staging input corrupted');
    },
    execute: async (job) => artifact(job),
    publish: async () => ({ savedToDirectory: false }),
  });
  assert.equal(outcome.results.length, 1);
  assert.match(outcome.fatalError, /staging input corrupted/);
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state), [
    'awaitingSave', 'interrupted', 'interrupted',
  ]);
});

test('user cancellation after first artifact does not start a second job', async () => {
  const { plan, ledger } = fixture();
  let cancel = false;
  let started = 0;
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    shouldCancel: () => cancel,
    prepare: async () => {},
    execute: async (job) => { started++; return artifact(job); },
    publish: async () => ({ savedToDirectory: true }),
    onResults: () => { cancel = true; },
  });
  assert.equal(started, 1);
  assert.equal(outcome.cancelled, true);
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state), [
    'succeeded', 'cancelled', 'cancelled',
  ]);
});

test('cancel while a job is executing never publishes its partial result', async () => {
  const { plan, ledger } = fixture();
  let cancelled = false;
  let publications = 0;
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    shouldCancel: () => cancelled,
    prepare: async () => {},
    execute: async (job) => { cancelled = true; return artifact(job); },
    publish: async () => { publications++; return { savedToDirectory: false }; },
  });
  assert.equal(outcome.cancelled, true);
  assert.equal(publications, 0);
  assert.equal(outcome.results.length, 0);
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state), [
    'cancelled', 'cancelled', 'cancelled',
  ]);
});

test('missing frozen authorization or incompatible ledger is not runnable', async () => {
  const { plan } = fixture();
  const other = fixture();
  await assert.rejects(runFrozenBatchQueue(plan, {
    ledger: other.ledger, prepare: async () => {},
    execute: async (job) => artifact(job), publish: async () => {},
  }), /一致的冻结计划/);
});

test('production integration has no synthetic mux click or link polling path', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../src/batch-runner.js', import.meta.url), 'utf8');
  assert.match(main, /async function executeCurrentMuxTask\(\)/);
  assert.match(main, /const result = await executeCurrentMuxTask\(\)/);
  assert.match(main, /await runFrozenBatchQueue\(frozenPlan,/);
  assert.doesNotMatch(main, /muxBtn\.click\(\)/);
  assert.doesNotMatch(main, /waitForSingleMuxCompletion/);
  assert.doesNotMatch(runner, /document\.|\.click\(|new Event\(|window\./);
});
