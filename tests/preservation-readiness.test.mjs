import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { preservationReadiness } from '../src/preservation-readiness.js';

const source = (name) => ({ name, size: 123, lastModified: 50 });

test('rendered preflight is fail-closed while a source is being checked', () => {
  const video = source('source.mkv');
  const value = preservationReadiness({ source: video, inspectionSource: video, state: 'checking' });
  assert.equal(value.status, 'checking');
  assert.equal(value.blocking, true);
  assert.match(value.description, /检查结束前不可开始封装/);
});

test('a same-name same-size new File identity cannot reuse an older verdict', () => {
  const oldFile = source('same.mkv');
  const replacement = source('same.mkv');
  const stale = preservationReadiness({
    source: replacement, inspectionSource: oldFile, state: 'ready',
    inspection: { state: 'NO_KNOWN_HAZARD' },
  });
  assert.equal(stale.status, 'checking');
  assert.equal(stale.blocking, true);
});

test('nested chapters or unsafe/unknown EBML block before mux, with visible reasons', () => {
  const video = source('nested.mkv');
  for (const state of ['BLOCKED_RISK', 'BLOCKED_UNKNOWN']) {
    const result = preservationReadiness({
      source: video, inspectionSource: video, state: 'ready',
      inspection: { state, reasons: ['嵌套章节', '指向特定章节 UID 的标签'] },
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.blocking, true);
    assert.match(result.description, /嵌套章节/);
    assert.match(result.description, /源文件不会被修改/);
  }
});

test('UID relation warning never claims semantic preservation and does not weaken executor gate', () => {
  const video = source('tags.mkv');
  const result = preservationReadiness({
    source: video, inspectionSource: video, state: 'ready',
    inspection: { state: 'UNVERIFIED_REFERENCES', warnings: ['指向特定轨道 UID 的标签'] },
  });
  assert.equal(result.status, 'warning');
  assert.equal(result.blocking, false);
  assert.match(result.description, /关联保真未获独立证明/);
});

test('a clean preflight does not claim lossless full-EBML capability', () => {
  const video = source('simple.mkv');
  const result = preservationReadiness({
    source: video, inspectionSource: video, state: 'ready',
    inspection: { state: 'NO_KNOWN_HAZARD', caveat: '未发现已证实的阻断风险不等于源容器整体结构可无损保留。' },
  });
  assert.equal(result.status, 'clear');
  assert.equal(result.blocking, false);
  assert.match(result.description, /不等于/);
});

test('single no-source and non-MKV cases never fabricate Matroska-specific hazard findings', () => {
  assert.equal(preservationReadiness().status, 'idle');
  const video = source('clip.mp4');
  const result = preservationReadiness({ source: video, inspectionSource: video, state: 'not-applicable' });
  assert.equal(result.blocking, false);
  assert.equal(result.status, 'not-applicable');
});

test('integration retains actual runtime preflight and binds preview result to source reference', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(main, /beginPreservationPreview\(\)/);
  assert.match(main, /queueMicrotask\(\(\) =>/);
  assert.match(main, /const identity = await sniffFileContainer\(source\)/);
  assert.match(main, /generation !== preservationPreviewGeneration \|\| videoInput\.files\?\.\[0\] !== source/);
  assert.match(main, /currentPreservationReadiness\(\)\.blocking/);
  assert.match(main, /const protection = await inspectMatroskaPreservation\(video\)/);
  assert.match(main, /const refusal = preservationBlockMessage\(video\.name, protection\)/);
  assert.match(main, /if \(batchRunning\) \{/);
  assert.match(html, /id="preservationReadiness"/);
  assert.match(css, /\.preservation-readiness\[data-status="blocked"\]/);
});
