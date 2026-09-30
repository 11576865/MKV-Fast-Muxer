import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop workbench uses the full browser canvas and three-stage hierarchy', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(css, /Workbench UI reorganization v3/);
  assert.match(
    css,
    /@media \(min-width: 1280px\) and \(hover: hover\) and \(pointer: fine\)/
  );
  assert.match(
    css,
    /width: calc\(100% - clamp\(24px, 2vw, 42px\)\);\n    max-width: none;/
  );
  assert.match(
    css,
    /grid-template-columns: minmax\(0, 1fr\) clamp\(370px, 24vw, 470px\);/
  );
  assert.match(css, /\.output-hub \{\n    max-height: calc\(100vh - 24px\);/);

  assert.match(html, /class="flow-rail"/);
  assert.match(html, />输入<\/span>/);
  assert.match(html, />调整<\/span>/);
  assert.match(html, />检查并封装<\/span>/);
  assert.match(html, /class="editor-column"/);
  assert.match(html, /class="output-hub"/);
  assert.match(html, /id="trackBulkTools" class="tool-drawer hidden"/);
});

test('mobile layout collapses editing and output into one column', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.source-grid,\n  \.editor-grid,\n  \.output-summary \.manifest \{\n    grid-template-columns: 1fr;/);
  assert.match(css, /\.output-section \.mux-plan \{\n    max-height: none;/);
});

test('small-tablet layout preserves useful two-column density before narrow-phone collapse', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(css, /Mobile\/tablet layout authority v1/);
  assert.match(css, /@media \(min-width: 560px\) and \(max-width: 760px\)/);
  assert.match(
    css,
    /\.source-grid \{\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    css,
    /\.output-summary \.manifest \{\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(css, /max-height: min\(48dvh, 420px\);/);
  assert.match(css, /@media \(max-width: 559px\)/);
  assert.doesNotMatch(html, /<details class="attachment-manager" open>/);
  assert.match(html, /<details class="attachment-manager">/);
});

test('touch layouts keep compact controls usable without desktop sizing', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /@media \(max-width: 1120px\) and \(hover: none\) and \(pointer: coarse\)/
  );
  assert.match(css, /\.track-order button \{\n    width: 36px;\n    min-height: 36px;/);
  assert.match(css, /\.diagnostics-panel pre \{\n    max-height: 190px;/);
});
