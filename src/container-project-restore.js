/**
 * P1 verified detached source-track edit restoration.
 *
 * One explicit, synchronous transaction into the EXISTING trackState owner.
 * This is not a Matroska writer, a general ContainerProject mutation owner,
 * or a restored file permission. Caller must bind the proof to the identical
 * live File and imported draft before each call.
 */
import { previewDetachedProjectIntentConflicts } from './container-project-conflict-preview.js';
import { createContainerProjectFromProjection } from './container-project.js';

export const TRACK_REPLAY_SCHEMA = 'verified-source-track-replay-v1';
const FIELDS = Object.freeze([
  'include', 'title', 'language', 'default', 'forced',
  'original', 'commentary', 'hearingImpaired', 'order',
]);
const capture = track => Object.fromEntries(FIELDS.map(field => [field, track[field]]));
const equal = (a, b) => FIELDS.every(field => a[field] === b[field]);
const freeze = x => Object.freeze(x);
const allowed = new Set(['title', 'language', 'default', 'forced']);

function validateValue(field, value) {
  if (field === 'title') {
    if (typeof value !== 'string' || value.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(value))
      throw Error('TRACK_REPLAY_TITLE_INVALID');
  } else if (field === 'language') {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{2,35}$/.test(value))
      throw Error('TRACK_REPLAY_LANGUAGE_INVALID');
  } else if (typeof value !== 'boolean') {
    throw Error('TRACK_REPLAY_FLAG_INVALID');
  }
}

export function prepareVerifiedTrackReplay({
  draft, liveProjection, sourceProof, trackState, appendMode = false,
} = {}) {
  const preview = previewDetachedProjectIntentConflicts({
    draft, liveProjection, sourceProof,
  });
  if (!preview.previewable || !preview.changes.length)
    throw Error('TRACK_REPLAY_BASELINE_NOT_VERIFIED');
  if (appendMode) throw Error('TRACK_REPLAY_SELECTIVE_MODE_REQUIRED');
  if (!trackState || !Array.isArray(trackState.tracks) ||
      !liveProjection?.sourceScanKey ||
      trackState.fileKey !== liveProjection.sourceScanKey ||
      liveProjection.identityDiagnostics?.length)
    throw Error('TRACK_REPLAY_SOURCE_SCAN_STALE');
  if (preview.changes.length > 100)
    throw Error('TRACK_REPLAY_CHANGE_BUDGET');

  // Detached edit intents use stable, hashed ContainerProject IDs while the
  // live projection uses source-scoped composition IDs. Resolve by the same
  // ordered domain projection used for export, never by display labels.
  const currentProject = createContainerProjectFromProjection(liveProjection);
  const objects = new Map(currentProject.objects.map((object, index) =>
    [object.id, liveProjection.objects[index]]));
  const patches = new Map();
  for (const change of preview.changes) {
    const object = objects.get(change.objectId);
    const [kind, indexText] = String(object?.target?.key || '').split(':');
    const index = Number(indexText);
    if (object?.target?.type !== 'source' ||
        !['audio', 'subtitle'].includes(kind) || object.kind !== kind ||
        !/^\d+$/.test(indexText || '') || !Number.isSafeInteger(index))
      throw Error('TRACK_REPLAY_UNSUPPORTED_OBJECT');
    const track = trackState.tracks.find(row =>
      row.index === index && row.type === kind);
    if (!track) throw Error('TRACK_REPLAY_TRACK_MISSING');
    const field = change.type === 'include' ? 'include' :
      change.type === 'set-attribute' ? change.field : '';
    if (field !== 'include' && !allowed.has(field))
      throw Error('TRACK_REPLAY_UNSUPPORTED_EDIT');
    if (field !== 'include') validateValue(field, change.to);
    else if (typeof change.to !== 'boolean')
      throw Error('TRACK_REPLAY_INCLUDE_INVALID');
    let patch = patches.get(index);
    if (!patch) {
      const before = capture(track);
      patch = { index, kind, before, after: { ...before } };
      patches.set(index, patch);
    } else if (patch.kind !== kind) {
      throw Error('TRACK_REPLAY_INDEX_COLLISION');
    }
    // Compare against the current *mutable editor owner*, not just a read-only
    // projection. A UI edit made after verification must never be overwritten.
    if (patch.before[field] !== change.current)
      throw Error('TRACK_REPLAY_LIVE_FIELD_DRIFT');
    patch.after[field] = change.to;
  }

  for (const patch of patches.values()) {
    if (!patch.after.include) {
      if (preview.changes.some(change => {
        const item = objects.get(change.objectId);
        return item?.target?.key === patch.kind + ':' + patch.index &&
          change.type === 'set-attribute' &&
          // Disabling a track is allowed to clear its Default/Forced flags,
          // which the old editor already does. Other hidden-field edits are
          // not silently restored into an excluded track.
          !(change.field === 'default' && change.to === false) &&
          !(change.field === 'forced' && change.to === false);
      })) throw Error('TRACK_REPLAY_EXCLUDED_FIELD_EDIT');
      // Mirrors existing source-track exclusion semantics. No silent replay of
      // old disposition flags on an excluded stream.
      for (const flag of ['default', 'forced', 'original', 'commentary', 'hearingImpaired'])
        patch.after[flag] = false;
    }
    if (!equal(patch.before, patch.after) &&
        patch.after.include === false &&
        (patch.after.default || patch.after.forced))
      throw Error('TRACK_REPLAY_EXCLUDED_FLAG');
  }
  return freeze({
    schema: TRACK_REPLAY_SCHEMA,
    sourceKey: liveProjection.sourceKey,
    sourceScanKey: liveProjection.sourceScanKey,
    proposedCount: preview.changes.length,
    tracks: freeze([...patches.values()].map(patch => freeze({
      index: patch.index, kind: patch.kind,
      before: freeze(patch.before), after: freeze(patch.after),
    }))),
    // No permission, execution token or source bytes are carried into a plan.
    executionAuthorized: false, sourceMutationAuthorized: false,
  });
}

export function applyPreparedTrackReplay(plan, trackState) {
  if (plan?.schema !== TRACK_REPLAY_SCHEMA ||
      !trackState || plan.sourceScanKey !== trackState.fileKey ||
      !Array.isArray(trackState.tracks))
    throw Error('TRACK_REPLAY_PLAN_STALE');
  if (!plan.tracks.length || plan.tracks.length > 100)
    throw Error('TRACK_REPLAY_PLAN_INVALID');
  const targets = [];
  const seen = new Set();
  // Validate every target before mutating the first; no partial commit on a
  // stale/changed editor state. This path has no awaits or File writes.
  for (const patch of plan.tracks) {
    if (seen.has(patch.index)) throw Error('TRACK_REPLAY_DUPLICATE_TARGET');
    seen.add(patch.index);
    const track = trackState.tracks.find(row =>
      row.index === patch.index && row.type === patch.kind);
    if (!track || !equal(capture(track), patch.before))
      throw Error('TRACK_REPLAY_LIVE_STATE_CHANGED');
    targets.push([track, patch.after]);
  }
  for (const [track, after] of targets) {
    for (const field of FIELDS) track[field] = after[field];
  }
  return freeze({
    status: 'applied-to-current-edit-plan',
    updatedTracks: targets.length,
    reviewedFields: plan.proposedCount,
    fileWritten: false, muxStarted: false, executionAuthorized: false,
  });
}

/** Scoped, safe inverse: only undo if all touched tracks still equal the
 * exact values this transaction produced. Never re-run a detached JSON. */
export function revertPreparedTrackReplay(plan, trackState) {
  if (plan?.schema !== TRACK_REPLAY_SCHEMA ||
      !trackState || plan.sourceScanKey !== trackState.fileKey ||
      !Array.isArray(trackState.tracks))
    throw Error('TRACK_REPLAY_UNDO_STALE');
  const targets = [];
  for (const patch of plan.tracks) {
    const track = trackState.tracks.find(row =>
      row.index === patch.index && row.type === patch.kind);
    if (!track || !equal(capture(track), patch.after))
      throw Error('TRACK_REPLAY_UNDO_CONFLICT');
    targets.push([track, patch.before]);
  }
  for (const [track, before] of targets) {
    for (const field of FIELDS) track[field] = before[field];
  }
  return freeze({ status: 'reverted-in-current-edit-plan',
    revertedTracks: targets.length, fileWritten: false, muxStarted: false });
}
