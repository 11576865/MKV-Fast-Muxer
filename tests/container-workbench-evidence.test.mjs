import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectSourceStructureEvidence, projectActualOutputEvidence } from '../src/container-workbench-evidence.js';

const file = (name = 'source.mkv') => ({ name, size: 80, lastModified: 9 });
function scan(source) {
  return {
    fileKey: `${source.name}|${source.size}|${source.lastModified}`,
    chapters: [
      { start_time: '0.000', end_time: '5.000', tags: { title: 'Opening' } },
      { start_time: '5.000', end_time: '12.000', tags: { title: 'Main' } },
    ],
    format: { tags: { title: 'Episode 01', comment: 'source only' } },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264' },
      { index: 4, codec_type: 'data', codec_name: 'bin_data' },
      { index: 6, codec_type: 'mystery', codec_name: 'unknown' },
    ],
  };
}
const report = {
  output: { name: 'source.mkv', sha256: 'abc123', sizeBytes: 500 },
  audit: { status: 'pass', issues: [], counts: { video: 1, audio: 1, subtitle: 2, attachment: 1, chapter: 2 } },
  plan: { audio: 'copy', subtitles: ['new.ass'] },
};

test('actual output projects SubRip cue evidence separately from presentation and player claims', () => {
  const proof = { status: 'unavailable', presentationVerified: false, playerVerified: false };
  assert.deepEqual(projectActualOutputEvidence({ ...report,
    audit: { ...report.audit, subripCueAudit: proof } }).subripCue, proof);
});

test('source inspector exposes actual ffprobe chapter/tag/data evidence without claiming writer preservation', () => {
  const source = file();
  const observed = projectSourceStructureEvidence({ source, trackState: scan(source) });
  assert.equal(observed.observed, true);
  assert.equal(observed.items.length, 6);
  assert.match(observed.summary, /2 个扁平章节 · 2 项全局标签 · 2 条其他来源流/);
  assert.deepEqual(observed.items.filter(x => x.kind === 'chapter').map(x => x.title), ['Opening', 'Main']);
  assert.ok(observed.items.find(x => x.kind === 'metadata' && x.title === 'comment' && x.detail === 'source only'));
  assert.ok(observed.items.find(x => x.kind === 'data' && x.evidence === 'ffprobe-stream'));
  assert.ok(observed.items.every(x => x.id.includes('source.mkv')));
});

test('stale or unavailable source is not allowed to display cached structure as its own', () => {
  const a = file('source-a.mkv');
  const b = file('source-b.mkv');
  const oldScan = scan(a);
  const fresh = projectSourceStructureEvidence({ source: b, trackState: oldScan });
  assert.equal(fresh.observed, false);
  assert.equal(fresh.items.length, 0);
  const pending = projectSourceStructureEvidence({ source: a });
  assert.equal(pending.observed, false);
});

test('output evidence separates independently passing audit, plan freshness and actual save state', () => {
  const sourceKey = 'source.mkv|80|9';
  const current = projectActualOutputEvidence(report, {
    currentSourceKey: sourceKey,
    sourceKeyAtExecution: sourceKey,
    currentPlan: { audio: 'copy', subtitles: ['new.ass'] },
  });
  assert.equal(current.status, 'pass');
  assert.equal(current.current, true);
  assert.match(current.scopeNotice, /未证明完整 EBML/);
  assert.match(current.publicationNotice, /不在此审计范围/);
  assert.equal(current.sha256, 'abc123');
  assert.equal(current.counts.subtitle, 2);
  assert.equal(projectActualOutputEvidence(report, {
    currentSourceKey: sourceKey, sourceKeyAtExecution: sourceKey, currentPlan: { audio: 'drop' },
  }).current, false);
  assert.equal(projectActualOutputEvidence(report, {
    currentSourceKey: 'different.mkv|80|9', sourceKeyAtExecution: sourceKey, currentPlan: report.plan,
  }).current, false);
});

test('audit mismatch, unavailable audit and absent artifact evidence never become pass', () => {
  const warn = projectActualOutputEvidence({
    ...report, audit: { status: 'warning', issues: ['Chapter mismatch'] },
  });
  assert.equal(warn.status, 'warning');
  assert.deepEqual(warn.issues, ['Chapter mismatch']);
  assert.equal(projectActualOutputEvidence({
    ...report, audit: { status: 'unavailable', issues: ['probe error'] },
  }).status, 'unavailable');
  assert.equal(projectActualOutputEvidence({ ...report, output: { name: 'source.mkv' } }), null);
});

test('composition workspace visibly integrates actual evidence without creating a second writer', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
  for (const id of ['compositionSourceEvidence', 'compositionSourceEvidenceList',
    'outputEvidencePanel', 'outputEvidenceTitle', 'outputEvidenceIssues']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(main, /projectSourceStructureEvidence\(\{ source, trackState: scanned \}\)/);
  assert.match(main, /projectActualOutputEvidence\(lastActualOutput\.report,/);
  assert.match(main, /lastActualOutput = \{ sourceKey: evidenceSourceAtExecution, sourceFile:video, report \}/);
  assert.match(main, /renderActualOutputEvidence\(\)/);
  assert.match(css, /\.composition-evidence-row/);
  assert.match(main, /sourceAttachmentDeliveryAudit = auditSourceAttachmentDelivery/);
  assert.match(main, /lastActualOutput\.sourceFile === source/);
  assert.match(css, /\.output-evidence-panel\[data-current="false"\]/);
});
