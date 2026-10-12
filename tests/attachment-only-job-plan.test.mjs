import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preparePngAttachmentOnlyPlan, getBoundPngSourceForCandidate,
  PNG_ONLY_PLAN_SCHEMA, MAX_PNG_ATTACHMENT_BYTES,
} from '../src/attachment-only-job-plan.js';
import {
  executePngAttachmentOnlyCandidate,
  PNG_ONLY_CANDIDATE_WRITER_ID,
} from '../src/attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { pngBytes } from '../scripts/r02-attachment-only-fixture.mjs';

const file = (data, name = 'pixel.png') => {
  const out = new Blob([data]);
  out.name = name;
  out.lastModified = 1234;
  return out;
};

test('compiles a single-PNG attachment-only JobPlan without media tracks or File objects', () => {
  const source = file(pngBytes);
  const plan = preparePngAttachmentOnlyPlan({
    file: source, filename: '../../pixel.png',
    outputName: 'result.mkv',
  });
  assert.equal(plan.schema, PNG_ONLY_PLAN_SCHEMA);
  assert.equal(plan.origin, 'new-empty-matroska');
  assert.equal(plan.output.expectedTrackCount, 0);
  assert.equal(plan.output.expectedClusterCount, 0);
  assert.equal(plan.output.expectedAttachmentCount, 1);
  assert.equal(plan.attachments[0].filename, 'pixel.png');
  assert.equal(plan.attachments[0].fileUid, '1');
  assert.equal(plan.attachments[0].filenameAdjusted, true);
  assert.equal(plan.executionMode, 'experimental-candidate-only');
  assert.equal(plan.claims.finalMatroskaConformance, 'unverified');
  assert.equal(getBoundPngSourceForCandidate(plan), source);
  assert.equal(Object.isFrozen(plan.attachments[0]), true);
  assert.equal(Object.isFrozen(source), false);
  assert.ok(!JSON.stringify(plan).includes('FileData'));
});

test('cannot hijack a different File using cloned plan or same metadata', () => {
  const original = file(pngBytes);
  const plan = preparePngAttachmentOnlyPlan({ file: original });
  const clone = structuredClone(plan);
  assert.throws(() => getBoundPngSourceForCandidate(clone),
    /BINDING_STALE_OR_FOREIGN/);
  const replacement = file(pngBytes);
  replacement.name = original.name;
  replacement.lastModified = original.lastModified;
  assert.notEqual(replacement, getBoundPngSourceForCandidate(plan));
  assert.equal(getBoundPngSourceForCandidate(plan), original);
});

test('rejects invalid output name, missing source, oversized input, and empty input', () => {
  assert.throws(() => preparePngAttachmentOnlyPlan(),
    /MISSING_OR_EXCEEDS/);
  assert.throws(() => preparePngAttachmentOnlyPlan({ file: file([]) }),
    /MISSING_OR_EXCEEDS/);
  assert.throws(() => preparePngAttachmentOnlyPlan({
    file: file([1]), outputName: 'output.mp4',
  }), /OUTPUT_MUST_BE_MKV/);
  const huge = new Blob([new Uint8Array(MAX_PNG_ATTACHMENT_BYTES + 1)]);
  assert.throws(() => preparePngAttachmentOnlyPlan({
    file: huge,
  }), /MISSING_OR_EXCEEDS/);
});

test('writer denies non-PNG input even if declared filename and MIME are PNG', async () => {
  const plan = preparePngAttachmentOnlyPlan({
    file: file(new TextEncoder().encode('%PDF-FAKE'), 'pretend.png'),
  });
  await assert.rejects(() => executePngAttachmentOnlyCandidate(plan),
    /SOURCE_SIGNATURE_MISMATCH/);
});

test('candidate creates true zero-track Matroska with exact PNG FileData Blob bytes', async () => {
  const source = file(pngBytes);
  const plan = preparePngAttachmentOnlyPlan({ file: source });
  const output = await executePngAttachmentOnlyCandidate(plan);
  assert.equal(output.state, 'CREATED_AWAITING_INDEPENDENT_AUDIT');
  assert.equal(output.writer, PNG_ONLY_CANDIDATE_WRITER_ID);
  assert.equal(output.mediaTracksWritten, 0);
  assert.equal(output.clustersWritten, 0);
  assert.equal(output.attachmentCountWritten, 1);
  assert.equal(output.evidence.fullByteEquivalence, 'unverified');

  const reader = createMatroskaAttachmentReader(output.output);
  const inventory = await reader.inspect();
  assert.equal(inventory.state, 'inspected');
  assert.equal(inventory.structure.hasTracksElement, false);
  assert.equal(inventory.structure.hasClusterElement, false);
  assert.equal(inventory.attachments.length, 1);
  assert.equal(inventory.attachments[0].fileUid, '1');
  const extracted = await reader.openAttachment(inventory.attachments[0].id)
    .data.arrayBuffer();
  assert.deepEqual(Buffer.from(extracted), pngBytes);
});

test('candidate writer refuses unbound, edited, or unsupported plan shapes', async () => {
  const plan = preparePngAttachmentOnlyPlan({ file: file(pngBytes) });
  await assert.rejects(() => executePngAttachmentOnlyCandidate({
    ...plan, attachments: [{ ...plan.attachments[0], fileUid: '2' }],
  }), /PLAN_NOT_SUPPORTED/);
  await assert.rejects(() => executePngAttachmentOnlyCandidate({
    ...plan, attachments: [{ ...plan.attachments[0], filename: 'altered.png' }],
  }), /BINDING_STALE_OR_FOREIGN/);
  await assert.rejects(() => executePngAttachmentOnlyCandidate(null),
    /PLAN_NOT_SUPPORTED/);
});

test('writes ordinary Blob parts and does not require FFmpeg or whole payload pre-read', async () => {
  const source = file(pngBytes);
  let readCalls = 0;
  const originalSlice = source.slice.bind(source);
  source.slice = (...args) => {
    readCalls++;
    return originalSlice(...args);
  };
  const plan = preparePngAttachmentOnlyPlan({ file: source });
  const outcome = await executePngAttachmentOnlyCandidate(plan);
  assert.equal(readCalls, 1, 'only one 8-byte prefix slice before composing Blob');
  assert.ok(outcome.output instanceof Blob);
  assert.ok(outcome.outputBytes > source.size);
});
