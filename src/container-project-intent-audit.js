/**
 * P1: detached, untrusted edit-intent internal coherence ONLY.
 *
 * A coherent JSON can be wholly fabricated. This does not prove authorship,
 * source/object byte identity, user consent, writer eligibility or replay.
 * Never use this result as an execution gate on its own.
 */
import { CONTAINER_PROJECT_SCHEMA } from './container-project.js';

const EDITABLE = Object.freeze({
  video: ['title', 'language', 'default', 'forced'],
  audio: ['title', 'language', 'default', 'forced'],
  subtitle: ['title', 'language', 'default', 'forced'],
  attachment: ['name', 'mime'],
  chapter: ['title'],
  tag: ['name', 'value'],
  metadata: ['name', 'value'],
  other: [],
});
const stringBool = value =>
  (typeof value === 'string' && value.length <= 1024) ||
  typeof value === 'boolean';

function reject(reason) { throw Error('PROJECT_INTENT_CHAIN_INVALID:' + reason); }

function currentValue(item, intent) {
  if (intent.type === 'include') return item.included;
  if (intent.type === 'reorder') return item.order;
  if (intent.type === 'set-attribute') return item.attributes[intent.field] ?? null;
  reject('UNKNOWN_TYPE');
}

function validateChange(item, intent, objectCount) {
  if (intent.field !== (intent.type === 'set-attribute' ? intent.field : null))
    reject('INAPPLICABLE_FIELD');
  if (intent.type === 'set-attribute') {
    if (typeof intent.field !== 'string' ||
        !EDITABLE[item.kind]?.includes(intent.field) ||
        !stringBool(intent.to) ||
        !(intent.from === null || stringBool(intent.from)))
      reject('INVALID_TYPED_ATTRIBUTE');
  } else if (intent.type === 'include') {
    if (typeof intent.from !== 'boolean' || typeof intent.to !== 'boolean')
      reject('INVALID_INCLUDE_VALUE');
  } else if (intent.type === 'reorder') {
    if (![intent.from,intent.to].every(n =>
      Number.isSafeInteger(n) && n >= 0 && n < objectCount))
      reject('INVALID_ORDER_VALUE');
  } else reject('UNKNOWN_TYPE');
  if (intent.from === intent.to) reject('NOOP_INTENT');
}

function rewind(item, intent) {
  if (intent.type === 'include') { item.included = intent.from; return; }
  if (intent.type === 'reorder') { item.order = intent.from; return; }
  if (intent.from === null) delete item.attributes[intent.field];
  else item.attributes[intent.field] = intent.from;
}

/**
 * Reverse-walk from the serialized final state. Each recorded "to" MUST be
 * the current state before undoing that intent; the previous "from" becomes
 * the next earlier state. This detects contradictory chains and forged final
 * snapshots, not whether any claimed original edit actually occurred.
 */
export function auditDetachedContainerProjectIntentChain(project) {
  if (project?.schema !== CONTAINER_PROJECT_SCHEMA ||
      !Array.isArray(project.objects) ||
      !Array.isArray(project.editIntents) ||
      !Number.isSafeInteger(project.revision) ||
      project.revision < 0) reject('PROJECT_SHAPE');
  const objects = new Map(project.objects.map(o => [o.id, {
    kind: o.kind, included: o.included, order: o.order,
    attributes: { ...o.attributes },
  }]));
  if (objects.size !== project.objects.length) reject('DUPLICATE_OBJECT');
  let priorRevision = 0;
  for (const intent of project.editIntents) {
    if (!intent || !Number.isSafeInteger(intent.revision) ||
        intent.revision <= priorRevision || intent.revision > project.revision)
      reject('REVISION_ORDER');
    priorRevision = intent.revision;
  }

  for (let index = project.editIntents.length - 1; index >= 0; index--) {
    const intent = project.editIntents[index];
    const item = objects.get(intent.objectId);
    if (!item) reject('OBJECT_NOT_FOUND');
    validateChange(item, intent, project.objects.length);
    if (currentValue(item, intent) !== intent.to)
      reject('TO_STATE_CONTRADICTION');
    rewind(item, intent);
  }
  const itemCount = project.editIntents.length;
  return Object.freeze({
    state: itemCount ? 'internally-coherent' : 'no-recorded-intents',
    internallyCoherent: true, intentCount: itemCount,
    lastIntentRevision: itemCount ? priorRevision : null,
    // The JSON is editable. Semantic self-consistency is not provenance.
    authorshipProven: false, originalEditOccurrenceProven: false,
    sourceByteIdentityProven: false, changesApplied: false,
    executionAuthorized: false, writerEligible: false,
    preview: Object.freeze(project.editIntents.slice(0, 12).map(intent =>
      Object.freeze({
        revision: intent.revision, type: intent.type,
        objectId: intent.objectId, field: intent.field,
        from: intent.from, to: intent.to,
      }))),
  });
}
