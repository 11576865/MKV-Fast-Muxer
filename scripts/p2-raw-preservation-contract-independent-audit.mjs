// P2-PC research: independent MKVToolNix-authored nested Chapters + linked
// Tag real fixture. No existing-MKV mutation; compare in-memory byte-tampered
// copies to verify that the strict evidence gate catches data-loss classes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import {
  inspectRawSegmentPreservation, compareRawSegmentPreservation,
} from '../src/matroska-raw-preservation-contract.js';

const fixtureDir = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const outputDir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const originalPath = path.join(fixtureDir, 'p0-independent-mkvtoolnix.mkv');
const reportPath = path.join(outputDir, 'p2-raw-preservation-contract-report.json');
const sha = buf => createHash('sha256').update(buf).digest('hex');
const report = {
  schema: 'p2-raw-segment-preservation-contract-independent-audit-v0',
  state: 'INCONCLUSIVE',
  sourceAuthoredWith: 'mkvmerge-mkvpropedit',
  originalModified: false,
  editedOutputCreated: false,
  writerAuthorized: false,
  scope: 'bounded-raw-byte-necessary-not-sufficient-evidence',
};
await fs.mkdir(outputDir, { recursive: true });
try {
  const original = await fs.readFile(originalPath);
  const originalSha = sha(original);
  report.originalSha256 = originalSha;

  // Assert independent XML semantics before fingerprinting any source bytes.
  const chapterXml = execFileSync('mkvextract', [originalPath, 'chapters'], {
    encoding: 'utf8', timeout: 30000,
  });
  const tagXml = execFileSync('mkvextract', [originalPath, 'tags'], {
    encoding: 'utf8', timeout: 30000,
  });
  if (!chapterXml.includes('P0 nested chapter') ||
      !tagXml.includes('P0_NESTED_CHAPTER_KEEP') ||
      !tagXml.includes('510011')) {
    throw Error('INDEPENDENT_FIXTURE_CHAPTER_TARGET_PROVENANCE_MISSING');
  }
  report.independentFixtureProvenance = {
    nestedChapter: true, chapterUidTarget: '510011',
    chapterText: 'P0 nested chapter', linkedTag: 'P0_NESTED_CHAPTER_KEEP',
  };
  const scan = bytes => inspectRawSegmentPreservation(new Blob([bytes]));
  const source = await scan(original);
  if (source.state !== 'inspected') {
    throw Error('SOURCE_UNVERIFIED_' + source.diagnostic?.code);
  }
  report.originalElements = source.elements.map(el => ({
    id: el.id, ordinal: el.ordinal, offset: el.offset,
    byteLength: el.byteLength, digest: el.byteCommitment,
  }));
  const clone = compareRawSegmentPreservation(source, await scan(Buffer.from(original)));
  if (!clone.identicalScannedBytes || clone.approvedToWrite ||
      clone.state !== 'PROTECTED_RAW_BYTES_MATCH_NOT_WRITE_AUTHORIZATION') {
    throw Error('IDENTICAL_SOURCE_NOT_EXACT_DENY_ONLY_MATCH');
  }
  const mutateText = async (value, family) => {
    const clone = Buffer.from(original);
    const position = clone.indexOf(Buffer.from(value, 'utf8'));
    if (position < 0) throw Error('REAL_SOURCE_MARKER_MISSING_' + value);
    clone[position] ^= 1;
    const candidate = await scan(clone);
    if (candidate.state !== 'inspected') {
      throw Error('MODIFIED_CANDIDATE_NOT_PARSEABLE_' + family);
    }
    const comparison = compareRawSegmentPreservation(source, candidate, {
      attachmentChangesRequested: true,
    });
    const expectedId = family === 'chapter' ? '0x1043a770' : '0x1254c367';
    if (comparison.state !== 'BLOCKED_PROTECTED_BYTES_CHANGED' ||
        !comparison.changedProtected.some(x => x.sourceId === expectedId) ||
        comparison.approvedToWrite) {
      throw Error('PROTECTED_' + family.toUpperCase() + '_TAMPER_NOT_BLOCKED');
    }
    return { state: comparison.state, element: expectedId,
      changedProtected: comparison.changedProtected.length };
  };
  report.chapterMutation = await mutateText('P0 nested chapter', 'chapter');
  report.targetedTagMutation = await mutateText('P0_NESTED_CHAPTER_KEEP', 'tag');

  const reader = createMatroskaAttachmentReader(new Blob([original]));
  const inv = await reader.inspect();
  if (inv.state !== 'inspected' || inv.attachments.length !== 1) {
    throw Error('INDEPENDENT_ATTACHMENT_SOURCE_NOT_INSPECTED');
  }
  const modifiedFileData = Buffer.from(original);
  const range = inv.attachments[0].dataRange;
  if (!range || range.length < 2) throw Error('INDEPENDENT_FILEDATA_EMPTY');
  modifiedFileData[range.offset + Math.floor(range.length / 2)] ^= 1;
  const changed = await scan(modifiedFileData);
  const notRequested = compareRawSegmentPreservation(source, changed);
  const requested = compareRawSegmentPreservation(source, changed, {
    attachmentChangesRequested: true,
  });
  if (notRequested.state !== 'BLOCKED_UNREQUESTED_ATTACHMENT_DELTA' ||
      requested.state !== 'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF' ||
      !requested.protectedTopLevelEqual || requested.approvedToWrite) {
    throw Error('ATTACHMENT_DELTA_WRITER_POLICY_INCORRECT');
  }
  report.attachmentMutation = {
    withoutExplicitRequest: notRequested.state,
    withExplicitRequest: requested.state,
    protectedByteCommitmentsEqual: requested.protectedTopLevelEqual,
    writerAuthorized: requested.approvedToWrite,
  };
  const afterSha = sha(await fs.readFile(originalPath));
  report.originalSha256After = afterSha;
  if (afterSha !== originalSha) throw Error('INDEPENDENT_SOURCE_MODIFIED');
  report.state = 'INDEPENDENT_COMPLEX_MKV_RAW_PROTECTION_DIFFERENCES_DETECTED';
} catch (err) {
  report.state = 'INCONCLUSIVE_OR_FAILED';
  report.error = err?.message || String(err);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    state: report.state, error: report.error || null, reportPath,
  }));
}
if (report.state !== 'INDEPENDENT_COMPLEX_MKV_RAW_PROTECTION_DIFFERENCES_DETECTED') {
  process.exitCode = 1;
}
