/**
 * P1 source-track live domain authority (bounded migration).
 *
 * A session's immutable ContainerProject owns source audio/subtitle
 * include/title/language/Default/Forced. The original trackState objects
 * remain an execution-facing projection so the existing, already-tested
 * FFmpeg path and attachment/advanced editors are not replaced speculatively.
 * Other track fields and Matroska EBML structures remain legacy-owned.
 *
 * No source bytes, File grants, jobs, write plans or provenance are produced.
 */
import {
  createContainerProject, createContainerProjectFromProjection,
  applyContainerProjectEdit,
} from './container-project.js';

export const LIVE_SOURCE_FIELDS = Object.freeze([
  'include', 'title', 'language', 'default', 'forced',
]);
const fieldSet = new Set(LIVE_SOURCE_FIELDS);
const LIMIT = 85;
const clearOnExclude = Object.freeze([
  'default', 'forced', 'original', 'commentary', 'hearingImpaired',
]);
const keyOf = row => row.type + ':' + row.index;
const snapshot = row => ({
  include: row.include, title: row.title, language: row.language,
  default: row.default, forced: row.forced,
});
const projectValue = (object, field) => field === 'include'
  ? object.included : object.attributes[field];
const assertValue = (field, value) => {
  if (field === 'include' || field === 'default' || field === 'forced') {
    if (typeof value !== 'boolean') throw Error('LIVE_TRACK_BOOLEAN_REQUIRED');
  } else if (field === 'title') {
    if (typeof value !== 'string' || value.length > 160)
      throw Error('LIVE_TRACK_TITLE_INVALID');
  } else if (field === 'language') {
    if (typeof value !== 'string' || value.length > 35)
      throw Error('LIVE_TRACK_LANGUAGE_INVALID');
  } else throw Error('LIVE_TRACK_UNSUPPORTED_FIELD');
};

function compact(project) {
  // The domain's edit history budget is not a keystroke budget.
  // Compaction retains the exact current immutable semantic objects and
  // source bindings. It intentionally does NOT assert authenticated history.
  if (project.history.length < LIMIT) return project;
  return createContainerProject({
    documentId: project.documentId,
    sources: project.sources.map(({ size, ...source }) =>
      size === null ? source : { ...source, size }),
    objects: project.objects,
  });
}

function currentRows(session, source, state) {
  if (!session || session.source !== source || session.trackState !== state ||
      state?.fileKey !== session.fileKey)
    throw Error('LIVE_TRACK_SOURCE_SESSION_STALE');
  if (!Array.isArray(state.tracks)) throw Error('LIVE_TRACKS_UNAVAILABLE');
  const indexed = new Map();
  for (const track of state.tracks) {
    if (!['audio', 'subtitle'].includes(track.type) ||
        !Number.isSafeInteger(track.index) || track.index < 0 ||
        indexed.has(keyOf(track))) throw Error('LIVE_TRACK_INDEX_AMBIGUOUS');
    indexed.set(keyOf(track), track);
  }
  if (indexed.size !== session.targets.size)
    throw Error('LIVE_TRACK_INVENTORY_DRIFT');
  const objects = new Map(session.project.objects.map(object => [object.id, object]));
  for (const [key, id] of session.targets) {
    const row = indexed.get(key), object = objects.get(id);
    if (!row || !object || object.kind !== row.type || !object.sourceId)
      throw Error('LIVE_TRACK_IDENTITY_DRIFT');
    for (const field of LIVE_SOURCE_FIELDS) {
      if (snapshot(row)[field] !== projectValue(object, field))
        throw Error('LIVE_TRACK_EXECUTOR_PROJECTION_DRIFT');
    }
  }
  return indexed;
}

export function createLiveSourceTrackSession({ source, trackState, projection } = {}) {
  if (!source || !trackState || !projection ||
      projection.sourceScanKey !== trackState.fileKey ||
      projection.source?.inspection !== 'ffprobe-projected' ||
      projection.identityDiagnostics?.length)
    throw Error('LIVE_TRACK_INSPECTED_SOURCE_REQUIRED');
  const project = createContainerProjectFromProjection(projection);
  const targets = new Map();
  project.objects.forEach((object, index) => {
    const target = projection.objects[index]?.target;
    if (target?.type !== 'source' ||
        !['audio', 'subtitle'].includes(object.kind)) return;
    const match = /^(audio|subtitle):(\d+)$/.exec(target.key || '');
    if (!match || match[1] !== object.kind || !object.sourceId ||
        targets.has(target.key)) throw Error('LIVE_TRACK_SOURCE_ID_COLLISION');
    targets.set(target.key, object.id);
  });
  const session = {
    source, trackState, fileKey: trackState.fileKey,
    targets, project, generation: 0, compacted: 0,
  };
  currentRows(session, source, trackState);
  return session;
}

/**
 * Transaction semantics:
 * - all touched objects are validated against the same immutable owner
 * - all changes compile into NEW immutable ContainerProject first
 * - only after successful compilation are legacy output projections updated
 * - no awaits or partial edits; one action is one commit
 */
export function commitLiveSourceTrackChanges(session, {
  source, trackState, changes = [], appendMode = false,
} = {}) {
  const indexed = currentRows(session, source, trackState);
  if (appendMode) throw Error('LIVE_TRACK_PRESERVE_ALL_READONLY');
  if (!Array.isArray(changes) || !changes.length || changes.length > 200)
    throw Error('LIVE_TRACK_CHANGE_BUDGET');
  const staged = new Map();
  for (const change of changes) {
    if (!change || !Number.isSafeInteger(change.index) || change.index < 0 ||
        !fieldSet.has(change.field))
      throw Error('LIVE_TRACK_UNSUPPORTED_CHANGE');
    const row = trackState.tracks.find(t => t.index === change.index);
    if (!row || !['audio', 'subtitle'].includes(row.type))
      throw Error('LIVE_TRACK_NOT_FOUND');
    assertValue(change.field, change.value);
    const key = keyOf(row);
    const item = staged.get(key) || { key, row, values: snapshot(row) };
    item.values[change.field] = change.value;
    staged.set(key, item);
  }
  if (staged.size > indexed.size) throw Error('LIVE_TRACK_INVENTORY_DRIFT');
  let next = compact(session.project);
  let commits = 0;
  for (const item of staged.values()) {
    const domainId = session.targets.get(item.key);
    if (!domainId || !indexed.has(item.key)) throw Error('LIVE_TRACK_NOT_FOUND');
    const desired = item.values;
    if (!desired.include) {
      desired.default = false;
      desired.forced = false;
    }
    if (desired.default && !desired.include || desired.forced && !desired.include)
      throw Error('LIVE_TRACK_EXCLUDED_FLAG');
    // Do not rename hidden/excluded tracks by accident.
    for (const field of LIVE_SOURCE_FIELDS) {
      if (field === 'include') continue;
      const existing = next.objects.find(o => o.id === domainId);
      if (!existing) throw Error('LIVE_TRACK_IDENTITY_DRIFT');
      const before = projectValue(existing, field);
      const value = desired[field];
      if (before === value) continue;
      next = compact(next);
      next = applyContainerProjectEdit(next, {
        type: 'set-attribute', objectId: domainId, field, value,
      });
      commits++;
    }
    const existing = next.objects.find(o => o.id === domainId);
    if (existing.included !== desired.include) {
      next = compact(next);
      next = applyContainerProjectEdit(next, {
        type: 'include', objectId: domainId, value: desired.include,
      });
      commits++;
    }
  }
  // A no-op must never fabricate a commit or invalidate an unrelated undo.
  if (!commits) return Object.freeze({
    status: 'no-change', changedFields: 0, updatedTracks: 0,
    generation: session.generation,
  });
  // COMMIT. Validate first and mutate every projection synchronously.
  for (const item of staged.values()) {
    const object = next.objects.find(o => o.id === session.targets.get(item.key));
    const row = item.row;
    for (const field of LIVE_SOURCE_FIELDS)
      row[field] = projectValue(object, field);
    if (!row.include) {
      for (const field of clearOnExclude) row[field] = false;
    }
  }
  session.project = next;
  session.generation++;
  if (!session.project.history.length) session.compacted++;
  return Object.freeze({
    status: 'committed-to-domain-and-executor-projection',
    changedFields: commits, updatedTracks: staged.size,
    generation: session.generation,
    fileWritten: false, muxStarted: false,
  });
}

export function inspectLiveSourceTrackSession(session, { source, trackState } = {}) {
  currentRows(session, source, trackState);
  return Object.freeze({
    generation: session.generation, revision: session.project.revision,
    boundedHistoryLength: session.project.history.length,
    sourceTrackCount: session.targets.size,
    domainOwnedFields: LIVE_SOURCE_FIELDS,
    domainIsAuthoritative: true,
    wholeEbmlPreservation: 'unverified', writerAuthorization: false,
  });
}
