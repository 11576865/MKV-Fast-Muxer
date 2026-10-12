// R-02-W: independently inspect output from the NEW candidate writer rather
// than from the existing deterministic fixture encoder (R-02 baseline).
// Research-only: never upgrades product capability based on workflow green.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { preparePngAttachmentOnlyPlan } from '../src/attachment-only-job-plan.js';
import { executePngAttachmentOnlyCandidate } from '../src/attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { pngBytes } from './r02-attachment-only-fixture.mjs';

const dir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const outputPath = path.join(dir, 'r02-writer-candidate.mkv');
const extractedPath = path.join(dir, 'r02-writer-candidate-extracted.png');
const reportPath = path.join(dir, 'r02-writer-candidate-report.json');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const report = {
  schema: 'r02-png-only-candidate-writer-audit-v0',
  stage: 'experimental-only',
  result: 'INCONCLUSIVE',
  productWriterEnabled: false,
  existingMuxWriterChanged: false,
  originalPngSha256: sha256(pngBytes),
  probes: { mkvmerge: 'not-tested', mkvextract: 'not-tested',
    modelReader: 'not-tested' },
};

await fs.mkdir(dir, { recursive: true });
try {
  const file = new Blob([pngBytes], { type: 'image/png' });
  file.name = 'pixel.png';
  file.lastModified = 123;
  const plan = preparePngAttachmentOnlyPlan({
    file, filename: 'pixel.png', outputName: 'r02-writer-candidate.mkv',
  });
  report.plan = plan;
  const written = await executePngAttachmentOnlyCandidate(plan);
  report.writer = written.writer;
  report.writerStatus = written.state;
  report.outputBytes = written.outputBytes;
  const outputBytes = Buffer.from(await written.output.arrayBuffer());
  await fs.writeFile(outputPath, outputBytes);
  report.outputSha256 = sha256(outputBytes);
  if (written.state !== 'CREATED_AWAITING_INDEPENDENT_AUDIT') {
    throw new Error('WRITER_INCORRECT_STATUS');
  }

  // Different implementation from the candidate writer; required proof.
  const mkv = JSON.parse(execFileSync('mkvmerge', ['-J', outputPath], {
    encoding: 'utf8', timeout: 30000,
  }));
  report.probes.mkvmerge = 'parsed';
  report.observed = {
    tracks: (mkv.tracks || []).length,
    attachments: (mkv.attachments || []).map(a => ({
      id: a.id, filename: a.file_name, mimeType: a.content_type,
      size: a.size, uid: a.properties?.uid ?? null,
    })),
  };
  if (report.observed.tracks !== 0 || report.observed.attachments.length !== 1) {
    throw new Error('INDEPENDENT_STRUCTURE_WRONG');
  }
  const only = report.observed.attachments[0];
  if (only.filename !== 'pixel.png' || only.mimeType !== 'image/png' ||
      !Number.isInteger(only.id) || only.size !== pngBytes.length) {
    throw new Error('INDEPENDENT_ATTACHMENT_METADATA_WRONG');
  }
  execFileSync('mkvextract', [
    'attachments', outputPath, String(only.id) + ':' + extractedPath,
  ], { encoding: 'utf8', timeout: 30000 });
  const extracted = await fs.readFile(extractedPath);
  report.probes.mkvextract = 'extracted';
  report.extractedSha256 = sha256(extracted);
  if (!extracted.equals(pngBytes)) throw new Error('INDEPENDENT_PNG_BYTES_DIFFER');

  // Verify our reader and independent extractor agree on the SAME output.
  const reader = createMatroskaAttachmentReader(new Blob([outputBytes]));
  const inventory = await reader.inspect();
  report.probes.modelReader = inventory.state;
  if (inventory.state !== 'inspected' || inventory.attachments.length !== 1 ||
      inventory.structure.hasTracksElement || inventory.structure.hasClusterElement ||
      inventory.attachments[0].fileUid !== '1') {
    throw new Error('MODEL_READER_WRITER_OUTPUT_MISMATCH');
  }
  const own = Buffer.from(await reader.openAttachment(inventory.attachments[0].id)
    .data.arrayBuffer());
  report.modelExtractedSha256 = sha256(own);
  if (!own.equals(extracted)) throw new Error('MODEL_AND_INDEPENDENT_BYTES_DIFFER');
  report.result = 'CANDIDATE_WRITER_INDEPENDENT_ZERO_TRACK_AND_PNG_BYTES_MATCH';
} catch (error) {
  report.result = 'INCONCLUSIVE_OR_FAILED';
  report.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result, writer: report.writer,
    probes: report.probes, reportPath,
  }));
}
if (report.result !== 'CANDIDATE_WRITER_INDEPENDENT_ZERO_TRACK_AND_PNG_BYTES_MATCH') {
  process.exitCode = 1;
}
