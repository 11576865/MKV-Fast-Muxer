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
  assert.match(html, /PREVIEW FRAME · LIBASS/);
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
  assert.equal(pkg.version, '1.0.1');
  assert.equal(pkg.dependencies.jassub, '2.5.15');

  assert.match(copyScript, /jassub\/dist/);
  assert.match(copyScript, /worker\/worker\.js/);
  assert.match(copyScript, /jassub-worker-modern\.wasm/);
  assert.match(copyScript, /default\.woff2/);
});


test('Vite emits module workers for the JASSUB bundle', async () => {
  const vite = await text('vite.config.js');
  assert.match(vite, /worker:\s*\{[\s\S]*format:\s*['"]es['"]/);
});


test('preview is explicitly on-demand rather than auto-started', async () => {
  const [html, main] = await Promise.all([
    text('index.html'),
    text('src/main.js'),
  ]);

  assert.match(html, /生成预览帧/);
  assert.match(html, /按需生成/);
  assert.match(main, /previewRefreshBtn\?\.addEventListener\('click', refreshSubtitlePreview\)/);
  assert.doesNotMatch(main, /scheduleSubtitlePreview/);
  assert.match(main, /choosePreviewFrameTime/);
  assert.match(main, /manualRender/);
});

test('desktop output plan expands naturally instead of using nested scrolling', async () => {
  const css = await text('src/style.css');

  assert.match(css, /Desktop output panel should use available page space/);
  assert.match(css, /\.output-hub \{\s*position: static;\s*max-height: none;\s*overflow: visible;/);
  assert.match(css, /\.output-section \.mux-plan \{\s*max-height: none;\s*overflow: visible;/);
});
