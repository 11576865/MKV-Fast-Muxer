// Independent writer-family negative controls and decoder/seek checks.
// No production existing-MKV editing, filesystem overwrite or UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareExistingMkvAppendAttachmentCandidate } from '../src/existing-mkv-append-attachment-candidate.js';
import { inspectRawSegmentPreservation } from '../src/matroska-raw-preservation-contract.js';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../src/mkvmerge-exact-uid-json.js';

const fixtures = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const outputDir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const reportPath = path.join(outputDir, 'p2-cross-writer-decode-seek-report.json');
const sha = x => createHash('sha256').update(x).digest('hex');
const run = (exe, args) => execFileSync(exe, args, {
  encoding: 'utf8', timeout: 90000, maxBuffer: 40 * 1024 * 1024,
});
const parsed = (exe, args) => JSON.parse(run(exe, args));
const observe = file => parseMkvmergeJsonWithExactUids(run('mkvmerge', ['-J', file]));
const tracks = info => (info.tracks || []).map(t => ({
  id: t.id, type: t.type, codec: t.codec,
  uid: exactPositiveUid(t.properties?.uid),
}));
const packetRows = (file, range = null) => {
  const args = ['-v', 'error', '-show_packets', '-show_data_hash', 'sha256',
    '-show_entries', 'packet=stream_index,pts,dts,duration,size,data_hash'];
  if (range) args.push('-read_intervals', range);
  args.push('-of', 'json', file);
  const rows = parsed('ffprobe', args).packets || [];
  if (!rows.length || rows.some(x => x.pts === undefined ||
    x.dts === undefined || x.duration === undefined ||
    x.size === undefined || !/^SHA256:[0-9a-f]{64}$/i.test(x.data_hash || ''))) {
    throw Error('CROSS_WRITER_PACKET_HASH_OR_TIMING_UNVERIFIED');
  }
  return rows;
};
const decode = (file, kind, seek = null) => {
  const args = ['-hide_banner', '-loglevel', 'error', '-threads', '1'];
  if (seek !== null) args.push('-ss', seek);
  args.push('-i', file, '-map', kind === 'video' ? '0:v:0' : '0:a:0');
  if (seek !== null) args.push('-t', '0.42');
  args.push('-f', 'framemd5', '-');
  const frames = run('ffmpeg', args).split(/\r?\n/).filter(x =>
    x && !x.startsWith('#'));
  if (!frames.length) throw Error('CROSS_WRITER_NO_DECODED_FRAMES_' + kind);
  return { frames: frames.length, sha256: sha(Buffer.from(frames.join('\n'))) };
};
const result = {
  schema: 'p2-cross-writer-source-refusals-and-decoder-seek-v0',
  verdict: 'INCONCLUSIVE',
  productExistingMkvWriterEnabled: false,
  generalCrossWriterCompatibility: false,
  ffmpegSources: [], mkvtoolnixSources: [],
};
await fs.mkdir(outputDir, { recursive: true });
try {
  const upstream = JSON.parse(await fs.readFile(path.join(
    outputDir, 'p2-void-existing-mkv-layout-matrix-report.json'), 'utf8'));
  if (upstream.result !==
      'P2_VOID_LAYOUT_CORPUS_INDEPENDENT_ROUNDTRIP_AND_REJECTIONS_MATCH') {
    throw Error('UPSTREAM_P2V_LAYOUT_CORPUS_NOT_VERIFIED');
  }
  // MKVToolNix source/candidate bytes were separately verified by mkvmerge
  // and mkvextract in the upstream oracle. Here, independently decode frames
  // and test file-position seeking with FFmpeg and FFprobe.
  for (const mode of [
    { id: 'default-cues', seek: true },
    { id: 'disable-lacing', seek: true },
    { id: 'no-cues', seek: false },
  ]) {
    const src = path.join(outputDir, 'p2-layout-' + mode.id + '-source.mkv');
    const dst = path.join(outputDir, 'p2-layout-' + mode.id + '-candidate.mkv');
    const sourceTracks = tracks(observe(src));
    if (JSON.stringify(sourceTracks) !== JSON.stringify(tracks(observe(dst))) ||
        !sourceTracks.some(t => t.type === 'video') ||
        !sourceTracks.some(t => t.type === 'audio')) {
      throw Error('CROSS_WRITER_TRACK_MISMATCH_' + mode.id);
    }
    const a = packetRows(src), b = packetRows(dst);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw Error('CROSS_WRITER_FULL_PACKET_MISMATCH_' + mode.id);
    }
    const cases = [];
    // Do not claim true seek behavior for no-Cues media; only full decoding.
    for (const time of mode.seek ? ['0.35', '1.25'] : [null]) {
      for (const kind of ['video', 'audio']) {
        const x = decode(src, kind, time), y = decode(dst, kind, time);
        if (JSON.stringify(x) !== JSON.stringify(y)) {
          throw Error('CROSS_WRITER_DECODE_SEEK_DIFFERENCE_' + mode.id + '_' + kind);
        }
        cases.push({ kind, time, ...x });
      }
    }
    let packetSeek = null;
    if (mode.seek) {
      const before = packetRows(src, '0.55%+0.60');
      const after = packetRows(dst, '0.55%+0.60');
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw Error('CROSS_WRITER_INDEXED_PACKET_SEEK_MISMATCH_' + mode.id);
      }
      packetSeek = { packetCount: before.length,
        sha256: sha(Buffer.from(JSON.stringify(before))) };
    }
    result.mkvtoolnixSources.push({
      id: mode.id, sourceAuthor: 'MKVToolNix',
      fullPacketCount: a.length,
      testedSeek: mode.seek,
      decoderMatches: cases, packetSeek,
      verdict: 'TESTED_SOURCE_CANDIDATE_DECODER_BEHAVIOR_MATCH',
    });
  }
  // Independently author two valid FFmpeg-native Matroska files; reserve_index
  // space is NOT assumed to be a sufficient pre-Info Void reservation.
  for (const mode of [
    { id: 'ffmpeg-default', args: [] },
    { id: 'ffmpeg-reserve-index', args: ['-reserve_index_space', '4096'] },
  ]) {
    const filePath = path.join(outputDir, 'p2-cross-writer-' + mode.id + '.mkv');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-i', path.join(fixtures, 'base.mp4'), '-map', '0:v:0',
      '-map', '0:a:0', '-c', 'copy', ...mode.args, filePath]);
    const data = await fs.readFile(filePath);
    const sourceSha = sha(data);
    const inventory = observe(filePath);
    const originalTracks = tracks(inventory);
    if ((inventory.attachments || []).length ||
        !originalTracks.some(t => t.type === 'video') ||
        !originalTracks.some(t => t.type === 'audio')) {
      throw Error('CROSS_WRITER_FFMPEG_SOURCE_INVALID_' + mode.id);
    }
    const scan = await inspectRawSegmentPreservation(new Blob([data]));
    if (scan.state !== 'inspected') {
      throw Error('CROSS_WRITER_FFMPEG_RAW_SCAN_UNVERIFIED_' + mode.id +
        ':' + scan.diagnostic?.code);
    }
    const video = decode(filePath, 'video', null);
    const audio = decode(filePath, 'audio', null);
    const payload = new Blob([Buffer.alloc(1024, 0x55)]);
    payload.name = 'cross-writer-large-resource.bin';
    let refusal = null;
    try {
      await prepareExistingMkvAppendAttachmentCandidate({
        source: new Blob([data]), attachment: payload,
        filename: payload.name, mimeType: 'application/octet-stream',
      });
    } catch (error) {
      refusal = error?.message || String(error);
    }
    // If future FFmpeg emits an eligible pre-Info slot, a separate full
    // independent POSITIVE oracle is mandatory before accepting it.
    if (![
      'APPEND_VOID_SLOT_CAPACITY_EXCEEDED',
      'APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED',
      'APPEND_UNKNOWN_SEGMENT_LENGTH_UNSUPPORTED',
    ].includes(refusal)) {
      throw Error('CROSS_WRITER_FFMPEG_NEEDS_NEW_ORACLE_' + mode.id +
        ':' + String(refusal));
    }
    if (sha(await fs.readFile(filePath)) !== sourceSha) {
      throw Error('CROSS_WRITER_SOURCE_MODIFIED_' + mode.id);
    }
    result.ffmpegSources.push({
      id: mode.id, sourceAuthor: 'FFmpeg Matroska native muxer',
      externalMkvmergeRead: true, decodes: {video, audio},
      preInfoVoidBytes: scan.elements[1]?.id === '0xec'
        ? scan.elements[1].byteLength : 0,
      elementIds: scan.elements.slice(0, 5).map(x => x.id),
      sourceSha256: sourceSha,
      verdict: 'VALID_MEDIA_INELIGIBLE_FOR_NARROW_VOID_WRITER',
      refusal,
    });
  }
  if (result.mkvtoolnixSources.length !== 3 ||
      result.ffmpegSources.length !== 2) throw Error('CROSS_WRITER_MATRIX_INCOMPLETE');
  result.verdict = 'CROSS_WRITER_FFMPEG_LAYOUT_REFUSALS_AND_MKVTOOLNIX_DECODER_SEEK_MATCH';
} catch (error) {
  result.verdict = 'INCONCLUSIVE_OR_FAILED';
  result.error = error?.message || String(error);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({
    verdict: result.verdict, error: result.error || null,
    ffmpeg: result.ffmpegSources.map(x => [x.id, x.refusal]),
    playback: result.mkvtoolnixSources.map(x => [x.id, x.testedSeek]),
    reportPath,
  }));
}
if (result.verdict !==
    'CROSS_WRITER_FFMPEG_LAYOUT_REFUSALS_AND_MKVTOOLNIX_DECODER_SEEK_MATCH') {
  process.exitCode = 1;
}
