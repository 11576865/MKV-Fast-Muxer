import { BATCH_JOB_PLAN_SCHEMA } from './batch-job-plan.js';

/**
 * Serial, headless batch orchestrator. Does not access DOM, File inputs, or
 * FFmpeg instances. An adapter owns the actual mux and persistence operations;
 * this module owns per-job ordering and terminal state semantics.
 */
export async function runFrozenBatchQueue(plan, {
  ledger,
  shouldCancel = () => false,
  prepare,
  execute,
  publish,
  onResults = () => {},
} = {}) {
  if (plan?.schema !== BATCH_JOB_PLAN_SCHEMA || !ledger || ledger.plan !== plan) {
    throw new Error('批次执行器需要与状态台账一致的冻结计划');
  }
  if (![prepare, execute, publish, onResults, shouldCancel].every((fn) => typeof fn === 'function')) {
    throw new Error('批次执行器缺少必要的操作回调');
  }

  const results = [];
  let fatalError = '';
  let cancelled = false;
  try {
    for (let index = 0; index < plan.jobs.length; index += 1) {
      if (shouldCancel()) { cancelled = true; break; }
      const job = plan.jobs[index];
      ledger.transition(job.jobId, 'preparing');
      // Adapter staging errors are batch-fatal: the inherited single-job
      // inputs may be partially changed and cannot be trusted for later jobs.
      await prepare(job, index, plan);
      if (shouldCancel()) {
        cancelled = true;
        ledger.transition(job.jobId, 'cancelled', { error: '用户取消当前任务' });
        break;
      }
      try {
        ledger.transition(job.jobId, 'muxing');
        const artifact = await execute(job, index, plan);
        if (!artifact?.blob || !artifact.outputName) {
          throw new Error('执行器没有交付有效的 MKV 文件对象');
        }
        if (shouldCancel()) throw new Error('batch-cancelled');
        ledger.transition(job.jobId, 'saving');
        const publication = await publish(job, artifact, index, plan);
        const item = Object.freeze({ job, ok: true, ...publication,
          outputName: artifact.outputName,
          auditStatus: artifact.auditStatus || 'unavailable',
          auditIssues: Object.freeze(Array.from(artifact.auditIssues || [])),
          outputSha256: artifact.outputSha256 || '',
        });
        results.push(item);
        ledger.transition(job.jobId, item.savedToDirectory ? 'succeeded' :
          item.directorySaveError ? 'saveWarning' : 'awaitingSave',
          { error: item.directorySaveError || '' });
      } catch (error) {
        const reason = error?.message || String(error);
        if (reason === 'batch-cancelled' || shouldCancel()) {
          cancelled = true;
          ledger.transition(job.jobId, 'cancelled', { error: '用户取消当前任务' });
          break;
        }
        ledger.transition(job.jobId, 'failed', { error: reason });
        results.push(Object.freeze({ job, ok: false, error: reason }));
      }
      onResults(Object.freeze([...results]));
    }
  } catch (error) {
    fatalError = error?.message || String(error);
    const current = ledger.snapshot().find((entry) =>
      ['preparing', 'muxing', 'saving'].includes(entry.state));
    if (current) ledger.transition(current.jobId, 'interrupted', { error: fatalError });
  } finally {
    cancelled = cancelled || shouldCancel();
    ledger.interruptRemaining(cancelled ? '用户取消后尚未运行'
      : fatalError || '队列已结束', { cancelled });
  }
  return Object.freeze({
    results: Object.freeze([...results]), cancelled, fatalError,
  });
}
