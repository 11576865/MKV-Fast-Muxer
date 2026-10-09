import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('MKV workbench keeps the complete existing source, editing and audit contracts', async () => {
  const html = await source('index.html');
  const ids = ['videoInput', 'subInput', 'audioInput', 'fontInput',
    'previewStage', 'previewTimeInput', 'previewRefreshBtn', 'previewStatus',
    'newSubtitleList', 'newAudioList', 'fontMode', 'fontSubsetEnabled',
    'appendPreserveAll', 'scanTracksBtn', 'trackList', 'attachmentList',
    'refreshPlanBtn', 'muxPlan', 'planWarnings', 'muxBtn', 'cancelBtn',
    'downloadLink', 'reportLink', 'auditResult', 'batchStartBtn', 'batchResults'];
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `missing live control ${id}`);
  }
  assert.match(html, /<h2>预览与调整<\/h2>/);
  assert.match(html, /id="preview-title">字幕预览/);
  assert.match(html, /data-editor-filter="source"[^>]*>原轨道<\/button>/);
  assert.match(html, /<h2>封装输出<\/h2>/);
  assert.match(html, /开始封装 MKV/);
});

test('main mux, cancellation and result downloads are visibly labeled in markup', async () => {
  const html = await source('index.html');
  assert.match(html, /id="muxBtn"[^>]*aria-label="开始封装"[^>]*>[\s\S]*?<span class="action-label" aria-hidden="true">开始封装<\/span><\/button>/);
  assert.match(html, /id="cancelBtn"[^>]*aria-label="取消当前操作"[^>]*>[\s\S]*?<span class="action-label" aria-hidden="true">取消<\/span><\/button>/);
  assert.match(html, /id="downloadLink"[^>]*>[\s\S]*?<span>保存 MKV<\/span><\/a>/);
  assert.match(html, /id="reportLink"[^>]*>[\s\S]*?<span>保存封装报告<\/span><\/a>/);
});

test('desktop restores preview context and focus navigation while retaining mobile disclosure', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/style.css')]);
  assert.match(css, /MKV-focused UI phase 1/);
  assert.match(css, /@media \(min-width: 1360px\) and \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.editor-grid > \.object-editor-nav \{\s*display: grid;/);
  assert.match(css, /\.subtitle-preview-card \.preview-head \{\s*display: flex;/);
  assert.match(css, /\.execution-panel \.action-icon-button \{\s*width: auto;[\s\S]*?flex: 1 1 auto;/);
  assert.match(html, /id="mobilePreviewToggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="mobilePlanToggle"[^>]*aria-expanded="false"/);
  assert.match(css, /@media \(max-width: 600px\)/);
});

test('object filtering reuses existing live editor panels rather than remounting controls', async () => {
  const js = await source('src/object-editor.js');
  assert.match(js, /panel\.hidden = category !== 'all'/);
  assert.match(js, /root\.dataset\.editorFocus = category/);
  assert.match(js, /button\.setAttribute\('aria-pressed'/);
});
