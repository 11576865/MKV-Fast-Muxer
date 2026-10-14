/**
 * ContainerProject v1: immutable, source-neutral semantic draft.
 * The inspected source-track live session owns a bounded field/order subset.
 * This semantic project is NOT a general Matroska writer; resource-only
 * plans may exist even when this browser has no suitable writer.
 */
export const CONTAINER_PROJECT_SCHEMA = 'container-project-v1';
const ALLOWED_KINDS = new Set(['video','audio','subtitle','attachment','chapter','tag','metadata','other']);
const EDITABLE_FIELDS = Object.freeze({
  video: ['title','language','default','forced'],
  audio: ['title','language','default','forced','original','commentary','hearingImpaired'],
  subtitle: ['title','language','default','forced','original','commentary','hearingImpaired'],
  attachment: ['name','mime'],
  chapter: ['title'],
  tag: ['name','value'],
  metadata: ['name','value'],
  other: [],
});
const isPlain = x => x !== null && typeof x === 'object' &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
};
const clean = x => typeof x === 'string' ? x.trim() : '';
function safeIdentity(value) {
  const id = clean(value);
  if (!id || id.length > 256 || !/^[A-Za-z0-9_./:%-]+$/.test(id)) {
    throw Error('INVALID_PROJECT_IDENTITY');
  }
  return id;
}
const clone = x => JSON.parse(JSON.stringify(x));

export function createContainerProject({
  documentId, sources = [], objects = [], authorization = 'unbound',
} = {}) {
  safeIdentity(documentId);
  if (!['unbound','session'].includes(authorization)) throw Error('INVALID_AUTHORIZATION');
  if (sources.length > 1000 || objects.length > 10000) throw Error('PROJECT_BUDGET_EXCEEDED');
  const sourceIds = new Set(), objectIds = new Set();
  const safeSources = sources.map(source => {
    const id = safeIdentity(source.id);
    if (sourceIds.has(id)) throw Error('DUPLICATE_SOURCE_ID');
    sourceIds.add(id);
    const size = source.size;
    if (size !== undefined && (!Number.isSafeInteger(size) || size < 0))
      throw Error('INVALID_SOURCE_SIZE');
    return {
      id, name: clean(source.name), size: size ?? null,
      identityEvidence: clean(source.identityEvidence) || 'display-only',
      ...(source.sha256 === undefined ? {} : {
        sha256: typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/.test(source.sha256)
          ? source.sha256 : (() => { throw Error('INVALID_SOURCE_SHA256'); })(),
      }),
      authorization: 'requires-relink',
    };
  });
  const safeObjects = objects.map(item => {
    const id = safeIdentity(item.id), kind = item.kind;
    if (objectIds.has(id)) throw Error('DUPLICATE_OBJECT_ID');
    if (!ALLOWED_KINDS.has(kind)) throw Error('INVALID_OBJECT_KIND');
    if (item.sourceId && !sourceIds.has(item.sourceId)) throw Error('DANGLING_SOURCE');
    objectIds.add(id);
    const attrs = {};
    if (item.attributes !== undefined && !isPlain(item.attributes))
      throw Error('INVALID_ATTRIBUTES');
    for (const [field, value] of Object.entries(item.attributes || {})) {
      if (!EDITABLE_FIELDS[kind].includes(field)) throw Error('UNKNOWN_ATTRIBUTE');
      if (!['string','boolean'].includes(typeof value) || String(value).length > 1024)
        throw Error('INVALID_ATTRIBUTE_VALUE');
      attrs[field] = value;
    }
    return {
      id, kind, sourceId: item.sourceId || null,
      included: item.included !== false,
      order: Number.isSafeInteger(item.order) && item.order >= 0 ? item.order : objectIds.size - 1,
      attributes: attrs, provenance: clean(item.provenance) || 'source-observation',
    };
  });
  return freeze({
    schema: CONTAINER_PROJECT_SCHEMA, documentId, revision: 0,
    authorization: 'requires-relink', sources: safeSources,
    objects: safeObjects, editIntents: [], history: [],
    validationRecords: [], artifacts: [],
    writerStatus: 'unresolved',
  });
}

export function applyContainerProjectEdit(project, edit) {
  if (project?.schema !== CONTAINER_PROJECT_SCHEMA || !isPlain(edit))
    throw Error('INVALID_PROJECT_OR_EDIT');
  const index = project.objects.findIndex(o => o.id === edit.objectId);
  if (index < 0) throw Error('UNKNOWN_PROJECT_OBJECT');
  const old = project.objects[index];
  const next = { ...old, attributes: { ...old.attributes } };
  let previous, current;
  if (edit.type === 'include') {
    if (typeof edit.value !== 'boolean') throw Error('INVALID_INCLUDE');
    previous = old.included;
    current = edit.value;
    next.included = current;
  } else if (edit.type === 'set-attribute') {
    if (!EDITABLE_FIELDS[old.kind].includes(edit.field)) throw Error('UNSUPPORTED_ATTRIBUTE_EDIT');
    if (!['string','boolean'].includes(typeof edit.value) ||
        String(edit.value).length > 1024) throw Error('INVALID_ATTRIBUTE_VALUE');
    previous = old.attributes[edit.field] ?? null;
    current = edit.value;
    next.attributes[edit.field] = current;
  } else if (edit.type === 'reorder') {
    if (!Number.isSafeInteger(edit.value) || edit.value < 0 || edit.value >= project.objects.length)
      throw Error('INVALID_ORDER');
    previous = old.order; current = edit.value; next.order = current;
  } else throw Error('UNKNOWN_EDIT_TYPE');
  if (previous === current) return project;
  if (project.history.length >= 100) throw Error('PROJECT_HISTORY_BUDGET');
  const intent = {
    revision: project.revision + 1, type: edit.type,
    objectId: old.id, field: edit.field || null, from: previous, to: current,
  };
  return freeze({
    ...project, revision: project.revision + 1,
    objects: project.objects.map((o,i) => i === index ? next : o),
    editIntents: [...project.editIntents, intent],
    history: [...project.history, { objectId: old.id, previous: old, next }],
    validationRecords: [], writerStatus: 'unresolved',
  });
}

export function undoContainerProjectEdit(project) {
  if (project?.schema !== CONTAINER_PROJECT_SCHEMA) throw Error('INVALID_PROJECT');
  if (!project.history.length) return project;
  const last = project.history.at(-1);
  return freeze({
    ...project, revision: project.revision + 1,
    objects: project.objects.map(o => o.id === last.objectId ? clone(last.previous) : o),
    editIntents: project.editIntents.slice(0,-1),
    history: project.history.slice(0,-1),
    validationRecords: [], writerStatus: 'unresolved',
  });
}

export function serializeContainerProject(project) {
  if (project?.schema !== CONTAINER_PROJECT_SCHEMA) throw Error('INVALID_PROJECT');
  const copy = {
    schema: project.schema, documentId: project.documentId,
    sources: project.sources.map(s => ({ ...s, authorization: 'requires-relink' })),
    objects: project.objects.map(o => clone(o)),
    editIntents: project.editIntents.map(o => clone(o)),
    revision: project.revision,
    execution: 'requires-fresh-source-authorization',
  };
  return JSON.stringify(copy, null, 2) + '\n';
}


// Migration bridge only. This is a source/target DRAFT derived from the
// current immutable projection, not a second writer or editable live owner.
// Hashed names avoid persisting browser File references or index-based DOM IDs.
function stableKey(prefix, source) {
  let h1 = 2166136261, h2 = 2246822519;
  for (const ch of String(source || '')) {
    const n = ch.charCodeAt(0);
    h1 = Math.imul(h1 ^ n, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ n, 3266489917) >>> 0;
  }
  return prefix + ':' + h1.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0');
}
export function createContainerProjectFromProjection(snapshot) {
  if (snapshot?.schema !== 'container-document-projection-v0' ||
      !Array.isArray(snapshot.objects)) throw Error('UNKNOWN_PROJECTION_SCHEMA');
  const documentId = stableKey('document', snapshot.sourceKey || 'empty');
  const sourceId = snapshot.source ? stableKey('source', snapshot.sourceKey) : null;
  const source = snapshot.source ? [{
    id: sourceId, name: snapshot.source.name,
    identityEvidence: snapshot.source.identityEvidence || 'display-only',
  }] : [];
  const objects = snapshot.objects.map(item => {
    const kind = ALLOWED_KINDS.has(item.kind) ? item.kind :
      item.kind === 'font' ? 'attachment' : 'other';
    const attributes = {};
    // Prefer the actual scanned edit values to a display label. In
    // particular an unnamed stream's visible codec label is NOT its title.
    for (const [field, value] of Object.entries(item.attributes || {})) {
      if (EDITABLE_FIELDS[kind].includes(field) &&
          (typeof value === 'string' || typeof value === 'boolean'))
        attributes[field] = value;
    }
    if (!('title' in attributes) &&
        typeof item.title === 'string' && EDITABLE_FIELDS[kind].includes('title'))
      attributes.title = item.title;
    return {
      id: stableKey('object', item.id), kind,
      sourceId: item.evidence?.startsWith('ffprobe') ||
        item.evidence === 'source-observation' ? sourceId : null,
      included: item.included !== false && item.status !== 'remove',
      attributes,
      provenance: item.evidence || 'legacy-projection',
    };
  });
  return createContainerProject({ documentId, sources: source, objects });
}

/**
 * Export the effective legacy editor as a portable source-baseline delta.
 * EditIntents here are derived differences (scanned vs current), NOT a claim
 * that these operations happened chronologically or that the JSON is signed.
 * Only source audio/subtitle rows have verified scan-time editable baselines.
 */
export function createEditedContainerProjectFromProjection(snapshot) {
  if (snapshot?.identityDiagnostics?.length)
    throw Error('PROJECT_SOURCE_IDENTITY_AMBIGUOUS');
  const current = createContainerProjectFromProjection(snapshot);
  const observed = new Map((snapshot.objects || [])
    .map(item => [stableKey('object', item.id), item]));
  const originals = current.objects.map(object => {
    const item = observed.get(object.id);
    if (item?.target?.type !== 'source' ||
        !['audio', 'subtitle', 'attachment'].includes(object.kind) || !item.originalAttributes)
      return object;
    return {
      ...object,
      included: item.originalIncluded !== false,
      attributes: { ...item.originalAttributes },
    };
  });
  let result = createContainerProject({
    documentId: current.documentId,
    // The normalized projection carries size:null for unknown source size;
    // the public constructor expects size omitted or a safe nonnegative int.
    sources: current.sources.map(({ size, ...source }) =>
      size === null ? source : { ...source, size }),
    objects: originals,
  });
  for (const target of current.objects) {
    const item = observed.get(target.id);
    if (item?.target?.type !== 'source' ||
        !['audio', 'subtitle', 'attachment'].includes(target.kind) || !item.originalAttributes)
      continue;
    // Persist all effective field differences, including side effects of
    // source-track exclusion. A bounded log is safer than truncating edits.
    const editable = target.kind === 'attachment'
      ? ['name', 'mime']
      : ['title', 'language', 'default', 'forced',
        'original', 'commentary', 'hearingImpaired'];
    for (const field of editable) {
      const previous = result.objects.find(object => object.id === target.id).attributes[field];
      const next = target.attributes[field];
      if (previous !== next) {
        result = applyContainerProjectEdit(result, {
          type: 'set-attribute', objectId: target.id, field, value: next,
        });
      }
    }
    const oldIncluded = result.objects.find(object => object.id === target.id).included;
    if (oldIncluded !== target.included) {
      result = applyContainerProjectEdit(result, {
        type: 'include', objectId: target.id, value: target.included,
      });
    }
  }
  return result;
}
