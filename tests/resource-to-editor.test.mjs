import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('resources link to their existing subtitle/audio/font editor rather than cloned forms', async () => {
  const [main, html, css] = await Promise.all([
    read('src/main.js'), read('index.html'), read('src/workbench.css'),
  ]);
  assert.match(main, /data-asset-focus-key=/);
  assert.match(main, /importedAssetEntries\.find\(item => item\.key === open\.dataset\.assetFocusKey\)/);
  assert.match(main, /focusedImportedAssetKey = entry\.key/);
  assert.match(main, /fileKey\(item\.file\) === fileKey\(entry\.file\)/);
  assert.match(main, /document\.querySelector\(\x60\[data-editor-filter=/);
  assert.match(main, /control\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(main, /if \(focusedImportedAssetKey === key\) focusedImportedAssetKey = ''/);
  assert.match(css, /\.asset-entry\[data-focused="true"\]/);
  assert.match(css, /\.editor-column > \.asset-inspector-host\s*\{/);
  for (const id of ['newSubtitleList', 'newAudioList', 'fontMode', 'assetInspectorHost',
    'assetInventory', 'muxBtn', 'downloadLink', 'videoInput', 'subInput', 'audioInput', 'fontInput']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
      'one existing runtime UI instance for ' + id);
  }
});
