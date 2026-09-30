import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const outDir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/';
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

function probe(file) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_chapters',
    '-show_format',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' }));
}

function streams(probeJson, type) {
  return (probeJson.streams || []).filter((stream) => stream.codec_type === type);
}

async function waitForStatus(page, prefix, timeout = 180_000) {
  try {
    await page.waitForFunction(
      (expected) => {
        const value = document.querySelector('#status')?.textContent || '';
        if (value.startsWith('失败：')) throw new Error(value);
        return value.startsWith(expected);
      },
      prefix,
      { timeout },
    );
  } catch (error) {
    const status = await page.locator('#status').textContent().catch(() => '(status unavailable)');
    const log = await page.locator('#log').textContent().catch(() => '(log unavailable)');
    console.error('Browser status:', status);
    console.error('Browser log:\n' + log);
    throw new Error(`${status}\n${log}`, { cause: error });
  }
}

async function saveDownload(page, selector, destination) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(selector).click(),
  ]);
  await download.saveAs(destination);
  return destination;
}

async function openApp(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error('[browser:pageerror]', error));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#muxBtn').waitFor();
  return { context, page };
}

async function scenarioMultiTrack(browser) {
  console.log('E2E scenario 1: MP4 + external FLAC + two ASS + duplicate font upload');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#audioInput', path.join(root, 'external.flac'));
    await page.setInputFiles('#subInput', [
      path.join(root, 'zh.ass'),
      path.join(root, 'en.ass'),
    ]);
    await page.setInputFiles('#fontInput', [
      path.join(root, 'DejaVuSans.ttf'),
      path.join(root, 'DejaVuSans-copy.ttf'),
    ]);

    await page.locator('input[data-new-audio-field="language"][data-index="0"]').fill('eng');
    await page.locator('input[data-new-audio-field="title"][data-index="0"]').fill('External FLAC');

    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('简体中文');
    await page.locator('input[data-new-sub-field="language"][data-index="1"]').fill('eng');
    await page.locator('input[data-new-sub-field="title"][data-index="1"]').fill('English');
    await page.locator('input[data-new-sub-field="forced"][data-index="1"]').check();

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'multi-track.mkv');
    const reportPath = path.join(outDir, 'multi-track.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const sourceProbe = probe(path.join(root, 'base.mp4'));
    const outputProbe = probe(output);
    const video = streams(outputProbe, 'video');
    const audio = streams(outputProbe, 'audio');
    const subtitles = streams(outputProbe, 'subtitle');
    const attachments = streams(outputProbe, 'attachment');

    assert.deepEqual(
      video.map((stream) => stream.codec_name),
      streams(sourceProbe, 'video').map((stream) => stream.codec_name),
      'video codec must survive stream copy',
    );
    assert.deepEqual(audio.map((stream) => stream.codec_name), ['aac', 'flac']);
    assert.deepEqual(subtitles.map((stream) => stream.codec_name), ['ass', 'ass']);
    assert.equal(subtitles[0].tags?.language, 'zho');
    assert.equal(subtitles[0].tags?.title, '简体中文');
    assert.equal(Boolean(subtitles[0].disposition?.default), true);
    assert.equal(subtitles[1].tags?.language, 'eng');
    assert.equal(subtitles[1].tags?.title, 'English');
    assert.equal(Boolean(subtitles[1].disposition?.forced), true);
    assert.equal(attachments.length, 1, 'identical uploaded fonts should be deduplicated');
    assert.equal(attachments[0].tags?.filename, 'DejaVuSans.ttf');

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.application.version, '0.8.0');
    assert.equal(report.fonts.selectedCount, 2);
    assert.equal(report.fonts.uniqueCount, 1);
    assert.equal(report.fonts.duplicateCount, 1);
    assert.equal(report.externalAudio.length, 1);
    assert.equal(report.externalAudio[0].codec, 'flac');
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));

    console.log('Scenario 1 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioSelectiveAttachments(browser) {
  console.log('E2E scenario 2: scanned MKV + chapters + selective original attachment');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-with-attachments.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    const attachmentRows = page.locator('.attachment-item');
    assert.equal(await attachmentRows.count(), 2, 'fixture should expose two original attachments');

    const notesRow = page.locator('.attachment-item', { hasText: 'notes.txt' });
    await notesRow.locator('input[data-attachment-action="include"]').check();
    await notesRow.locator('input[data-attachment-field="filename"]').fill('notes-renamed.txt');
    await notesRow.locator('input[data-attachment-field="mimetype"]').fill('text/x-notes');

    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('Fixture Subtitle');

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'selective-attachments.mkv');
    const reportPath = path.join(outDir, 'selective-attachments.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const outputProbe = probe(output);
    const attachments = streams(outputProbe, 'attachment');
    const filenames = attachments.map((stream) => stream.tags?.filename).sort();

    assert.equal((outputProbe.chapters || []).length, 2, 'chapters must be preserved');
    assert.equal(outputProbe.format?.tags?.title, 'Fixture Container');
    const outputComment = Object.entries(outputProbe.format?.tags || {})
      .find(([key]) => key.toLowerCase() === 'comment')?.[1];
    assert.equal(outputComment, 'Fixture global comment');
    assert.deepEqual(filenames, ['DejaVuSans.ttf', 'notes-renamed.txt']);
    assert.equal(filenames.includes('fixture-original.ttf'), false, 'unselected original font attachment must be removed');
    const renamedNotes = attachments.find((stream) => stream.tags?.filename === 'notes-renamed.txt');
    assert.equal(renamedNotes?.tags?.mimetype, 'text/x-notes');

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.expectedAudit.chapterCount, 2);
    assert.equal(report.expectedAudit.formatTags.comment, 'Fixture global comment');
    assert.equal(report.warnings.originalAttachmentSelectionCount, 1);
    assert.deepEqual(report.expectedAudit.attachmentFilenames, ['notes-renamed.txt']);
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));

    console.log('Scenario 2 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioOriginalTracks(browser) {
  console.log('E2E scenario 3: scanned MKV + original track selection/edit + new ASS');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    const audioRows = page.locator('.track-row.track-audio');
    const subtitleRows = page.locator('.track-row.track-subtitle');
    assert.equal(await audioRows.count(), 2);
    assert.equal(await subtitleRows.count(), 1);

    const firstAudio = audioRows.nth(0);
    const secondAudio = audioRows.nth(1);

    await firstAudio.locator('input[data-track-action="include"]').uncheck();
    await secondAudio.locator('input[data-track-field="language"]').fill('zho');
    await secondAudio.locator('input[data-track-field="title"]').fill('保留的 Opus');
    await secondAudio.locator('input[data-track-action="default"]').check();

    const originalSubtitle = subtitleRows.nth(0);
    await originalSubtitle.locator('input[data-track-action="include"]').check();
    await originalSubtitle.locator('input[data-track-field="language"]').fill('eng');
    await originalSubtitle.locator('input[data-track-field="title"]').fill('Original Signs Edited');
    await originalSubtitle.locator('input[data-track-action="forced"]').check();

    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('新增中文');
    await page.locator('input[data-new-sub-field="default"][data-index="0"]').check();

    const planText = await page.locator('#muxPlan').textContent();
    assert.match(planText, /保留的 Opus/);
    assert.match(planText, /Original Signs Edited/);
    assert.match(planText, /新增中文/);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'original-track-selection.mkv');
    const reportPath = path.join(outDir, 'original-track-selection.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.expectedAudit.audio[0].title, '保留的 Opus');
    assert.equal(report.expectedAudit.audio[0].language, 'zho');
    assert.equal(report.expectedAudit.subtitles[1].title, 'Original Signs Edited');
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));

    const out = probe(output);
    const audio = streams(out, 'audio');
    const subtitles = streams(out, 'subtitle');

    assert.deepEqual(audio.map((stream) => stream.codec_name), ['opus']);
    assert.equal(audio[0].tags?.language, 'zho');
    assert.equal(audio[0].tags?.title, '保留的 Opus');
    assert.equal(Boolean(audio[0].disposition?.default), true);

    assert.deepEqual(subtitles.map((stream) => stream.codec_name), ['ass', 'ass']);
    assert.equal(subtitles[0].tags?.language, 'zho');
    assert.equal(subtitles[0].tags?.title, '新增中文');
    assert.equal(subtitles[1].tags?.language, 'eng');
    assert.equal(subtitles[1].tags?.title, 'Original Signs Edited');
    assert.equal(Boolean(subtitles[1].disposition?.forced), true);

    console.log('Scenario 3 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUtf16(browser) {
  console.log('E2E scenario 4: UTF-16LE + UTF-16BE ASS');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', [
      path.join(root, 'zh-utf16le.ass'),
      path.join(root, 'en-utf16be.ass'),
    ]);
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="language"][data-index="1"]').fill('eng');

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'utf16-subs.mkv');
    const reportPath = path.join(outDir, 'utf16-subs.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const out = probe(output);
    assert.deepEqual(streams(out, 'subtitle').map((stream) => stream.codec_name), ['ass', 'ass']);

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.deepEqual(
      report.subtitle.tracks.map((track) => track.encoding),
      ['UTF-16LE BOM', 'UTF-16BE BOM'],
    );
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 4 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioSameNameFonts(browser) {
  console.log('E2E scenario 5: same-name different-content fonts');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', [
      path.join(root, 'font-a', 'Same.ttf'),
      path.join(root, 'font-b', 'Same.ttf'),
    ]);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'same-name-fonts.mkv');
    const reportPath = path.join(outDir, 'same-name-fonts.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const out = probe(output);
    const attachments = streams(out, 'attachment');
    const filenames = attachments.map((stream) => stream.tags?.filename);

    assert.equal(attachments.length, 2);
    assert.equal(filenames.includes('Same.ttf'), true);
    assert.equal(filenames.some((name) => /^Same-mkvfm-[0-9a-f]{8}\.ttf$/i.test(name || '')), true);

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.fonts.uniqueCount, 2);
    assert.equal(report.fonts.duplicateCount, 0);
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 5 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioInputSwitchReset(browser) {
  console.log('E2E scenario 7: scanned MKV state resets when main input changes');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    assert.equal(await page.locator('.track-row.track-audio').count(), 2);
    assert.equal(await page.locator('.track-row.track-subtitle').count(), 1);

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));

    assert.equal(await page.locator('.track-row').count(), 0);
    assert.match(await page.locator('#trackList').textContent(), /选择 MKV 后可扫描轨道/);
    assert.match(await page.locator('#attachmentList').textContent(), /扫描 MKV 后显示附件列表/);
    assert.equal(await page.locator('#preserveAttachments').isChecked(), false);

    const plan = await page.locator('#muxPlan').textContent();
    assert.match(plan, /base\.mp4/);
    assert.doesNotMatch(plan, /Japanese AAC|English Opus|Original Signs/);
    console.log('Scenario 7 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioDefaultWarnings(browser) {
  console.log('E2E scenario 8: duplicate Default flags surface a plan warning');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#audioInput', path.join(root, 'external.flac'));
    await page.setInputFiles('#subInput', [
      path.join(root, 'zh.ass'),
      path.join(root, 'en.ass'),
    ]);
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    await page.locator('input[data-new-audio-field="default"][data-index="0"]').check();
    await page.locator('input[data-new-sub-field="default"][data-index="1"]').check();

    const warning = page.locator('#planWarnings');
    await warning.waitFor({ state: 'visible' });
    const text = await warning.textContent();
    assert.match(text, /Default 音频轨/);
    assert.match(text, /Default 字幕轨/);
    console.log('Scenario 8 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioInvalidAudioRecovery(browser) {
  console.log('E2E scenario 9: invalid external audio fails cleanly, then next task succeeds');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#audioInput', path.join(root, 'not-audio.wav'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#muxBtn').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#status')?.textContent || '';
      return value.startsWith('失败：');
    }, null, { timeout: 180_000 });

    const failedStatus = await page.locator('#status').textContent();
    assert.match(failedStatus, /外部音频|ffprobe|音频/);
    assert.equal(await page.locator('#muxBtn').isDisabled(), false);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);

    await page.setInputFiles('#audioInput', path.join(root, 'external.flac'));
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'recovered-after-invalid-audio.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    assert.deepEqual(streams(out, 'audio').map((stream) => stream.codec_name), ['aac', 'flac']);
    console.log('Scenario 9 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioCancelAndRestart(browser) {
  console.log('E2E scenario 10: cancel active task and immediately recover on a new task');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'cancel-medium.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#muxBtn').click();
    await page.locator('#cancelBtn').waitFor({ state: 'visible' });
    await page.locator('#cancelBtn').click();

    await page.waitForFunction(() => {
      const value = document.querySelector('#status')?.textContent || '';
      return value.includes('取消');
    }, null, { timeout: 60_000 });

    await page.waitForFunction(() => !document.querySelector('#muxBtn')?.disabled, null, { timeout: 60_000 });
    assert.equal(await page.locator('#downloadLink').isVisible(), false);

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'en.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'recovered-after-cancel.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    assert.equal(streams(out, 'subtitle').length, 1);
    assert.equal(streams(out, 'video').length, 1);
    console.log('Scenario 10 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioSequentialTasks(browser) {
  console.log('E2E scenario 11: two consecutive successful tasks do not leak prior metadata');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('First Task');
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const first = path.join(outDir, 'sequential-first.mkv');
    await saveDownload(page, '#downloadLink', first);

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'en.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('eng');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('Second Task');
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const second = path.join(outDir, 'sequential-second.mkv');
    await saveDownload(page, '#downloadLink', second);

    const firstSub = streams(probe(first), 'subtitle')[0];
    const secondSub = streams(probe(second), 'subtitle')[0];
    assert.equal(firstSub.tags?.language, 'zho');
    assert.equal(firstSub.tags?.title, 'First Task');
    assert.equal(secondSub.tags?.language, 'eng');
    assert.equal(secondSub.tags?.title, 'Second Task');
    assert.notEqual(secondSub.tags?.title, firstSub.tags?.title);
    console.log('Scenario 11 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioBrokenSubtitle(browser) {
  console.log('E2E scenario 12: malformed ASS does not poison the next task');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'broken.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#muxBtn').click();

    await page.waitForFunction(() => {
      const value = document.querySelector('#status')?.textContent || '';
      return value.startsWith('失败：') || value.startsWith('完成。');
    }, null, { timeout: 180_000 });

    const firstStatus = await page.locator('#status').textContent();
    if (firstStatus.startsWith('完成。')) {
      const first = path.join(outDir, 'malformed-ass-output.mkv');
      await saveDownload(page, '#downloadLink', first);
      assert.equal(streams(probe(first), 'subtitle').length, 1);
    } else {
      assert.equal(await page.locator('#downloadLink').isVisible(), false);
    }

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const recovered = path.join(outDir, 'recovered-after-malformed-ass.mkv');
    await saveDownload(page, '#downloadLink', recovered);
    assert.equal(streams(probe(recovered), 'subtitle').length, 1);
    console.log('Scenario 12 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBrokenFonts(browser) {
  console.log('E2E scenario 13: broken and zero-byte fonts fail without stale output');
  const { context, page } = await openApp(browser);

  try {
    for (const filename of ['broken.ttf', 'zero-byte.ttf']) {
      await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
      await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
      await page.setInputFiles('#fontInput', path.join(root, filename));
      await page.locator('#muxBtn').click();

      await page.waitForFunction(() => {
        const value = document.querySelector('#status')?.textContent || '';
        return value.startsWith('失败：');
      }, null, { timeout: 180_000 });

      assert.equal(await page.locator('#downloadLink').isVisible(), false);
      assert.equal(await page.locator('#reportLink').isVisible(), false);
      await page.waitForFunction(() => !document.querySelector('#muxBtn')?.disabled, null, { timeout: 60_000 });
    }

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    console.log('Scenario 13 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioVideoOnly(browser) {
  console.log('E2E scenario 14: video-only source remains audio-free');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'video-only.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'video-only.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    assert.equal(streams(out, 'video').length, 1);
    assert.equal(streams(out, 'audio').length, 0);
    assert.equal(streams(out, 'subtitle').length, 1);
    console.log('Scenario 14 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioPlainMkvScan(browser) {
  console.log('E2E scenario 15: plain MKV scan handles no subtitles and no attachments');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'plain-no-subs-no-attachments.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    assert.equal(await page.locator('.track-row.track-audio').count(), 1);
    assert.equal(await page.locator('.track-row.track-subtitle').count(), 0);
    assert.match(await page.locator('#attachmentList').textContent(), /没有附件/);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'plain-mkv-scan.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    assert.equal(streams(out, 'audio').length, 1);
    assert.equal(streams(out, 'subtitle').length, 1);
    console.log('Scenario 15 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioTrackReorder(browser) {
  console.log('E2E scenario 16: original audio reorder is reflected in output order');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    const audioRows = page.locator('.track-row.track-audio');
    assert.equal(await audioRows.count(), 2);
    await audioRows.nth(1).locator('button[data-track-move="-1"]').click();

    const plan = await page.locator('#muxPlan').textContent();
    const opusPos = plan.indexOf('English Opus');
    const aacPos = plan.indexOf('Japanese AAC');
    assert.ok(opusPos >= 0 && aacPos >= 0 && opusPos < aacPos);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'reordered-audio.mkv');
    await saveDownload(page, '#downloadLink', output);
    assert.deepEqual(streams(probe(output), 'audio').map((stream) => stream.codec_name), ['opus', 'aac']);
    console.log('Scenario 16 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioCancelScan(browser) {
  console.log('E2E scenario 17: cancel track scan and scan again');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'cancel-scan.mkv'));
    await page.locator('#scanTracksBtn').click();
    await page.locator('#cancelBtn').click();

    await page.waitForFunction(() => {
      const value = document.querySelector('#status')?.textContent || '';
      return value.includes('取消');
    }, null, { timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('#scanTracksBtn')?.disabled, null, { timeout: 60_000 });

    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');
    assert.equal(await page.locator('.track-row.track-audio').count(), 1);
    console.log('Scenario 17 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnicodeNamesAndLongTitle(browser) {
  console.log('E2E scenario 18: Unicode filenames and max-length track title');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, '视频 空格 😀.mp4'));
    await page.setInputFiles('#subInput', path.join(root, '字幕 空格 😀.ass'));
    await page.setInputFiles('#fontInput', path.join(root, '字体 空格 😀.ttf'));

    const longTitle = '长标题'.repeat(53) + 'X';
    assert.equal(longTitle.length, 160);
    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill(longTitle);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'unicode-names.mkv');
    const reportPath = path.join(outDir, 'unicode-names.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const sub = streams(probe(output), 'subtitle')[0];
    assert.equal(sub.tags?.title, longTitle);
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.input.name, '视频 空格 😀.mp4');
    assert.equal(report.subtitle.tracks[0].name, '字幕 空格 😀.ass');
    assert.equal(report.fonts.attachments[0].sourceName, '字体 空格 😀.ttf');
    console.log('Scenario 18 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioTenSequential(browser) {
  console.log('E2E scenario 19: ten consecutive mux tasks on one page');
  const { context, page } = await openApp(browser);

  try {
    for (let index = 0; index < 10; index += 1) {
      await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
      await page.setInputFiles('#subInput', path.join(root, index % 2 === 0 ? 'zh.ass' : 'en.ass'));
      await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

      const title = `Loop ${index + 1}`;
      await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill(title);
      await page.locator('#muxBtn').click();
      await waitForStatus(page, '完成。');

      if (index === 0 || index === 9) {
        const output = path.join(outDir, `loop-${index + 1}.mkv`);
        await saveDownload(page, '#downloadLink', output);
        assert.equal(streams(probe(output), 'subtitle')[0].tags?.title, title);
      }
    }
    console.log('Scenario 19 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioFontCollectionAndAdvancedFlags(browser) {
  console.log('E2E scenario 20: TTC collection + BCP47 language + advanced dispositions');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#audioInput', path.join(root, 'external.flac'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuCollection.ttc'));

    await page.locator('input[data-new-audio-field="language"][data-index="0"]').fill('eng');
    await page.locator('input[data-new-audio-field="title"][data-index="0"]').fill('Director Commentary');
    await page.locator('#newAudioList details.track-advanced summary').click();
    await page.locator('input[data-new-audio-field="original"][data-index="0"]').check();
    await page.locator('input[data-new-audio-field="commentary"][data-index="0"]').check();

    await page.locator('input[data-new-sub-field="language"][data-index="0"]').fill('zh-Hans');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('简体中文字幕');
    await page.locator('#newSubtitleList details.track-advanced summary').click();
    await page.locator('input[data-new-sub-field="hearingImpaired"][data-index="0"]').check();

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'font-collection-flags.mkv');
    const reportPath = path.join(outDir, 'font-collection-flags.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const out = probe(output);
    const audio = streams(out, 'audio');
    const subtitles = streams(out, 'subtitle');
    const attachments = streams(out, 'attachment');

    assert.equal(audio.at(-1).tags?.title, 'Director Commentary');
    assert.equal(Boolean(audio.at(-1).disposition?.original), true);
    assert.equal(Boolean(audio.at(-1).disposition?.comment), true);
    assert.equal(subtitles[0].tags?.language, 'zh-Hans');
    assert.equal(Boolean(subtitles[0].disposition?.hearing_impaired), true);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].tags?.filename, 'DejaVuCollection.ttc');
    assert.equal(attachments[0].tags?.mimetype, 'font/collection');

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.fonts.uniqueCount, 1);
    assert.equal(report.fonts.faceCount, 2);
    assert.equal(report.fonts.attachments[0].faces.length, 2);
    assert.equal(report.externalAudio[0].original, true);
    assert.equal(report.externalAudio[0].commentary, true);
    assert.equal(report.subtitle.tracks[0].hearingImpaired, true);
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 20 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBulkTrackMetadata(browser) {
  console.log('E2E scenario 21: bulk language and Default presets');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    await page.locator('.track-row.track-subtitle input[data-track-action="include"]').check();
    await page.locator('#bulkLanguage').fill('zho');
    await page.locator('#applyAudioLanguage').click();
    await page.locator('#applySubtitleLanguage').click();
    await page.locator('#firstAudioDefault').click();
    await page.locator('#firstSubtitleDefault').click();

    const audioLanguages = await page.locator('.track-row.track-audio input[data-track-field="language"]').evaluateAll(
      (inputs) => inputs.map((input) => input.value),
    );
    const subtitleLanguages = await page.locator('.track-row.track-subtitle input[data-track-field="language"]').evaluateAll(
      (inputs) => inputs.map((input) => input.value),
    );
    assert.deepEqual(audioLanguages, ['zho', 'zho']);
    assert.deepEqual(subtitleLanguages, ['zho']);

    const audioDefaults = await page.locator('.track-row.track-audio input[data-track-action="default"]').evaluateAll(
      (inputs) => inputs.map((input) => input.checked),
    );
    const subtitleDefaults = await page.locator('.track-row.track-subtitle input[data-track-action="default"]').evaluateAll(
      (inputs) => inputs.map((input) => input.checked),
    );
    assert.deepEqual(audioDefaults, [true, false]);
    assert.deepEqual(subtitleDefaults, [true]);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'bulk-track-metadata.mkv');
    await saveDownload(page, '#downloadLink', output);

    const out = probe(output);
    assert.deepEqual(streams(out, 'audio').map((stream) => stream.tags?.language), ['zho', 'zho']);
    assert.equal(Boolean(streams(out, 'audio')[0].disposition?.default), true);
    assert.equal(Boolean(streams(out, 'audio')[1].disposition?.default), false);
    assert.equal(streams(out, 'subtitle').at(-1).tags?.language, 'zho');
    console.log('Scenario 21 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioWorkbenchEfficiency(browser) {
  console.log('E2E scenario 22: bulk include/reset controls + grouped mux plan');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-with-attachments.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#scanTracksBtn').click();
    await waitForStatus(page, '轨道扫描完成：');

    await page.locator('#keepAllAttachments').click();
    assert.equal(await page.locator('input[data-attachment-action="include"]:checked').count(), 2);

    const firstAttachment = page.locator('.attachment-item').first();
    await firstAttachment.locator('input[data-attachment-field="filename"]').fill('renamed.ttf');
    await firstAttachment.locator('input[data-attachment-field="mimetype"]').fill('application/x-test');
    await page.locator('#resetAttachmentMetadata').click();
    assert.equal(await firstAttachment.locator('input[data-attachment-field="filename"]').inputValue(), 'fixture-original.ttf');
    assert.equal(await firstAttachment.locator('input[data-attachment-field="mimetype"]').inputValue(), 'application/x-truetype-font');

    await page.locator('#dropAllAudio').click();
    assert.equal(await page.locator('.track-row.track-audio input[data-track-action="include"]:checked').count(), 0);
    await page.locator('#keepAllAudio').click();
    assert.equal(await page.locator('.track-row.track-audio input[data-track-action="include"]:checked').count(), 1);

    await page.locator('.track-row.track-audio input[data-track-field="language"]').fill('eng');
    await page.locator('.track-row.track-audio input[data-track-field="title"]').fill('Changed');
    await page.locator('#resetAudioMetadata').click();
    assert.equal(await page.locator('.track-row.track-audio input[data-track-field="language"]').inputValue(), 'und');
    assert.equal(await page.locator('.track-row.track-audio input[data-track-field="title"]').inputValue(), '');

    const groupNames = await page.locator('.plan-group-head strong').allTextContents();
    assert.ok(groupNames.includes('容器'));
    assert.ok(groupNames.includes('视频'));
    assert.ok(groupNames.includes('音频'));
    assert.ok(groupNames.includes('字幕'));
    assert.ok(groupNames.includes('附件'));

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'workbench-efficiency.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    assert.equal(streams(out, 'audio').length, 1);
    assert.equal(streams(out, 'attachment').length, 3);
    console.log('Scenario 22 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioAv1(browser) {
  const av1Path = path.join(root, 'av1.mp4');
  try {
    await fs.access(av1Path);
  } catch {
    console.log('E2E scenario 6: AV1 skipped (fixture unavailable)');
    return;
  }

  console.log('E2E scenario 6: AV1 container probe + mux');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', av1Path);
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'av1.mkv');
    const reportPath = path.join(outDir, 'av1.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const source = probe(av1Path);
    const out = probe(output);
    assert.deepEqual(
      streams(out, 'video').map((stream) => stream.codec_name),
      streams(source, 'video').map((stream) => stream.codec_name),
    );

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 6 PASS');
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await scenarioMultiTrack(browser);
  await scenarioSelectiveAttachments(browser);
  await scenarioOriginalTracks(browser);
  await scenarioUtf16(browser);
  await scenarioSameNameFonts(browser);
  await scenarioAv1(browser);
  await scenarioInputSwitchReset(browser);
  await scenarioDefaultWarnings(browser);
  await scenarioInvalidAudioRecovery(browser);
  await scenarioCancelAndRestart(browser);
  await scenarioSequentialTasks(browser);
  await scenarioBrokenSubtitle(browser);
  await scenarioBrokenFonts(browser);
  await scenarioVideoOnly(browser);
  await scenarioPlainMkvScan(browser);
  await scenarioTrackReorder(browser);
  await scenarioCancelScan(browser);
  await scenarioUnicodeNamesAndLongTitle(browser);
  await scenarioTenSequential(browser);
  await scenarioFontCollectionAndAdvancedFlags(browser);
  await scenarioBulkTrackMetadata(browser);
  await scenarioWorkbenchEfficiency(browser);
  console.log('All browser E2E scenarios PASS');
} finally {
  await browser.close();
}
