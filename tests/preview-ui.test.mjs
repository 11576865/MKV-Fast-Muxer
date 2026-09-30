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
  assert.equal(pkg.version, '1.0.4');
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


test('subtitle language editor uses real select choices instead of a bare und text field', async () => {
  const main = await text('src/main.js');

  assert.match(main, /const trackLanguageChoices = \[/);
  assert.match(main, /\['zho', '中文'\]/);
  assert.match(main, /\['zh-Hans', '简体中文 · BCP 47'\]/);
  assert.match(main, /\['eng', 'English'\]/);
  assert.match(main, /\['jpn', '日本語'\]/);
  assert.match(main, /\['kor', '한국어'\]/);
  assert.match(main, /<select data-new-sub-field="language"/);
  assert.doesNotMatch(main, /<input data-new-sub-field="language"/);
});

test('desktop subtitle preview remains compact', async () => {
  const css = await text('src/style.css');

  assert.match(css, /Compact preview stage for desktop workbench/);
  assert.match(css, /\.preview-stage \{\s*min-height: 132px;\s*max-height: 190px;/);
  assert.match(css, /\.preview-stage img \{[\s\S]*max-height: 190px;/);
});

test('AV1 preview can fall back to browser frame capture before libass rendering', async () => {
  const main = await text('src/main.js');

  assert.match(main, /async function captureBrowserFramePng/);
  assert.match(main, /if \(codec === 'av1'\)/);
  assert.match(main, /浏览器抽帧 \+ /);
  assert.match(main, /context\.drawImage\(video/);
});
