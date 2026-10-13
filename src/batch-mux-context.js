import { BATCH_JOB_PLAN_SCHEMA } from './batch-job-plan.js';
import { inferredSubtitleMetadata } from './subtitle-format.js';

/**
 * Frozen batch execution context. No FileList, DOM controls, or browser state.
 * The source header and font identities are content-derived before this call.
 * Session-scoped File objects remain immutable references, not serializable paths.
 */
export function createFrozenBatchMuxContext(plan, job, {
  headerIdentity, fonts = plan?.fonts || [], fontIdentities = [],
} = {}) {
  if (plan?.schema !== BATCH_JOB_PLAN_SCHEMA || !plan.jobs.includes(job) ||
      !job?.video || !job?.outputName ||
      !['matroska', 'matroska-webm', 'iso-bmff', 'mov', 'webm'].includes(headerIdentity?.container)) {
    throw Error('BATCH_MUX_CONTEXT_NOT_AUTHORIZED');
  }
  const files = Array.from(fonts);
  const recognized = Array.from(fontIdentities);
  if (recognized.length !== files.length ||
      recognized.some((entry, index) => entry.file !== files[index] || !entry.identity)) {
    throw Error('BATCH_MUX_FONT_IDENTITY_MISMATCH');
  }
  const rawTracks = Array.from(job.subtitleTracks || []);
  if (!rawTracks.length || rawTracks.some(track => !track.file || !track.format)) {
    throw Error('BATCH_MUX_SUBTITLE_TRACKS_NOT_VERIFIED');
  }
  // Exactly the same defaults that syncNewTrackState previously populated
  // while staging the frozen job into a hidden single-mux FileList.
  const tracks = Object.freeze(rawTracks.map((track, index) => {
    const metadata = inferredSubtitleMetadata(track.file, track.format);
    return Object.freeze({
      ...track,
      sidecarFile: track.sidecarFile || null,
      displayName: track.displayName || track.file.name,
      language: track.language ?? metadata.language,
      title: track.title ?? metadata.title ?? track.file.name.replace(/\\.[^.]+$/, ''),
      default: track.default ?? (index === 0),
      forced: track.forced ?? false,
      original: track.original ?? false,
      commentary: track.commentary ?? false,
      hearingImpaired: track.hearingImpaired ?? false,
    });
  }));
  const preserveAll = Boolean(plan.policy.preserveAttachments &&
    ['matroska', 'matroska-webm'].includes(headerIdentity.container));
  return Object.freeze({
    kind: 'frozen-batch-mux-context-v1',
    jobId: job.jobId,
    source: job.video,
    sourceIdentity: job.sourceIdentity,
    outputName: job.outputName,
    headerIdentity,
    subtitles: tracks,
    fonts: Object.freeze(files),
    fontRecognition: Object.freeze({
      recognized: Object.freeze(recognized.map(entry => Object.freeze({
        file: entry.file, identity: entry.identity,
      }))),
      ignored: Object.freeze([]),
    }),
    externalAudio: Object.freeze([]),
    appendPreserveAll: preserveAll,
    preserveAttachments: preserveAll,
    fontMode: 'preserve',
    subsetEnabled: Boolean(plan.policy.subsetEnabled && plan.policy.subsetScope !== 'group'),
    reportPlan: Object.freeze({
      execution: 'frozen-batch-context-v1',
      jobId: job.jobId,
      outputName: job.outputName,
      sourceName: job.video.name,
      sourceIdentity: job.sourceIdentity,
      subtitles: Object.freeze(tracks.map(track => Object.freeze({
        name: track.file.name,
        language: track.language || '',
        title: track.title || '',
        format: track.format?.id || '',
      }))),
      fontCount: files.length,
      policy: plan.policy,
    }),
  });
}
