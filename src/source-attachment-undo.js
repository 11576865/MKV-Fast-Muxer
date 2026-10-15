/**
 * Session-scoped one-step undo receipt for source attachment edits.
 *
 * This is NOT another mutable ContainerProject. It remembers the exact
 * pre-transaction values, then routes any inverse back through the same live
 * domain transaction. A different File, track-state object, project revision
 * or intervening field change invalidates the receipt (fail closed).
 */
const fields = new Set(['include', 'filename', 'mimetype']);

export function captureSourceAttachmentUndo({ source, trackState, changes } = {}) {
  if (!source || !trackState || !Array.isArray(changes) || !changes.length) return null;
  const originals = new Map();
  const expected = new Map();
  for (const change of changes) {
    if (!Number.isSafeInteger(change?.index) || !fields.has(change.field)) return null;
    const item = trackState.attachments?.find(x => x.index === change.index);
    if (!item) return null;
    const key = change.index + ':' + change.field;
    if (!originals.has(key)) originals.set(key, {
      index: change.index, field: change.field, value: item[change.field],
    });
    expected.set(key, { index: change.index, field: change.field, value: change.value });
  }
  return { source, trackState, before: [...originals.values()], after: [...expected.values()] };
}

export function sealSourceAttachmentUndo(capture, revision) {
  if (!capture || !Number.isSafeInteger(revision) || revision < 0) return null;
  const before = capture.before.map(x => Object.freeze({ ...x }));
  const after = capture.after.map(x => Object.freeze({ ...x }));
  if (!after.some(x => {
    const original = before.find(row => row.index === x.index && row.field === x.field);
    return original && original.value !== x.value;
  })) return null;
  return Object.freeze({
    source: capture.source, trackState: capture.trackState,
    revision, before: Object.freeze(before), after: Object.freeze(after),
  });
}

export function planSourceAttachmentUndo(checkpoint, {
  source, trackState, revision, appendMode = false,
} = {}) {
  if (!checkpoint || appendMode || source !== checkpoint.source ||
      trackState !== checkpoint.trackState || revision !== checkpoint.revision)
    return null;
  if (!checkpoint.after.every(change => {
    const row = trackState?.attachments?.find(x => x.index === change.index);
    return row && row[change.field] === change.value;
  })) return null;
  // The existing domain refuses metadata edits to an excluded attachment.
  // A compound inverse restoring include=false plus changed metadata cannot
  // be committed atomically through that domain. Never offer a partial undo.
  for (const include of checkpoint.before.filter(x => x.field === 'include' && x.value === false)) {
    if (checkpoint.before.some(x => x.index === include.index && x.field !== 'include' &&
        checkpoint.after.find(a => a.index === x.index && a.field === x.field)?.value !== x.value))
      return null;
  }
  // Include must be restored BEFORE metadata if going to included=true,
  // but AFTER metadata if returning to excluded=false; otherwise the
  // existing authoring domain intentionally rejects excluded-file edits.
  const priority = edit => edit.field !== 'include' ? 0 :
    edit.value === true ? -1 : 1;
  const changes = [...checkpoint.before].sort((a,b) => priority(a) - priority(b));
  return Object.freeze(changes.map(x => Object.freeze({ ...x })));
}
