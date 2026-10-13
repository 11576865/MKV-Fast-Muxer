import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('1.2 UI exposes bitmap subtitles and preserve-all append mode', () => {
  assert.match(html, /PGS \/ VobSub/);
  assert.match(html, /id="appendPreserveAll"/);
  assert.match(html, /PGS \/ VobSub/);
  assert.match(main, /preserveAllOriginalSubtitles/);
});

test('1.2 batch UI exposes folder inputs, output directory and group subset mode', () => {
  assert.match(html, /id="batchVideoFolderInput"/);
  assert.match(html, /id="batchSubtitleFolderInput"/);
  assert.match(html, /id="batchFontFolderInput"/);
  assert.match(html, /id="batchOutputDirBtn"/);
  assert.match(html, /id="batchFontSubsetEnabled"/);
  assert.match(html, /value="group"/);
  assert.match(main, /showDirectoryPicker/);
  assert.match(main, /buildGroupedSubsetFonts/);
  assert.match(main, /findExistingBatchOutputs/);
  assert.match(main, /writeNewBatchArtifactPair/);
  const writer = fs.readFileSync(new URL('../src/batch-output.js', import.meta.url), 'utf8');
  assert.match(writer, /export async function writeNewBatchOutput/);
  assert.match(writer, /export async function writeNewBatchArtifactPair/);
  assert.match(writer, /await findExistingNamedOutputs\(directory, \[mkvName, reportName\]\)/);
});

test('1.2 runtime handles binary subtitle streams without text decoding', () => {
  assert.match(main, /if \(!format\?\.text\)/);
  assert.match(main, /format\?\.id === 'vobsub'/);
  assert.match(main, /await fetchFile\(item\.sidecarFile\)/);
});


test('1.2.1 preserves batch capabilities under the sole content-first import surface', () => {
  assert.match(html, /class="batch-unified-intake"/);
  for (const id of ['batchUnifiedInput', 'batchUnifiedFolderInput', 'batchAssetDropzone',
    'batchAssetInventory', 'batchStartBtn', 'batchOutputDirBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /batch-source-cluster|batch-legacy-intake/);
  assert.match(html, /<div class="intake-runtime-adapters" hidden inert aria-hidden="true">[\s\S]*?id="batchVideoInput"/);
  for (const id of ['batchVideoInput', 'batchVideoFolderInput', 'batchSubtitleInput',
    'batchSubtitleFolderInput', 'batchFontInput', 'batchFontFolderInput']) {
    assert.match(html, new RegExp(`id="${id}"`), `executor adapter ${id} must remain`);
  }
  assert.match(main, /resolveBatchImportedAssets/);
  assert.match(main, /replaceBatchAdapterFiles/);
});
