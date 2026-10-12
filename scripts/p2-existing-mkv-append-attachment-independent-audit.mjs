// P2 append-only existing MKV candidate. Independently author a nested-chapter,
// ChapterUID-targeted Tag source WITHOUT attachments via MKVToolNix. Serialize
// only a new AttachedFile at the end (no real product writer). Use independent
// extractors to audit actual resulting file and source hash.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  prepareExistingMkvAppendAttachmentCandidate,
  executeExistingMkvAppendAttachmentCandidate,
} from '../src/existing-mkv-append-attachment-candidate.js';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../src/mkvmerge-exact-uid-json.js';

const fixtures = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const sourcePath = path.join(out, 'p2-existing-append-independent-source.mkv');
const candidatePath = path.join(out, 'p2-existing-append-one-attachment-candidate.mkv');
const extractedPath = path.join(out, 'p2-existing-append-extracted-attachment.bin');
const reportPath = path.join(out, 'p2-existing-append-one-attachment-audit.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (bin, args, opts = {}) => execFileSync(bin, args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000, ...opts,
});
const inspect = filepath => parseMkvmergeJsonWithExactUids(
  run('mkvmerge', ['-J', filepath]));
const sourceArtifact = (file, kind) => {
  const destination = path.join(out, 'p2-existing-append-' + kind + '-' +
    path.basename(file) + '.xml');
  run('mkvextract', [file, kind, destination]);
  return destination;
};
const tracks = inspected => (inspected.tracks || []).map(track => ({
  id: track.id, type: track.type, codec: track.codec,
  uid: exactPositiveUid(track.properties?.uid),
}));
const report = {
  schema: 'p2-research-append-one-existing-mkv-attachment-independent-v0',
  state: 'INCONCLUSIVE',
  scope: 'one-source-no-original-attachments-same-offset-append-only-experiment',
  generalExistingMkvWriter: false,
  existingMkvProductUiEnabled: false,
  dataSourceModified: false,
};
await fs.mkdir(out, { recursive: true });
try {
  // Entirely independent source author; no FFmpeg used to create this MKV.
  run('mkvmerge', ['--quiet', '--output', sourcePath,
    '--chapters', path.join(fixtures, 'p0-independent-chapters.xml'),
    path.join(fixtures, 'base.mp4')]);
  run('mkvpropedit', [sourcePath, '--tags', 'all:' +
    path.join(fixtures, 'p0-independent-tags.xml')]);
  const externalSource = inspect(sourcePath);
  if ((externalSource.attachments || []).length !== 0 ||
      (externalSource.tracks || []).length === 0) {
    throw Error('INDEPENDENT_SOURCE_NOT_ATTACHMENT_FREE_WITH_TRACKS');
  }
  const srcChaptersPath = sourceArtifact(sourcePath, 'chapters');
  const srcTagsPath = sourceArtifact(sourcePath, 'tags');
  const [srcChapters, srcTags] = await Promise.all([
    fs.readFile(srcChaptersPath), fs.readFile(srcTagsPath),
  ]);
  if (!srcChapters.toString('utf8').includes('P0 nested chapter') ||
      !srcTags.toString('utf8').includes('P0_NESTED_CHAPTER_KEEP') ||
      !srcTags.toString('utf8').includes('510011')) {
    throw Error('INDEPENDENT_SOURCE_NESTED_CHAPTER_TARGET_NOT_PROVEN');
  }
  const sourceBytes = await fs.readFile(sourcePath);
  report.sourceSha256 = sha(sourceBytes);
  const source = new Blob([sourceBytes]);
  source.name = 'independent-nested-chapter-source.mkv';
  const payload = Buffer.from('append-only candidate independent exact text bytes\n');
  const addition = new Blob([payload]);
  addition.name = 'append-evidence.txt';
  const plan = await prepareExistingMkvAppendAttachmentCandidate({
    source, attachment: addition,
    filename: 'append-evidence.txt', mimeType: 'text/plain',
  });
  report.plan = plan;
  const candidate = await executeExistingMkvAppendAttachmentCandidate(plan);
  if (candidate.status !== 'CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT' ||
      !candidate.rawComparison.protectedTopLevelEqual ||
      candidate.rawComparison.approvedToWrite) {
    throw Error('EXPERIMENTAL_WRITER_RAW_CONTRACT_NOT_MET');
  }
  const bytes = Buffer.from(await candidate.output.arrayBuffer());
  await fs.writeFile(candidatePath, bytes);
  report.candidateSha256 = sha(bytes);
  report.candidateBytes = bytes.length;
  const observed = inspect(candidatePath);
  const attached = observed.attachments || [];
  if (attached.length !== 1 || attached[0].file_name !== 'append-evidence.txt' ||
      attached[0].content_type !== 'text/plain' ||
      attached[0].size !== payload.length || !Number.isInteger(attached[0].id)) {
    throw Error('INDEPENDENT_CANDIDATE_ATTACHMENT_METADATA_MISMATCH');
  }
  const originalTracks = tracks(externalSource);
  const candidateTracks = tracks(observed);
  if (JSON.stringify(originalTracks) !== JSON.stringify(candidateTracks)) {
    throw Error('INDEPENDENT_TRACK_IDENTITY_OR_CODEC_DIFFERENCE');
  }
  report.tracks = { source: originalTracks, candidate: candidateTracks };
  const dstChaptersPath = sourceArtifact(candidatePath, 'chapters');
  const dstTagsPath = sourceArtifact(candidatePath, 'tags');
  const [dstChapters, dstTags] = await Promise.all([
    fs.readFile(dstChaptersPath), fs.readFile(dstTagsPath),
  ]);
  if (!dstChapters.equals(srcChapters) || !dstTags.equals(srcTags)) {
    throw Error('INDEPENDENT_CHAPTER_OR_TAG_XML_DIFFERENCE');
  }
  // Compare actual independently extracted compressed video track bytes,
  // not merely metadata or a successful parser return code.
  const extractedTracks = [];
  for (const t of originalTracks) {
    const a = path.join(out, 'p2-existing-append-original-track-' + t.id + '.bin');
    const b = path.join(out, 'p2-existing-append-candidate-track-' + t.id + '.bin');
    run('mkvextract', [sourcePath, 'tracks', t.id + ':' + a]);
    run('mkvextract', [candidatePath, 'tracks', t.id + ':' + b]);
    const [before, after] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    if (!before.equals(after)) throw Error('INDEPENDENT_TRACK_PACKET_BYTES_DIFFER_' + t.id);
    extractedTracks.push({ id: t.id, sha256: sha(before), bytes: before.length });
  }
  run('mkvextract', [candidatePath, 'attachments',
    String(attached[0].id) + ':' + extractedPath]);
  const actualFileData = await fs.readFile(extractedPath);
  if (!actualFileData.equals(payload)) {
    throw Error('INDEPENDENT_ADDED_ATTACHMENT_FILEDATA_DIFFER');
  }
  report.independentEvidence = {
    authoringTool: 'mkvmerge + mkvpropedit',
    inspectingTool: 'mkvmerge -J',
    extractingTool: 'mkvextract chapters/tags/tracks/attachments',
    sourceTrackCount: originalTracks.length,
    chapterXmlSha256: sha(srcChapters),
    tagXmlSha256: sha(srcTags),
    trackByteHashes: extractedTracks,
    addedAttachmentSha256: sha(actualFileData),
    addedAttachmentFileUid: exactPositiveUid(attached[0].properties?.uid),
    existingSourceSha256Unchanged: sha(await fs.readFile(sourcePath)) === report.sourceSha256,
    untouchedOriginalSegmentChildren: candidate.rawComparison.protectedTopLevelEqual,
    publicationAuthorized: false,
  };
  if (!report.independentEvidence.existingSourceSha256Unchanged ||
      candidate.rawComparison.state !==
        'ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF') {
    throw Error('SOURCE_CHANGED_OR_WRITER_UNJUSTIFIABLY_APPROVED');
  }
  report.state = 'INDEPENDENT_APPEND_ONLY_EXISTING_MKV_TAG_CHAPTER_MEDIA_AND_ATTACHMENT_MATCH';
} catch (error) {
  report.state = 'INCONCLUSIVE_OR_FAILED';
  report.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    state: report.state, error: report.error || null, reportPath,
  }));
}
if (report.state !==
    'INDEPENDENT_APPEND_ONLY_EXISTING_MKV_TAG_CHAPTER_MEDIA_AND_ATTACHMENT_MATCH') {
  process.exitCode = 1;
}
