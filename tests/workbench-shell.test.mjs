import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('workbench separates imported source navigation from the central inspector and MKV export', async () => {
  const [html, script] = await Promise.all([source('index.html'), source('src/main.js')]);
  assert.match(html, /id="assetInventory"/);
  assert.match(html, /id="assetInspectorHost" class="asset-inspector-host"[^>]*hidden/);
  assert.match(html, /class="editor-column"[\s\S]*?id="assetInspectorHost"[\s\S]*?class="subtitle-preview-card"/);
  assert.match(html, /class="output-hub"/);
  assert.match(script, /sourceInspectorMarkup = `<section class="asset-tree-inspector"/);
  assert.match(script, /assetInspectorHost\.innerHTML = sourceInspectorMarkup/);
  assert.match(script, /for \(const target of \[assetInventory, assetInspectorHost\]\)/);
  assert.match(script, /assetInspectorHost\?\.addEventListener\('click'/);
  assert.match(script, /containerTreeSelectedItem\.set\(source\.dataset\.sourceTree, targetKey\)/);
  assert.match(script, /reselected\?\.focus\(\{ preventScroll: true \}\)/);
});

test('all consequential MKV output actions have visible text labels, not only icons or aria names', async () => {
  const html = await source('index.html');
  assert.match(html, /id="muxBtn"[^>]*>[\s\S]*?<span class="action-label">开始封装 MKV<\/span><\/button>/);
  assert.match(html, /id="cancelBtn"[^>]*>[\s\S]*?<span class="action-label">取消<\/span><\/button>/);
  assert.match(html, /id="downloadLink"[^>]*>[\s\S]*?<span>下载 MKV<\/span><\/a>/);
  assert.match(html, /id="reportLink"[^>]*>[\s\S]*?<span>下载报告<\/span><\/a>/);
});

test('desktop uses three independent workbench zones, with a stacked mobile inspector', async () => {
  const css = await source('src/style.css');
  assert.match(css, /Workbench IA \/ phase 5/);
  assert.match(css, /@media \(min-width: 1440px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /grid-template-areas: "head" "inspector" "editors" "preview" "logs"/);
  assert.match(css, /grid-template-columns: minmax\(320px, \.93fr\) minmax\(410px, 1\.35fr\) minmax\(300px, \.82fr\)/);
  assert.match(css, /\.asset-inspector-host\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1439px\)[\s\S]*?grid-template-areas: "head" "inspector" "preview" "editors" "logs"/);
});
