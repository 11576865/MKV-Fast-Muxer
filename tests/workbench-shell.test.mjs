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
  const css = await source('src/workbench.css');
  assert.match(css, /Workbench IA \/ phase 5/);
  assert.match(css, /@media \(min-width: 1440px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /grid-template-areas: "head" "inspector" "editors" "preview" "logs"/);
  assert.match(css, /grid-template-columns: minmax\(320px, \.93fr\) minmax\(410px, 1\.35fr\) minmax\(300px, \.82fr\)/);
  assert.match(css, /\.asset-inspector-host\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1439px\)[\s\S]*?grid-template-areas: "head" "inspector" "preview" "editors" "logs"/);
});

test('stacked view has native task navigation and output execution precedes plan details', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('src/workbench.css')]);
  for (const id of ['source-title', 'workbench-editor-title', 'workbench-output-title', 'batch-title']) {
    assert.match(html, new RegExp(`href="#${id}"`), `missing native section jump for ${id}`);
    assert.match(html, new RegExp(`id="${id}" tabindex="-1"`), `missing heading focus target ${id}`);
  }
  assert.ok(html.indexOf('class="output-section execution-panel"') <
    html.indexOf('class="output-section plan-panel"'), 'ready/status/action must precede detailed plan');
  assert.match(css, /\.workbench-jump-nav \{[\s\S]*?position: sticky;/);
  assert.match(css, /#source-title, #workbench-editor-title, #workbench-output-title, #batch-title \{\s*scroll-margin-top: 72px;/);
});

test('workbench styles are loaded after legacy CSS with one explicit authority', async () => {
  const [main, legacyCss, css, navigation] = await Promise.all([
    source('src/main.js'), source('src/style.css'),
    source('src/workbench.css'), source('src/workbench-navigation.js'),
  ]);
  assert.ok(main.indexOf("import './style.css'") < main.indexOf("import './workbench.css'"),
    'workbench overrides must load after the global stylesheet');
  assert.doesNotMatch(legacyCss, /Workbench IA \/ phase 5/);
  assert.match(css, /Workbench IA \/ phase 5/);
  assert.match(css, /\.workbench-jump-nav a\[aria-current="location"\]/);
  assert.match(main, /setupWorkbenchNavigation\(document\.querySelector\('\.workbench-jump-nav'\)\)/);
  assert.match(navigation, /aria-current/);
});
