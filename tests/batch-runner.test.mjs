import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBatchJobLedger, freezeBatchJobPlan } from '../src/batch-job-plan.js';
import { buildBatchJobs } from '../src/batch.js';
import { runFrozenBatchQueue } from '../src/batch-runner.js';

const file = (name) => ({ name, size: 12, lastModified: 1234 });
function fixture(count = 3) {
  const pairing = buildBatchJobs([
    ...Array.from({length: count}, (_, i) => file(`Batch S01E${String(i+1).padStart(2,'0')}.mp4`)),
  ], [
    ...Array.from({length: count}, (_, i) => file(`Batch S01E${String(i+1).padStart(2,'0')}.zh.ass`)),
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
  auditStatus: 'pass',
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
  assert.equal(outcome.results[0].auditStatus, 'pass');
  assert.equal(outcome.results[0].outputSha256, 'abc');
  assert.deepEqual(phases, plan.jobs.flatMap((job) => [
    'prepare:' + job.outputName, 'mux:' + job.outputName, 'save:' + job.outputName,
  ]));
  assert.deepEqual(visible.map((x) => x.length), [1, 2, 3]);
});

test('a generated artifact with failed or unavailable audit remains downloadable but is never marked verified', async () => {
  const { plan, ledger } = fixture();
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    prepare: async () => {},
    execute: async (job, index) => ({
      ...artifact(job), auditStatus: index === 0 ? 'warning' : 'unavailable',
      auditIssues: index === 0 ? ['字幕数量不一致'] : [],
    }),
    publish: async () => ({ savedToDirectory: true, directorySaveError: '' }),
  });
  assert.equal(outcome.results.length, 3);
  assert.ok(outcome.results.every((entry) => entry.ok));
  assert.deepEqual(ledger.snapshot().map((entry) => entry.state),
    ['auditWarning', 'auditWarning', 'auditWarning']);
  assert.match(ledger.snapshot()[0].error, /字幕数量不一致/);
  assert.match(ledger.snapshot()[1].error, /未完成/);
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

test('a mismatched output name is refused before persistence', async () => {
  const { plan, ledger } = fixture();
  let saves = 0;
  const outcome = await runFrozenBatchQueue(plan, {
    ledger,
    prepare: async () => {},
    execute: async (job) => ({ ...artifact(job), outputName: 'unauthorized.mkv' }),
    publish: async () => { saves++; return { savedToDirectory: true }; },
  });
  assert.equal(saves, 0);
  assert.equal(outcome.results.length, 3);
  assert.ok(outcome.results.every((entry) => !entry.ok));
  assert.match(outcome.results[0].error, /输出身份与冻结任务不一致/);
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
  assert.match(main, /async function executeCurrentMuxTask\(explicit = null\)/);
  assert.match(main, /const result = await executeCurrentMuxTask\(activeBatchMuxContext\)/);
  assert.match(main, /await runFrozenBatchQueue\(frozenPlan,/);
  assert.match(main, /createFrozenBatchMuxContext\(frozenPlan, job,/);
  const batchRun = main.slice(main.indexOf('batchStartBtn?.addEventListener'), main.lastIndexOf('resetTrackState();'));
  assert.doesNotMatch(batchRun, /setInputFiles\((?:videoInput|audioInput|subInput|fontInput),/);
  assert.doesNotMatch(batchRun, /await videoSniffPromise|await subtitleInspectPromise|await fontInspectPromise/);
  assert.doesNotMatch(main, /muxBtn\.click\(\)/);
  assert.doesNotMatch(main, /waitForSingleMuxCompletion/);
  assert.doesNotMatch(runner, /document\.|\.click\(|new Event\(|window\./);
});


test('20-job batch retries only failed IDs and retains the other 18 artifacts and frozen rules', async () => {
  const { plan, ledger } = fixture(20);
  const adapters = {
    ledger, prepare: async () => {},
    execute: async (job, index) => {
      if ([2, 16].includes(index)) throw Error('transient worker error');
      return artifact(job);
    },
    publish: async () => ({ savedToDirectory: false, url: 'blob:original' }),
  };
  const first = await runFrozenBatchQueue(plan, adapters);
  assert.equal(first.results.filter(r => r.ok).length, 18);
  const ids = [plan.jobs[2].jobId, plan.jobs[16].jobId];
  ledger.requeueFailed(ids);
  const ran = [];
  const retry = await runFrozenBatchQueue(plan, {
    ...adapters, jobIds: ids,
    execute: async (job, index, current) => {
      assert.equal(current, plan);
      assert.equal(job, plan.jobs[index]);
      ran.push(index);
      return artifact(job);
    },
  });
  assert.deepEqual(ran, [2, 16]);
  assert.equal(retry.results.length, 2);
  assert.equal(ledger.snapshot().filter(e => e.state === 'awaitingSave').length, 20);
  const final = first.results.map(item => retry.results.find(r => r.job.jobId === item.job.jobId) || item);
  assert.ok(final.every(r => r.ok));
  for (const item of first.results.filter(r => r.ok))
    assert.equal(final.find(r => r.job.jobId === item.job.jobId), item);
});

test('requeue is atomic and refuses successful, unknown, duplicate, and active IDs', async () => {
  const { plan, ledger } = fixture();
  await runFrozenBatchQueue(plan, {
    ledger, prepare: async () => {},
    execute: async (job, index) => { if (index === 1) throw Error('failed'); return artifact(job); },
    publish: async () => ({savedToDirectory: false}),
  });
  const before = ledger.snapshot();
  for (const ids of [[], ['missing'], [plan.jobs[1].jobId, plan.jobs[0].jobId],
    [plan.jobs[1].jobId, plan.jobs[1].jobId]]) {
    assert.throws(() => ledger.requeueFailed(ids));
    assert.deepEqual(ledger.snapshot(), before);
  }
  ledger.requeueFailed([plan.jobs[1].jobId]);
  assert.throws(() => ledger.requeueFailed([plan.jobs[1].jobId]));
});

test('selected execution refuses unknown or terminal jobs before invoking any adapter', async () => {
  const {plan, ledger} = fixture();
  let calls = 0;
  const adapters = {ledger, prepare: async()=>{calls++;}, execute: async job => artifact(job), publish: async()=>({})};
  for (const ids of [[], ['unknown'], [plan.jobs[0].jobId, plan.jobs[0].jobId]])
    await assert.rejects(runFrozenBatchQueue(plan, {...adapters, jobIds: ids}));
  assert.equal(calls, 0);
  await runFrozenBatchQueue(plan, adapters);
  await assert.rejects(runFrozenBatchQueue(plan, {...adapters, jobIds: [plan.jobs[0].jobId]}));
  assert.equal(calls, 3);
});

test('failed-job retry cancellation leaves previous successes and unselected failures unchanged', async () => {
  const {plan, ledger} = fixture();
  const adapters = {ledger, prepare: async()=>{}, execute: async(job,index)=>{
    if(index !== 0) throw Error('worker failed'); return artifact(job);
  }, publish: async()=>({savedToDirectory:true})};
  await runFrozenBatchQueue(plan, adapters);
  ledger.requeueFailed([plan.jobs[1].jobId]);
  const outcome = await runFrozenBatchQueue(plan, {...adapters, jobIds:[plan.jobs[1].jobId], shouldCancel:()=>true});
  assert.equal(outcome.cancelled,true);
  assert.deepEqual(ledger.snapshot().map(e=>e.state),['succeeded','cancelled','failed']);
});
