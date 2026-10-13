/**
 * P1 bounded bridge from a reviewed, detached ContainerProject to the EXISTING
 * in-memory source-track editor. No EBML write, mux execution, permission grant,
 * relink or generic replay of include/order/chapters/tags.
 *
 * Caller must supply the current exact source-File + matching digest verdict,
 * not a stale value from a previous selection. This pure gate additionally
 * checks live scanned object provenance, baseline and mutable editor values.
 */
import { createContainerProjectFromProjection } from './container-project.js';
import { previewDetachedProjectIntentConflicts } from './container-project-conflict-preview.js';

const refuse = (code, detail = '') => Object.freeze({
  status: 'BLOCKED', code, detail,
  ready: false, changes: Object.freeze([]),
  changesApplied: false, executionAuthorized: false,
});

export function prepareDetachedSourceTitleReplay({
  draft, liveProjection, sourceProof, trackState,
  sourceFileMatched = false, selectiveMode = true,
} = {}) {
  if (!sourceFileMatched) return refuse('SOURCE_FILE_NOT_CURRENT');
  if (!selectiveMode) return refuse('SOURCE_APPEND_ALL_MODE');
  if (!trackState || !Array.isArray(trackState.tracks))
    return refuse('TRACK_EDITOR_NOT_SCANNED');
  const comparison = previewDetachedProjectIntentConflicts({
    draft, liveProjection, sourceProof,
  });
  if (!comparison.previewable || comparison.status !== 'READ_ONLY_PREVIEW_MATCHES')
    return refuse('SOURCE_OR_BASELINE_NOT_VERIFIED', comparison.prereq || '');
  if (!comparison.changes.length || comparison.changes.length > 20)
    return refuse('TITLE_REPLAY_BUDGET_OR_EMPTY');

  // Mapping is derived exclusively from the CURRENT inspected projection,
  // not from a user-supplied index or object name in detached JSON.
  const current = createContainerProjectFromProjection(liveProjection);
  if (current.objects.length !== liveProjection.objects.length)
    return refuse('SOURCE_MAPPING_INCONSISTENT');
  const mapping = new Map(current.objects.map((object, index) =>
    [object.id, liveProjection.objects[index]]));
  const targets = [];
  const used = new Set();
  for (const item of comparison.changes) {
    if (item.type !== 'set-attribute' || item.field !== 'title' ||
        !['audio','subtitle'].includes(item.kind) ||
        typeof item.from !== 'string' || typeof item.to !== 'string' ||
        item.to.length > 160 || item.to.includes('\0'))
      return refuse('UNSUPPORTED_REPLAY_EDIT');
    const live = mapping.get(item.objectId);
    if (!live || live.evidence !== 'ffprobe-scanned-source-stream' ||
        live.target?.type !== 'source' ||
        typeof live.target.key !== 'string' ||
        !/^(audio|subtitle):[0-9]+$/.test(live.target.key))
      return refuse('SOURCE_TRACK_PROVENANCE_REQUIRED');
    const [kind, indexText] = live.target.key.split(':');
    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || kind !== item.kind || used.has(index))
      return refuse('SOURCE_TRACK_AMBIGUOUS');
    const track = trackState.tracks.find(t => t.index === index);
    // A live editor may diverge from ffprobe's immutable observed stream.
    // Equality to the recorded baseline is REQUIRED at the actual write owner.
    if (!track || track.type !== kind || !track.include || track.title !== item.from)
      return refuse('LIVE_EDITOR_FIELD_DRIFT');
    used.add(index);
    targets.push(Object.freeze({
      index, kind, from: item.from, to: item.to, objectId: item.objectId,
    }));
  }
  return Object.freeze({
    status: 'TITLE_EDITOR_REPLAY_READY', code: 'ALL_SOURCE_TITLES_MATCH',
    ready: true, changes: Object.freeze(targets),
    // This is a transient editor change, NOT authorization to produce media.
    changesApplied: false, executionAuthorized: false,
    writerEligible: false,
  });
}

export function commitPreparedSourceTitleReplay(trackState, plan) {
  if (!plan?.ready || plan.status !== 'TITLE_EDITOR_REPLAY_READY' ||
      !Array.isArray(plan.changes) || !plan.changes.length ||
      !Array.isArray(trackState?.tracks)) throw Error('TITLE_REPLAY_NOT_PREPARED');
  // Atomicity: validate ALL old values before mutating any track.
  const targets = plan.changes.map(change => {
    const track = trackState.tracks.find(t => t.index === change.index);
    if (!track || track.type !== change.kind || !track.include ||
        track.title !== change.from || typeof change.to !== 'string' ||
        change.to.length > 160) throw Error('TITLE_REPLAY_EDITOR_CHANGED');
    return { track, title: change.to };
  });
  for (const { track, title } of targets) track.title = title;
  return Object.freeze({
    status: 'EDIT_DRAFT_UPDATED', appliedCount: targets.length,
    mediaWritten: false, muxStarted: false,
    runtimePreflightStillRequired: true, sourceFilePermissionRetained: false,
  });
}
