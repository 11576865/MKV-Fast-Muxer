import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareMultiAttachmentOnlyPlan, getBoundMultiAttachmentSources,
  MAX_ATTACHED_FILES, MAX_SINGLE_ATTACHMENT_BYTES,
} from '../src/multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from '../src/multi-attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';

const licenseBytes = Buffer.from('License: redistribution permitted for this test fixture.\n');
const file = (bytes, name) => {
  const out = new Blob([bytes]);
  out.name = name;
  out.lastModified = 123;
  return out;
};
const rows = () => [
  { file: file(pngBytes, 'poster.png'), mimeType: 'image/png' },
  { file: file(licenseBytes, 'LICENSE.txt'), mimeType: 'text/plain' },
];

test('frozen plan models two independent generic files with two distinct UIDs and zero tracks', () => {
  const draft = prepareMultiAttachmentOnlyPlan({ attachments: rows() });
  assert.equal(draft.schema, 'matroska-multi-attachment-only-jobplan-v0');
  assert.equal(draft.executionMode, 'experimental-candidate-only');
  assert.equal(draft.output.expectedTrackCount, 0);
  assert.equal(draft.output.expectedClusterCount, 0);
  assert.equal(draft.output.expectedAttachmentCount, 2);
  assert.deepEqual(draft.attachments.map(a => a.fileUid), ['1', '2']);
  assert.deepEqual(draft.attachments.map(a => a.declaredMimeType), ['image/png', 'text/plain']);
  assert.ok(Object.isFrozen(draft.attachments));
  assert.ok(!JSON.stringify(draft).includes('"file"'));
  assert.equal(draft.claims.executableContentSafety, 'not-validated');
  assert.equal(getBoundMultiAttachmentSources(draft).length, 2);
});

test('candidate writer creates zero-media Matroska and our independent reader extracts both exact payloads', async () => {
  const input = rows();
  const plan = prepareMultiAttachmentOnlyPlan({ attachments: input });
  const candidate = await executeMultiAttachmentOnlyCandidate(plan);
  assert.equal(candidate.state, 'CREATED_AWAITING_INDEPENDENT_AUDIT');
  assert.equal(candidate.trackCountWritten, 0);
  assert.equal(candidate.clusterCountWritten, 0);
  assert.equal(candidate.attachmentCountWritten, 2);
  const inspected = createMatroskaAttachmentReader(candidate.output);
  const inventory = await inspected.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.structure.hasTracksElement, false);
  assert.equal(inventory.structure.hasClusterElement, false);
  assert.deepEqual(inventory.attachments.map(a => a.fileUid), ['1', '2']);
  assert.deepEqual(inventory.attachments.map(a => a.filename), ['poster.png', 'LICENSE.txt']);
  for (let i = 0; i < 2; i++) {
    const actual = Buffer.from(await inspected.openAttachment(inventory.attachments[i].id)
      .data.arrayBuffer());
    assert.deepEqual(actual, i === 0 ? pngBytes : licenseBytes);
  }
});

test('unsafe filename and ambiguous collision demand explicit acknowledgement before compiling', () => {
  const items = rows();
  items[0].filename = '../../LICENSE.txt';
  items[1].filename = 'license.TXT';
  assert.throws(() => prepareMultiAttachmentOnlyPlan({ attachments: items }),
    /FILENAME_REVIEW_REQUIRED/);
  const plan = prepareMultiAttachmentOnlyPlan({
    attachments: items, approveFilenameAdjustments: true,
  });
  assert.equal(plan.attachments[0].filename, 'LICENSE.txt');
  assert.equal(plan.attachments[1].filename, 'license (2).TXT');
  assert.equal(plan.attachments[0].originalName, '../../LICENSE.txt');
  assert.ok(plan.attachments[0].filenameAdjustments.includes('path-components-stripped'));
  assert.ok(plan.attachments[1].filenameAdjustments.includes('collision-renamed'));
});

test('no hidden coercion: duplicate source references or unsupported 1 / 9 item compositions fail', () => {
  const one = rows()[0];
  assert.throws(() => prepareMultiAttachmentOnlyPlan({ attachments: [one] }),
    /COUNT_OUTSIDE/);
  assert.throws(() => prepareMultiAttachmentOnlyPlan({
    attachments: Array.from({ length: MAX_ATTACHED_FILES + 1 }, (_, i) =>
      ({ file: file([1], i + '.bin'), mimeType: 'application/octet-stream' })),
  }), /COUNT_OUTSIDE/);
  assert.throws(() => prepareMultiAttachmentOnlyPlan({
    attachments: [one, one],
  }), /DUPLICATE_SOURCE_REFERENCE/);
});

test('rejects malformed MIME, empty objects and oversized or total budget sources', () => {
  const invalid = rows();
  invalid[1].mimeType = 'image/png\r\nContent-Disposition: attachment';
  assert.throws(() => prepareMultiAttachmentOnlyPlan({ attachments: invalid }),
    /MIME_SYNTAX_INVALID/);
  assert.throws(() => prepareMultiAttachmentOnlyPlan({
    attachments: [{ file: file([], 'empty.bin'), mimeType: 'application/octet-stream' }, rows()[1]],
  }), /INVALID_FILE/);
  const tooLarge = file(new Uint8Array(MAX_SINGLE_ATTACHMENT_BYTES + 1), 'oversized.bin');
  assert.throws(() => prepareMultiAttachmentOnlyPlan({
    attachments: [{ file: tooLarge, mimeType: 'application/octet-stream' }, rows()[1]],
  }), /INVALID_FILE/);
  const half = file(new Uint8Array(MAX_SINGLE_ATTACHMENT_BYTES), 'part-a.bin');
  const half2 = file(new Uint8Array(MAX_SINGLE_ATTACHMENT_BYTES), 'part-b.bin');
  const extra = file([1], 'extra.bin');
  assert.throws(() => prepareMultiAttachmentOnlyPlan({
    attachments: [
      { file: half, mimeType: 'application/octet-stream' },
      { file: half2, mimeType: 'application/octet-stream' },
      { file: extra, mimeType: 'application/octet-stream' },
    ],
  }), /TOTAL_BUDGET_EXCEEDED/);
});

test('plan cloning, field edits and fake FileUID cannot borrow source binding', async () => {
  const plan = prepareMultiAttachmentOnlyPlan({ attachments: rows() });
  const clone = Object.freeze(structuredClone(plan));
  assert.throws(() => getBoundMultiAttachmentSources(clone), /BINDING_STALE_OR_FORGED/);
  await assert.rejects(() => executeMultiAttachmentOnlyCandidate({
    ...plan,
    attachments: plan.attachments.map((a, i) => i ? { ...a, fileUid: '1' } : a),
  }), /PLAN_NOT_SUPPORTED/);
  await assert.rejects(() => executeMultiAttachmentOnlyCandidate(Object.freeze({
    ...plan,
  })), /BINDING_STALE_OR_FORGED/);
  await assert.rejects(() => executeMultiAttachmentOnlyCandidate(null),
    /PLAN_NOT_SUPPORTED/);
});

test('new writer never validates declared MIME or attempts to run or preview raw attachments', async () => {
  const items = rows();
  items[1].mimeType = 'image/png'; // deliberately false; FileData remains text
  const result = await executeMultiAttachmentOnlyCandidate(
    prepareMultiAttachmentOnlyPlan({ attachments: items }));
  assert.equal(result.evidence.mimeMatch, 'not-tested');
  assert.equal(result.evidence.attachmentsPresumedSafe, false);
  assert.equal(result.evidence.independentMatroskaParsing, 'not-tested');
});

test('source Blob is referenced without eager full-file reads during EBML composition', async () => {
  const inputs = rows();
  let reads = 0;
  const original = inputs[0].file.slice.bind(inputs[0].file);
  inputs[0].file.slice = (...args) => {
    reads++;
    return original(...args);
  };
  const writer = await executeMultiAttachmentOnlyCandidate(
    prepareMultiAttachmentOnlyPlan({ attachments: inputs }));
  assert.equal(reads, 0);
  assert.ok(writer.output.size > pngBytes.length + licenseBytes.length);
});
