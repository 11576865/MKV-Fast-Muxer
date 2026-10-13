/**
 * P1 source-track live domain authority (bounded migration).
 *
 * A session's immutable ContainerProject owns source audio/subtitle
 * include/title/language/Default/Forced/Original/Commentary/HearingImpaired
 * and within-kind relative ordering. The original trackState objects remain
 * an execution-facing projection for the already-verified FFmpeg writer.
 * Source attachment include/name/MIME are also domain-owned, but their
 * underlying AttachmentUID/Tag/EBML writer authorization is NOT expanded.
 *
 * No source bytes, File grants, jobs, write plans or provenance are produced.
 */
import {
  createContainerProject, createContainerProjectFromProjection,
  applyContainerProjectEdit,
} from './container-project.js';

export const LIVE_SOURCE_FIELDS = Object.freeze([
  'include', 'title', 'language', 'default', 'forced',
  'original', 'commentary', 'hearingImpaired',
]);
export const LIVE_ATTACHMENT_FIELDS = Object.freeze(['include', 'filename', 'mimetype']);
const fieldSet = new Set(LIVE_SOURCE_FIELDS);
const LIMIT = 85;
const clearOnExclude = Object.freeze([
  'default', 'forced', 'original', 'commentary', 'hearingImpaired',
]);
const keyOf = row => row.type + ':' + row.index;
const snapshot = row => ({
  include: row.include, title: row.title, language: row.language,
  default: row.default, forced: row.forced,
  original: row.original, commentary: row.commentary,
  hearingImpaired: row.hearingImpaired,
});
const projectValue = (object, field) => field === 'include'
  ? object.included : object.attributes[field];
const assertValue = (field, value) => {
  if (['include', 'default', 'forced', 'original',
    'commentary', 'hearingImpaired'].includes(field)) {
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
  // The source projection assigns stable, bounded project order slots from
  // the displayed within-kind list. Legacy FFmpeg order numbers can be
  // sparse (stream.index), so compare relative order, not equal numbers.
  for (const kind of ['audio', 'subtitle']) {
    const owned = [...session.targets.entries()]
      .filter(([key]) => key.startsWith(kind + ':'))
      .sort((a, b) => objects.get(a[1]).order - objects.get(b[1]).order)
      .map(([key]) => key);
    const executableRows = [...indexed.entries()]
      .filter(([, row]) => row.type === kind);
    if (executableRows.some(([,row]) =>
      !Number.isSafeInteger(row.order) || row.order < 0) ||
        new Set(executableRows.map(([,row]) => row.order)).size !== executableRows.length)
      throw Error('LIVE_TRACK_ORDER_PROJECTION_DRIFT');
    const executable = executableRows
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key]) => key);
    if (owned.length !== executable.length ||
        owned.some((key, i) => key !== executable[i]))
      throw Error('LIVE_TRACK_ORDER_PROJECTION_DRIFT');
    const domainOrder = owned.map(key => objects.get(session.targets.get(key)).order);
    if (new Set(domainOrder).size !== domainOrder.length)
      throw Error('LIVE_TRACK_DOMAIN_ORDER_AMBIGUOUS');
  }
  if (!Array.isArray(state.attachments)) throw Error('LIVE_ATTACHMENT_INVENTORY_UNAVAILABLE');
  const attachments = new Map();
  const sourceStreamIndices = new Set(state.streams?.map(stream => stream.index) || []);
  const projectById = new Map(session.project.objects.map(object => [object.id,object]));
  for (const item of state.attachments) {
    const key = 'attachment:' + item.index;
    if (!Number.isSafeInteger(item.index) || item.index < 0 ||
        attachments.has(key) || indexed.has(key) ||
        !sourceStreamIndices.has(item.index) ||
        item.stream?.index !== item.index ||
        item.stream?.codec_type !== 'attachment')
      throw Error('LIVE_ATTACHMENT_INDEX_AMBIGUOUS');
    attachments.set(key,item);
  }
  if (attachments.size !== session.attachmentTargets.size)
    throw Error('LIVE_ATTACHMENT_INVENTORY_DRIFT');
  for (const [key,id] of session.attachmentTargets) {
    const item=attachments.get(key), object=projectById.get(id);
    if (!item || !object || object.kind !== 'attachment' || !object.sourceId ||
        Boolean(item.include) !== object.included ||
        item.filename !== object.attributes.name ||
        item.mimetype !== object.attributes.mime)
      throw Error('LIVE_ATTACHMENT_EXECUTOR_PROJECTION_DRIFT');
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
  const attachmentTargets = new Map();
  project.objects.forEach((object, index) => {
    const target = projection.objects[index]?.target;
    if (target?.type !== 'source' ||
        !['audio', 'subtitle', 'attachment'].includes(object.kind)) return;
    const match = /^(audio|subtitle|attachment):(\d+)$/.exec(target.key || '');
    if (!match || match[1] !== object.kind || !object.sourceId)
      throw Error('LIVE_SOURCE_ID_INVALID');
    const map = object.kind === 'attachment' ? attachmentTargets : targets;
    if (map.has(target.key)) throw Error('LIVE_SOURCE_ID_COLLISION');
    map.set(target.key, object.id);
  });
  const session = {
    source, trackState, fileKey: trackState.fileKey,
    targets, attachmentTargets, project, generation: 0, compacted: 0,
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
      for (const field of clearOnExclude) desired[field] = false;
    }
    if (!desired.include && clearOnExclude.some(field => desired[field]))
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


/**
 * Reorder one included source track against its adjacent included peer.
 * Both immutable domain slots are exchanged before the two legacy FFmpeg
 * order values move. Neither File bytes nor unrelated excluded rows move.
 *
 * The domain slots are bounded original projection positions. The FFmpeg
 * values need not equal them (sparse stream indices are permitted).
 */
export function moveLiveSourceTrack(session, {
  source, trackState, index, delta, appendMode = false,
} = {}) {
  const indexed = currentRows(session, source, trackState);
  if (appendMode) throw Error('LIVE_TRACK_PRESERVE_ALL_READONLY');
  if (!Number.isSafeInteger(index) || ![-1, 1].includes(delta))
    throw Error('LIVE_TRACK_INVALID_MOVE');
  const target = [...indexed.values()].find(row => row.index === index);
  if (!target || !target.include) throw Error('LIVE_TRACK_MOVE_NOT_INCLUDED');
  const peers = [...indexed.values()]
    .filter(row => row.type === target.type && row.include)
    .sort((a, b) => a.order - b.order);
  const from = peers.findIndex(row => row.index === index);
  const other = peers[from + delta];
  if (!other) return Object.freeze({
    status: 'no-change', generation: session.generation,
  });
  const a = session.targets.get(keyOf(target));
  const b = session.targets.get(keyOf(other));
  const x = session.project.objects.find(obj => obj.id === a);
  const y = session.project.objects.find(obj => obj.id === b);
  if (!x || !y || x.kind !== y.kind || x.order === y.order)
    throw Error('LIVE_TRACK_ORDER_IDENTITY_DRIFT');
  // Build the entire immutable domain transaction before changing either
  // execution value. Partial application cannot leak into legacy mux.
  let next = compact(session.project);
  next = applyContainerProjectEdit(next, {
    type: 'reorder', objectId: a, value: y.order,
  });
  next = applyContainerProjectEdit(next, {
    type: 'reorder', objectId: b, value: x.order,
  });
  const oldOrder = target.order;
  target.order = other.order;
  other.order = oldOrder;
  session.project = next;
  session.generation++;
  return Object.freeze({
    status: 'committed-to-domain-and-executor-projection',
    moved: index, across: other.index,
    generation: session.generation, fileWritten: false, muxStarted: false,
  });
}


/**
 * The exact scanned source attachment identity remains immutable.
 * Metadata fields are validated and committed to ContainerProject first;
 * the existing selective-MKV FFmpeg writer + P0 relation safety gates are
 * the ONLY authorities deciding whether requested changes can be delivered.
 */
export function commitLiveSourceAttachmentChanges(session, {
  source, trackState, changes = [], appendMode = false,
} = {}) {
  currentRows(session, source, trackState);
  if (appendMode) throw Error('LIVE_ATTACHMENT_PRESERVE_ALL_READONLY');
  if (!Array.isArray(changes) || !changes.length || changes.length > 200)
    throw Error('LIVE_ATTACHMENT_CHANGE_BUDGET');
  const staged = new Map();
  for (const change of changes) {
    if (!change || !Number.isSafeInteger(change.index) || change.index < 0 ||
        !LIVE_ATTACHMENT_FIELDS.includes(change.field))
      throw Error('LIVE_ATTACHMENT_UNSUPPORTED_CHANGE');
    const item = trackState.attachments.find(row => row.index === change.index);
    if (!item) throw Error('LIVE_ATTACHMENT_NOT_FOUND');
    const value = change.value;
    if (change.field === 'include') {
      if (typeof value !== 'boolean') throw Error('LIVE_ATTACHMENT_INCLUDE_INVALID');
    } else if (typeof value !== 'string' ||
        value.length > (change.field === 'filename' ? 240 : 120) ||
        /[\u0000-\u001f\u007f]/.test(value) ||
        change.field === 'filename' && (value.includes('/') || value.includes('\\'))) {
      throw Error('LIVE_ATTACHMENT_METADATA_INVALID');
    }
    const current = staged.get(item.index) || {
      item, values: { include:item.include, filename:item.filename, mimetype:item.mimetype },
    };
    current.values[change.field] = value;
    staged.set(item.index,current);
  }
  let next = compact(session.project);
  let commits=0;
  for (const {item,values} of staged.values()) {
    if (!values.include && (values.filename !== item.filename ||
        values.mimetype !== item.mimetype))
      throw Error('LIVE_ATTACHMENT_EXCLUDED_METADATA_CHANGE');
    const id=session.attachmentTargets.get('attachment:'+item.index);
    if (!id) throw Error('LIVE_ATTACHMENT_NOT_BOUND');
    for (const [field,value] of [
      ['name',values.filename],['mime',values.mimetype],
    ]) {
      const obj=next.objects.find(o=>o.id===id);
      if (!obj || obj.kind!=='attachment' || !obj.sourceId)
        throw Error('LIVE_ATTACHMENT_IDENTITY_DRIFT');
      if (obj.attributes[field]===value) continue;
      next=compact(next);
      next=applyContainerProjectEdit(next,{
        type:'set-attribute',objectId:id,field,value,
      });
      commits++;
    }
    const obj=next.objects.find(o=>o.id===id);
    if (obj.included!==values.include) {
      next=compact(next);
      next=applyContainerProjectEdit(next,{
        type:'include',objectId:id,value:values.include,
      });
      commits++;
    }
  }
  if (!commits) return Object.freeze({
    status:'no-change',changedFields:0,updatedAttachments:0,
    generation:session.generation,
  });
  // All operations above have completed: the writer-facing projection
  // changes synchronously without any filesystem or source modification.
  for (const {item} of staged.values()) {
    const obj=next.objects.find(o=>o.id===session.attachmentTargets.get(
      'attachment:'+item.index));
    item.include=obj.included;
    item.filename=obj.attributes.name;
    item.mimetype=obj.attributes.mime;
  }
  session.project=next;
  session.generation++;
  return Object.freeze({
    status:'committed-to-domain-and-executor-projection',
    changedFields:commits,updatedAttachments:staged.size,
    generation:session.generation,fileWritten:false,muxStarted:false,
    sourceUidRelationsPreserved:'not-proven-by-domain-command',
  });
}

export function inspectLiveSourceTrackSession(session, { source, trackState } = {}) {
  currentRows(session, source, trackState);
  return Object.freeze({
    generation: session.generation, revision: session.project.revision,
    boundedHistoryLength: session.project.history.length,
    sourceTrackCount: session.targets.size,
    sourceAttachmentCount: session.attachmentTargets.size,
    domainOwnedFields: LIVE_SOURCE_FIELDS,
    domainOwnedAttachmentFields: LIVE_ATTACHMENT_FIELDS,
    domainIsAuthoritative: true,
    wholeEbmlPreservation: 'unverified', writerAuthorization: false,
  });
}
