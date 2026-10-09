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
  assert.match(main, /writeNewBatchOutput/);
});

test('1.2 runtime handles binary subtitle streams without text decoding', () => {
  assert.match(main, /if \(!format\?\.text\)/);
  assert.match(main, /format\?\.id === 'vobsub'/);
  assert.match(main, /await fetchFile\(item\.sidecarFile\)/);
});


test('1.2.1 keeps every batch capability visible without six full source cards', () => {
  assert.match(html, /class="batch-source-cluster batch-video-cluster"/);
  assert.match(html, /class="batch-source-cluster batch-subtitle-cluster"/);
  assert.match(html, /class="batch-source-cluster batch-font-cluster"/);
  assert.match(html, /id="batchVideoInput"/);
  assert.match(html, /id="batchVideoFolderInput"/);
  assert.match(html, /id="batchSubtitleInput"/);
  assert.match(html, /id="batchSubtitleFolderInput"/);
  assert.match(html, /id="batchFontInput"/);
  assert.match(html, /id="batchFontFolderInput"/);
  assert.doesNotMatch(html, /source-type">VIDEO DIR/);
  assert.doesNotMatch(html, /source-type">SUB DIR/);
  assert.doesNotMatch(html, /source-type">FONT DIR/);
});
