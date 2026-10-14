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
const ATTACHMENT_FIELDS = Object.freeze(['include','filename','mimetype']);
const captureAttachment = item => Object.fromEntries(ATTACHMENT_FIELDS.map(field => [field,item[field]]));
const equalAttachment = (a,b) => ATTACHMENT_FIELDS.every(field => a[field] === b[field]);
const freeze = x => Object.freeze(x);
const allowed = new Set([
  'title', 'language', 'default', 'forced', 'original', 'commentary', 'hearingImpaired',
]);

function validateAttachmentValue(field,value) {
  if (field === 'include') {
    if (typeof value !== 'boolean') throw Error('ATTACHMENT_REPLAY_INCLUDE_INVALID');
  } else if (typeof value !== 'string' ||
    value.length > (field === 'filename' ? 240 : 120) ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    field === 'filename' && (value.includes('/') || value.includes('\\'))) {
    throw Error('ATTACHMENT_REPLAY_METADATA_INVALID');
  }
}

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
  const attachmentPatches = new Map();
  const reorderChanges = new Map();
  for (const change of preview.changes) {
    const object = objects.get(change.objectId);
    const [kind, indexText] = String(object?.target?.key || '').split(':');
    const index = Number(indexText);
    if (change.type === 'reorder') {
      if (object?.target?.type !== 'source' ||
          !['audio','subtitle'].includes(kind) || kind !== object.kind ||
          !/^\d+$/.test(indexText || '') || !Number.isSafeInteger(index))
        throw Error('TRACK_REPLAY_UNSUPPORTED_REORDER');
      const group=reorderChanges.get(kind) || new Map();
      if (group.has(index)) throw Error('TRACK_REPLAY_REORDER_DUPLICATE');
      group.set(index,change);
      reorderChanges.set(kind,group);
      continue;
    }
    if (object?.target?.type === 'source' && kind === 'attachment' &&
        object.kind === 'attachment' && /^\d+$/.test(indexText || '') &&
        Number.isSafeInteger(index)) {
      const attachment=trackState.attachments?.find(row=>row.index===index);
      const stream=trackState.streams?.find(row=>row.index===index);
      if (!attachment || !stream || attachment.stream!==stream ||
          stream.codec_type!=='attachment')
        throw Error('ATTACHMENT_REPLAY_SCAN_IDENTITY_DRIFT');
      const field = change.type === 'include' ? 'include' :
        change.type === 'set-attribute' && change.field === 'name' ? 'filename' :
        change.type === 'set-attribute' && change.field === 'mime' ? 'mimetype' : '';
      if (!ATTACHMENT_FIELDS.includes(field))
        throw Error('ATTACHMENT_REPLAY_UNSUPPORTED_EDIT');
      validateAttachmentValue(field,change.to);
      let patch=attachmentPatches.get(index);
      if (!patch) {
        const before=captureAttachment(attachment);
        patch={index,kind:'attachment',stream,before,after:{...before}};
        attachmentPatches.set(index,patch);
      }
      if (patch.before[field]!==change.current)
        throw Error('ATTACHMENT_REPLAY_LIVE_FIELD_DRIFT');
      patch.after[field]=change.to;
      continue;
    }
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


  // A reorder is a permutation of ALL scanned slots in one kind, not a
  // standalone scalar edit. The domain stores compact positions, while the
  // existing FFmpeg executor can have sparse numbers such as 1, 4, 9.
  // Validate a bijection of the whole source cohort before changing ANY row.
  for (const [kind, changes] of reorderChanges) {
    const sourceGroup=currentProject.objects.map((obj,position)=>({
      obj,projection:liveProjection.objects[position],
    })).filter(({obj,projection})=>obj.kind===kind &&
      projection?.target?.type==='source' &&
      /^\d+$/.test((projection.target.key || '').split(':')[1] || '') &&
      (projection.target.key || '').startsWith(kind+':'));
    const executor=trackState.tracks.filter(row=>row.type===kind);
    if (sourceGroup.length!==executor.length || sourceGroup.length<2 ||
        executor.some(row=>!row.include || !Number.isSafeInteger(row.order) ||
          row.order<0 || row.stream!==trackState.streams?.find(stream=>stream.index===row.index)) ||
        new Set(executor.map(row=>row.index)).size!==executor.length ||
        new Set(executor.map(row=>row.order)).size!==executor.length)
      throw Error('TRACK_REPLAY_ORDER_INVENTORY_UNSAFE');
    const sourceByIndex=new Map();
    for (const entry of sourceGroup) {
      const index=Number(entry.projection.target.key.split(':')[1]);
      if (sourceByIndex.has(index)) throw Error('TRACK_REPLAY_ORDER_INVENTORY_UNSAFE');
      sourceByIndex.set(index,entry.obj);
    }
    if (sourceByIndex.size!==executor.length ||
        executor.some(row=>!sourceByIndex.has(row.index)))
      throw Error('TRACK_REPLAY_ORDER_INVENTORY_UNSAFE');
    const byProject=[...executor].sort((a,b)=>
      sourceByIndex.get(a.index).order-sourceByIndex.get(b.index).order);
    const byExecutor=[...executor].sort((a,b)=>a.order-b.order);
    if (byProject.some((row,i)=>row!==byExecutor[i]))
      throw Error('TRACK_REPLAY_ORDER_PROJECTION_DRIFT');
    const slotSet=byProject.map(row=>sourceByIndex.get(row.index).order);
    if (new Set(slotSet).size!==slotSet.length)
      throw Error('TRACK_REPLAY_ORDER_INVENTORY_UNSAFE');
    const desired=new Map();
    for (const row of executor) {
      const change=changes.get(row.index);
      const currentSlot=sourceByIndex.get(row.index).order;
      if (change && change.current!==currentSlot)
        throw Error('TRACK_REPLAY_ORDER_BASELINE_CONFLICT');
      desired.set(row.index,change ? change.to : currentSlot);
      const nextIncluded=patches.get(row.index)?.after.include ?? row.include;
      if (!nextIncluded) throw Error('TRACK_REPLAY_ORDER_INCLUSION_CONFLICT');
    }
    if (new Set(desired.values()).size!==desired.size ||
        [...desired.values()].some(slot=>!slotSet.includes(slot)))
      throw Error('TRACK_REPLAY_ORDER_NOT_PERMUTATION');
    const numericSlots=byExecutor.map(row=>row.order);
    const desiredRows=[...executor].sort((a,b)=>desired.get(a.index)-desired.get(b.index));
    desiredRows.forEach((row,position)=>{
      const existing=patches.get(row.index);
      const patch=existing || {
        index:row.index,kind,before:capture(row),after:capture(row),
      };
      if (patch.kind!==kind || patch.before.order!==row.order)
        throw Error('TRACK_REPLAY_ORDER_LIVE_STATE_CHANGED');
      patch.after.order=numericSlots[position];
      // Only the exact stream from the freshly inspected source may receive
      // a recovered order; a copied same-index row is not a source identity.
      patch.stream=row.stream;
      patches.set(row.index,patch);
    });
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
          !(['default', 'forced', 'original', 'commentary', 'hearingImpaired']
            .includes(change.field) && change.to === false);
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
  for (const patch of attachmentPatches.values()) {
    // An excluded attachment's metadata is not part of the executable
    // output. Refuse to hide metadata edits behind an exclusion command.
    if (!patch.after.include &&
        (patch.after.filename !== patch.before.filename ||
         patch.after.mimetype !== patch.before.mimetype))
      throw Error('ATTACHMENT_REPLAY_EXCLUDED_METADATA_EDIT');
  }
  if (patches.size + attachmentPatches.size > 100)
    throw Error('TRACK_REPLAY_CHANGE_BUDGET');
  return freeze({
    schema: TRACK_REPLAY_SCHEMA,
    sourceKey: liveProjection.sourceKey,
    sourceScanKey: liveProjection.sourceScanKey,
    proposedCount: preview.changes.length,
    tracks: freeze([...patches.values()].map(patch => freeze({
      index: patch.index, kind: patch.kind,
      before: freeze(patch.before), after: freeze(patch.after),
      ...(patch.stream ? { stream:patch.stream } : {}),
    }))),
    attachments: freeze([...attachmentPatches.values()].map(patch => freeze({
      index: patch.index, kind: patch.kind, stream: patch.stream,
      before: freeze(patch.before), after: freeze(patch.after),
    }))),
    // Stream references are in-memory identity sentinels only. No permission,
    // execution token or source bytes are carried into a plan.
    executionAuthorized: false, sourceMutationAuthorized: false,
  });
}

export function applyPreparedTrackReplay(plan, trackState) {
  if (plan?.schema !== TRACK_REPLAY_SCHEMA ||
      !trackState || plan.sourceScanKey !== trackState.fileKey ||
      !Array.isArray(trackState.tracks))
    throw Error('TRACK_REPLAY_PLAN_STALE');
  const attachments = plan.attachments || [];
  if (!Array.isArray(attachments) ||
      !plan.tracks.length && !attachments.length ||
      plan.tracks.length + attachments.length > 100)
    throw Error('TRACK_REPLAY_PLAN_INVALID');
  const targets = [];
  const attachmentTargets = [];
  const seen = new Set();
  // Validate every target before mutating the first; no partial commit on a
  // stale/changed editor state. This path has no awaits or File writes.
  for (const patch of plan.tracks) {
    if (seen.has(patch.index)) throw Error('TRACK_REPLAY_DUPLICATE_TARGET');
    seen.add(patch.index);
    const track = trackState.tracks.find(row =>
      row.index === patch.index && row.type === patch.kind);
    if (!track || patch.stream && (
        track.stream!==patch.stream ||
        !trackState.streams?.some(stream=>stream===patch.stream &&
          stream.index===patch.index)) ||
        !equal(capture(track), patch.before))
      throw Error('TRACK_REPLAY_LIVE_STATE_CHANGED');
    targets.push([track, patch.after]);
  }
  for (const patch of attachments) {
    if (seen.has(patch.index)) throw Error('TRACK_REPLAY_DUPLICATE_TARGET');
    seen.add(patch.index);
    const item=trackState.attachments?.find(row=>row.index===patch.index);
    const stream=trackState.streams?.find(row=>row.index===patch.index);
    if (!item || !stream || patch.kind!=='attachment' ||
        patch.stream!==stream || item.stream!==stream ||
        stream.codec_type!=='attachment' ||
        !equalAttachment(captureAttachment(item),patch.before))
      throw Error('ATTACHMENT_REPLAY_LIVE_STATE_CHANGED');
    attachmentTargets.push([item,patch.after]);
  }
  // Nothing from either collection changes until every track AND attachment
  // is proven still equal to the prepared before state.
  for (const [track, after] of targets) {
    for (const field of FIELDS) track[field] = after[field];
  }
  for (const [item,after] of attachmentTargets) {
    for (const field of ATTACHMENT_FIELDS) item[field]=after[field];
  }
  return freeze({
    status: 'applied-to-current-edit-plan',
    updatedTracks: targets.length,
    updatedAttachments: attachmentTargets.length,
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
  const attachmentTargets = [];
  for (const patch of plan.tracks) {
    const track = trackState.tracks.find(row =>
      row.index === patch.index && row.type === patch.kind);
    if (!track || patch.stream && (
        track.stream!==patch.stream ||
        !trackState.streams?.some(stream=>stream===patch.stream &&
          stream.index===patch.index)) ||
        !equal(capture(track), patch.after))
      throw Error('TRACK_REPLAY_UNDO_CONFLICT');
    targets.push([track, patch.before]);
  }
  for (const patch of plan.attachments || []) {
    const item=trackState.attachments?.find(row=>row.index===patch.index);
    const stream=trackState.streams?.find(row=>row.index===patch.index);
    if (!item || !stream || patch.kind!=='attachment' ||
        patch.stream!==stream || item.stream!==stream ||
        stream.codec_type!=='attachment' ||
        !equalAttachment(captureAttachment(item),patch.after))
      throw Error('ATTACHMENT_REPLAY_UNDO_CONFLICT');
    attachmentTargets.push([item,patch.before]);
  }
  for (const [track, before] of targets) {
    for (const field of FIELDS) track[field] = before[field];
  }
  for (const [item,before] of attachmentTargets) {
    for (const field of ATTACHMENT_FIELDS) item[field]=before[field];
  }
  return freeze({ status: 'reverted-in-current-edit-plan',
    revertedTracks: targets.length, revertedAttachments: attachmentTargets.length,
    fileWritten: false, muxStarted: false });
}
