import assert from 'node:assert/strict';
import test from 'node:test';
import { projectAttachmentCopyTarget } from '../src/attachment-copy-target.js';
import { resolveLegacyTargetCapability } from '../src/container-target-draft.js';
import { ATTACHMENT_INVENTORY_SCHEMA } from '../src/matroska-attachment-reader.js';

const fixtureInventory = () => ({
  schema: ATTACHMENT_INVENTORY_SCHEMA,
  state: 'inspected',
  source: {
    id: 'source-session:1/asset:1', name: 'resources.mkv',
    size: 1024, identityEvidence: 'session-object-reference',
  },
  attachments: [
    { id: 'attachment:0:uid:17', filename: 'picture.png',
      mimeType: 'image/png', byteLength: 84, fileUid: '17' },
    { id: 'attachment:1:uid:18', filename: 'license.json',
      mimeType: 'application/json', byteLength: 32, fileUid: '18' },
  ],
});

test('inspection-to-target bridge composes one PNG, zero video, with no invented FileData', () => {
  const source = fixtureInventory();
  const before = JSON.stringify(source);
  const draft = projectAttachmentCopyTarget(source, ['attachment:0:uid:17']);
  assert.equal(draft.kind, 'attachments-only');
  assert.equal(draft.output.tracks.length, 0);
  assert.equal(draft.output.attachments.length, 1);
  assert.equal(draft.output.attachments[0].declaredSize, 84);
  assert.equal(draft.output.attachments[0].fileUid, 'not-assigned');
  assert.equal(draft.output.attachments[0].sourceKey,
    'source-session:1/asset:1/attachment:0:uid:17');
  assert.equal(draft.output.attachments[0].bytesEvidence, 'not-inspected');
  assert.equal(resolveLegacyTargetCapability(draft).code, 'LEGACY_VIDEO_ROOT_REQUIRED');
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source), false);
});

test('arbitrary attachment selection preserves requested order without font-special casing', () => {
  const draft = projectAttachmentCopyTarget(fixtureInventory(),
    ['attachment:1:uid:18','attachment:0:uid:17']);
  assert.deepEqual(draft.output.attachments.map(x => x.filename),
    ['license.json','picture.png']);
  assert.deepEqual(draft.output.attachments.map(x => x.mimeType),
    ['application/json','image/png']);
});

test('stale or duplicate selection and unverified inventory must fail closed', () => {
  const original = fixtureInventory();
  assert.throws(() => projectAttachmentCopyTarget(original, ['not-exists']),
    /ATTACHMENT_SELECTION_STALE/);
  assert.throws(() => projectAttachmentCopyTarget(original, [
    'attachment:0:uid:17','attachment:0:uid:17',
  ]), /ATTACHMENT_SELECTION_DUPLICATED/);
  assert.throws(() => projectAttachmentCopyTarget({ ...original, state: 'unverified' }),
    /VERIFIED_ATTACHMENT_INVENTORY_REQUIRED/);
  assert.throws(() => projectAttachmentCopyTarget(original, 'all'),
    /ATTACHMENT_SELECTION_INVALID/);
});
