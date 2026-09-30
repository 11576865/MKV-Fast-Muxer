import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('visual ASS preview is present and explicit light theme is removed', async () => {
  const [html, css, main] = await Promise.all([
    text('index.html'),
    text('src/style.css'),
    text('src/main.js'),
  ]);

  assert.match(html, /id="previewVideo"/);
  assert.match(html, /id="previewSubtitleSelect"/);
  assert.match(html, /id="previewRefreshBtn"/);
  assert.match(html, /VISUAL PREVIEW · LIBASS/);
  assert.doesNotMatch(html, /data-theme-choice="light"/);
  assert.doesNotMatch(html, />白天</);

  assert.match(main, /import JASSUB from 'jassub'/);
  assert.match(main, /queryFonts:\s*false/);
  assert.match(main, /new URL\('jassub\/', window\.location\.href\)/);
  assert.match(main, /worker\/worker\.js/);
  assert.match(main, /wasm\/jassub-worker\.wasm/);

  assert.match(css, /\.subtitle-preview-card/);
  assert.match(css, /\.editor-card \.new-track-row \{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test('JASSUB runtime assets are copied locally and dependency is pinned', async () => {
  const [packageJson, copyScript] = await Promise.all([
    text('package.json'),
    text('scripts/copy-core.mjs'),
  ]);

  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.dependencies.jassub, '2.5.15');

  assert.match(copyScript, /jassub\/dist/);
  assert.match(copyScript, /worker\/worker\.js/);
  assert.match(copyScript, /jassub-worker-modern\.wasm/);
  assert.match(copyScript, /default\.woff2/);
});
