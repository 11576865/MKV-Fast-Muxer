import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContainerProject, applyContainerProjectEdit,
  undoContainerProjectEdit, serializeContainerProject,
} from '../src/container-project.js';
import {
  resolveContainerCapabilities, summarizeContainerCapability,
} from '../src/container-capabilities.js';
import {
  BATCH_RECIPE_MAX_BYTES, buildBatchRecipe, parseBatchRecipe,
  stringifyBatchRecipe, recipeApplyPreview,
} from '../src/batch-recipe.js';

const create = () => createContainerProject({
  documentId: 'case:p1',
  sources: [{ id: 'source:one', name: 'a.mkv', size: 1800 }],
  objects: [
    { id: 'stream:0', kind: 'subtitle', sourceId: 'source:one', attributes: { title: 'Chinese', language: 'zho' } },
    { id: 'attachment:1', kind: 'attachment', sourceId: 'source:one', attributes: { name: 'font.ttf', mime: 'font/ttf' } },
    { id: 'chapter:2', kind: 'chapter', sourceId: 'source:one', attributes: { title: 'Part I' } },
  ],
});
const recipe = () => buildBatchRecipe({ policy: {
  preserveAttachments: true, subsetEnabled: false, subsetScope: 'job',
} });

test('P1 resource-only domain project has no video-root prerequisite and no write permission', () => {
  const p = createContainerProject({
    documentId: 'test:resource-only', objects: [{
      id: 'attachment:1', kind: 'attachment', attributes: { name: 'only.png', mime: 'image/png' },
    }],
  });
  assert.equal(p.objects.length, 1);
  assert.equal(p.objects[0].kind, 'attachment');
  assert.equal(p.writerStatus, 'unresolved');
  assert.equal(p.authorization, 'requires-relink');
  assert.equal(Object.isFrozen(p.objects[0].attributes), true);
});
test('P1 metadata edits yield immutable revisioned intents; undo restores original without mutating old snapshots', () => {
  const p = create();
  const updated = applyContainerProjectEdit(p, { type: 'set-attribute', objectId: 'stream:0', field: 'title', value: 'Japanese' });
  assert.equal(p.objects[0].attributes.title, 'Chinese');
  assert.equal(updated.objects[0].attributes.title, 'Japanese');
  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.editIntents[0], { revision: 1, type: 'set-attribute', objectId: 'stream:0', field: 'title', from: 'Chinese', to: 'Japanese' });
  const undo = undoContainerProjectEdit(updated);
  assert.equal(undo.objects[0].attributes.title, 'Chinese');
  assert.equal(undo.revision, 2);
  assert.equal(updated.objects[0].attributes.title, 'Japanese');
});
test('P1 inclusion, reordering and impossible operations are separately authorized', () => {
  const p = create();
  assert.equal(applyContainerProjectEdit(p, { type: 'include', objectId: 'attachment:1', value: false }).objects[1].included, false);
  assert.equal(applyContainerProjectEdit(p, { type: 'reorder', objectId: 'stream:0', value: 2 }).objects[0].order, 2);
  assert.throws(() => applyContainerProjectEdit(p, { type: 'set-attribute', objectId: 'attachment:1', field: 'fontBinary', value: 'hack' }), /UNSUPPORTED/);
  assert.throws(() => applyContainerProjectEdit(p, { type: 'delete-source-file', objectId: 'stream:0' }), /UNKNOWN_EDIT/);
  assert.throws(() => applyContainerProjectEdit(p, { type: 'reorder', objectId: 'stream:0', value: 999 }), /INVALID_ORDER/);
});
test('P1 duplicate and dangling identity refusal; serializing never preserves source file handles', () => {
  assert.throws(() => createContainerProject({ documentId: 'bad' , sources: [{ id: 'x' }, { id: 'x' }] }), /DUPLICATE_SOURCE/);
  assert.throws(() => createContainerProject({ documentId: 'bad', objects: [{ id: 'one', kind: 'video', sourceId: 'missing' }] }), /DANGLING_SOURCE/);
  const out = JSON.parse(serializeContainerProject(create()));
  assert.equal(out.execution, 'requires-fresh-source-authorization');
  assert.equal(out.sources[0].authorization, 'requires-relink');
  assert.equal(out.objects.length, 3);
});
test('P2 no-source and uninspected sources are not executable', () => {
  assert.equal(resolveContainerCapabilities().mux.status, 'blocked');
  assert.equal(resolveContainerCapabilities({
    hasSource: true, sourceContainer: 'matroska',
  }).mux.status, 'requires-preflight');
  assert.equal(resolveContainerCapabilities({
    hasSource: true, sourceContainer: 'unknown', sourceInspected: true, hasVideo: true,
  }).mux.code, 'IDENTITY_UNKNOWN');
});
test('P2 video-less domain can exist while current browser video mux remains unsupported', () => {
  const c = resolveContainerCapabilities({ hasSource: true, sourceContainer: 'matroska', sourceInspected: true, hasVideo: false });
  assert.equal(c.plan.status, 'available');
  assert.equal(c.mux.status, 'unsupported');
  assert.equal(c.resourceOnlyWrite.status, 'experimental');
  assert.equal(c.fullEbmlPreservation.status, 'unsupported');
  assert.equal(c.playerCompatibility.status, 'unverified');
});
test('P2 complex Matroska blocked; bounded attachment path never claims general eligibility', () => {
  const blocked = resolveContainerCapabilities({
    hasSource: true, sourceContainer: 'matroska', sourceInspected: true, hasVideo: true, preservationStatus: 'blocked',
  });
  assert.equal(blocked.mux.code, 'PRESERVATION_NOT_CLEARED');
  assert.equal(blocked.existingAttachmentAdd.status, 'requires-preflight');
  const narrowed = resolveContainerCapabilities({
    hasSource: true, sourceContainer: 'matroska', writerEligibility: 'verified-by-dedicated-writer',
  });
  assert.equal(narrowed.existingAttachmentAdd.code, 'BOUNDED_VOID_WRITER');
  assert.notEqual(narrowed.existingAttachmentAdd.status, 'available');
  assert.equal(summarizeContainerCapability(narrowed).length, 5);
});
test('P3-B batch recipes roundtrip without smuggling media handles or destination grants', () => {
  const source = recipe();
  const wire = stringifyBatchRecipe(source);
  const read = parseBatchRecipe(wire);
  assert.deepEqual(read, source);
  assert.equal(read.sourceBindings, 'must-reselect-and-review');
  assert.equal(read.outputDirectoryPermission, 'not-exported');
  assert.equal(read.savedArtifacts, 'not-included');
  assert.equal(recipeApplyPreview(read).executionAuthorized, false);
  assert.equal(recipeApplyPreview(read, { hasSelectedSources: true }).mustRebuildPairing, true);
});
test('P3-B malicious/obsolete recipes fail closed and never gain execution authorization', () => {
  const original = recipe();
  assert.throws(() => parseBatchRecipe('x'), /RECIPE_JSON_INVALID/);
  assert.throws(() => parseBatchRecipe('x'.repeat(BATCH_RECIPE_MAX_BYTES + 1)), /RECIPE_TOO_LARGE/);
  assert.throws(() => parseBatchRecipe(JSON.stringify({ ...original, schema: 'batch-recipe-v900' })), /RECIPE_SCHEMA_UNSUPPORTED/);
  assert.throws(() => parseBatchRecipe(JSON.stringify({ ...original, outputDirectoryPermission: '/tmp/private' })), /RECIPE_SCHEMA_UNSUPPORTED/);
  assert.throws(() => parseBatchRecipe(JSON.stringify({ ...original, fileHandles: ['source.mkv'] })), /RECIPE_SCHEMA_UNSUPPORTED/);
  assert.throws(() => parseBatchRecipe(JSON.stringify({ ...original, policy: { ...original.policy, subsetScope: 'evil' } })), /INVALID_RECIPE_VALUES/);
  assert.throws(() => parseBatchRecipe(JSON.stringify({ ...original, policy: { ...original.policy, subsetEnabled: 'yes' } })), /INVALID_RECIPE_VALUES/);
});
