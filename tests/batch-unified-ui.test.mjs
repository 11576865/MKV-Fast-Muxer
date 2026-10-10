import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('batch shares a visible unified import surface and keeps categorized controls behind explicit disclosure', async () => {
  const html = await source('index.html');
  for (const id of ['batchUnifiedInput','batchUnifiedFolderInput','batchAssetDropzone','batchAssetInventory','batchAssetStatus']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<details class="batch-legacy-intake">[\s\S]*?<summary>分类导入（兼容旧批量流程）<\/summary>/);
  assert.ok(html.indexOf('class="batch-unified-intake"') < html.indexOf('class="batch-legacy-intake"'));
  assert.match(html, /独立音频目前不属于批量封装能力/);
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
  assert.match(css, /\.batch-legacy-intake > summary/);
  assert.ok(js.indexOf("import './style.css'") < js.indexOf("import './workbench.css'"));
});
