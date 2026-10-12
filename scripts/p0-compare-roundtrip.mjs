// P0 preservation oracle: comparison only. No production media pipeline changes.
// Requires independent tools ffprobe, mkvmerge, mkvextract. "Pass" is limited to
// fields and extracted attachment bytes explicitly checked in this report.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COVERAGE = [
  'ffprobe ordered video/audio/subtitle codec types and names',
  'ffprobe relevant track language/title and default/forced flags',
  'ffprobe chapter start/end/title in milliseconds',
  'ffprobe selected global title/comment metadata',
  'mkvmerge independently enumerated attachments: name, MIME, exact extracted SHA-256 bytes',
];
const NOT_COVERED = [
  'complete EBML element tree and unknown elements',
  'all Tags/Targets/UID/link relationships and nested chapter semantics',
  'packet-by-packet elementary stream bit identity and timestamp fidelity',
  'decoding, libass font selection, visual rendering, player interoperability',
  'file byte identity, SeekHead/Cues/layout, writing application and transient mux metadata',
];

const DEEP_COVERAGE = [
  'mkvextract independently recovered nested chapter/edition hierarchy and UIDs',
  'mkvextract independently recovered P0_* tag values with chapter target links',
];
const DEEP_NOT_COVERED = [
  'arbitrary/non-P0_* tags or their complete target graphs',
  'unknown EBML elements, packet bit identity, timecode-level parity, or playback rendering',
];
const relevantTags = (tags, keys) => Object.fromEntries(keys
  .filter((key) => tags && tags[key] !== undefined)
  .map((key) => [key, String(tags[key])]));

function orderedStreams(probe) {
  return (probe.streams || []).filter((s) => ['video', 'audio', 'subtitle'].includes(s.codec_type))
    .map((s) => ({
      type: s.codec_type,
      codec: s.codec_name ?? null,
      tags: relevantTags(s.tags, ['language', 'title']),
      flags: {
        default: Boolean(s.disposition?.default),
        forced: Boolean(s.disposition?.forced),
      },
    }));
}
function chapters(probe) {
  return (probe.chapters || []).map((c) => ({
    startMs: Math.round(Number(c.start_time) * 1000),
    endMs: Math.round(Number(c.end_time) * 1000),
    title: String(c.tags?.title || ''),
  }));
}
function metadata(probe) {
  // Do not require ENCODER, writing application, DATE etc. to be identical.
  return relevantTags(probe.format?.tags, ['title', 'comment']);
}

export function compareRoundtripFacts(before, after) {
  const differences = [];
  for (const [key, project] of [
    ['mediaTracks', orderedStreams],
    ['chapters', chapters],
    ['globalMetadata', metadata],
  ]) {
    const expected = project(before.ffprobe);
    const actual = project(after.ffprobe);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      differences.push({ code: 'SEMANTIC_DIFFERENCE', field: key, source: expected, output: actual });
    }
  }
  const extract = (data) => (data.attachments || []).map((a) => ({
    filename: a.filename, mimeType: a.mimeType, sha256: a.sha256,
  }));
  const sourceAttachments = extract(before);
  const outputAttachments = extract(after);
  if (JSON.stringify(sourceAttachments) !== JSON.stringify(outputAttachments)) {
    differences.push({
      code: 'ATTACHMENT_DIFFERENCE', field: 'attachmentNamesTypesAndBytes',
      source: sourceAttachments, output: outputAttachments,
    });
  }
  if (before.deep || after.deep) {
    for (const field of ['chapterHierarchy', 'p0MarkedTags']) {
      const a = before.deep?.[field];
      const b = after.deep?.[field];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        differences.push({ code: 'EBML_SEMANTIC_DIFFERENCE', field,
          source: a ?? null, output: b ?? null });
      }
    }
  }
  return differences;
}

function runJson(command, args) {
  const stdout = execFileSync(command, args, {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
  });
  return JSON.parse(stdout);
}

function deepXmlFacts(file) {
  const helper = fileURLToPath(new URL('./p0-summarize-ebml-xml.py', import.meta.url));
  const result = {};
  for (const [kind, field] of [['chapters', 'chapterHierarchy'], ['tags', 'p0MarkedTags']]) {
    const xml = execFileSync('mkvextract', [file, kind], {
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
    });
    const normalized = execFileSync(process.env.E2E_PYTHON || 'python3', [helper, kind], {
      input: xml, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
    });
    result[field] = JSON.parse(normalized);
  }
  return result;
}

function inspect(file, temporaryDir, prefix, deep = false) {
  const ffprobe = runJson('ffprobe', [
    '-v', 'error', '-show_streams', '-show_chapters', '-show_format', '-of', 'json', file,
  ]);
  const mkv = runJson('mkvmerge', ['-J', file]);
  assert.ok(Array.isArray(mkv.attachments), 'mkvmerge must expose attachments');
  const attachments = [];
  for (const [index, entry] of mkv.attachments.entries()) {
    const destination = path.join(temporaryDir, prefix + '-attachment-' + index + '.bin');
    execFileSync('mkvextract', [file, 'attachments', String(entry.id) + ':' + destination], {
      encoding: 'utf8', timeout: 60000,
    });
    const bytes = fs.readFileSync(destination);
    attachments.push({
      filename: entry.file_name,
      mimeType: entry.content_type,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
  }
  return { ffprobe, attachments, ...(deep ? { deep: deepXmlFacts(file) } : {}) };
}

export function checkRoundtrip(sourcePath, outputPath, { deep = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-matroska-audit-'));
  try {
    const before = inspect(sourcePath, temp, 'source', deep);
    const after = inspect(outputPath, temp, 'output', deep);
    const differences = compareRoundtripFacts(before, after);
    return {
      schemaVersion: 1,
      sourceFile: path.basename(sourcePath),
      outputFile: path.basename(outputPath),
      sourceBytes: fs.statSync(sourcePath).size,
      outputBytes: fs.statSync(outputPath).size,
      outcome: differences.length ? 'DIFFERENCE_DETECTED' : 'CHECKED_FIELDS_MATCH',
      differences,
      checked: deep ? [...COVERAGE, ...DEEP_COVERAGE] : COVERAGE,
      notChecked: deep ? DEEP_NOT_COVERED : NOT_COVERED,
      caution: 'CHECKED_FIELDS_MATCH is not proof of lossless Matroska roundtrip.',
      tools: {
        ffprobe: execFileSync('ffprobe', ['-version'], { encoding: 'utf8' }).split('\n')[0],
        mkvmerge: execFileSync('mkvmerge', ['--version'], { encoding: 'utf8' }).trim(),
        mkvextract: execFileSync('mkvextract', ['--version'], { encoding: 'utf8' }).trim(),
      },
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function cli() {
  const [source, output, reportFile, mode] = process.argv.slice(2);
  const deep = mode === '--deep';
  if (!source || !output || !reportFile || (mode && !deep)) {
    console.error('Usage: node scripts/p0-compare-roundtrip.mjs SOURCE.mkv OUTPUT.mkv REPORT.json [--deep]');
    process.exitCode = 3;
    return;
  }
  let report;
  try {
    report = checkRoundtrip(source, output, { deep });
    console.log('P0 preservation comparison: ' + report.outcome);
    if (report.differences.length) {
      console.error(JSON.stringify(report.differences, null, 2));
      process.exitCode = 2;
    }
  } catch (error) {
    report = {
      schemaVersion: 1, sourceFile: path.basename(source), outputFile: path.basename(output),
      outcome: 'CHECK_UNAVAILABLE', error: String(error?.message || error),
      checked: deep ? [...COVERAGE, ...DEEP_COVERAGE] : COVERAGE,
      notChecked: deep ? DEEP_NOT_COVERED : NOT_COVERED,
    };
    process.exitCode = 3;
    console.error('P0 comparison unavailable: ' + report.error);
  }
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('P0 report: ' + reportFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli();
}
