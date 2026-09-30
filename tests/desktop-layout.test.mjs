import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('expanded desktop top-aligns Review & Mux beside Input and gives preview the larger pane', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(css, /Adaptive pane layout v5/);
  assert.match(css, /\.workspace \{\n    display: grid;\n    grid-template-columns: minmax\(0, 1fr\) clamp\(340px, 22vw, 410px\);/);
  assert.match(css, /\.workspace > \.stage-input \{\n    grid-column: 1;\n    grid-row: 1;/);
  assert.match(css, /\.workspace > \.workbench-grid \{\n    display: contents;/);
  assert.match(css, /\.workspace > \.workbench-grid > \.editor-column \{\n    grid-column: 1;\n    grid-row: 2;/);
  assert.match(css, /\.workspace > \.workbench-grid > \.output-hub \{\n    grid-column: 2;\n    grid-row: 1 \/ span 2;/);
  assert.match(css, /grid-template-columns: minmax\(500px, 1\.2fr\) minmax\(340px, \.8fr\);/);
  assert.match(css, /aspect-ratio: 16 \/ 9;/);

  assert.match(html, /class="stage stage-input"/);
  assert.match(html, /class="editor-column"/);
  assert.match(html, /class="output-hub"/);
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


test('left preview column keeps diagnostics directly below preview instead of waiting for the editor column', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(css, /Adaptive pane layout v6/);
  assert.match(
    css,
    /grid-template-areas:\n      "head head"\n      "preview editors"\n      "logs editors";/
  );
  assert.match(css, /\.editor-column > \.diagnostics-panel \{\n    grid-area: logs;/);
  assert.match(css, /\.editor-column > \.editor-grid \{\n    grid-area: editors;/);
});
