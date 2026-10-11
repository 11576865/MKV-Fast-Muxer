import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('phone work areas only project one existing DOM-owned stage at a time', async () => {
  const [html, css, nav, main] = await Promise.all([
    source('index.html'), source('src/workbench.css'),
    source('src/workbench-navigation.js'), source('src/main.js'),
  ]);
  for (const id of ['source-title', 'workbench-editor-title', 'workbench-output-title', 'batch-title']) {
    assert.match(html, new RegExp('href="#' + id + '"'));
  }
  for (const area of ['source', 'edit', 'output', 'batch']) {
    assert.match(css, new RegExp('data-mobile-view="' + area + '"'));
  }
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.workspace\[data-mobile-view\] > \.stage-input/);
  assert.match(css, /\.workspace\[data-mobile-view\] > \.workbench-grid > \.editor-column/);
  assert.match(css, /\.workspace\[data-mobile-view\] > \.workbench-grid > \.output-hub/);
  assert.match(css, /\.workspace\[data-mobile-view\] > \.batch-workspace/);
  assert.match(nav, /workspace\.dataset\.mobileView = view/);
  assert.match(nav, /if \(view === 'batch'\)/);
  assert.match(main, /editorTab\?\.click\(\)/);
  assert.match(main, /containerTreeSelectedItem\.set/);
  assert.ok(main.indexOf("import './style.css'") < main.indexOf("import './workbench.css'"));
  assert.doesNotMatch(nav, /replaceChildren|innerHTML|appendChild/, 'navigation must not remount stateful editors');
  for (const id of ['videoInput', 'subInput', 'fontInput', 'audioInput', 'muxBtn',
    'cancelBtn', 'downloadLink', 'reportLink', 'batchStartBtn', 'batchCancelBtn']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
