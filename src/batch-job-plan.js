import { fileIdentity } from './batch.js';

/**
 * Immutable authorization boundary between the reviewed batch pairing and
 * the current legacy browser executor. File references remain session-scoped;
 * this snapshot must not be serialized as a durable filesystem permission.
 */
export const BATCH_JOB_PLAN_SCHEMA = 'batch-job-plan-v1';

function freezeList(items = []) {
  return Object.freeze(Array.from(items));
}

function assertReady(pairing, strictVideoInputs = false) {
  if (!pairing?.jobs?.length) throw new Error('没有可执行的批量任务');
  const problems = [
    ['字幕归属未确认', pairing.ambiguousPairings?.length],
    ['批量输出重名', pairing.outputNameCollisions?.length],
    ['目标目录冲突', pairing.directoryConflicts?.length],
    ['无效字幕', pairing.invalidSubtitles?.length],
    ['无效字体', pairing.fontRecognition?.ignored?.length],
    ['不支持的视频', strictVideoInputs && pairing.videoRecognition?.ignored?.length],
    ['输出目录检查失败', pairing.directoryCheckError],
  ];
  const refused = problems.filter(([, value]) => Boolean(value)).map(([name]) => name);
  if (refused.length) throw new Error('无法冻结批次：' + refused.join('、'));
}

export function freezeBatchJobPlan(pairing, { generation, preserveAttachments = false,
  subsetEnabled = false, subsetScope = 'job', directoryName = '', strictVideoInputs = false } = {}) {
  assertReady(pairing, strictVideoInputs);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new Error('冻结批量计划缺少有效代次');
  }
  if (!['job', 'group'].includes(subsetScope)) throw new Error('不支持的字体子集策略');
  const policy = Object.freeze({
    preserveAttachments: Boolean(preserveAttachments),
    subsetEnabled: Boolean(subsetEnabled),
    subsetScope,
    directoryName: String(directoryName || ''),
  });
  const fonts = freezeList(pairing.fonts);
  // Group font subsetting requires content-derived font identity, not merely
  // File handles. Freezing the chosen fonts but omitting identity silently
  // degraded the old Group path to unsubsetted attachments.
  const fontRecognition = Object.freeze({
    recognized: freezeList((pairing.fontRecognition?.recognized || []).map((entry) => Object.freeze({
      ...entry,
      identity: entry.identity,
    }))),
    ignored: freezeList(pairing.fontRecognition?.ignored),
  });
  const jobs = freezeList(pairing.jobs.map((job, index) => {
    if (!job.video || !job.outputName || !job.subtitleInputFiles?.length) {
      throw new Error('存在缺少视频、字幕或输出名称的批次任务');
    }
    const sourceIdentity = fileIdentity(job.video);
    const tracks = freezeList(job.subtitleTracks?.map((track) => Object.freeze({
      ...track,
      file: track.file,
      sidecarFile: track.sidecarFile || null,
    })));
    const subtitleInputFiles = freezeList(job.subtitleInputFiles);
    const assignmentIdentity = freezeList(subtitleInputFiles.map(fileIdentity));
    return Object.freeze({
      ...job,
      jobId: `batch:${generation}:${index}:${sourceIdentity}`,
      sourceIdentity,
      assignmentIdentity,
      outputName: String(job.outputName),
      subtitleTracks: tracks,
      subtitleInputFiles,
      subtitles: freezeList(job.subtitles),
    });
  }));
  return Object.freeze({
    schema: BATCH_JOB_PLAN_SCHEMA,
    generation,
    policy,
    fonts,
    fontRecognition,
    jobs,
    sourceIdentity: freezeList(jobs.map((job) => job.sourceIdentity)),
  });
}

export const BATCH_JOB_STATES = Object.freeze({
  queued: '待执行',
  preparing: '准备资源',
  muxing: '封装中',
  saving: '保存中',
  awaitingSave: '待下载保存',
  succeeded: '已完成',
  saveWarning: '保存未完成',
  auditWarning: '审计待复核',
  failed: '执行失败',
  cancelled: '已取消',
  interrupted: '已中断',
});

const TRANSITIONS = Object.freeze({
  queued: ['preparing', 'cancelled', 'interrupted'],
  preparing: ['muxing', 'failed', 'cancelled', 'interrupted'],
  muxing: ['saving', 'failed', 'cancelled', 'interrupted'],
  saving: ['succeeded', 'awaitingSave', 'saveWarning', 'auditWarning', 'failed', 'cancelled', 'interrupted'],
  awaitingSave: ['saving'],
  auditWarning: ['saving'],
  succeeded: [], saveWarning: ['saving'], failed: [], cancelled: [], interrupted: [],
});

/** A batch-owned status ledger, never an editable copy of track/asset state. */
export function createBatchJobLedger(plan, onChange = () => {}) {
  if (plan?.schema !== BATCH_JOB_PLAN_SCHEMA) throw new Error('不是受支持的冻结批量计划');
  const entries = new Map(plan.jobs.map((job) => [job.jobId, Object.freeze({
    jobId: job.jobId, state: 'queued', error: '', outputName: job.outputName,
  })]));
  const notify = () => onChange(snapshot());
  function snapshot() {
    return Object.freeze(plan.jobs.map((job) => entries.get(job.jobId)));
  }
  function transition(jobId, state, { error = '' } = {}) {
    const prior = entries.get(jobId);
    if (!prior) throw new Error('未知批量任务身份');
    if (!TRANSITIONS[prior.state].includes(state)) {
      throw new Error(`不允许的任务状态变化：${prior.state} → ${state}`);
    }
    const next = Object.freeze({ ...prior, state, error: String(error || '') });
    entries.set(jobId, next);
    notify();
    return next;
  }
  function interruptRemaining(reason = '未继续执行', { cancelled = false } = {}) {
    for (const job of plan.jobs) {
      const current = entries.get(job.jobId);
      if (current.state === 'queued') transition(job.jobId, cancelled ? 'cancelled' : 'interrupted', { error: reason });
    }
  }
  // Explicit retry authorization, separate from normal terminal transitions.
  // Validate the entire set first, so a mixed request cannot partly requeue.
  function requeueFailed(jobIds) {
    const ids = Array.from(jobIds || []);
    if (!ids.length || new Set(ids).size !== ids.length ||
        [...entries.values()].some(e => ['queued','preparing','muxing','saving'].includes(e.state)) ||
        ids.some(id => entries.get(id)?.state !== 'failed')) {
      throw new Error('仅允许重试空闲批次中明确选择的失败任务');
    }
    for (const id of ids) entries.set(id, Object.freeze({ ...entries.get(id), state: 'queued', error: '' }));
    notify();
  }
  return Object.freeze({ snapshot, transition, interruptRemaining, requeueFailed, plan });
}
