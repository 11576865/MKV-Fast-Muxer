import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';

const dir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const sample = path.join(dir, 'r02-attachment-only-research.mkv');
const priorReport = path.join(dir, 'r02-attachment-only-report.json');
const reportPath = path.join(dir, 'r02-container-reader-crosscheck.json');
const report = {
  schema: 'r02-container-reader-crosscheck-v0',
  result: 'INCONCLUSIVE',
  source: 'test-only R-02 fixture',
  productionWriter: 'not-implemented',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  const prior = JSON.parse(await fs.readFile(priorReport, 'utf8'));
  if (prior.result !== 'INDEPENDENT_READER_AND_BYTES_MATCH') {
    throw new Error('R02_INDEPENDENT_ORACLE_NOT_GREEN');
  }
  const data = await fs.readFile(sample);
  const blob = new Blob([data]);
  blob.name = 'r02-attachment-only-research.mkv';
  blob.lastModified = 123;
  const reader = createMatroskaAttachmentReader(blob);
  const inventory = await reader.inspect();
  report.inventoryState = inventory.state;
  report.inventory = inventory;
  if (inventory.state !== 'inspected') {
    throw new Error('MODEL_READER_FAILED_' + (inventory.diagnostic?.code || 'unknown'));
  }
  if (inventory.structure.hasTracksElement || inventory.structure.hasClusterElement ||
      inventory.attachments.length !== 1 || inventory.structure.attachmentElements !== 1) {
    throw new Error('NOT_ZERO_TRACKS_AND_ONE_ATTACHMENT');
  }
  const item = inventory.attachments[0];
  if (item.filename !== 'pixel.png' || item.mimeType !== 'image/png') {
    throw new Error('WRONG_ATTACHMENT_ATTRIBUTES');
  }
  const extracted = reader.openAttachment(item.id);
  const bytes = new Uint8Array(await extracted.data.arrayBuffer());
  report.modelReaderSha256 = sha256(bytes);
  report.independentOracleSha256 = prior.extractedPngSha256;
  if (report.modelReaderSha256 !== prior.extractedPngSha256 ||
      report.modelReaderSha256 !== prior.sourcePngSha256) {
    throw new Error('MODEL_READER_PAYLOAD_MISMATCH');
  }
  report.result = 'MODEL_AND_INDEPENDENT_ATTACHMENT_BYTES_MATCH';
} catch (error) {
  report.result = 'INCONCLUSIVE_OR_FAILED';
  report.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result, reportPath, inventoryState: report.inventoryState,
  }));
}
if (report.result !== 'MODEL_AND_INDEPENDENT_ATTACHMENT_BYTES_MATCH') process.exitCode = 1;
