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

test('preview stays 16:9 within the active edit workspace, not the source inventory', async () => {
  const [html, legacyCss, modernCss] = await Promise.all([
    source('index.html'), source('src/style.css'), source('src/workbench.css'),
  ]);
  assert.match(html, /id="preview-title">字幕预览/);
  assert.match(html, /id="previewRefreshBtn"[^>]*aria-label="生成预览帧"/);
  assert.match(legacyCss, /\.subtitle-preview-card \.preview-stage \{[^}]*aspect-ratio: 16 \/ 9;/);
  assert.match(html, /class="editor-column"[\s\S]*id="assetInspectorHost"[\s\S]*class="subtitle-preview-card"/);
  assert.match(modernCss, /grid-template-areas: "head" "inspector" "editors" "preview" "logs"/);
  assert.match(modernCss, /grid-template-areas: "head" "inspector" "preview" "editors" "logs"/);
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


test('modern desktop layout hides duplicate original editor by default while preserving access', async () => {
  const [html, modernCss] = await Promise.all([
    source('index.html'), source('src/workbench.css'),
  ]);
  assert.match(modernCss, /\.editor-grid\[data-intake-mode="unified"\]\[data-show-legacy-source="false"\]:not\(\[data-editor-focus="source"\]\)/);
  assert.match(modernCss, /@media \(min-width: 1440px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(modernCss, /grid-template-columns: minmax\(320px, \.93fr\) minmax\(410px, 1\.35fr\) minmax\(300px, \.82fr\)/);
  assert.match(modernCss, /\.workspace > \.workbench-grid > \.output-hub \{/);
  // Secondary legacy and bulk controls are still real, reachable DOM nodes.
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


test('MKV execution actions are visibly named and preserve the container change audit', async () => {
  const [html, modernCss, main] = await Promise.all([
    source('index.html'), source('src/workbench.css'), source('src/main.js'),
  ]);
  assert.match(html, /id="containerChangeSummary"/);
  assert.match(html, /id="scanTracksBtn"[^>]*aria-label="重新扫描容器"/);
  assert.match(html, /id="refreshPlanBtn"[^>]*aria-label="刷新封装计划"/);
  assert.match(html, /id="muxBtn"[^>]*>[\s\S]*?<span class="action-label">开始封装 MKV<\/span>/);
  assert.match(html, /id="cancelBtn"[^>]*>[\s\S]*?<span class="action-label">取消<\/span>/);
  assert.match(html, /id="downloadLink"[^>]*>[\s\S]*?<span>下载 MKV<\/span>/);
  assert.match(html, /id="reportLink"[^>]*>[\s\S]*?<span>下载报告<\/span>/);
  assert.match(modernCss, /\.execution-panel \.action-icon-button \{[\s\S]*?min-height: 48px;/);
  assert.match(main, /function renderContainerChangeSummary/);
  assert.match(main, /data-change="add"/);
  assert.match(main, /data-change="remove"/);
  assert.match(main, /streams: probe\.streams \|\| \[\]/);
});
