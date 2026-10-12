import { buildMuxCommand } from './mux-command.js';
import {
  buildSubtitleEditIntentSnapshot,
  bindSubtitleIntentsToLegacyDescriptors,
  isSubtitleEditIntentSnapshotCurrent,
} from './subtitle-edit-intent.js';
import { outputCompositionFileKey } from './output-composition.js';

const formatEvidence = (format) => JSON.stringify({
  id: format?.id || '',
  inputExtension: format?.inputExtension || '',
  ffmpegOutputCodec: format?.ffmpegOutputCodec || '',
  requiresSidecar: Boolean(format?.requiresSidecar),
  sidecarOnly: Boolean(format?.sidecarOnly),
});

// This is a narrow *single-operation freshness witness*, not an immutable
// global JobPlan or a cryptographic guarantee that File bytes did not change.
// Never freeze browser File objects or authoring state.
export function captureSubtitleExecutionWitness({
  source = null, tracks = [], appendMode = false,
} = {}) {
  return Object.freeze({
    source,
    sourceKey: outputCompositionFileKey(source),
    appendMode: Boolean(appendMode),
    draft: buildSubtitleEditIntentSnapshot({ source, newSubtitles: tracks }),
    trackRefs: Object.freeze((tracks || []).map(track => Object.freeze({
      file: track?.file || null,
      sidecar: track?.sidecarFile || null,
      formatEvidence: formatEvidence(track?.format),
    }))),
  });
}

export function validateSubtitleExecutionWitness(witness, {
  source = null, tracks = [], appendMode = false,
} = {}) {
  if (!witness || !source || witness.source !== source ||
      witness.sourceKey !== outputCompositionFileKey(source)) {
    return { ok: false, reason: 'source-changed' };
  }
  if (witness.appendMode !== Boolean(appendMode)) {
    return { ok: false, reason: 'source-mode-changed' };
  }
  if (tracks.length !== witness.trackRefs.length) {
    return { ok: false, reason: 'subtitle-count-changed' };
  }
  for (let index = 0; index < tracks.length; index += 1) {
    const current = tracks[index] || {};
    const prior = witness.trackRefs[index];
    if (!current.file || current.file !== prior.file ||
        (current.sidecarFile || null) !== prior.sidecar ||
        formatEvidence(current.format) !== prior.formatEvidence) {
      return { ok: false, reason: 'subtitle-input-changed', index };
    }
  }
  if (!isSubtitleEditIntentSnapshotCurrent(witness.draft, {
    source, newSubtitles: tracks,
  })) return { ok: false, reason: 'subtitle-edit-changed' };
  return { ok: true };
}

/**
 * No second execution and no replacement of FFmpeg arguments:
 * compares a second mapping of the staged runtime subtitle requests against
 * the *actual* legacy mux-command arguments about to be executed.
 * This validates mapping consistency, not produced Matroska semantics.
 */
export function verifyStagedSubtitleCommandParity({
  source, runtimeSubtitles = [], commandOptions, expectedArgs,
} = {}) {
  const snapshot = buildSubtitleEditIntentSnapshot({
    source, newSubtitles: runtimeSubtitles,
  });
  const shadowRows = bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    expectedRevision: snapshot.revision,
    bindings: runtimeSubtitles.map(row => ({
      assetKey: outputCompositionFileKey(row.file),
      path: row.path,
      inputIndex: row.inputIndex,
    })),
  });
  const actualOptions = commandOptions || {};
  const mirror = buildMuxCommand({
    ...actualOptions,
    newSubtitleTracks: shadowRows,
  });
  if (!Array.isArray(expectedArgs) || mirror.length !== expectedArgs.length ||
      mirror.some((arg, index) => arg !== expectedArgs[index])) {
    throw new Error('字幕意图与当前 FFmpeg 封装参数不一致；本次写入已拒绝。');
  }
  return Object.freeze({
    state: 'COMMAND_ARGUMENTS_MATCH',
    checkedSubtitles: shadowRows.length,
    scope: 'staged-subtitle-fields-only',
  });
}
