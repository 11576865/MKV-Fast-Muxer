/**
 * P1 draft roundtrip, deliberately separate from a source authorization or
 * media writer. A name/size/timestamp match proves only display identity.
 */
import {
  CONTAINER_PROJECT_SCHEMA, createContainerProject,
  createContainerProjectFromProjection,
} from './container-project.js';

export const PROJECT_IMPORT_MAX_BYTES = 1024 * 1024;
const keyset = (value, allowed) => Object.keys(value).every(k => allowed.includes(k));
const plain = x => x !== null && typeof x === 'object' &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const scalar = x => x === null || typeof x === 'boolean' ||
  Number.isSafeInteger(x) || typeof x === 'string' && x.length <= 1024;
const keys = Object.freeze({
  project: ['schema','documentId','sources','objects','editIntents','revision','execution'],
  source: ['id','name','size','identityEvidence','authorization'],
  object: ['id','kind','sourceId','included','order','attributes','provenance'],
  intent: ['revision','type','objectId','field','from','to'],
});

export function parseContainerProjectDraft(text) {
  if (typeof text !== 'string' ||
      new TextEncoder().encode(text).length > PROJECT_IMPORT_MAX_BYTES)
    throw Error('PROJECT_IMPORT_TOO_LARGE');
  let raw;
  try { raw = JSON.parse(text); } catch { throw Error('PROJECT_JSON_INVALID'); }
  if (!plain(raw) || !keyset(raw, keys.project) ||
      raw.schema !== CONTAINER_PROJECT_SCHEMA ||
      raw.execution !== 'requires-fresh-source-authorization' ||
      !Array.isArray(raw.sources) || !Array.isArray(raw.objects) ||
      !Array.isArray(raw.editIntents) ||
      !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
      raw.revision > 100000 || raw.editIntents.length > 10000 ||
      raw.revision < raw.editIntents.length)
    throw Error('PROJECT_IMPORT_SCHEMA_UNSUPPORTED');

  const sources = raw.sources.map(source => {
    if (!plain(source) || !keyset(source,keys.source) ||
        source.authorization !== 'requires-relink' ||
        typeof source.name !== 'string' || source.name.length > 512 ||
        !['string'].includes(typeof source.identityEvidence) ||
        source.identityEvidence.length > 256 ||
        (source.size !== null && source.size !== undefined &&
         (!Number.isSafeInteger(source.size) || source.size < 0)))
      throw Error('PROJECT_SOURCE_UNTRUSTED');
    return { id: source.id, name: source.name,
      size: source.size === null ? undefined : source.size,
      identityEvidence: source.identityEvidence };
  });
  const objects = raw.objects.map(object => {
    if (!plain(object) || !keyset(object, keys.object) ||
        !plain(object.attributes) || typeof object.included !== 'boolean' ||
        !Number.isSafeInteger(object.order) || object.order < 0 ||
        (object.sourceId !== null && typeof object.sourceId !== 'string') ||
        typeof object.provenance !== 'string' || object.provenance.length > 256)
      throw Error('PROJECT_OBJECT_UNTRUSTED');
    return object;
  });
  // Delegate typed fields, identity dedupe and dangling reference checks to
  // the same semantic constructor used by the export and editor.
  const project = createContainerProject({
    documentId: raw.documentId, sources, objects,
  });
  const seenRevisions = new Set();
  const intents = raw.editIntents.map(intent => {
    if (!plain(intent) || !keyset(intent, keys.intent) ||
        !keys.intent.every(k => Object.hasOwn(intent,k)) ||
        !Number.isSafeInteger(intent.revision) ||
        intent.revision < 1 || intent.revision > raw.revision ||
        seenRevisions.has(intent.revision) ||
        !['include','set-attribute','reorder'].includes(intent.type) ||
        !project.objects.some(o => o.id === intent.objectId) ||
        (intent.field !== null && (typeof intent.field !== 'string' || intent.field.length > 80)) ||
        !scalar(intent.from) || !scalar(intent.to))
      throw Error('PROJECT_EDIT_INTENT_UNTRUSTED');
    seenRevisions.add(intent.revision);
    return Object.freeze({ ...intent });
  });
  return Object.freeze({
    ...project, revision: raw.revision,
    editIntents: Object.freeze(intents),
    // This is ONLY an imported detached draft; no file binding or trusted
    // validation/attachments/history can be resurrected from JSON.
    authorization: 'requires-relink',
    validationRecords: Object.freeze([]),
    artifacts: Object.freeze([]),
    history: Object.freeze([]),
    writerStatus: 'unresolved',
  });
}

export function compareContainerProjectDraft(imported, liveProjection) {
  if (imported?.schema !== CONTAINER_PROJECT_SCHEMA)
    throw Error('PROJECT_IMPORT_REQUIRED');
  const current = liveProjection
    ? createContainerProjectFromProjection(liveProjection) : null;
  const previousIds = new Set(imported.objects.map(o => o.id));
  const currentIds = new Set((current?.objects || []).map(o => o.id));
  const missing = imported.objects.filter(o => !currentIds.has(o.id));
  const added = (current?.objects || []).filter(o => !previousIds.has(o.id));
  const sameDisplayKey = Boolean(current && imported.documentId === current.documentId &&
    imported.sources.length === current.sources.length &&
    imported.sources.every((old,i) => old.id === current.sources[i]?.id));
  const info = sameDisplayKey
    ? '显示身份匹配，但文件名/大小/时间不能证明来源字节一致；必须重新检查真实来源。'
    : '来源身份不同或未关联；不会将此草稿的修改自动套用到当前媒体。';
  return Object.freeze({
    state: sameDisplayKey ? 'display-identity-only' : 'source-relink-required',
    importedCount: imported.objects.length,
    currentCount: current?.objects.length ?? 0,
    missingCount: missing.length,
    addedCount: added.length,
    missingObjectIds: Object.freeze(missing.slice(0,12).map(o => o.id)),
    addedObjectIds: Object.freeze(added.slice(0,12).map(o => o.id)),
    importedRevision: imported.revision,
    reviewRequired: true,
    executionAuthorized: false,
    writerEligible: false,
    sourceByteIdentityProven: false,
    changesApplied: false,
    warning: info,
  });
}
