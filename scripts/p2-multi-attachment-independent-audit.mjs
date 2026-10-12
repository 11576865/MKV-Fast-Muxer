// P2-M: externally audit a *separate* generic multi-attachment candidate,
// not the already proven one-PNG R-02 constant research fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareMultiAttachmentOnlyPlan } from '../src/multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from '../src/multi-attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { pngBytes } from './r02-attachment-only-fixture.mjs';

const dir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const outputPath = path.join(dir, 'p2-multi-attachment-candidate.mkv');
const extractedPaths = [
  path.join(dir, 'p2-multi-attachment-extracted-png.png'),
  path.join(dir, 'p2-multi-attachment-extracted-license.txt'),
];
const reportPath = path.join(dir, 'p2-multi-attachment-candidate-report.json');
const license = Buffer.from('Test fixture license: redistribution permitted.\n', 'utf8');
const sha = b => createHash('sha256').update(b).digest('hex');
const fixtures = [
  { name: 'cover.png', mimeType: 'image/png', bytes: pngBytes },
  { name: 'LICENSE.txt', mimeType: 'text/plain', bytes: license },
];
const report = {
  schema: 'p2-multi-generic-attachment-independent-audit-v0',
  result: 'INCONCLUSIVE',
  scope: 'experimental-create-new-two-attachments-zero-media-tracks',
  backendProductionReady: false,
  previewsOrExecutesAttachments: false,
  source: fixtures.map(x => ({
    filename: x.name, mimeType: x.mimeType,
    length: x.bytes.length, sha256: sha(x.bytes),
  })),
};
await fs.mkdir(dir, { recursive: true });
try {
  const rows = fixtures.map(f => {
    const file = new Blob([f.bytes], { type: 'application/octet-stream' });
    file.name = f.name;
    file.lastModified = 123;
    return { file, mimeType: f.mimeType, filename: f.name };
  });
  const plan = prepareMultiAttachmentOnlyPlan({
    attachments: rows, outputName: 'p2-multi-attachment-candidate.mkv',
  });
  const candidate = await executeMultiAttachmentOnlyCandidate(plan);
  report.writer = candidate.writer;
  report.writerStatus = candidate.state;
  if (candidate.state !== 'CREATED_AWAITING_INDEPENDENT_AUDIT' ||
      candidate.attachmentCountWritten !== 2 ||
      candidate.trackCountWritten !== 0 ||
      candidate.clusterCountWritten !== 0) throw new Error('CANDIDATE_WRITER_STATUS_INVALID');
  const mkvBytes = Buffer.from(await candidate.output.arrayBuffer());
  await fs.writeFile(outputPath, mkvBytes);
  report.candidateBytes = mkvBytes.length;
  report.candidateSha256 = sha(mkvBytes);

  // Independent implementation; the new writer does not parse its own EBML.
  const parsed = JSON.parse(execFileSync('mkvmerge', ['-J', outputPath], {
    encoding: 'utf8', timeout: 30000,
  }));
  const found = parsed.attachments || [];
  report.independent = {
    tool: 'mkvmerge -J',
    tracks: (parsed.tracks || []).length,
    attachments: found.map(a => ({
      id: a.id, filename: a.file_name, mimeType: a.content_type,
      size: a.size,
    })),
  };
  if (report.independent.tracks !== 0 || found.length !== 2) {
    throw new Error('INDEPENDENT_TRACK_OR_ATTACHMENT_COUNT_WRONG');
  }
  const checks = [];
  for (let i = 0; i < fixtures.length; i++) {
    const expected = fixtures[i], item = found[i];
    if (!Number.isInteger(item.id) || item.file_name !== expected.name ||
        item.content_type !== expected.mimeType || item.size !== expected.bytes.length) {
      throw new Error('INDEPENDENT_ATTACHMENT_METADATA_WRONG_' + i);
    }
    execFileSync('mkvextract', [
      'attachments', outputPath, String(item.id) + ':' + extractedPaths[i],
    ], { timeout: 30000 });
    const bytes = await fs.readFile(extractedPaths[i]);
    if (!bytes.equals(expected.bytes)) {
      throw new Error('INDEPENDENT_ATTACHMENT_BYTES_WRONG_' + i);
    }
    checks.push({ filename: item.file_name, sha256: sha(bytes) });
  }
  report.independentExtracted = checks;

  // Second reader is separately implemented; check FileUID relationship
  // and same *specific* candidate produced file, not a different fixture.
  const reader = createMatroskaAttachmentReader(new Blob([mkvBytes]));
  const inventory = await reader.inspect();
  report.modelReader = {
    state: inventory.state,
    tracks: inventory.structure?.hasTracksElement,
    cluster: inventory.structure?.hasClusterElement,
    uids: inventory.attachments?.map(a => a.fileUid),
  };
  if (inventory.state !== 'inspected' ||
      inventory.structure.hasTracksElement ||
      inventory.structure.hasClusterElement ||
      inventory.attachments.length !== 2 ||
      inventory.attachments[0].fileUid !== '1' ||
      inventory.attachments[1].fileUid !== '2') {
    throw new Error('MODEL_READER_OR_UID_FAILED');
  }
  for (let i = 0; i < fixtures.length; i++) {
    const extracted = Buffer.from(await reader.openAttachment(inventory.attachments[i].id)
      .data.arrayBuffer());
    if (!extracted.equals(fixtures[i].bytes) ||
        sha(extracted) !== checks[i].sha256) {
      throw new Error('MODEL_AND_INDEPENDENT_EXTRACTS_DIFFER_' + i);
    }
  }
  report.result = 'MULTI_ATTACHMENT_WRITER_INDEPENDENT_UIDS_AND_BYTES_MATCH';
} catch (error) {
  report.result = 'INCONCLUSIVE_OR_FAILED';
  report.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, reportPath }));
}
if (report.result !== 'MULTI_ATTACHMENT_WRITER_INDEPENDENT_UIDS_AND_BYTES_MATCH') {
  process.exitCode = 1;
}
