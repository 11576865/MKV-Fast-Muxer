import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('1.2.2 keeps all three workflow stages and every real editor reachable', async () => {
  const html = await source('index.html');
  for (const id of ['videoInput', 'subInput', 'fontInput', 'audioInput', 'previewStage',
    'newAudioList', 'newSubtitleList', 'fontMode', 'fontSubsetEnabled',
    'appendPreserveAll', 'scanTracksBtn', 'trackList', 'attachmentList',
    'muxPlan', 'muxBtn', 'downloadLink', 'auditResult']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<span class="section-index">01<\/span>/);
  assert.match(html, /<span class="section-index">02<\/span>/);
  assert.match(html, /<span class="section-index">03<\/span>/);
  assert.match(html, /class="source-item source-video source-primary"/);
  assert.match(html, /class="source-item source-subtitle source-primary"/);
  assert.match(html, /class="source-item source-font source-secondary"/);
  assert.match(html, /class="source-item source-audio source-secondary"/);
  assert.doesNotMatch(html, /id="outputName"[^>]*contenteditable|id="outputName"[^>]*type="text"/);
  for (const category of ['all', 'subtitle', 'audio', 'font', 'source']) {
    assert.match(html, new RegExp(`data-editor-filter="${category}"`));
  }
});

test('preview remains a 16:9 on-demand frame and an editor sits beside it on wide screens', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);
  assert.match(html, /按需抽帧，无连续播放/);
  assert.match(html, /生成预览帧/);
  assert.match(css, /1\.2\.2 visual system/);
  assert.match(css, /\.subtitle-preview-card \.preview-stage \{[^}]*aspect-ratio: 16 \/ 9;/);
  assert.match(css, /@media \(min-width: 1360px\) \{/);
  assert.match(css, /\.editor-column \{ grid-template-columns: minmax\(0, 1\.38fr\) minmax\(325px, \.62fr\)/);
  assert.match(css, /@media \(min-width: 1360px\) and \(max-width: 1650px\)/);
});

test('narrow layouts stack controls and batch is a secondary expandable workspace', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.source-strip \{ grid-template-columns: 1fr;/);
  assert.match(html, /<details class="batch-drawer">/);
  assert.match(html, /id="batchVideoFolderInput"/);
  assert.match(html, /id="batchSubtitleFolderInput"/);
  assert.match(html, /id="batchFontFolderInput"/);
  assert.match(html, /id="batchSubsetScope"/);
  assert.match(html, /id="batchOutputDirBtn"/);
  assert.match(html, /<details class="diagnostics-panel">/);
});
