import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../src/batch.js', import.meta.url), 'utf8');
const subset = fs.readFileSync(new URL('../src/font-subset.js', import.meta.url), 'utf8');

function inputTag(id) {
  return html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || '';
}

test('font pickers do not use extension allowlists as authoritative admission gates', () => {
  assert.ok(inputTag('fontInput'));
  assert.ok(inputTag('batchFontInput'));
  assert.doesNotMatch(inputTag('fontInput'), /accept=/);
  assert.doesNotMatch(inputTag('batchFontInput'), /accept=/);
  assert.match(html, /按实际 SFNT 内容识别/);
});

test('single mux validates font content and derives virtual extension and MIME from identity', () => {
  assert.match(main, /await inspectFontFile\(item\.file\)/);
  assert.match(main, /isSupportedFontIdentity\(fontIdentity\)/);
  assert.match(main, /fontVirtualExtension\(item\.fontIdentity\)/);
  assert.match(main, /mimeForFont\(item\.file, item\.fontIdentity\)/);
  assert.doesNotMatch(
    main,
    /\['\.ttf', '\.otf', '\.ttc', '\.otc'\]\.includes\(ext\(file\.name\)\)/,
  );
});

test('font subsetting follows actual font identity rather than source filename extension', () => {
  assert.match(subset, /canSubsetFontIdentity\(detectedIdentity\)/);
  assert.match(subset, /fontVirtualExtension\(detectedIdentity\)/);
  assert.match(subset, /detectedIdentity\.mimeType/);
});

test('batch font discovery uses content identity and passes only recognized fonts to jobs', () => {
  assert.match(batch, /identifyBatchFonts/);
  assert.doesNotMatch(batch, /FONT_EXTENSIONS|isSupportedBatchFont/);
  assert.match(main, /identifyBatchFonts\(candidateFonts/);
  assert.match(main, /pairing\.fontFiles = fonts/);
  assert.match(main, /const requestedBatchFonts = pairing\.fontFiles \|\| \[\]/);
});


test('verified font identity requires structural parsing beyond the four-byte signature', () => {
  assert.match(batch, /inspect = inspectFontFile/);
  assert.match(main, /fontIdentity\?\.descriptors/);
});
