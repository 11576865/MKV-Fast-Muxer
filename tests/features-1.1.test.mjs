import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('1.1 UI exposes multi-format subtitles, batch queue and font subsetting', () => {
  assert.match(html, /ASS \/ SSA \/ SRT \/ WebVTT/);
  assert.match(html, /按实际内容识别/);
  assert.match(html, /id="fontSubsetEnabled"/);
  assert.match(html, /id="batchVideoInput"/);
  assert.match(html, /id="batchSubtitleInput"/);
  assert.match(html, /id="batchStartBtn"/);
  assert.match(html, /id="batchPreserveAttachments"/);
});

test('main wires batch and subset helpers', () => {
  assert.match(main, /subsetFontItems/);
  assert.match(main, /buildBatchJobs/);
  assert.match(main, /codecOverride/);
  assert.match(main, /expectedCodec/);
});
