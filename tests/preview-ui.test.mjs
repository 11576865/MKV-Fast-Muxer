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
  assert.match(html, /FRAME PREVIEW/);
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
  assert.equal(pkg.version, '1.2.2');
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
  assert.match(main, /label: 'FFmpeg 快速定位'/);
  assert.match(main, /label: 'FFmpeg 兼容定位'/);
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

test('expanded desktop keeps the preview large and exactly 16:9', async () => {
  const css = await text('src/style.css');

  assert.match(css, /Adaptive pane layout v5/);
  assert.match(css, /grid-template-columns: minmax\(500px, 1\.2fr\) minmax\(340px, \.8fr\);/);
  assert.match(css, /\.subtitle-preview-card \.preview-stage \{[\s\S]*aspect-ratio: 16 \/ 9;/);
  assert.match(css, /\.subtitle-preview-card \.preview-stage img \{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
});

test('AV1 preview can fall back to browser frame capture before libass rendering', async () => {
  const main = await text('src/main.js');

  assert.match(main, /async function captureBrowserFramePng/);
  assert.match(main, /if \(codec === 'av1'\)/);
  assert.match(main, /浏览器抽帧 \+ /);
  assert.match(main, /context\.drawImage\(video/);
});


test('visual polish adds preview zoom and clamps long desktop names', async () => {
  const [html, css, main] = await Promise.all([
    text('index.html'),
    text('src/style.css'),
    text('src/main.js'),
  ]);

  assert.match(html, /FRAME PREVIEW/);
  assert.doesNotMatch(html, /PREVIEW FRAME · LIBASS/);
  assert.match(html, /id="previewDialog"/);
  assert.match(html, /id="previewDialogImage"/);
  assert.match(main, /function openPreviewDialog/);
  assert.match(main, /previewImage\?\.addEventListener\('click', openPreviewDialog\)/);
  assert.match(css, /\.stage-input \.filename \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(css, /\.manifest-output strong,[\s\S]*\.output-section \.plan-main strong/);
});

test('language dropdown keeps codes as values but shows concise labels', async () => {
  const main = await text('src/main.js');

  assert.match(main, /\['zho', '中文'\]/);
  assert.match(main, /<option value="\$\{escapeHtml\(code\)\}"[^>]*>\$\{escapeHtml\(label\)\}<\/option>/);
  assert.doesNotMatch(main, />\$\{escapeHtml\(label\)\} \(\$\{escapeHtml\(code\)\}\)<\/option>/);
  assert.match(main, /title="语言代码：\$\{escapeHtml\(item\.language\)\}"/);
});


test('Review & Mux pane uses a quieter summary-plan-action hierarchy', async () => {
  const css = await text('src/style.css');

  assert.match(css, /1\.0\.7 output pane refinement/);
  assert.match(css, /\.output-summary \.manifest > div \{[\s\S]*border-radius: 4px/);
  assert.match(css, /\.output-section \.plan-row \{[\s\S]*border-left: 2px solid/);
  assert.match(css, /\.execution-panel \{[\s\S]*var\(--success\) 5%/);
});


test('empty preview image stays hidden until a PNG exists', async () => {
  const [html, main] = await Promise.all([
    text('index.html'),
    text('src/main.js'),
  ]);

  assert.match(html, /id="previewImage" class="preview-image-trigger hidden"/);
  assert.match(main, /previewImage\?\.classList\.add\('hidden'\)/);
  assert.match(main, /previewImage\.classList\.remove\('hidden'\)/);
});


test('preview accepts arbitrary timestamps and previous-next cue navigation', async () => {
  const [html, main] = await Promise.all([text('index.html'), text('src/main.js')]);
  assert.match(html, /id="previewTimeInput"/);
  assert.match(html, /id="previewPrevCueBtn"/);
  assert.match(html, /id="previewNextCueBtn"/);
  assert.match(main, /function parsePreviewTime/);
  assert.match(main, /function extractPreviewCueTimes/);
  assert.match(main, /navigatePreviewCue/);
});
