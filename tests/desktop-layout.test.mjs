import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('content-first MKV intake keeps live editors and output without category upload gates', async () => {
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
  for (const id of ['unifiedAssetInput', 'unifiedFolderInput', 'assetDropzone', 'assetInventory', 'assetImportStatus']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /legacy-source-picker" hidden aria-hidden="true" inert/);
  assert.match(html, /导入文件和容器/);
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

test('narrow layouts keep content-first intake and batch remains separately expandable', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(await source('src/workbench.css'), /\.unified-intake-head \{ flex-direction: column; align-items: stretch;/);
  assert.match(html, /<details class="batch-drawer">/);
  assert.match(html, /id="batchVideoFolderInput"/);
  assert.match(html, /id="batchSubtitleFolderInput"/);
  assert.match(html, /id="batchFontFolderInput"/);
  assert.match(html, /id="batchSubsetScope"/);
  assert.match(html, /id="batchOutputDirBtn"/);
  assert.match(html, /<details class="diagnostics-panel">/);
});


test('desktop refinement preserves existing editors while offering unified import', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);

  assert.match(css, /Desktop refinement: annotated 1920px pass/);
  assert.match(css, /@media \(min-width: 1360px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(await source('src/workbench.css'), /\.legacy-source-picker,\s*\.legacy-source-picker\[hidden\] \{\s*display: none !important;/);
  assert.match(css, /\.subtitle-preview-card \.preview-head \{[\s\S]*display: none;/);
  assert.match(css, /\.object-editor-nav \{[\s\S]*display: none;/);
  assert.match(css, /\.action-icon-button \{[\s\S]*width: 48px;[\s\S]*background: var\(--success\)/);
  assert.match(css, /\.batch-layout \{[\s\S]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(400px, \.65fr\)/);

  // Controls stay in the DOM for narrower layouts and scripted state preservation.
  assert.match(html, /class="object-editor-nav"/);
  assert.match(html, /id="previewRefreshBtn"/);
  assert.match(html, /id="batchStartBtn"/);
});


test('portrait tablet guard preserves editor/output columns below unified import', async () => {
  const css = await source('src/style.css');

  assert.match(css, /Portrait tablet \/ desktop-mode browser guard/);
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 1180px\) and \(orientation: portrait\)/);
  assert.match(await source('src/workbench.css'), /@media \(max-width: 900px\) \{\s*\.unified-intake-head \{ flex-direction: column;/);
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
