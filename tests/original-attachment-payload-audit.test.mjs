import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareMultiAttachmentOnlyPlan } from '../src/multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from '../src/multi-attachment-only-candidate-writer.js';
import { auditPreservedOriginalAttachmentData } from '../src/original-attachment-payload-audit.js';

const make = (name, bytes) => Object.assign(new Blob([bytes]), { name, lastModified: 9 });
const fromParts = async (fileOne = Buffer.from('original A'),
  fileTwo = Buffer.from('original B'), secondName = 'notes.txt') => {
  const plan = prepareMultiAttachmentOnlyPlan({
    attachments: [
      { file: make('first.ttf', fileOne), mimeType: 'font/ttf' },
      { file: make(secondName, fileTwo), mimeType: 'text/plain' },
    ],
  });
  return (await executeMultiAttachmentOnlyCandidate(plan)).output;
};
const claims = () => [
  { sourceFilename: 'first.ttf', outputFilename: 'first.ttf',
    sourceMimeType: 'font/ttf', outputMimeType: 'font/ttf' },
  { sourceFilename: 'notes.txt', outputFilename: 'notes.txt',
    sourceMimeType: 'text/plain', outputMimeType: 'text/plain' },
];

test('real Matroska output FileData matches two original source attachments independently', async () => {
  const source = await fromParts();
  const output = await fromParts();
  const audit = await auditPreservedOriginalAttachmentData(source, output, claims());
  assert.equal(audit.status, 'pass', audit.issues.join('; '));
  assert.equal(audit.verified, 2);
  assert.equal(audit.total, 2);
  assert.equal(audit.uidRelationsVerified, false);
  assert.equal(audit.observations.length, 2);
  assert.deepEqual(audit.observations.map(item => item.sha256),
    ['original A', 'original B'].map(x => createHash('sha256').update(x).digest('hex')));
});

test('same filename and byte length but modified output bytes are never accepted', async () => {
  const source = await fromParts();
  const output = await fromParts(Buffer.from('original Z'), Buffer.from('original B'));
  const audit = await auditPreservedOriginalAttachmentData(source, output, claims());
  assert.equal(audit.status, 'warning');
  assert.equal(audit.verified, 1);
  assert.match(audit.issues.join(' '), /SHA-256/);
});

test('missing or renamed attachment without authorized explicit source/output mapping is warning', async () => {
  const source = await fromParts();
  const output = await fromParts(Buffer.from('original A'), Buffer.from('original B'), 'renamed.txt');
  const notMapped = await auditPreservedOriginalAttachmentData(source, output, claims());
  assert.equal(notMapped.status, 'warning');
  assert.match(notMapped.issues.join(' '), /无法唯一对应/);
  const renamed = claims();
  renamed[1].outputFilename = 'renamed.txt';
  const mapped = await auditPreservedOriginalAttachmentData(source, output, renamed);
  assert.equal(mapped.status, 'pass');
});

test('wrong MIME and ambiguous claim do not silently establish original retention', async () => {
  const source = await fromParts();
  const output = await fromParts();
  const badMime = claims();
  badMime[0].outputMimeType = 'application/octet-stream';
  assert.equal((await auditPreservedOriginalAttachmentData(source, output, badMime)).status,
    'warning');
  const unknown = claims();
  unknown[0].sourceFilename = '';
  assert.equal((await auditPreservedOriginalAttachmentData(source, output, unknown)).status,
    'unavailable');
});

test('bounded read and unparseable output report unavailable, never pass', async () => {
  const source = await fromParts();
  const output = await fromParts();
  assert.equal((await auditPreservedOriginalAttachmentData(
    source, new Blob(['not Matroska']), claims())).status, 'unavailable');
  assert.equal((await auditPreservedOriginalAttachmentData(
    source, output, claims(), { maxFileBytes: 4 })).status, 'unavailable');
  assert.equal((await auditPreservedOriginalAttachmentData(
    source, output, claims(), { maxTotalBytes: 14 })).status, 'unavailable');
});

test('no original attachments requested is explicitly not-requested', async () => {
  const result = await auditPreservedOriginalAttachmentData(
    new Blob(['x']), new Blob(['y']), []);
  assert.equal(result.status, 'not-requested');
  assert.equal(result.total, 0);
});

test('real shared mux, batch status and output UI use single evidence source', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/container-workbench-evidence.js', import.meta.url), 'utf8');
  assert.match(main, /auditPreservedOriginalAttachmentData\(\s*video, outputBlob, originalAttachmentClaims\)/);
  assert.match(main, /finalAudit\.originalAttachmentPayloadAudit = originalPayloadAudit/);
  assert.match(main, /if \(finalAudit\.status === 'pass'\) finalAudit\.status = 'warning'/);
  assert.match(model, /originalAttachmentPayload: report\.audit\?\.originalAttachmentPayloadAudit \|\| null/);
  assert.match(main, /原附件字节验证：/);
});

test('S12: 64 MiB original FileData is verified by bounded full-range byte comparison, not fake SHA', async () => {
  const bytes = Buffer.alloc(64 * 1024 * 1024, 0x5a);
  bytes[0] = 0x11;
  bytes[bytes.length - 1] = 0x99;
  const source = await fromParts(bytes, Buffer.from('original B'));
  const output = await fromParts(Buffer.from(bytes), Buffer.from('original B'));
  const audit = await auditPreservedOriginalAttachmentData(source, output, claims(), {
    chunkCompare: { maxFileBytes: 128 * 1024 * 1024,
      maxTotalBytes: 1024 * 1024 * 1024, chunkBytes: 1024 * 1024 },
  });
  assert.equal(audit.status, 'pass', audit.issues.join('; '));
  assert.equal(audit.verified, 2);
  assert.match(audit.evidence, /byte-compare-v2/);
  const proof = audit.observations.find(item => item.sourceFilename === 'first.ttf');
  assert.equal(proof.byteLength, bytes.length);
  assert.equal(proof.comparedBytes, bytes.length);
  assert.equal(proof.proofMethod, 'exact-byte-compare');
  assert.equal(proof.sha256, null, 'byte comparison must not invent a SHA-256 digest');
  assert.equal(audit.uidRelationsVerified, false);
  assert.equal(audit.observations.find(item => item.sourceFilename === 'notes.txt').proofMethod, 'sha256');
});

test('S12: one changed byte in the final chunk is detected without an all-file hash', async () => {
  const first = Buffer.alloc(1024 * 1024 + 11, 0x21);
  const changed = Buffer.from(first);
  changed[changed.length - 1] ^= 0x80;
  const source = await fromParts(first);
  const output = await fromParts(changed);
  const audit = await auditPreservedOriginalAttachmentData(source, output, claims(), {
    maxFileBytes: 2048, maxTotalBytes: 4096,
    chunkCompare: { maxFileBytes: 4 * 1024 * 1024,
      maxTotalBytes: 4 * 1024 * 1024, chunkBytes: 65536 },
  });
  assert.equal(audit.status, 'warning');
  assert.equal(audit.verified, 1, 'only the unchanged second small FileData is proven');
  assert.match(audit.issues.join(';'), /逐字节比较不一致/);
  assert.ok(audit.observations.every(item => item.sourceFilename !== 'first.ttf'));
});

test('S12: a chunk compare budget refusal never upgrades output authority', async () => {
  const big = Buffer.alloc(1024 * 1024 + 1, 0x21);
  const source = await fromParts(big);
  const output = await fromParts(big);
  const options = { maxFileBytes: 1024, maxTotalBytes: 2048,
    chunkCompare: { maxFileBytes: 1024 * 1024,
      maxTotalBytes: 1024 * 1024, chunkBytes: 65536 } };
  const refusal = await auditPreservedOriginalAttachmentData(source, output, claims(), options);
  assert.equal(refusal.status, 'unavailable');
  assert.equal(refusal.verified, 0);
  assert.match(refusal.issues.join(';'), /超出独立核验预算/);
  const invalid = await auditPreservedOriginalAttachmentData(source, output, claims(), {
    chunkCompare: {maxFileBytes: 2000000, maxTotalBytes: 2000000, chunkBytes: 1},
  });
  assert.equal(invalid.status, 'unavailable');
});
