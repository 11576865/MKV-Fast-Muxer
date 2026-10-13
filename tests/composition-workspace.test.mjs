import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = name => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('the output composition is primary while imported assets remain inspectable on demand', async () => {
  const [html, main, css] = await Promise.all([
    source('index.html'), source('src/main.js'), source('src/workbench.css'),
  ]);
  assert.ok(html.indexOf('id="unifiedAssetInput"') < html.indexOf('id="outputCompositionPanel"'));
  assert.ok(html.indexOf('id="outputCompositionPanel"') < html.indexOf('id="sourceFilesDetails"'));
  assert.match(html, /<details id="sourceFilesDetails" class="source-files-details">/);
  assert.match(html, /id="compositionTracks" class="composition-tracks"/);
  assert.match(html, /id="compositionIssues"[^>]*role="status"/);
  assert.match(css, /\.workspace\[data-has-composition="true"\] \.stage-input \.asset-dropzone\s*\{ display: none; \}/);
  assert.match(main, /function renderOutputComposition\(\)/);
  assert.match(main, /buildContainerDocument\(\{/);
  assert.match(main, /reconcileContainerSelection\(containerDocument, lastCompositionSourceKey, selectedCompositionId\)/);
  assert.match(main, /selectedCompositionId = item\.id/);
  assert.match(main, /renderMuxPlan\(\) \{/);
  assert.match(main, /compositionTracks\?\.addEventListener\('click'/);
});

test('one output track routes to its existing stream or external editor; export controls invoke the shared mux operation', async () => {
  const [html, main] = await Promise.all([source('index.html'), source('src/main.js')]);
  assert.match(main, /containerTreeSelectedItem\.set\(roles\.sourceKey, target\.key\)/);
  assert.match(main, /\[data-editor-filter="source"\]/);
  assert.match(main, /outputCompositionFileKey\(row\.file\) === target\.fileKey/);
  assert.match(main, /compositionMuxBtn\?\.addEventListener\('click', \(\) => \{ if \(!muxBtn\.disabled\) void executeCurrentMuxTask\(\); \}\)/);
  assert.match(main, /editorMuxBtn\?\.addEventListener\('click', \(\) => \{ if \(!muxBtn\.disabled\) void executeCurrentMuxTask\(\); \}\)/);
  for (const id of ['videoInput', 'subInput', 'audioInput', 'fontInput',
    'assetInspectorHost', 'muxBtn', 'compositionMuxBtn', 'editorMuxBtn', 'objectEditorBack']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'stable ID ' + id);
  }
});

test('invalid input and ambiguous main source must expand secondary source evidence', async () => {
  const main = await source('src/main.js');
  assert.match(main, /sourceFilesDetails\.open = Boolean\(\s*roles\.needsSourceChoice \|\| roles\.unknown\.length \|\| focusedSourceRadio\s*\)/);
  assert.match(main, /entry\.kind === 'unknown' \|\|/);
  assert.match(main, /status === ASSET_STATUS\.UNSUPPORTED/);
  assert.match(main, /compositionIssues\.textContent = model\.diagnostics/);
});
