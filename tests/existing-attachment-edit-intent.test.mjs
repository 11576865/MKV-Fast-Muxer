import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchFixture, pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { prepareMultiAttachmentOnlyPlan } from '../src/multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from '../src/multi-attachment-only-candidate-writer.js';
import {
  createExistingAttachmentEditIntent, isExistingAttachmentEditIntentCurrent,
  EXISTING_ATTACHMENT_EDIT_SCHEMA,
} from '../src/existing-attachment-edit-intent.js';

function makeFile(bytes, name) {
  const file = new Blob([bytes]);
  file.name = name;
  file.lastModified = 42;
  return file;
}
const pngSource = () => makeFile(createResearchFixture(), 'pixel-only.mkv');
const attached = (bytes, name) => makeFile(bytes, name);
const textFile = () => attached(Buffer.from('An independent generic text attachment\n'), 'new-note.txt');
async function twoSource() {
  const rows = [
    { file: attached(pngBytes, 'cover.png'), mimeType: 'image/png' },
    { file: attached(Buffer.from('license\n'), 'LICENSE.txt'), mimeType: 'text/plain' },
  ];
  const plan = prepareMultiAttachmentOnlyPlan({ attachments: rows });
  const out = await executeMultiAttachmentOnlyCandidate(plan);
  return makeFile(out.output, 'two-attached.mkv');
}
const elem = (id, payload) => {
  const bytes = Buffer.from(payload);
  const length = bytes.length;
  return Buffer.concat([Buffer.from(id, 'hex'), Buffer.from([
    0x10 | ((length >>> 24) & 15), length >>> 16 & 255,
    length >>> 8 & 255, length & 255,
  ]), bytes]);
};
const cat = (...bytes) => Buffer.concat(bytes);
function taggedFile({ withNestedChapter = false, duplicateUid = false } = {}) {
  const att = (id, filename) => elem('61A7', cat(
    elem('466E', Buffer.from(filename)), elem('4660', Buffer.from('image/png')),
    elem('465C', pngBytes), elem('46AE', [id]),
  ));
  const header = elem('1A45DFA3', cat(elem('4282', Buffer.from('matroska'))));
  const info = elem('1549A966', elem('2AD7B1', [15, 66, 64]));
  const attachedFiles = elem('1941A469', cat(att(7, 'one.png'),
    ...(duplicateUid ? [att(7, 'two.png')] : [])));
  const targets = elem('63C0', elem('63C6', [7])); // TagAttachmentUID
  const tag = elem('1254C367', elem('7373', targets));
  const chapters = withNestedChapter
    ? elem('1043A770', elem('45B9', elem('B6', elem('B6', elem('73C4', [9])))))
    : Buffer.alloc(0);
  return makeFile(cat(header, elem('18538067', cat(info, attachedFiles, tag, chapters))),
    'tagged-source.mkv');
}

test('no-change draft is read-only and not a no-edit remux authorization', async () => {
  const reader = createMatroskaAttachmentReader(pngSource());
  const draft = await createExistingAttachmentEditIntent({ reader });
  assert.equal(draft.schema, EXISTING_ATTACHMENT_EDIT_SCHEMA);
  assert.equal(draft.state, 'DRAFT_ONLY_WRITE_BLOCKED');
  assert.equal(draft.proposedChanges.changed, false);
  assert.equal(draft.proposedChanges.effects[0].action, 'retain');
  assert.equal(draft.proposedChanges.effects[0].sourceFileUid, '42');
  assert.equal(draft.capability.code, 'NO_WRITE_REQUESTED');
  assert.equal(draft.execution.writer, null);
  assert.equal(draft.execution.approvedToWrite, false);
  assert.equal(isExistingAttachmentEditIntentCurrent(draft), true);
  assert.equal(Object.isFrozen(draft.proposedChanges.effects[0]), true);
});

test('add/replace/remove/retain are represented without changing source UID or FileData', async () => {
  const source = await twoSource();
  const before = Buffer.from(await source.arrayBuffer());
  const reader = createMatroskaAttachmentReader(source);
  const added = textFile();
  const replacement = attached(Buffer.from('new-license\n'), 'replacement.txt');
  const draft = await createExistingAttachmentEditIntent({
    reader,
    actions: [
      { type: 'retain', attachmentId: 'attachment:0:uid:1' },
      { type: 'replace', attachmentId: 'attachment:1:uid:2',
        file: replacement, mimeType: 'text/plain' },
      { type: 'add', file: added, mimeType: 'text/plain' },
    ],
  });
  assert.equal(draft.proposedChanges.changed, true);
  assert.deepEqual(draft.proposedChanges.effects.map(x => x.action),
    ['retain', 'replace']);
  assert.equal(draft.proposedChanges.effects[0].sourceFileUid, '1');
  assert.equal(draft.proposedChanges.effects[1].sourceFileUid, '2');
  assert.equal(draft.proposedChanges.effects[1].result.filename, 'replacement.txt');
  assert.equal(draft.proposedChanges.effects[1].result.proposedFileUid,
    'requires-writer-allocation');
  assert.equal(draft.proposedChanges.additions[0].filename, 'new-note.txt');
  assert.equal(draft.capability.code, 'EXISTING_MATROSKA_WRITER_NOT_PROVEN');
  assert.equal(draft.execution.approvedToWrite, false);
  assert.deepEqual(Buffer.from(await source.arrayBuffer()), before);
  assert.ok(!JSON.stringify(draft).includes('new-license\\n'));
});

test('remove remains proposed effect only, without mutating or exporting input container', async () => {
  const reader = createMatroskaAttachmentReader(await twoSource());
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: 'attachment:0:uid:1' }],
  });
  assert.equal(draft.proposedChanges.effects[0].action, 'remove');
  assert.equal(draft.proposedChanges.effects[1].action, 'retain');
  assert.equal(draft.execution.output, null);
  assert.equal(draft.capability.state, 'BLOCKED');
});

test('TagAttachmentUID forces explicit relation risk rather than harmless modification', async () => {
  const reader = createMatroskaAttachmentReader(taggedFile());
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: 'attachment:0:uid:7' }],
  });
  assert.equal(draft.preservationPreflight.state, 'UNVERIFIED_REFERENCES');
  assert.equal(draft.capability.code, 'SOURCE_UID_RELATIONS_UNVERIFIED');
  assert.equal(draft.sourceObservation.uidTagRelations, 'observed-unverified');
  assert.ok(draft.capability.reasons.some(x => x.includes('附件')));
  assert.equal(draft.execution.approvedToWrite, false);
});

test('nested Chapters and UID targeted tags block modifications as structural hazards', async () => {
  const reader = createMatroskaAttachmentReader(taggedFile({ withNestedChapter: true }));
  const draft = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: 'attachment:0:uid:7' }],
  });
  assert.equal(draft.preservationPreflight.state, 'BLOCKED_RISK');
  assert.equal(draft.capability.code, 'SOURCE_STRUCTURAL_PRESERVATION_BLOCKED');
  assert.equal(draft.execution.writer, null);
});

test('duplicate source FileUID cannot silently map to one target action', async () => {
  const reader = createMatroskaAttachmentReader(taggedFile({ duplicateUid: true }));
  await assert.rejects(() => createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: 'attachment:0:uid:7' }],
  }), /SOURCE_DUPLICATE_ID_OR_UID/);
});

test('unsafe new name and collision require explicit consent, keeping old names untouched', async () => {
  const reader = createMatroskaAttachmentReader(await twoSource());
  const pending = () => createExistingAttachmentEditIntent({
    reader, actions: [{
      type: 'add', file: attached([11, 22], 'custom.bin'),
      mimeType: 'application/octet-stream', filename: '../COVER.PNG',
    }],
  });
  await assert.rejects(pending, /FILENAME_REVIEW_REQUIRED/);
  const approved = await createExistingAttachmentEditIntent({
    reader, approveFilenameAdjustments: true, actions: [{
      type: 'add', file: attached([11, 22], 'custom.bin'),
      mimeType: 'application/octet-stream', filename: '../COVER.PNG',
    }],
  });
  assert.equal(approved.proposedChanges.effects[0].originalFilename, 'cover.png');
  assert.equal(approved.proposedChanges.additions[0].filename, 'COVER (2).PNG');
  assert.equal(approved.proposedChanges.additions[0].renamed, true);
});

test('stale item, conflicting edits, source duplicate, malformed MIME and unknown action fail', async () => {
  const newFile = textFile();
  const cases = [
    [{ type: 'remove', attachmentId: 'wrong-id' }, /SELECTION_STALE/],
    [[{ type: 'remove', attachmentId: 'attachment:0:uid:1' },
      { type: 'retain', attachmentId: 'attachment:0:uid:1' }], /CONFLICTING_EDIT/],
    [[{ type: 'add', file: newFile, mimeType: 'text/plain' },
      { type: 'add', file: newFile, mimeType: 'text/plain' }], /NEW_SOURCE_DUPLICATED/],
    [[{ type: 'add', file: newFile, mimeType: 'text/html\nscript' }], /MIME_INVALID/],
    [[{ type: 'rewrite', attachmentId: 'attachment:0:uid:1' }], /OPERATION_UNRECOGNIZED/],
  ];
  for (const [action, expected] of cases) {
    const reader = createMatroskaAttachmentReader(await twoSource());
    await assert.rejects(() => createExistingAttachmentEditIntent({
      reader, actions: Array.isArray(action) ? action : [action],
    }), expected);
  }
});

test('reinspection invalidates old intent even if the same file object is selected', async () => {
  const reader = createMatroskaAttachmentReader(pngSource());
  const draft = await createExistingAttachmentEditIntent({ reader });
  assert.equal(isExistingAttachmentEditIntentCurrent(draft), true);
  const reinspection = await reader.inspect();
  assert.equal(reinspection.state, 'inspected');
  assert.equal(isExistingAttachmentEditIntentCurrent(draft), false);
  const cloned = Object.freeze(structuredClone(draft));
  assert.equal(isExistingAttachmentEditIntentCurrent(cloned), false);
});

test('failed inspection refuses to create any edit intent', async () => {
  const reader = createMatroskaAttachmentReader(makeFile(Buffer.from('not an EBML'), 'bad.mkv'));
  await assert.rejects(() => createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'add', file: textFile(), mimeType: 'text/plain' }],
  }), /SOURCE_UNVERIFIED/);
});
