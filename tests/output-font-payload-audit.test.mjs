import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prepareMultiAttachmentOnlyPlan } from '../src/multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from '../src/multi-attachment-only-candidate-writer.js';
import { auditProducedFontAttachments } from '../src/output-font-payload-audit.js';

const blob = (name, bytes) => Object.assign(new Blob([bytes]), {
  name, lastModified: 1234,
});
const fontA = blob('FontA.ttf', Uint8Array.of(2, 1, 0, 0, 14, 20, 77));
const fontB = blob('FontB.otf', Uint8Array.of(79, 84, 84, 79, 17, 23));
const inputs = [
  { file: fontA, mimeType: 'application/x-truetype-font' },
  { file: fontB, mimeType: 'application/vnd.ms-opentype' },
];
const hash = async file => createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
async function fixture() {
  const plan = prepareMultiAttachmentOnlyPlan({ attachments: inputs });
  const output = (await executeMultiAttachmentOnlyCandidate(plan)).output;
  return { output, expected: await Promise.all(inputs.map(async item => ({
    filename: item.file.name, mimeType: item.mimeType,
    sizeBytes: item.file.size, sha256: await hash(item.file),
  }))) };
}

test('read real Matroska FileData and independently match two staged byte digests', async () => {
  const { output, expected } = await fixture();
  const result = await auditProducedFontAttachments(output, expected);
  assert.equal(result.status, 'pass');
  assert.equal(result.verified, 2);
  assert.equal(result.total, 2);
  assert.deepEqual(result.issues, []);
  assert.match(result.evidence, /ebml-filedata-sha256/);
});

test('a wrong digest is a warning and cannot be confused with ffprobe stream-count success', async () => {
  const { output, expected } = await fixture();
  expected[0].sha256 = '0'.repeat(64);
  const result = await auditProducedFontAttachments(output, expected);
  assert.equal(result.status, 'warning');
  assert.equal(result.verified, 1);
  assert.match(result.issues[0], /SHA-256/);
});

test('missing, duplicated or renamed new font attachment is not silently accepted', async () => {
  const { output, expected } = await fixture();
  assert.equal((await auditProducedFontAttachments(output, [{ ...expected[0], filename: 'missing.ttf' }])).status, 'warning');
  assert.equal((await auditProducedFontAttachments(output, [expected[0], expected[0]])).status, 'warning');
  const changedMime = [{ ...expected[0], mimeType: 'application/binary' }, expected[1]];
  assert.equal((await auditProducedFontAttachments(output, changedMime)).status, 'warning');
});

test('unparseable output and size budget lead to unavailable, not to a false pass', async () => {
  const { output, expected } = await fixture();
  assert.equal((await auditProducedFontAttachments(new Blob(['not MKV']), expected)).status, 'unavailable');
  assert.equal((await auditProducedFontAttachments(output, expected, { maxPerFontBytes: 2 })).status, 'unavailable');
  assert.equal((await auditProducedFontAttachments(output, expected, { maxTotalBytes: 8 })).status, 'unavailable');
});

test('no new font attachments is a distinct not-requested outcome', async () => {
  const result = await auditProducedFontAttachments(new Blob(['unrelated']), []);
  assert.equal(result.status, 'not-requested');
  assert.equal(result.total, 0);
});

test('shared single and batch mux now use output raw font audit, not an independent UI copy', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/container-workbench-evidence.js', import.meta.url), 'utf8');
  assert.match(main, /const stagedBytes = await fetchFile\(item\.file\)/);
  assert.match(main, /const fontPayloadAudit = await auditProducedFontAttachments\(outputBlob,/);
  assert.match(main, /finalAudit\.fontPayloadAudit = fontPayloadAudit/);
  assert.match(main, /fontPayloadAudit\.status === 'pass'/);
  assert.match(model, /fontPayload: report\.audit\?\.fontPayloadAudit \|\| null/);
});
