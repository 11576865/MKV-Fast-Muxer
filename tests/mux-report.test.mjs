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
    expectedAudit: { chapterCount: 0 },
    audit: { status: 'pass', ok: true, issues: [] },
    output: { name: 'movie.mkv', sha256: 'abc' },
  });

  assert.equal(report.schema, 1);
  assert.equal(report.application.processing, 'browser-local');
  assert.equal(JSON.parse(serializeMuxReport(report)).output.name, 'movie.mkv');
  assert.equal(reportFilename('movie.mkv'), 'movie.mux-report.json');
});
