// P2 layout matrix: do not infer universal existing-MKV compatibility from
// a single successful MKVToolNix source. Independently author variations with
// Cues and lacing differences, plus real failure/refusal controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  prepareExistingMkvAppendAttachmentCandidate,
  executeExistingMkvAppendAttachmentCandidate,
} from '../src/existing-mkv-append-attachment-candidate.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../src/mkvmerge-exact-uid-json.js';

const fixtureDir = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const reportPath = path.join(out, 'p2-void-existing-mkv-layout-matrix-report.json');
const sha = b => createHash('sha256').update(b).digest('hex');
const run = (bin, args) => execFileSync(bin, args, {
  encoding: 'utf8', timeout: 90000, maxBuffer: 40 * 1024 * 1024,
});
const getMkv = p => parseMkvmergeJsonWithExactUids(run('mkvmerge', ['-J', p]));
const trackList = data => (data.tracks || []).map(t => ({
  id: t.id, type: t.type, codec: t.codec,
  uid: exactPositiveUid(t.properties?.uid),
}));
const packetList = p => {
  const json = JSON.parse(run('ffprobe', ['-v', 'error', '-show_packets',
    '-show_data_hash', 'sha256',
    '-show_entries', 'packet=stream_index,pts,dts,duration,size,data_hash',
    '-of', 'json', p]));
  const rows = json.packets || [];
  if (!rows.length || rows.some(row =>
    !/^SHA256:[0-9a-f]{64}$/i.test(row.data_hash || '') ||
    row.pts === undefined || row.dts === undefined ||
    row.duration === undefined || row.size === undefined)) {
    throw Error('LAYOUT_MATRIX_MISSING_MEDIA_PACKET_EVIDENCE');
  }
  return rows;
};
const extractXml = async (p, kind, name) => {
  const target = path.join(out, 'p2-layout-' + name + '-' + kind + '.xml');
  run('mkvextract', [p, kind, target]);
  return fs.readFile(target);
};
const payload = Buffer.from('matrix witness: generic attached content\n', 'utf8');
const shaPayload = sha(payload);
const report = {
  schema: 'p2-existing-mkv-preinfo-void-layout-independent-matrix-v0',
  result: 'INCONCLUSIVE',
  scope: 'mkvtoolnix-authoring-variations-and-refusals-only',
  productExistingMkvEditingEnabled: false,
  sourceOverwriteExecuted: false,
  variants: [],
};
await fs.mkdir(out, { recursive: true });
try {
  const modes = [
    { id: 'default-cues', extra: [] },
    { id: 'no-cues', extra: ['--no-cues'] },
    { id: 'disable-lacing', extra: ['--disable-lacing'] },
  ];
  let baseline = null;
  for (const mode of modes) {
    const sourcePath = path.join(out, 'p2-layout-' + mode.id + '-source.mkv');
    const candidatePath = path.join(out, 'p2-layout-' + mode.id + '-candidate.mkv');
    run('mkvmerge', ['--quiet', ...mode.extra, '--output', sourcePath,
      '--chapters', path.join(fixtureDir, 'p0-independent-chapters.xml'),
      path.join(fixtureDir, 'base.mp4')]);
    run('mkvpropedit', [sourcePath,
      '--tags', 'all:' + path.join(fixtureDir, 'p0-independent-tags.xml')]);
    const sourceData = await fs.readFile(sourcePath);
    const sourceHash = sha(sourceData);
    const before = getMkv(sourcePath);
    if ((before.attachments || []).length !== 0 ||
        (before.tracks || []).length === 0) {
      throw Error('LAYOUT_MATRIX_INDEPENDENT_SOURCE_INVALID_' + mode.id);
    }
    const scan = await inspectRawSegmentPreservation(new Blob([sourceData]));
    if (scan.state !== 'inspected') {
      throw Error('LAYOUT_MATRIX_RAW_SCAN_FAILED_' + mode.id + ':' + scan.diagnostic?.code);
    }
    const ids = scan.elements.map(e => e.id);
    const hasCues = ids.includes('0x1c53bb6b');
    if (mode.id === 'no-cues' && hasCues) {
      throw Error('LAYOUT_MATRIX_NO_CUES_OPTION_DID_NOT_TAKE_EFFECT');
    }
    const original = new Blob([sourceData]);
    original.name = mode.id + '-source.mkv';
    const addition = new Blob([payload]);
    addition.name = 'matrix-proof.txt';
    const plan = await prepareExistingMkvAppendAttachmentCandidate({
      source: original, attachment: addition,
      filename: 'matrix-proof.txt', mimeType: 'text/plain',
    });
    const candidate = await executeExistingMkvAppendAttachmentCandidate(plan);
    if (candidate.rawComparison.state !== 'BLOCKED_PROTECTED_BYTES_CHANGED' ||
        candidate.rawComparison.approvedToWrite ||
        !candidate.evidence.originalNonVoidElementByteCommitmentsAndOffsetsMatch ||
        candidate.output.size !== sourceData.length) {
      throw Error('LAYOUT_MATRIX_OFFSET_COMMITMENT_FAILED_' + mode.id);
    }
    await fs.writeFile(candidatePath, Buffer.from(await candidate.output.arrayBuffer()));
    const after = getMkv(candidatePath);
    const newItems = after.attachments || [];
    if (newItems.length !== 1 ||
        newItems[0].file_name !== 'matrix-proof.txt' ||
        newItems[0].content_type !== 'text/plain' ||
        newItems[0].size !== payload.length ||
        exactPositiveUid(newItems[0].properties?.uid) !== '1') {
      throw Error('LAYOUT_MATRIX_EXTERNAL_ATTACHMENT_MISMATCH_' + mode.id);
    }
    if (JSON.stringify(trackList(before)) !== JSON.stringify(trackList(after))) {
      throw Error('LAYOUT_MATRIX_TRACK_UID_CODEC_MISMATCH_' + mode.id);
    }
    const packetSource = packetList(sourcePath);
    const packetOutput = packetList(candidatePath);
    if (JSON.stringify(packetSource) !== JSON.stringify(packetOutput)) {
      throw Error('LAYOUT_MATRIX_PACKETS_TIMING_CHANGED_' + mode.id);
    }
    const xmlEvidence = {};
    for (const kind of ['chapters', 'tags']) {
      const a = await extractXml(sourcePath, kind, mode.id + '-before');
      const b = await extractXml(candidatePath, kind, mode.id + '-after');
      if (!a.equals(b)) throw Error('LAYOUT_MATRIX_' + kind + '_CHANGED_' + mode.id);
      if (kind === 'chapters' && !a.toString().includes('P0 nested chapter') ||
          kind === 'tags' && !a.toString().includes('P0_NESTED_CHAPTER_KEEP')) {
        throw Error('LAYOUT_MATRIX_REQUIRED_CHAPTER_TAG_ABSENT_' + mode.id);
      }
      xmlEvidence[kind + 'Sha256'] = sha(a);
    }
    const extractedPath = path.join(out, 'p2-layout-' + mode.id + '-extracted.bin');
    run('mkvextract', [candidatePath, 'attachments',
      String(newItems[0].id) + ':' + extractedPath]);
    if (!((await fs.readFile(extractedPath)).equals(payload))) {
      throw Error('LAYOUT_MATRIX_ATTACHMENT_FILEDATA_MISMATCH_' + mode.id);
    }
    if (sha(await fs.readFile(sourcePath)) !== sourceHash) {
      throw Error('LAYOUT_MATRIX_SOURCE_MUTATED_' + mode.id);
    }
    report.variants.push({
      id: mode.id, classification: 'independent-authoring-success',
      sourceSha256: sourceHash, hasCues, trackCount: trackList(before).length,
      packetCount: packetSource.length,
      packetRecordsSha256: sha(Buffer.from(JSON.stringify(packetSource))),
      newAttachmentSha256: shaPayload, ...xmlEvidence,
      byteLengthUnchanged: true, protectedOffsetsAndBytesUnchanged: true,
      writerAuthorized: false,
    });
    if (mode.id === 'default-cues') {
      baseline = { sourcePath, sourceData, scan };
    }
  }

  // An independently authored original attachment must deny second-master
  // insertion before any candidate Blob is returned.
  const existingPath = path.join(out, 'p2-layout-existing-attachment-source.mkv');
  run('mkvmerge', ['--quiet', '--output', existingPath,
    '--attachment-name', 'prior.txt',
    '--attachment-mime-type', 'text/plain',
    '--attach-file', path.join(fixtureDir, 'notes.txt'),
    path.join(fixtureDir, 'base.mp4')]);
  const existingBytes = await fs.readFile(existingPath);
  if ((getMkv(existingPath).attachments || []).length !== 1) {
    throw Error('LAYOUT_MATRIX_EXISTING_ATTACHMENT_CONTROL_UNTRUSTWORTHY');
  }
  let refusal = '';
  try {
    await prepareExistingMkvAppendAttachmentCandidate({
      source: new Blob([existingBytes]), attachment: new Blob([payload]),
      filename: 'new.txt', mimeType: 'text/plain',
    });
  } catch (e) { refusal = e?.message || String(e); }
  if (refusal !== 'APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED') {
    throw Error('LAYOUT_MATRIX_EXISTING_ATTACHMENT_NOT_REFUSED:' + refusal);
  }
  report.variants.push({
    id: 'preexisting-attachments', classification: 'independent-source-refused',
    code: refusal, sourceSha256: sha(existingBytes),
  });

  // Derived negative fixture: split the authentic independent source's
  // reserved Void into TWO legal Voids of exactly equal combined size.
  // The original non-Void offsets remain constant, but the allowed
  // SeekHead -> one Void -> Info shape no longer exists.
  const sourceSlot = baseline.scan.elements[1];
  if (sourceSlot?.id !== '0xec' || sourceSlot.byteLength < 32) {
    throw Error('LAYOUT_MATRIX_NO_BASELINE_VOID_TO_SPLIT');
  }
  const encodeLength = n => {
    for (let w = 1; w <= 8; w++) {
      if (BigInt(n) < (1n << BigInt(w * 7)) - 1n) {
        let v = BigInt(n) | (1n << BigInt(w * 7));
        const b = Buffer.alloc(w);
        for (let i = w - 1; i >= 0; i--) {
          b[i] = Number(v & 255n); v >>= 8n;
        }
        return b;
      }
    }
    throw Error('LAYOUT_MATRIX_VOID_LENGTH_UNENCODABLE');
  };
  const voidOfTotal = total => {
    for (let w = 1; w <= 8; w++) {
      const payloadLen = total - w - 1;
      if (payloadLen >= 0 && BigInt(payloadLen) < (1n << BigInt(w * 7)) - 1n) {
        const size = encodeLength(payloadLen);
        if (size.length === w) return Buffer.concat([
          Buffer.from([0xec]), size, Buffer.alloc(payloadLen),
        ]);
      }
    }
    throw Error('LAYOUT_MATRIX_VOID_SPLIT_UNENCODABLE');
  };
  const originalBytes = Buffer.from(baseline.sourceData);
  const tiny = voidOfTotal(8);
  const rest = voidOfTotal(sourceSlot.byteLength - tiny.length);
  const derived = Buffer.concat([
    originalBytes.subarray(0, sourceSlot.offset),
    tiny, rest,
    originalBytes.subarray(sourceSlot.offset + sourceSlot.byteLength),
  ]);
  if (derived.length !== originalBytes.length) {
    throw Error('LAYOUT_MATRIX_VOID_SPLIT_MOVED_SOURCE_OFFSETS');
  }
  const splitPath = path.join(out, 'p2-layout-two-void-source.mkv');
  await fs.writeFile(splitPath, derived);
  if (trackList(getMkv(splitPath)).length !==
      trackList(getMkv(baseline.sourcePath)).length) {
    throw Error('LAYOUT_MATRIX_SPLIT_VOID_NOT_READABLE_EXTERNALLY');
  }
  const splitScan = await inspectRawSegmentPreservation(new Blob([derived]));
  if (splitScan.elements[1]?.id !== '0xec' ||
      splitScan.elements[2]?.id !== '0xec') {
    throw Error('LAYOUT_MATRIX_SPLIT_VOID_NOT_PARSED');
  }
  refusal = '';
  try {
    await prepareExistingMkvAppendAttachmentCandidate({
      source: new Blob([derived]), attachment: new Blob([payload]),
      filename: 'new.txt', mimeType: 'text/plain',
    });
  } catch (e) { refusal = e?.message || String(e); }
  if (refusal !== 'APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED') {
    throw Error('LAYOUT_MATRIX_SPLIT_VOID_NOT_REFUSED:' + refusal);
  }
  report.variants.push({
    id: 'two-preinfo-void-elements', classification: 'derived-valid-source-refused',
    code: refusal, sourceSha256: sha(derived), preservedSourceByteLength: true,
  });

  report.result = 'P2_VOID_LAYOUT_CORPUS_INDEPENDENT_ROUNDTRIP_AND_REJECTIONS_MATCH';
} catch (error) {
  report.result = 'INCONCLUSIVE_OR_FAILED';
  report.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result, error: report.error || null,
    variants: report.variants.map(v => [v.id, v.classification]), reportPath,
  }));
}
if (report.result !== 'P2_VOID_LAYOUT_CORPUS_INDEPENDENT_ROUNDTRIP_AND_REJECTIONS_MATCH') {
  process.exitCode = 1;
}
