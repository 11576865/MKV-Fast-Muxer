// R-02 research-only independent-tool oracle for zero-track PNG Matroska.
// Fixture encoder is shared with browser regression; not a production writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createResearchFixture, pngBytes } from './r02-attachment-only-fixture.mjs';

const outDir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const mkvPath = path.join(outDir, 'r02-attachment-only-research.mkv');
const extractedPath = path.join(outDir, 'r02-extracted.png');
const reportPath = path.join(outDir, 'r02-attachment-only-report.json');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

const report = {
  schema: 'r02-attachment-only-experiment-v0',
  intent: 'one PNG attachment; no Tracks and no Cluster',
  scope: 'test-only EBML fixture; not a product backend or full standards certification',
  normativeReference: 'RFC 9559 sections 4.5, 6.1, 21',
  fixture: { output: mkvPath, attachmentName: 'pixel.png', mimeType: 'image/png' },
  sourcePngSha256: sha256(pngBytes),
  reader: { mkvmerge: 'not-tested', mkvextract: 'not-tested', ffprobe: 'not-tested' },
  result: 'INCONCLUSIVE',
};
await fs.mkdir(outDir, { recursive: true });
try {
  const fixture = createResearchFixture();
  await fs.writeFile(mkvPath, fixture);
  report.fixture.size = fixture.length;
  report.fixture.sha256 = sha256(fixture);

  // First independent reader: MKVToolNix, not the generator's own EBML parser.
  const info = JSON.parse(execFileSync('mkvmerge', ['-J', mkvPath], {
    encoding: 'utf8', timeout: 30000,
  }));
  const tracks = info.tracks || [];
  const attachments = info.attachments || [];
  report.reader.mkvmerge = 'parsed';
  report.observed = {
    trackCount: tracks.length,
    attachmentCount: attachments.length,
    attachments: attachments.map(item => ({
      id: item.id, file_name: item.file_name,
      content_type: item.content_type, size: item.size,
    })),
  };
  if (tracks.length !== 0 || attachments.length !== 1) {
    throw new Error('Independent reader did not find exactly zero tracks and one attachment');
  }
  const attachment = attachments[0];
  if (attachment.file_name !== 'pixel.png' || attachment.content_type !== 'image/png') {
    throw new Error('Independent reader observed wrong attachment name or MIME');
  }
  if (!Number.isInteger(attachment.id)) {
    throw new Error('Independent reader did not expose attachment identifier');
  }
  execFileSync('mkvextract', [
    'attachments', mkvPath, String(attachment.id) + ':' + extractedPath,
  ], { encoding: 'utf8', timeout: 30000 });
  const extracted = await fs.readFile(extractedPath);
  report.reader.mkvextract = 'extracted';
  report.extractedPngSha256 = sha256(extracted);
  if (!extracted.equals(pngBytes)) {
    throw new Error('Extracted PNG bytes differ from source bytes');
  }
  report.result = 'INDEPENDENT_READER_AND_BYTES_MATCH';
} catch (error) {
  report.error = error?.message || String(error);
  report.result = 'INCONCLUSIVE_OR_FAILED';
} finally {
  // ffprobe rejection is an observed non-playing reader outcome, not an
  // automatic declaration of RFC non-conformance.
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', mkvPath,
    ], { encoding: 'utf8', timeout: 30000 });
    const parsed = JSON.parse(output);
    report.reader.ffprobe = 'parsed';
    report.ffprobeStreamCount = (parsed.streams || []).length;
  } catch (error) {
    report.reader.ffprobe = 'rejected-or-no-media';
    report.ffprobeError = String(error?.stderr || error?.message || error).slice(0, 500);
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, reportPath, reader: report.reader }));
}
if (report.result !== 'INDEPENDENT_READER_AND_BYTES_MATCH') process.exitCode = 1;
