import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('design plate rehosts the single production observation inspector without duplicating writable controls', async () => {
  const [shell, plate, html] = await Promise.all([
    source('src/softmux-10.14-workbench.js'),
    source('src/softmux-design-plate.js'),
    source('index.html'),
  ]);
  assert.match(shell, /mountSoftmuxDesignPlate\(doc, root\)/);
  assert.match(plate, /inspector\.prepend\(notice\)/);
  assert.match(plate, /outputComposition\.after\(outline\)/);
  assert.match(plate, /current\.click\(\)/);
  assert.doesNotMatch(plate, /cloneNode|document\.write|insertAdjacentHTML/);
  for (const id of ['sf14SectionNotice','outputCompositionPanel','compositionTracks',
    'muxBtn','cancelBtn','batchPlan','batchJobInspector']) {
    const expected = ['sf14SectionNotice'].includes(id) ? shell : html;
    assert.equal((expected.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'owner ' + id);
  }
});

test('prospective output is permanently grouped by track and attachment, with original object IDs and edit routing', async () => {
  const [main, css] = await Promise.all([source('src/main.js'),source('src/softmux-design-plate.css')]);
  assert.match(main, /const renderCompositionRow = item =>/);
  assert.match(main, /item\.kind !== 'attachment' && item\.kind !== 'font'/);
  assert.match(main, /item\.kind === 'attachment' \|\| item\.kind === 'font'/);
  assert.match(main, /renderCompositionGroup\('tracks','轨道 \/ TRACKS',outputTracks/);
  assert.match(main, /renderCompositionGroup\('attachments','附件 \/ ATTACHMENTS',outputAttachments/);
  assert.match(main, /data-composition-id/);
  assert.match(main, /compositionTracks\?\.addEventListener\('click'/);
  assert.match(css, /\.sf14-composition-group-title/);
});

test('source chapters, tags and attachments are labelled as observation, bound to the exact scanned File and never auto authorized for writing',async()=>{
  const [plate,main] = await Promise.all([source('src/softmux-design-plate.js'), source('src/main.js')]);
  assert.match(plate, /snapshot\.scanned \? snapshot\[spec\.key\] \|\| \[\] : \[\]/);
  assert.match(plate, /next\.sourceFile === lastSource/);
  assert.match(plate, /root\.addEventListener\('softmux:source-sections-updated'/);
  assert.match(plate, /'来源已观察'/);
  assert.match(plate, /'来源扫描未返回此类对象；未证明完整 EBML 结构不存在。'/);
  assert.match(main, /updateSoftmux1014SourceSections\(document, withSourceAttachmentUndoIndicator\(buildSourceObjectSections\(scanned/);
  assert.match(main, /softmux:open-observed-metadata-tool/);
});

test('batch plate uses the existing matrix and selected-job inspector, exposes the existing recipe/source controls', async () => {
  const [css,shell,html]=await Promise.all([
    source('src/softmux-design-plate.css'),
    source('src/softmux-10.14-workbench.js'),
    source('index.html'),
  ]);
  assert.match(css,/\.sf14-batch \.batch-review-layout/);
  assert.match(css,/grid-template-columns:minmax\(0,1\.9fr\) minmax\(310px,\.9fr\)/);
  assert.match(css,/data-controls="sources"/);
  assert.match(css,/data-controls="recipe"/);
  assert.match(shell,/batch\.querySelector\('\.batch-inputs'\)/);
  assert.match(shell,/batch\.querySelector\('\.batch-settings'\)/);
  assert.match(html,/id="batchPlan" class="mux-plan batch-review-matrix"/);
  assert.match(html,/id="batchJobInspector" class="batch-job-inspector"/);
  assert.match(html,/id="batchStartBtn"/);
  assert.match(html,/id="batchCancelBtn"/);
});
