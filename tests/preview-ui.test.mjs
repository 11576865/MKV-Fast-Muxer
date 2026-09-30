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

  assert.match(html, /id="previewImage"/);
  assert.match(html, /id="previewSubtitleSelect"/);
  assert.match(html, /id="previewRefreshBtn"/);
  assert.match(html, /PREVIEW FRAME · LIBASS/);
  assert.doesNotMatch(html, /data-theme-choice="light"/);
  assert.doesNotMatch(html, />白天</);

  assert.doesNotMatch(main, /JASSUB/);
  assert.match(main, /FFFSType\.WORKERFS/);
  assert.match(main, /-vf/);
  assert.match(main, /ass=/);

  assert.match(css, /\.subtitle-preview-card/);
  assert.match(css, /\.editor-card \.new-track-row \{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test('preview uses the existing local FFmpeg runtime without a second subtitle renderer', async () => {
  const [packageJson, copyScript] = await Promise.all([
    text('package.json'),
    text('scripts/copy-core.mjs'),
  ]);

  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.version, '1.0.3');
  assert.equal('jassub' in pkg.dependencies, false);
  assert.doesNotMatch(copyScript, /jassub/i);
  assert.match(copyScript, /ffmpeg-core\.wasm/);
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
  assert.match(main, /FFFSType\.WORKERFS/);
  assert.match(main, /preview-sub\.png/);
});

test('desktop output plan expands naturally instead of using nested scrolling', async () => {
  const css = await text('src/style.css');

  assert.match(css, /Desktop output panel should use available page space/);
  assert.match(css, /\.output-hub \{\s*position: static;\s*max-height: none;\s*overflow: visible;/);
  assert.match(css, /\.output-section \.mux-plan \{\s*max-height: none;\s*overflow: visible;/);
});


test('preview extraction clamps time and retries seek strategy', async () => {
  const main = await text('src/main.js');

  assert.match(main, /function clampPreviewTime/);
  assert.match(main, /durationSeconds - 0\.08/);
  assert.match(main, /label: '快速定位'/);
  assert.match(main, /label: '兼容定位'/);
  assert.match(main, /execWithCapturedLogs/);
  assert.match(main, /usefulLogTail/);
  assert.match(main, /编码：\$\{codec\}/);
});
