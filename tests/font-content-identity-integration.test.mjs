import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../src/batch.js', import.meta.url), 'utf8');
const subset = fs.readFileSync(new URL('../src/font-subset.js', import.meta.url), 'utf8');

test('single-file font workflow uses actual font structure instead of extension gating', () => {
  assert.match(main, /identifyFontFile/);
  assert.match(main, /fontIdentityMismatchMessage/);
  assert.match(main, /fontMimeType\(item\.fontIdentity\)/);
  assert.match(main, /fontVirtualSuffix\(item\.fontIdentity\)/);
  assert.doesNotMatch(main, /\['\.ttf', '\.otf', '\.ttc', '\.otc'\]\.includes\(ext\(file\.name\)\)/);
  assert.doesNotMatch(html, /id="fontInput"[^>]*accept=/);
});

test('batch font discovery is content-derived and picker is not extension-filtered', () => {
  assert.match(batch, /identifyBatchFonts/);
  assert.match(main, /fontRecognition/);
  assert.doesNotMatch(html, /id="batchFontInput"[^>]*accept=/);
});

test('font subsetting can use font identity instead of renamed source extension', () => {
  assert.match(subset, /identity\.valid && identity\.container === 'single'/);
  assert.match(subset, /fontVirtualSuffix\(identity\)/);
  assert.match(subset, /fontMimeType\(identity\)/);
});
