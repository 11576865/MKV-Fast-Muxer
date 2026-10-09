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
  assert.match(html, /id="preview-title">字幕预览/);
  assert.match(html, /id="previewRefreshBtn"[^>]*aria-label="生成预览帧"/);
  assert.match(css, /1\.2\.2 visual system/);
  assert.match(css, /\.subtitle-preview-card \.preview-stage \{[^}]*aspect-ratio: 16 \/ 9;/);
  assert.match(css, /@media \(min-width: 1360px\) \{/);
  assert.match(css, /\.editor-column \{[^}]*grid-template-columns: minmax\(0, 1\.38fr\) minmax\(325px, \.62fr\)/);
  assert.match(css, /@media \(max-width: 1359px\)/);
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


test('desktop refinement keeps compact controls while restoring discoverable MKV actions', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);

  assert.match(css, /Desktop refinement: annotated 1920px pass/);
  assert.match(css, /@media \(min-width: 1360px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /\.stage-input \.stage-title p,[\s\S]*\.stage-input \.workload-notice \{[\s\S]*display: none;/);
  assert.match(css, /\.subtitle-preview-card \.preview-head \{[\s\S]*display: none;/);
  assert.match(css, /\.editor-grid > \.object-editor-nav \{\s*display: grid;/);
  assert.match(css, /\.subtitle-preview-card \.preview-head \{\s*display: flex;/);
  assert.match(css, /\.execution-panel \.action-icon-button \{\s*width: auto;[\s\S]*flex: 1 1 auto;/);
  assert.match(css, /\.batch-layout \{[\s\S]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(400px, \.65fr\)/);

  // Controls stay in the DOM for narrower layouts and scripted state preservation.
  assert.match(html, /class="object-editor-nav"/);
  assert.match(html, /id="previewRefreshBtn"/);
  assert.match(html, /id="batchStartBtn"/);
});


test('portrait tablet desktop-mode browser guard prevents squeezed desktop columns', async () => {
  const css = await source('src/style.css');

  assert.match(css, /Portrait tablet \/ desktop-mode browser guard/);
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 1180px\) and \(orientation: portrait\)/);
  assert.match(css, /\.stage-input \.source-strip \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.workspace > \.workbench-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.output-hub \{[\s\S]*position: static;[\s\S]*max-height: none;[\s\S]*overflow: visible/);
});


test('compact mux UI uses icon actions and exposes an explicit container change summary', async () => {
  const [html, css, main] = await Promise.all([
    source('index.html'),
    source('src/style.css'),
    source('src/main.js'),
  ]);

  assert.match(html, /id="containerChangeSummary"/);
  assert.match(html, /id="scanTracksBtn"[^>]*class="icon-button"[^>]*aria-label="重新扫描容器"/);
  assert.match(html, /id="refreshPlanBtn"[^>]*class="icon-button"[^>]*aria-label="刷新封装计划"/);
  assert.match(html, /id="muxBtn"[^>]*class="icon-button action-icon-button"[^>]*aria-label="开始封装"/);
  assert.match(html, /id="cancelBtn"[^>]*class="icon-button danger-icon-button"[^>]*aria-label="取消当前操作"/);
  assert.match(css, /1\.2\.3 compact soft-mux controls \+ explicit container inventory/);
  assert.match(main, /function renderContainerChangeSummary/);
  assert.match(main, /data-change="add"/);
  assert.match(main, /data-change="remove"/);
  assert.match(main, /streams: probe\.streams \|\| \[\]/);
});
