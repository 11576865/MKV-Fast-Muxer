/**
 * P1: read-only three-way detached-intent conflict preview.
 *
 * Imported JSON can be modified by its holder. A matching digest is a byte
 * comparison commitment, not edit authorship or an execution authorization.
 * The comparison checks whether a CURRENT, INSPECTED, source-bound object
 * still has the recorded pre-edit field value for a proposed detached change.
 * It NEVER applies an imported edit to the executable mux composition.
 */
import {
  CONTAINER_PROJECT_SCHEMA, createContainerProjectFromProjection,
} from './container-project.js';
import { auditDetachedContainerProjectIntentChain } from './container-project-intent-audit.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const same = (left, right) => left === right;
const current = (object, intent) =>
  intent.type === 'include' ? object.included :
  intent.type === 'reorder' ? object.order :
  object.attributes[intent.field] ?? null;
const fieldKey = intent => intent.type === 'set-attribute'
  ? 'attribute:' + intent.field
  : intent.type;

function beforeByUndoing(draft) {
  const map = new Map(draft.objects.map(obj => [obj.id, {
    ...obj, attributes: { ...obj.attributes },
  }]));
  for (let i = draft.editIntents.length - 1; i >= 0; i--) {
    const intent = draft.editIntents[i];
    const object = map.get(intent.objectId);
    if (intent.type === 'include') object.included = intent.from;
    else if (intent.type === 'reorder') object.order = intent.from;
    else if (intent.from === null) delete object.attributes[intent.field];
    else object.attributes[intent.field] = intent.from;
  }
  return map;
}

export function previewDetachedProjectIntentConflicts({
  draft, liveProjection = null, sourceProof = null,
} = {}) {
  if (draft?.schema !== CONTAINER_PROJECT_SCHEMA)
    throw Error('PROJECT_PREVIEW_DRAFT_REQUIRED');
  // Even if an untrusted caller claims the source digest matched, refuse
  // structurally contradictory final objects or intent revision chains.
  auditDetachedContainerProjectIntentChain(draft);

  const live = liveProjection
    ? createContainerProjectFromProjection(liveProjection) : null;
  const provenanceObserved = liveProjection?.source?.inspection === 'ffprobe-projected';
  const sameSourceIdentity = Boolean(
    live && draft.documentId === live.documentId &&
    draft.sources.length === 1 && live.sources.length === 1 &&
    draft.sources[0].id === live.sources[0].id);
  const proofMatched = sourceProof?.state === 'digest-matches-draft' &&
    sourceProof.matched === true &&
    sourceProof.sourceByteIdentityProven === true;
  const prerequisites = !live
    ? 'SOURCE_ABSENT'
    : !sameSourceIdentity
      ? 'SOURCE_IDENTITY_DRIFT'
      : !proofMatched
        ? 'SOURCE_BYTES_UNVERIFIED'
        : !provenanceObserved
          ? 'TRACKS_NOT_INSPECTED'
          : null;

  if (draft.editIntents.length === 0) return freeze({
    status: 'NO_RECORDED_EDITS',
    prereq: prerequisites,
    previewable: false,
    proposedCount: 0,
    conflictCount: 0, comparedCount: 0,
    changes: [], sourceByteIdentityProven: proofMatched,
    currentTracksInspected: provenanceObserved,
    changesApplied: false, executionAuthorized: false,
    warning: '草稿没有修改记录；不能据此证明历史编辑存在。',
  });

  const original = beforeByUndoing(draft);
  const finalObjects = new Map(draft.objects.map(obj => [obj.id, obj]));
  const liveObjects = new Map((live?.objects || []).map(obj => [obj.id, obj]));
  // Coalesce repeated updates to the SAME field: compare the earliest
  // recorded "from" to the latest final "to", not an intermediate value.
  const touched = new Map();
  for (const intent of draft.editIntents) {
    const key = JSON.stringify([intent.objectId, fieldKey(intent)]);
    if (!touched.has(key)) touched.set(key, {
      objectId: intent.objectId, type: intent.type,
      field: intent.type === 'set-attribute' ? intent.field : null,
      lastRevision: intent.revision,
    });
    touched.get(key).lastRevision = intent.revision;
  }
  let conflictCount = 0, comparedCount = 0;
  const changes = [];
  for (const entry of touched.values()) {
    const originalObject = original.get(entry.objectId);
    const finalObject = finalObjects.get(entry.objectId);
    const currentObject = liveObjects.get(entry.objectId);
    const pseudoIntent = { type: entry.type, field: entry.field };
    const from = current(originalObject, pseudoIntent);
    const to = current(finalObject, pseudoIntent);
    const liveValue = currentObject && current(currentObject, pseudoIntent);
    let reason = prerequisites;
    if (!reason) {
      if (!currentObject) reason = 'OBJECT_MISSING';
      else if (originalObject.kind !== currentObject.kind ||
          originalObject.sourceId !== currentObject.sourceId)
        reason = 'OBJECT_IDENTITY_DRIFT';
      else if (originalObject.sourceId === null)
        reason = 'UNBOUND_OR_EXTERNAL_OBJECT';
      else if (!same(liveValue, from))
        reason = 'BASELINE_FIELD_CONFLICT';
    }
    if (reason) conflictCount++;
    else comparedCount++;
    changes.push({
      objectId: entry.objectId, kind: originalObject.kind,
      type: entry.type, field: entry.field, from, to,
      current: currentObject ? liveValue : null,
      verdict: reason ? 'not-comparable' : 'baseline-matches',
      reason: reason || 'READ_ONLY_COMPARISON',
      lastRevision: entry.lastRevision,
    });
  }
  return freeze({
    status: !prerequisites && conflictCount === 0
      ? 'READ_ONLY_PREVIEW_MATCHES' : 'PREVIEW_BLOCKED',
    prereq: prerequisites,
    previewable: !prerequisites && conflictCount === 0,
    proposedCount: changes.length, comparedCount, conflictCount,
    changes, sourceByteIdentityProven: proofMatched,
    currentTracksInspected: provenanceObserved,
    changesApplied: false, executionAuthorized: false,
    // Even a fully matching baseline is only a read-only proposal.
    warning: '仅比较草稿旧值与当前对象字段；不证明旧编辑的作者、格式保真或目标写入资格。未执行任何更改。',
  });
}
