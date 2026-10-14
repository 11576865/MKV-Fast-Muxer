// Supplemental native fixture probe. Full browser product acceptance remains
// the existing Chromium suite, including scenarioAdditionalSubtitleFormats.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditProducedSubripCues } from '../src/subrip-output-audit.js';
import { buildMuxCommand } from '../src/mux-command.js';

const root = await mkdtemp(path.join(tmpdir(), 'mkv-r6-'));
try {
  const text = 'WEBVTT\n\ncue-one\n00:00.123 --> 00:01.456\n第一行\nsecond line\n\n00:01.000 --> 00:01.789\nOverlapping cue\n';
  const source = path.join(root, 'input.vtt');
  const output = path.join(root, 'output.mkv');
  const media = path.join(root, 'aac-priming.mp4');
  await writeFile(source, text);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', media]);
  const args = buildMuxCommand({ mainInputPath: media, outputPath: output,
    newSubtitleTracks: [{ path: source, inputIndex: 1, codecOverride: 'srt', format: { id: 'webvtt' } }] });
  execFileSync('ffmpeg', ['-v', 'error', ...args]);
  const recovered = execFileSync('ffmpeg', ['-v', 'error', '-copyts', '-i', output,
    '-map', '0:s:0', '-c:s', 'srt', '-f', 'srt', 'pipe:1'], { encoding: 'utf8' });
  assert.equal(recovered.replace(/\r\n?/g, '\n').trimEnd(),
    '1\n00:00:00,123 --> 00:00:01,456\n第一行\nsecond line\n\n2\n00:00:01,000 --> 00:00:01,789\nOverlapping cue');
  const data = await readFile(output);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output], { encoding: 'utf8' }));
  const options = { claims: [{ name: 'input.vtt', formatId: 'webvtt', ordinal: 0, outputText: text }],
    outputBytes: data.length, outputProbe: probe, readFinalSrt: async () => recovered };
  assert.equal((await auditProducedSubripCues(options)).status, 'pass');
  for (const altered of [recovered.replace(',123', ',124'), recovered.replace('第一行', 'changed'), recovered.split('\n\n')[0]]) {
    assert.equal((await auditProducedSubripCues({ ...options, readFinalSrt: async () => altered })).status, 'warning');
  }
  console.log(JSON.stringify({ status: 'pass', scope: 'native-fixture-not-browser-product',
    source_sha256: createHash('sha256').update(text).digest('hex'),
    artifact_sha256: createHash('sha256').update(data).digest('hex'), negative_controls: 3,
    ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0] }));
} finally {
  await rm(root, { recursive: true, force: true });
}
