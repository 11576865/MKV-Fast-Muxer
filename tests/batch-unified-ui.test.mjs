import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('batch uses a single visible import and stores executor adapters offscreen', async () => {
  const html = await source('index.html');
  for (const id of ['batchUnifiedInput','batchUnifiedFolderInput','batchAssetDropzone','batchAssetInventory','batchAssetStatus']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /batch-legacy-intake|兼容旧批量流程/);
  assert.match(html, /class="intake-runtime-adapters" hidden inert aria-hidden="true"/);
  for (const id of ['batchVideoInput', 'batchSubtitleInput', 'batchFontInput']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<details class="format-reference batch-format-reference"><summary>格式<\/summary>/);
  assert.match(html, /暂不支持独立音频/);
  assert.doesNotMatch(html, /<details class="format-reference batch-format-reference" open/);
});

test('batch signature identity routes through existing pairing without invisible unsupported assets', async () => {
  const [js, identity] = await Promise.all([source('src/main.js'), source('src/asset-intake.js')]);
  assert.match(js, /resolveBatchImportedAssets/);
  assert.match(js, /function replaceBatchAdapterFiles\(\)/);
  assert.match(js, /batchInternalAdapterUpdate = true;/);
  assert.match(js, /batchUnifiedMode && Boolean\(unifiedRoles\?\.unsupported\.length \|\| recognition\.ignored\.length\)/);
  assert.match(js, /batchUnifiedMode \? selected : selectedFonts\(\)/);
  assert.match(identity, /export function resolveBatchImportedAssets\(entries\)/);
  assert.match(js, /batchImportInProgress \|\| isBusy\(\)/);
});

test('batch-specific UI owns its style rules in workbench.css, not global legacy CSS', async () => {
  const [css, js] = await Promise.all([source('src/workbench.css'), source('src/main.js')]);
  assert.match(css, /\.batch-unified-intake \{/);
  assert.match(css, /\.batch-inputs \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(css, /\.batch-legacy-intake/);
  assert.match(css, /\.intake-runtime-adapters\[hidden\] \{ display: none !important; \}/);
  assert.ok(js.indexOf("import './style.css'") < js.indexOf("import './workbench.css'"));
});

test('recognized batch assets show concise state while unsupported assets retain diagnosis', async () => {
  const main = await source('src/main.js');
  assert.match(main, /const diagnosis = supported \? state : \[state, entry\.detail\]\.filter\(Boolean\)\.join\(' · '\)/);
  assert.match(main, /\$\{escapeHtml\(diagnosis\)\}/);
  assert.match(main, /'批量不支持独立音频'/);
  assert.doesNotMatch(main, /视频轨待预检|进入配对预检/);
});
