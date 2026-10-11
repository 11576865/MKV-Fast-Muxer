import assert from 'node:assert/strict';
import test from 'node:test';

import { createMuxReport, reportFilename, serializeMuxReport } from '../src/mux-report.js';

test('mux report is versioned, serializable and derives a stable sidecar name', () => {
  const report = createMuxReport({
    generatedAt: '2026-09-30T00:00:00.000Z',
    appVersion: '0.3.0',
    input: { name: 'movie.mp4' },
    subtitle: { name: 'movie.ass' },
    fonts: { uniqueCount: 2 },
    plan: { entries: [], warnings: [] },
    compatibility: { state: 'DIRECT_COPY', issues: [] },
    expectedAudit: { chapterCount: 0 },
    audit: { status: 'pass', ok: true, issues: [] },
    output: { name: 'movie.mkv', sha256: 'abc' },
  });

  assert.equal(report.schema, 1);
  assert.equal(report.application.processing, 'browser-local');
  assert.equal(report.compatibility.state, 'DIRECT_COPY');
  assert.equal(JSON.parse(serializeMuxReport(report)).output.name, 'movie.mkv');
  assert.equal(reportFilename('movie.mkv'), 'movie.mux-report.json');
});


test('production mux-report version matches the package manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const base = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('package.json', base), 'utf8'));
  const application = await readFile(new URL('src/main.js', base), 'utf8');
  const match = application.match(/appVersion:\s*'([^']+)'/);
  assert.ok(match, 'the production mux flow must declare the report version');
  assert.equal(match[1], manifest.version, 'the report must not advertise an obsolete application version');
});
