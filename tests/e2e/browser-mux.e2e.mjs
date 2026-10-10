import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { verifiedCompatibilityEvidence } from '../../src/compatibility-evidence.js';

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
        if (/^失败：|没有生成可保存的成品|当前任务没有完成|封装没有完成|轨道扫描失败|无法可靠读取|没有可用音频轨|字体文件无法被可靠解析/.test(value)) {
          throw new Error(value);
        }
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

    await page.locator('select[data-new-audio-field="language"][data-index="0"]').selectOption('eng');
    await page.locator('input[data-new-audio-field="title"][data-index="0"]').fill('External FLAC');

    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('简体中文');
    await page.locator('select[data-new-sub-field="language"][data-index="1"]').selectOption('eng');
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
    assert.equal(report.application.version, '1.2.0');
    assert.equal(report.compatibility?.state, 'DIRECT_COPY');
    assert.equal(report.compatibility?.execution?.muxSucceeded, true);
    assert.equal(report.compatibility?.playback?.verified, false);
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

    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    assert.equal(await page.locator('.container-item-kind', { hasText: '章节' }).count(), 2);
    assert.equal(await page.locator('.container-item-kind', { hasText: '元数据' }).count(), 1);

    const attachmentRows = page.locator('.attachment-item');
    assert.equal(await attachmentRows.count(), 2, 'fixture should expose two original attachments');

    const sourceFontRow = page.locator('.attachment-item', { hasText: 'fixture-original.ttf' });
    await sourceFontRow.locator('input[data-attachment-action="include"]').uncheck();

    const notesRow = page.locator('.attachment-item', { hasText: 'notes.txt' });
    await notesRow.locator('input[data-attachment-action="include"]').check();
    await notesRow.locator('input[data-attachment-field="filename"]').fill('notes-renamed.txt');
    await notesRow.locator('input[data-attachment-field="mimetype"]').fill('text/x-notes');

    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
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

    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    assert.match(await page.locator('#containerChangeSummary').textContent(), /无删除/);

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

    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
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

    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
    await page.locator('select[data-new-sub-field="language"][data-index="1"]').selectOption('eng');

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
    await waitForStatus(page, '轨道扫描完成：');

    assert.equal(await page.locator('.track-row.track-audio').count(), 2);
    assert.equal(await page.locator('.track-row.track-subtitle').count(), 1);

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));

    assert.equal(await page.locator('.track-row').count(), 0);
    assert.match(await page.locator('#trackList').textContent(), /选择 MKV 后自动读取容器内容/);
    assert.equal(await page.locator('#attachmentList').textContent(), '');
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
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();

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
      return value.includes('外部音频') && (value.includes('换用') || value.includes('移除'));
    }, null, { timeout: 180_000 });

    const failedStatus = await page.locator('#status').textContent();
    assert.match(failedStatus, /外部音频/);
    assert.match(failedStatus, /换用|移除/);
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
    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
    await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill('First Task');
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const first = path.join(outDir, 'sequential-first.mkv');
    await saveDownload(page, '#downloadLink', first);

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'en.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('eng');
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
      return /^失败：|没有生成可保存的成品|当前任务没有完成|封装没有完成|字体文件无法被可靠解析/.test(value) ||
        value.startsWith('完成。');
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
  console.log('E2E scenario 13: broken and zero-byte fonts are blocked by content preflight without stale output');
  const { context, page } = await openApp(browser);

  try {
    for (const filename of ['broken.ttf', 'zero-byte.ttf']) {
      await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
      await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
      await page.setInputFiles('#fontInput', path.join(root, filename));

      await page.waitForFunction(() => {
        const name = document.querySelector('#fontName')?.textContent || '';
        const hint = document.querySelector('#fontModeHint')?.textContent || '';
        const button = document.querySelector('#muxBtn');
        return name.includes('字体内容无法识别') &&
          hint.includes('存在无法解析的字体文件') &&
          Boolean(button?.disabled);
      });

      assert.equal(await page.locator('#muxBtn').isDisabled(), true);
      assert.match(await page.locator('#fontName').textContent(), /字体内容无法识别/);
      assert.match(await page.locator('#fontModeHint').textContent(), /存在无法解析的字体文件/);
      assert.equal(await page.locator('#downloadLink').isVisible(), false);
      assert.equal(await page.locator('#reportLink').isVisible(), false);
    }

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.waitForFunction(() => !document.querySelector('#muxBtn')?.disabled, null, { timeout: 60_000 });
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
    await waitForStatus(page, '轨道扫描完成：');

    assert.equal(await page.locator('.track-row.track-audio').count(), 1);
    assert.equal(await page.locator('.track-row.track-subtitle').count(), 0);
    assert.equal(await page.locator('.attachment-item').count(), 0);

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
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();

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
    await page.waitForFunction(() => !document.querySelector('#cancelBtn')?.disabled, null, { timeout: 60_000 });
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
    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zho');
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

      // The previous iteration clears the old inputs after export. Await the
      // new subtitle identity and current task readiness before editing its
      // metadata; otherwise a stale track editor can be filled mid-refresh.
      const subtitleName = index % 2 === 0 ? 'zh.ass' : 'en.ass';
      await page.waitForFunction((expected) => {
        const file = document.querySelector('#subInput')?.files?.[0];
        const action = document.querySelector('#muxBtn');
        const titleField = document.querySelector(
          'input[data-new-sub-field="title"][data-index="0"]'
        );
        return file?.name === expected && action && !action.disabled &&
          titleField && !titleField.disabled;
      }, subtitleName, { timeout: 60_000 });

      const title = `Loop ${index + 1}`;
      await page.locator('input[data-new-sub-field="title"][data-index="0"]').fill(title);
      assert.equal(await page.locator('input[data-new-sub-field="title"][data-index="0"]').inputValue(), title);
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

    await page.locator('select[data-new-audio-field="language"][data-index="0"]').selectOption('eng');
    await page.locator('input[data-new-audio-field="title"][data-index="0"]').fill('Director Commentary');
    await page.locator('#newAudioList details.track-advanced summary').click();
    await page.locator('input[data-new-audio-field="original"][data-index="0"]').check();
    await page.locator('input[data-new-audio-field="commentary"][data-index="0"]').check();

    await page.locator('select[data-new-sub-field="language"][data-index="0"]').selectOption('zh-Hans');
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
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();

    await page.locator('.track-row.track-subtitle input[data-track-action="include"]').check();
    await page.locator('#trackBulkTools > summary').click();
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
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    await page.locator('#trackBulkTools > summary').click();

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

async function scenarioAv1PreviewFrame(browser) {
  const av1Path = path.join(root, 'av1.mp4');
  try {
    await fs.access(av1Path);
  } catch {
    console.log('E2E scenario 25: AV1 preview skipped (fixture unavailable)');
    return;
  }

  console.log('E2E scenario 25: AV1 fixed preview frame');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', av1Path);
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#previewRefreshBtn').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#previewStatus')?.textContent || '';
      if (status.startsWith('无法生成预览帧：')) throw new Error(status);
      const image = document.querySelector('#previewImage');
      return status.startsWith('预览帧：') && image?.naturalWidth > 0 && image?.naturalHeight > 0;
    }, null, { timeout: 180_000 });

    const status = await page.locator('#previewStatus').textContent();
    assert.match(status, /FFmpeg\/libass/);
    console.log('Scenario 25 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioPreviewTimeClamp(browser) {
  console.log('E2E scenario 24: preview time clamps to source duration');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'late-preview.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#previewRefreshBtn').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#previewStatus')?.textContent || '';
      if (status.startsWith('无法生成预览帧：')) throw new Error(status);
      const image = document.querySelector('#previewImage');
      return status.startsWith('预览帧：') && image?.naturalWidth > 0 && image?.naturalHeight > 0;
    }, null, { timeout: 180_000 });

    const status = await page.locator('#previewStatus').textContent();
    assert.match(status, /1\.9\d s|2\.0\d s/);
    console.log('Scenario 24 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioPreviewFrame(browser) {
  console.log('E2E scenario 23: FFmpeg/libass fixed preview frame from MKV source');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-with-attachments.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));

    await page.locator('#previewRefreshBtn').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#previewStatus')?.textContent || '';
      const image = document.querySelector('#previewImage');
      if (status.startsWith('无法生成预览帧：')) throw new Error(status);
      return status.startsWith('预览帧：') &&
        image?.src?.startsWith('blob:') &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0;
    }, null, { timeout: 180_000 });

    const status = await page.locator('#previewStatus').textContent();
    assert.match(status, /FFmpeg\/libass/);
    assert.equal(await page.locator('#previewEmpty').evaluate((el) => el.classList.contains('hidden')), true);
    console.log('Scenario 23 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioAdditionalSubtitleFormats(browser) {
  console.log('E2E scenario 26: SSA + SRT + WebVTT without uploaded fonts');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', [
      path.join(root, 'sample.ssa'),
      path.join(root, 'sample.srt'),
      path.join(root, 'sample.vtt'),
    ]);

    await page.waitForFunction(() => {
      const button = document.querySelector('#muxBtn');
      const labels = Array.from(document.querySelectorAll('#newSubtitleList .track-meta'))
        .map((item) => item.textContent || '');
      return button && !button.disabled && labels.length === 3;
    });
    assert.equal(await page.locator('#muxBtn').isDisabled(), false, 'fonts must be optional');
    const formatLabels = await page.locator('#newSubtitleList .track-meta').allTextContents();
    assert.ok(formatLabels.some((value) => value.includes('SSA')));
    assert.ok(formatLabels.some((value) => value.includes('SRT')));
    assert.ok(formatLabels.some((value) => value.includes('WebVTT')));

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'additional-formats.mkv');
    const reportPath = path.join(outDir, 'additional-formats.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const subtitles = streams(probe(output), 'subtitle');
    assert.deepEqual(subtitles.map((stream) => stream.codec_name), ['ass', 'subrip', 'subrip']);

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.deepEqual(report.subtitle.tracks.map((track) => track.format), ['SSA', 'SRT', 'WebVTT']);
    assert.equal(report.compatibility?.state, 'CONVERSION_REQUIRED');
    assert.equal(report.compatibility?.mediaPolicy?.silentTranscode, false);
    assert.deepEqual(report.compatibility?.mediaPolicy?.subtitleConversions, [{
      code: 'webvtt-to-subrip',
      from: 'webvtt',
      to: 'subrip',
      builtIn: true,
    }]);
    assert.equal(report.compatibility?.execution?.muxSucceeded, true);
    assert.equal(report.fonts.selectedCount, 0);
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 26 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioFontSubsetting(browser) {
  console.log('E2E scenario 27: optional HarfBuzz font subsetting');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#fontSubsetEnabled').check();

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'font-subset.mkv');
    const reportPath = path.join(outDir, 'font-subset.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const attachments = streams(probe(output), 'attachment');
    assert.equal(attachments.length, 1);
    assert.match(attachments[0].tags?.filename || '', /\.subset\.ttf$/i);

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    const font = report.fonts.attachments[0];
    assert.equal(font.subset?.enabled, true);
    assert.equal(font.subset?.applied, true);
    assert.ok(Number(font.subset?.subsetSize) < Number(font.subset?.originalSize));
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    console.log('Scenario 27 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchAmbiguousSafety(browser) {
  console.log('E2E: ambiguous episode-only batch subtitles must not start a mux');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    const videoBuffer = await fs.readFile(path.join(root, 'base.mp4'));
    const subtitleBuffer = await fs.readFile(path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.setInputFiles('#batchVideoInput', [
      { name: 'Series A S01E01.mp4', mimeType: 'video/mp4', buffer: videoBuffer },
      { name: 'Series B S01E01.mp4', mimeType: 'video/mp4', buffer: videoBuffer },
    ]);
    await page.setInputFiles('#batchSubtitleInput', {
      name: 'S01E01.zh-Hans.ass', mimeType: 'text/plain', buffer: subtitleBuffer,
    });

    await page.waitForFunction(() =>
      (document.querySelector('#batchPlan')?.textContent || '').includes('字幕匹配多个视频')
    );
    const plan = await page.locator('#batchPlan').textContent();
    assert.match(plan, /S01E01\.zh-Hans\.ass/);
    assert.match(plan, /Series A S01E01\.mp4/);
    assert.match(plan, /Series B S01E01\.mp4/);
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);
    assert.equal(await page.locator('#batchResults .new-track-row').count(), 0);

    await page.setInputFiles('#batchSubtitleInput', {
      name: 'Series B S01E01.zh-Hans.ass', mimeType: 'text/plain', buffer: subtitleBuffer,
    });
    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return text.includes('Series B S01E01.zh-Hans.ass') &&
        !text.includes('字幕匹配多个视频') && start && !start.disabled;
    });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), false);
    console.log('Batch ambiguous pairing safety PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchDirectoryConflict(browser) {
  console.log('E2E: existing directory artifacts block batch before any mux starts');
  const { context, page } = await openApp(browser);
  try {
    await page.evaluate(() => {
      let selected = new Set(['Batch S01E01.mux-report.json']);
      window.__setBatchDirectoryContents = (names) => { selected = new Set(names); };
      window.showDirectoryPicker = async () => ({
        name: 'fixture-output',
        requestPermission: async () => 'granted',
        entries: async function* () {
          for (const name of selected) yield [name, { kind: 'file' }];
        },
        getFileHandle: async (filename, options = {}) => {
          if (selected.has(filename)) return { kind: 'file' };
          if (options.create) {
            selected.add(filename);
            return { kind: 'file' };
          }
          throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
        },
      });
    });
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.locator('#batchOutputDirBtn').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      return text.includes('已有 1 个同名文件') && text.includes('Batch S01E01.mux-report.json');
    });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);
    assert.equal(await page.locator('#batchResults .new-track-row').count(), 0);

    await page.evaluate(() => window.__setBatchDirectoryContents([]));
    await page.locator('#batchOutputDirBtn').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return text.includes('Batch S01E01.mp4') &&
        !text.includes('已有 1 个同名文件') && start && !start.disabled;
    });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), false);
    console.log('Batch existing-directory conflict safety PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchDirectorySaveFallback(browser) {
  console.log('E2E: completed mux remains downloadable when optional directory save fails');
  const { context, page } = await openApp(browser);
  try {
    await page.evaluate(() => {
      window.showDirectoryPicker = async () => ({
        name: 'simulated-unwritable-dir',
        requestPermission: async () => 'granted',
        entries: async function* () {},
        getFileHandle: async (_name, options = {}) => {
          if (!options.create) {
            throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
          }
          return {
            createWritable: async () => ({
              write: async () => { throw new Error('simulated quota exceeded'); },
              close: async () => {},
              abort: async () => {},
            }),
          };
        },
      });
    });

    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.locator('#batchOutputDirBtn').click();
    await page.waitForFunction(() => {
      const start = document.querySelector('#batchStartBtn');
      const text = document.querySelector('#batchPlan')?.textContent || '';
      return text.includes('Batch S01E01.mp4') && start && !start.disabled;
    });
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#batchStatus')?.textContent || '';
      return status.startsWith('批量完成：') || status.startsWith('批量已取消：');
    }, null, { timeout: 360_000 });

    const status = await page.locator('#batchStatus').textContent();
    assert.match(status, /成功 1，失败 0/);
    assert.match(status, /其中 1 项未完整写入目录/);
    assert.match(await page.locator('#batchResults').textContent(), /simulated quota exceeded/);
    assert.equal(await page.locator('#batchResults a.download').count(), 1);
    assert.equal(await page.locator('#batchResults a.report-download').count(), 1);
    console.log('Batch directory save fallback PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchQueue(browser) {
  console.log('E2E scenario 28: two-job batch queue with filename pairing');
  const { context, page } = await openApp(browser);

  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', [
      path.join(root, 'Batch S01E01.mp4'),
      path.join(root, 'Batch S01E02.mp4'),
    ]);
    await page.setInputFiles('#batchSubtitleInput', [
      path.join(root, 'Batch S01E01.zh-Hans.ass'),
      path.join(root, 'Batch S01E02.en.srt'),
    ]);

    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return (
        plan.includes('Batch S01E01.mp4') &&
        plan.includes('Batch S01E02.mp4') &&
        plan.includes('1 ASS') &&
        plan.includes('1 SRT') &&
        start &&
        !start.disabled
      );
    });

    const plan = await page.locator('#batchPlan').textContent();
    assert.match(plan, /Batch S01E01\.mp4/);
    assert.match(plan, /Batch S01E02\.mp4/);
    assert.match(plan, /1 ASS/);
    assert.match(plan, /1 SRT/);
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), false);

    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#batchStatus')?.textContent || '';
      return value.startsWith('批量完成：') || value.startsWith('批量已取消：');
    }, null, { timeout: 360_000 });

    const batchStatus = await page.locator('#batchStatus').textContent();
    assert.match(batchStatus, /成功 2，失败 0/);
    const resultRows = page.locator('#batchResults .new-track-row');
    assert.equal(await resultRows.count(), 2);
    assert.equal(await page.locator('#batchResults a.download').count(), 2);
    assert.equal(await page.locator('#batchResults a.report-download').count(), 2);
    console.log('Scenario 28 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioAutoLanguageInference(browser) {
  console.log('E2E scenario 29: subtitle filename language inference');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));

    assert.equal(
      await page.locator('select[data-new-sub-field="language"][data-index="0"]').inputValue(),
      'zh-Hans',
    );
    assert.match(
      await page.locator('input[data-new-sub-field="title"][data-index="0"]').inputValue(),
      /简体中文/,
    );
    console.log('Scenario 29 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioPreserveAllAppend(browser) {
  console.log('E2E scenario 30: preserve-all source MKV and append new subtitle');
  const { context, page } = await openApp(browser);

  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));

    assert.equal(await page.locator('#appendPreserveAll').isChecked(), true);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'preserve-all-append.mkv');
    await saveDownload(page, '#downloadLink', output);
    const out = probe(output);
    const audio = streams(out, 'audio');
    const subtitles = streams(out, 'subtitle');

    assert.deepEqual(audio.map((stream) => stream.codec_name), ['aac', 'opus']);
    assert.equal(subtitles.length, 2);
    assert.equal(subtitles[0].tags?.title, 'Original Signs');
    assert.equal(Boolean(subtitles[0].disposition?.forced), true);
    assert.equal(subtitles[1].codec_name, 'ass');
    console.log('Scenario 30 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchGroupSubset(browser) {
  console.log('E2E scenario 31: batch group font subset reused across jobs');
  const { context, page } = await openApp(browser);

  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', [
      path.join(root, 'Batch S01E01.mp4'),
      path.join(root, 'Batch S01E02.mp4'),
    ]);
    await page.setInputFiles('#batchSubtitleInput', [
      path.join(root, 'Batch S01E01.zh-Hans.ass'),
      path.join(root, 'Batch S01E02.en.srt'),
    ]);
    const batchFontBuffer = await fs.readFile(path.join(root, 'DejaVuSans.ttf'));
    await page.setInputFiles('#batchFontInput', {
      name: 'BatchSharedFont.mmmmmm',
      mimeType: 'application/octet-stream',
      buffer: batchFontBuffer,
    });
    await page.locator('#batchFontSubsetEnabled').check();
    await page.locator('#batchSubsetScope').selectOption('group');

    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return text.includes('1 个字体扩展名与实际内容不一致') && start && !start.disabled;
    });

    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#batchStatus')?.textContent || '';
      return value.startsWith('批量完成：');
    }, null, { timeout: 360_000 });

    assert.match(await page.locator('#batchStatus').textContent(), /成功 2，失败 0/);
    const first = path.join(outDir, 'batch-group-subset-first.mkv');
    const firstLink = page.locator('#batchResults a.download').first();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      firstLink.click(),
    ]);
    await download.saveAs(first);

    const attachments = streams(probe(first), 'attachment');
    assert.equal(attachments.length, 1);
    assert.match(attachments[0].tags?.filename || '', /\.subset\.ttf$/i);
    console.log('Scenario 31 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioResponsiveObjectEditor(browser) {
  console.log('E2E scenario 32: responsive frame and object editor preserve live metadata');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#audioInput', path.join(root, 'external.flac'));
    await page.setInputFiles('#fontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('[data-editor-filter="subtitle"]').click();
    await page.locator('[data-new-sub-field="title"]').fill('字幕属性切换后保留');
    assert.equal(await page.locator('#newAudioList').isVisible(), false);
    await page.locator('[data-editor-filter="audio"]').click();
    await page.locator('[data-new-audio-field="title"]').fill('External audio');
    await page.locator('[data-editor-filter="font"]').click();
    assert.equal(await page.locator('#fontMode').isVisible(), true);
    await page.locator('[data-editor-filter="source"]').click();
    assert.equal(await page.locator('#appendPreserveAll').isVisible(), true);
    assert.equal(await page.locator('#fontMode').isVisible(), false);
    await page.setInputFiles('#videoInput', path.join(root, 'source-with-attachments.mkv'));
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('[data-editor-filter="source"]').press('Home');
    assert.equal(await page.locator('[data-editor-filter="all"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-new-sub-field="title"]').inputValue(), '字幕属性切换后保留');
    assert.equal(await page.locator('[data-new-audio-field="title"]').inputValue(), 'External audio');
    assert.equal(await page.locator('.batch-drawer').getAttribute('open'), null);
    await page.locator('.batch-drawer > summary').click();
    for (const selector of ['#batchVideoInput', '#batchSubtitleFolderInput', '#batchFontFolderInput', '#batchSubsetScope', '#batchOutputDirBtn']) {
      assert.equal(await page.locator(selector).isVisible(), true, selector);
    }
    // mobile two-mode editor and disclosure behavior
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('[data-editor-filter="all"]').isVisible(), true);
    assert.equal(await page.locator('[data-editor-filter="source"]').isVisible(), true);
    assert.equal(await page.locator('[data-editor-filter="subtitle"]').isVisible(), false);
    assert.equal(await page.locator('[data-editor-filter="audio"]').isVisible(), false);
    assert.equal(await page.locator('[data-editor-filter="font"]').isVisible(), false);
    assert.equal(await page.locator('#previewStage').isVisible(), false);
    await page.locator('#mobilePreviewToggle').click();
    assert.equal(await page.locator('#previewStage').isVisible(), true);
    const openPreviewRatio = await page.locator('#previewStage').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width / rect.height;
    });
    assert.ok(Math.abs(openPreviewRatio - 16 / 9) < .01, `mobile preview ratio: ${openPreviewRatio}`);
    assert.equal(await page.locator('#muxPlan').isVisible(), false);
    await page.locator('#mobilePlanToggle').click();
    assert.equal(await page.locator('#muxPlan').isVisible(), true);
    await page.locator('[data-editor-filter="source"]').click();
    assert.equal(await page.locator('#appendPreserveAll').isVisible(), true);
    assert.equal(await page.locator('#fontMode').isVisible(), false);
    await page.locator('[data-editor-filter="all"]').click();
    assert.equal(await page.locator('#fontMode').isVisible(), true);
    assert.equal(await page.locator('#newAudioList').isVisible(), true);
    assert.equal(await page.locator('#newSubtitleList').isVisible(), true);
    // mobile all mode excludes source structure; source remains its own mode
    assert.equal(await page.locator('#appendPreserveAll').isVisible(), false);
    const mobileIntake = await page.locator('.unified-intake').boundingBox();
    assert.ok(mobileIntake && mobileIntake.width > 250, 'unified intake should remain usable on phones');
    assert.equal(await page.locator('.legacy-source-picker').isVisible(), false);

    for (const width of [1920, 1440, 1360, 1280, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });

      if (width <= 600) {
        await page.waitForFunction(() => {
          const card = document.querySelector('.subtitle-preview-card');
          return card?.dataset.mobileDisclosureInitialized === 'true';
        });
        if (await page.locator('#mobilePreviewToggle').getAttribute('aria-expanded') !== 'true') {
          await page.locator('#mobilePreviewToggle').click();
        }
      }

      await page.waitForFunction(() => {
        const rect = document.querySelector('#previewStage')?.getBoundingClientRect();
        return Boolean(rect && rect.width > 0 && rect.height > 0);
      });

      const layout = await page.evaluate(() => {
        const rect = document.querySelector('#previewStage').getBoundingClientRect();
        const editor = document.querySelector('.editor-grid').getBoundingClientRect();
        return { scroll: document.documentElement.scrollWidth, viewport: innerWidth, ratio: rect.width / rect.height, previewTop: rect.top, editorBottom: editor.bottom };
      });
      assert.ok(layout.scroll <= layout.viewport, `horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
      assert.ok(Math.abs(layout.ratio - 16 / 9) < .01, `preview ratio at ${width}: ${layout.ratio}`);
      if (width >= 1440) assert.ok(layout.editorBottom <= layout.previewTop + 2,
        `desktop should place property editing above contextual preview at ${width}: ${JSON.stringify(layout)}`);
    }
    console.log('Scenario 32 PASS');
  } finally {
    await context.close();
  }
}


async function scenarioContentFirstMkvIntake(browser) {
  console.log('E2E: unified content-first file inventory routes mixed assets to existing mux engine');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#unifiedAssetInput', [
      path.join(root, 'base.mp4'),
      path.join(root, 'zh.ass'),
      path.join(root, 'external.flac'),
      path.join(root, 'DejaVuSans.ttf'),
    ]);
    await page.waitForFunction(() => {
      const entries = document.querySelectorAll('.asset-entry');
      const button = document.querySelector('#muxBtn');
      return entries.length === 4 && button && !button.disabled;
    }, null, { timeout: 120_000 });
    const inventory = await page.locator('#assetInventory').textContent();
    assert.match(inventory, /媒体容器/);
    assert.match(inventory, /字幕/);
    assert.match(inventory, /独立音频/);
    assert.match(inventory, /字体/);
    assert.deepEqual(await page.evaluate(() => ({
      source: [...document.querySelector('#videoInput').files].map(f => f.name),
      subtitles: [...document.querySelector('#subInput').files].map(f => f.name),
      audio: [...document.querySelector('#audioInput').files].map(f => f.name),
      fonts: [...document.querySelector('#fontInput').files].map(f => f.name),
    })), {
      source: ['base.mp4'], subtitles: ['zh.ass'], audio: ['external.flac'],
      fonts: ['DejaVuSans.ttf'],
    });
    assert.equal(await page.locator('.legacy-source-picker').isVisible(), false);

    // Unrecognized content stays visible, blocks execution and can be removed.
    await page.evaluate(() => {
      const file = new File([new Uint8Array([0, 2, 4, 6])], 'mystery.bin');
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector('#unifiedAssetInput');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.asset-entry').length === 5);
    assert.match(await page.locator('#assetImportStatus').textContent(), /1 项未识别/);
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);
    await page.locator('.asset-entry[data-kind="unknown"] [data-asset-remove]').click();
    await page.waitForFunction(() => {
      const btn = document.querySelector('#muxBtn');
      return document.querySelectorAll('.asset-entry').length === 4 && btn && !btn.disabled;
    });

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'unified-intake.mkv');
    await saveDownload(page, '#downloadLink', output);
    const streamsOut = probe(output).streams;
    assert.equal(streamsOut.filter(s => s.codec_type === 'video').length, 1);
    assert.equal(streamsOut.filter(s => s.codec_type === 'subtitle').length, 1);
    assert.equal(streamsOut.filter(s => s.codec_type === 'attachment').length, 1);
    assert.equal(streamsOut.filter(s => s.codec_type === 'audio').length, 2);
    console.log('Unified content-first intake mux PASS');
  } finally {
    await context.close();
  }
}

async function scenarioContentFirstSourceAmbiguity(browser) {
  console.log('E2E: multiple detected containers require source choice; source-only MKV remux is valid');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#unifiedAssetInput', [
      path.join(root, 'base.mp4'),
      path.join(root, 'source-with-attachments.mkv'),
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.asset-entry[data-kind="container"]').length === 2);
    assert.match(await page.locator('#assetImportStatus').textContent(), /请选择主源/);
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);

    await page.locator('.asset-entry[data-kind="container"]').filter({ hasText: 'source-with-attachments.mkv' })
      .locator('[data-asset-source]').check();
    await page.waitForFunction(() => {
      const source = document.querySelector('#videoInput').files[0];
      const btn = document.querySelector('#muxBtn');
      return source?.name === 'source-with-attachments.mkv' && btn && !btn.disabled;
    }, null, { timeout: 120_000 });
    assert.equal(await page.locator('#subInput').evaluate(el => el.files.length), 0);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'container-only-remux.mkv');
    await saveDownload(page, '#downloadLink', output);
    const result = probe(output);
    assert.ok(result.streams.some(s => s.codec_type === 'video'));
    assert.ok(result.streams.some(s => s.codec_type === 'audio'));
    console.log('Source ambiguity and MKV-only remux PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnifiedContainerTreeEditing(browser) {
  console.log('E2E: MKV container tree edits live original audio, subtitle and attachment state');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#unifiedAssetInput', path.join(root, 'source-multitrack.mkv'));
    await waitForStatus(page, '轨道扫描完成：');
    const tree = page.locator('.asset-container-tree');
    await tree.waitFor({ state: 'visible' });
    assert.equal(await tree.getAttribute('open'), '');
    assert.equal(await tree.locator('[data-tree-group="video"] .asset-tree-row').count(), 1);
    assert.equal(await tree.locator('[data-tree-group="audio"] .asset-tree-row').count(), 2);
    assert.equal(await tree.locator('[data-tree-group="subtitle"] .asset-tree-row').count(), 1);
    assert.equal(await page.locator('#assetInventory [data-tree-preserve-all]').isChecked(), true);

    // Exposing selective edit mode must use the SAME append flag as old editor.
    await tree.locator('[data-tree-preserve-all]').uncheck();
    assert.equal(await page.locator('#appendPreserveAll').isChecked(), false);
    const audio = tree.locator('[data-tree-group="audio"] .asset-tree-row');
    const inspector = page.locator('#assetInspectorHost .asset-tree-inspector');
    assert.equal(await inspector.isVisible(), true, 'active track inspector belongs to central edit workspace');
    assert.equal(await tree.locator('.asset-tree-inspector').count(), 0, 'source inventory does not own the detailed editor');
    assert.equal(await tree.locator('[data-tree-group="audio"] [data-tree-track-field]').count(), 0,
      'compact list must not repeat one full editor per track');
    await audio.nth(0).locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-track-include]').uncheck();
    assert.equal(await page.locator('.track-row.track-audio').nth(0)
      .locator('input[data-track-action="include"]').isChecked(), false);
    await audio.nth(1).locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-track-field="title"]').fill('Tree Edited Opus');
    assert.equal(await page.locator('.track-row.track-audio').nth(1)
      .locator('input[data-track-field="title"]').inputValue(), 'Tree Edited Opus');
    const subtitle = tree.locator('[data-tree-group="subtitle"] .asset-tree-row');
    await subtitle.locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-track-flag="forced"]').check();
    assert.equal(await page.locator('.track-row.track-subtitle')
      .locator('input[data-track-action="forced"]').isChecked(), true);
    assert.match(await page.locator('#muxPlan').textContent(), /Tree Edited Opus/);
    assert.match(await page.locator('#containerChangeSummary').textContent(), /删除/);
    assert.equal(await tree.getAttribute('open'), '', 'container hierarchy must remain expanded after edits');

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'container-tree-audio-edit.mkv');
    await saveDownload(page, '#downloadLink', output);
    const result = probe(output);
    const audios = streams(result, 'audio');
    assert.equal(audios.length, 1);
    assert.equal(audios[0].tags?.title, 'Tree Edited Opus');
    assert.equal(streams(result, 'subtitle')[0].disposition?.forced, 1);

    // Exporting must NOT clear the unified inventory or reset live trackState.
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files[0]?.name), 'source-multitrack.mkv');
    assert.equal(await tree.isVisible(), true);
    await audio.nth(1).locator('[data-tree-select]').click();
    assert.equal(await inspector.locator('[data-tree-track-field="title"]').inputValue(), 'Tree Edited Opus');

    await page.setViewportSize({ width: 390, height: 844 });
    // Responsive projection may settle after the viewport API resolves.
    await page.waitForFunction(() => {
      const tree = document.querySelector('.asset-container-tree');
      const rect = tree?.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0 &&
        document.documentElement.scrollWidth <= innerWidth);
    }, null, { timeout: 30_000 });
    assert.equal(await tree.isVisible(), true);
    assert.equal(await tree.getAttribute('open'), '');
    assert.equal(await page.locator('#muxBtn').isDisabled(), false);
    console.log('MKV container-tree source track editing and post-export retention PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnifiedContainerOrderingAndAdvancedFlags(browser) {
  console.log('E2E: source container tree reorders real audio streams and writes advanced flags');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#unifiedAssetInput', path.join(root, 'source-multitrack.mkv'));
    await waitForStatus(page, '轨道扫描完成：');

    const tree = page.locator('.asset-container-tree');
    await tree.waitFor({ state: 'visible' });
    assert.match(await page.locator('.asset-entry[data-kind="container"] .asset-entry-type').textContent(),
      /内部结构已扫描/, 'file identity label must reflect the completed actual source probe');
    await tree.locator('[data-tree-preserve-all]').uncheck();
    const audioRows = tree.locator('[data-tree-group="audio"] .asset-tree-row');
    assert.equal(await audioRows.count(), 2);
    const inspector = page.locator('#assetInspectorHost .asset-tree-inspector');
    await audioRows.nth(0).locator('[data-tree-select]').click();
    assert.equal(await inspector.locator('[data-tree-track-move="-1"]').isDisabled(), true);
    await inspector.locator('[data-tree-track-field="title"]').fill('First tree audio');
    await audioRows.nth(1).locator('[data-tree-select]').click();
    assert.equal(await inspector.locator('[data-tree-track-move="1"]').isDisabled(), true);
    await inspector.locator('[data-tree-track-field="title"]').fill('Second tree audio');

    // The second included source audio must move above the first, not just
    // visually change position without affecting the mux output map.
    await inspector.locator('[data-tree-track-move="-1"]').click();
    assert.deepEqual(await audioRows.locator('.asset-tree-index-name').allTextContents(),
      ['Second tree audio', 'First tree audio']);
    assert.match(await page.locator('#containerChangeSummary').textContent(), /修改/);

    const first = inspector;
    const advanced = inspector.locator('[data-tree-advanced]');
    await advanced.locator('summary').click();
    await advanced.locator('[data-tree-track-flag="original"]').check();
    assert.equal(await advanced.getAttribute('open'), '');
    await advanced.locator('[data-tree-track-flag="commentary"]').check();
    assert.equal(await advanced.getAttribute('open'), '');
    const editedSourceIndex = await first.locator('[data-tree-track-flag="original"]').getAttribute('data-tree-track-index');
    const oldEditor = page.locator(`.track-row.track-audio input[data-track-action="original"][data-track-index="${editedSourceIndex}"]`);
    assert.equal(await oldEditor.isChecked(), true, 'legacy editor and asset tree share the same track state');

    // Mutations in the legacy source editor must also project back to the
    // imported container tree (without remounting its domain state).
    const oldCommentary = page.locator(
      `.track-row.track-audio input[data-track-action="commentary"][data-track-index="${editedSourceIndex}"]`
    );
    await tree.locator('[data-tree-legacy-tools]').click();
    const legacyAudioRow = page.locator(
      `.track-row.track-audio:has(input[data-track-action="commentary"][data-track-index="${editedSourceIndex}"])`
    );
    await legacyAudioRow.locator('details.track-advanced > summary').click();
    assert.equal(await oldCommentary.isChecked(), true);
    await oldCommentary.uncheck();
    assert.equal(await first.locator('[data-tree-track-flag="commentary"]').isChecked(), false);
    assert.equal(await advanced.getAttribute('open'), '');
    await first.locator('[data-tree-track-flag="commentary"]').check();

    const subtitle = tree.locator('[data-tree-group="subtitle"] .asset-tree-row');
    await subtitle.locator('[data-tree-select]').click();
    const subAdvanced = inspector.locator('[data-tree-advanced]');
    await subAdvanced.locator('summary').click();
    await subAdvanced.locator('[data-tree-track-flag="hearingImpaired"]').check();
    assert.equal(await subAdvanced.getAttribute('open'), '');

    // Capture real populated UI evidence for visual review, not just markup
    // or success-state screenshots. Generated fixtures contain no user data.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-desktop-1440.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-phone-390.png'),
      animations: 'disabled',
    });
    assert.equal(await tree.isVisible(), true);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'container-tree-advanced-order.mkv');
    await saveDownload(page, '#downloadLink', output);
    const result = probe(output);
    const audios = streams(result, 'audio');
    assert.equal(audios.length, 2);
    assert.deepEqual(audios.map(audio => audio.tags?.title),
      ['Second tree audio', 'First tree audio']);
    assert.equal(Boolean(audios[0].disposition?.original), true);
    assert.equal(Boolean(audios[0].disposition?.comment), true);
    assert.equal(Boolean(streams(result, 'subtitle')[0].disposition?.hearing_impaired), true);
    assert.equal(await tree.isVisible(), true, 'post-export tree remains available');
    console.log('MKV container-tree order and advanced flags PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnifiedContainerAttachmentEditing(browser) {
  console.log('E2E: source container hierarchy includes chapters, metadata and editable attachments');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#unifiedAssetInput', path.join(root, 'source-with-attachments.mkv'));
    await waitForStatus(page, '轨道扫描完成：');
    const tree = page.locator('.asset-container-tree');
    await tree.waitFor({ state: 'visible' });
    assert.equal(await tree.locator('[data-tree-group="chapter"] .asset-tree-row').count(), 2);
    assert.equal(await tree.locator('[data-tree-group="metadata"] .asset-tree-row').count(), 1);
    const attachmentRows = tree.locator('[data-tree-group="attachment"] .asset-tree-row');
    assert.equal(await attachmentRows.count(), 2);

    await tree.locator('[data-tree-preserve-all]').uncheck();
    const inspector = page.locator('#assetInspectorHost .asset-tree-inspector');
    const font = attachmentRows.filter({ hasText: 'fixture-original.ttf' });
    await font.locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-attachment-include]').uncheck();
    const notes = attachmentRows.filter({ hasText: 'notes.txt' });
    await notes.locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-attachment-field="filename"]').fill('tree-notes.txt');
    assert.equal(await page.locator('.attachment-item', { hasText: 'notes.txt' })
      .locator('input[data-attachment-field="filename"]').inputValue(), 'tree-notes.txt');

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'container-tree-attachments.mkv');
    await saveDownload(page, '#downloadLink', output);
    const result = probe(output);
    assert.equal(result.chapters?.length, 2);
    assert.deepEqual(streams(result, 'attachment').map(s => s.tags?.filename), ['tree-notes.txt']);
    console.log('MKV container-tree attachment editing PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnifiedWorkBenchZones(browser) {
  console.log('E2E: desktop three-zone layout, mobile stacked ownership, keyboard track selection');
  const { context, page } = await openApp(browser);
  try {
    await page.setViewportSize({ width: 1600, height: 960 });
    await page.setInputFiles('#unifiedAssetInput', path.join(root, 'source-multitrack.mkv'));
    await waitForStatus(page, '轨道扫描完成：');
    const regions = await page.evaluate(() => {
      const bounds = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, right: r.right, y: r.y, width: r.width, height: r.height };
      };
      return {
        source: bounds('.stage-input'),
        editor: bounds('.editor-column'),
        inspector: bounds('#assetInspectorHost'),
        output: bounds('.output-hub'),
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });
    assert.ok(regions.source.right < regions.editor.x + 8, 'source inventory must precede central edit region');
    assert.ok(regions.editor.right < regions.output.x + 8, 'output decisions must occupy an independent right rail');
    assert.ok(regions.inspector.x >= regions.editor.x && regions.inspector.right <= regions.editor.right + 2,
      'selected object inspector must live in the central editor');
    assert.ok(regions.scrollWidth <= regions.viewport, 'desktop must not overflow horizontally');
    assert.equal(await page.locator('.asset-tree-inspector').count(), 1,
      'one visible editor, not repeated per stream');
    assert.equal(await page.locator('#muxBtn').getByText('开始封装 MKV').isVisible(), true);

    const nav = page.locator('[data-tree-group="audio"] [data-tree-select]');
    await nav.nth(1).focus();
    await page.keyboard.press('Enter');
    assert.equal(await nav.nth(1).getAttribute('aria-pressed'), 'true');
    const selectedSourceIndex = await page.locator('#assetInspectorHost [data-tree-track-include]')
      .getAttribute('data-tree-track-include');
    assert.equal(selectedSourceIndex, '2', 'keyboard selection must target the correct source stream');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    const mobile = await page.evaluate(() => {
      const top = selector => document.querySelector(selector).getBoundingClientRect().top;
      const right = selector => document.querySelector(selector).getBoundingClientRect().right;
      return {
        sourceY: top('.stage-input'),
        inspectorY: top('#assetInspectorHost'),
        outputY: top('.output-hub'),
        inspectorRight: right('#assetInspectorHost'),
        viewport: innerWidth,
      };
    });
    assert.ok(mobile.sourceY < mobile.inspectorY && mobile.inspectorY < mobile.outputY,
      'mobile must flow source > selected property editor > output');
    assert.ok(mobile.inspectorRight <= mobile.viewport + 1, 'mobile inspector must not clip');
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-include]').isVisible(), true);
    console.log('Three-zone MKV workbench and keyboard selection PASS');
  } finally {
    await context.close();
  }
}

async function scenarioTabletDesktopUi(browser) {
  console.log('E2E scenario 33: tablet uses desktop-style workbench with collapsed preview');
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1180, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error('[browser:pageerror]', error));
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#muxBtn').waitFor();

    const media = await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      tablet: matchMedia('(min-width: 601px) and (max-width: 1359px) and (hover: none) and (pointer: coarse)').matches,
    }));
    assert.equal(media.coarse, true);
    assert.equal(media.tablet, true);

    assert.equal(await page.locator('.object-editor-nav').isVisible(), false);
    assert.equal(await page.locator('#previewStage').isVisible(), false);
    assert.equal(await page.locator('#mobilePreviewToggle').isVisible(), true);

    const collapsedLayout = await page.evaluate(() => {
      const editor = document.querySelector('.editor-column').getBoundingClientRect();
      const output = document.querySelector('.output-hub').getBoundingClientRect();
      const config = document.querySelector('.config-card').getBoundingClientRect();
      const source = document.querySelector('.source-track-card').getBoundingClientRect();
      const unifiedPickerWidth = document.querySelector('.unified-intake').getBoundingClientRect().width;
      return {
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
        editorRight: editor.right,
        outputLeft: output.left,
        outputWidth: output.width,
        configWidth: config.width,
        sourceWidth: source.width,
        unifiedPickerWidth,
      };
    });
    assert.ok(collapsedLayout.scroll <= collapsedLayout.viewport, `tablet horizontal overflow: ${JSON.stringify(collapsedLayout)}`);
    assert.ok(collapsedLayout.outputLeft >= collapsedLayout.editorRight - 1, `tablet output should sit beside editor: ${JSON.stringify(collapsedLayout)}`);
    assert.ok(collapsedLayout.outputWidth >= 270, `tablet output is too narrow: ${JSON.stringify(collapsedLayout)}`);
    assert.ok(collapsedLayout.configWidth >= 250 && collapsedLayout.sourceWidth >= 250, `tablet editor cards are too narrow: ${JSON.stringify(collapsedLayout)}`);
    assert.ok(collapsedLayout.unifiedPickerWidth > 500, `unified intake needs enough tablet width: ${collapsedLayout.unifiedPickerWidth}`);

    await page.locator('#mobilePreviewToggle').click();
    assert.equal(await page.locator('#previewStage').isVisible(), true);
    const ratio = await page.locator('#previewStage').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width / rect.height;
    });
    assert.ok(Math.abs(ratio - 16 / 9) < .01, `tablet preview ratio: ${ratio}`);
    console.log('Scenario 33 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioRenamedMediaIdentity(browser) {
  console.log('E2E scenario 34: renamed MP4 and AAC use actual content identity');
  const { context, page } = await openApp(browser);

  try {
    const videoBuffer = await fs.readFile(path.join(root, 'base.mp4'));
    const audioBuffer = await fs.readFile(path.join(root, 'external.aac'));
    const subtitleBuffer = await fs.readFile(path.join(root, 'zh.ass'));

    await page.setInputFiles('#videoInput', {
      name: 'base.mmmmmm',
      mimeType: 'application/octet-stream',
      buffer: videoBuffer,
    });
    await page.setInputFiles('#audioInput', {
      name: 'external.flac',
      mimeType: 'application/octet-stream',
      buffer: audioBuffer,
    });
    await page.setInputFiles('#subInput', {
      name: 'captions.mmmmm',
      mimeType: 'application/octet-stream',
      buffer: subtitleBuffer,
    });

    await page.waitForFunction(() => {
      const text = document.querySelector('#videoIdentity')?.textContent || '';
      return text.includes('ISO BMFF') && text.includes('扩展名 .mmmmmm');
    });

    await page.waitForFunction(() => {
      const text = document.querySelector('#newSubtitleList')?.textContent || '';
      return text.includes('ASS') && text.includes('扩展名 .mmmmm') && text.includes('已按实际内容识别');
    });

    assert.equal(await page.locator('#previewRefreshBtn').isEnabled(), true);
    assert.equal(await page.locator('#previewSubtitleSelect').isEnabled(), true);
    assert.match(await page.locator('#previewSubtitleSelect').textContent(), /captions\.mmmmm · ASS/);

    await page.locator('#previewRefreshBtn').click();
    await page.waitForFunction(() => {
      const image = document.querySelector('#previewImage');
      const status = document.querySelector('#previewStatus')?.textContent || '';
      return Boolean(image?.getAttribute('src')) || /预览已生成|完成/.test(status);
    }, null, { timeout: 180_000 });
    assert.equal(await page.locator('#previewImage').isVisible(), true);
    assert.match(await page.locator('#previewStatus').textContent(), /预览帧：captions\.mmmmm/);

    assert.equal(await page.locator('#muxBtn').isEnabled(), true);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'renamed-media-identity.mkv');
    const reportPath = path.join(outDir, 'renamed-media-identity.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const outputProbe = probe(output);
    assert.deepEqual(
      streams(outputProbe, 'audio').map((stream) => stream.codec_name),
      ['aac', 'aac'],
      'renamed raw AAC must be detected and stream-copied as AAC',
    );

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.externalAudio[0].codec, 'aac');

    const log = await page.locator('#log').textContent();
    assert.match(log, /扩展名 \.mmmmmm 与实际检测到的 ISO BMFF \/ MP4 不一致/);
    assert.match(log, /外部音频“external\.flac”.*实际检测到的 aac 不一致/);

    const mkvBuffer = await fs.readFile(path.join(root, 'source-with-attachments.mkv'));
    await page.setInputFiles('#videoInput', {
      name: 'actually-matroska.mp4',
      mimeType: 'video/mp4',
      buffer: mkvBuffer,
    });
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));

    await page.waitForFunction(() => {
      const text = document.querySelector('#videoIdentity')?.textContent || '';
      return text.includes('Matroska / MKV') && text.includes('扩展名 .mp4');
    });

    assert.equal(await page.locator('#scanTracksBtn').isEnabled(), true);
    assert.equal(await page.locator('#appendPreserveAll').isChecked(), true);
    await waitForStatus(page, '轨道扫描完成：');

    console.log('Scenario 34 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchResultUrlLifetime(browser) {
  console.log('E2E: batch download Blob URLs survive a completed run and expire on next run');
  const { context, page } = await openApp(browser);
  try {
    await page.evaluate(() => {
      const nativeRevoke = URL.revokeObjectURL.bind(URL);
      window.__revokedResultUrls = [];
      URL.revokeObjectURL = (url) => {
        window.__revokedResultUrls.push(url);
        nativeRevoke(url);
      };
    });

    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));

    async function waitReady() {
      await page.waitForFunction(() => {
        const start = document.querySelector('#batchStartBtn');
        const plan = document.querySelector('#batchPlan')?.textContent || '';
        return start && !start.disabled && plan.includes('Batch S01E01.mp4');
      }, null, { timeout: 60_000 });
    }

    async function waitCompleted() {
      await page.waitForFunction(() => {
        const value = document.querySelector('#batchStatus')?.textContent || '';
        return value.startsWith('批量完成：') || value.startsWith('批量已取消：');
      }, null, { timeout: 360_000 });
      assert.match(await page.locator('#batchStatus').textContent(), /成功 1，失败 0/);
    }

    await waitReady();
    await page.locator('#batchStartBtn').click();
    await waitCompleted();
    const firstLinks = await page.locator('#batchResults a').evaluateAll((els) =>
      els.map((el) => el.href)
    );
    assert.equal(firstLinks.length, 2, 'MKV and report downloads stay visible');
    assert.ok(firstLinks.every((href) => href.startsWith('blob:')));
    assert.deepEqual(
      await page.evaluate((links) =>
        links.filter((url) => window.__revokedResultUrls.includes(url)), firstLinks
      ),
      [],
      'do not revoke downloads while their result rows remain on screen',
    );

    await waitReady();
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction((links) =>
      links.every((url) => window.__revokedResultUrls.includes(url)), firstLinks,
      { timeout: 30_000 }
    );
    await waitCompleted();
    const secondLinks = await page.locator('#batchResults a').evaluateAll((els) =>
      els.map((el) => el.href)
    );
    assert.equal(secondLinks.length, 2);
    assert.deepEqual(
      await page.evaluate((links) =>
        links.filter((url) => window.__revokedResultUrls.includes(url)), secondLinks
      ),
      [],
      'new batch result links must remain usable',
    );
    console.log('Batch Blob download URL lifetime PASS');
  } finally {
    await context.close();
  }
}

async function scenarioBatchContentIdentity(browser) {
  console.log('E2E scenario 35: batch video identity follows content, not filename extension');
  const { context, page } = await openApp(browser);

  try {
    const mp4Buffer = await fs.readFile(path.join(root, 'base.mp4'));
    const mkvBuffer = await fs.readFile(path.join(root, 'source-with-attachments.mkv'));
    const zhBuffer = await fs.readFile(path.join(root, 'zh.ass'));
    const enBuffer = await fs.readFile(path.join(root, 'en.ass'));

    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', [
      {
        name: 'Renamed S01E01.mmmmmm',
        mimeType: 'application/octet-stream',
        buffer: mp4Buffer,
      },
      {
        name: 'Renamed S01E02.mp4',
        mimeType: 'video/mp4',
        buffer: mkvBuffer,
      },
    ]);
    await page.setInputFiles('#batchSubtitleInput', [
      {
        name: 'Renamed S01E01.zh-Hans.captiondata',
        mimeType: 'application/octet-stream',
        buffer: zhBuffer,
      },
      {
        name: 'Renamed S01E02.en.words',
        mimeType: 'application/octet-stream',
        buffer: enBuffer,
      },
    ]);

    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return (
        text.includes('Renamed S01E01.mmmmmm') &&
        text.includes('实际：ISO BMFF / MP4') &&
        text.includes('Renamed S01E02.mp4') &&
        text.includes('实际：Matroska / MKV') &&
        text.includes('2 个视频扩展名与实际内容不一致') &&
        text.includes('2 个字幕扩展名与实际内容不一致') &&
        start &&
        !start.disabled
      );
    });

    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#batchStatus')?.textContent || '';
      return value.startsWith('批量完成：');
    }, null, { timeout: 360_000 });

    assert.match(await page.locator('#batchStatus').textContent(), /成功 2，失败 0/);

    const links = page.locator('#batchResults a.download');
    assert.equal(await links.count(), 2);

    const first = path.join(outDir, 'batch-renamed-mp4.mkv');
    const [firstDownload] = await Promise.all([
      page.waitForEvent('download'),
      links.nth(0).click(),
    ]);
    await firstDownload.saveAs(first);

    const second = path.join(outDir, 'batch-renamed-matroska.mkv');
    const [secondDownload] = await Promise.all([
      page.waitForEvent('download'),
      links.nth(1).click(),
    ]);
    await secondDownload.saveAs(second);

    assert.equal(streams(probe(first), 'video').length, 1);
    const secondProbe = probe(second);
    assert.equal(streams(secondProbe, 'video').length, 1);
    assert.ok(
      streams(secondProbe, 'attachment').length >= 2,
      'renamed Matroska input should preserve original attachments in batch append mode',
    );

    console.log('Scenario 35 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioRenamedFontIdentity(browser) {
  console.log('E2E scenario 36: renamed font uses actual SFNT identity in preview, subset and mux');
  const { context, page } = await openApp(browser);

  try {
    const fontBuffer = await fs.readFile(path.join(root, 'DejaVuSans.ttf'));

    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.setInputFiles('#fontInput', {
      name: 'DejaVuSans.mmmmmm',
      mimeType: 'application/octet-stream',
      buffer: fontBuffer,
    });

    await page.locator('#previewRefreshBtn').click();
    await page.waitForFunction(() => {
      const image = document.querySelector('#previewImage');
      const status = document.querySelector('#previewStatus')?.textContent || '';
      return Boolean(image?.getAttribute('src')) || /无法生成预览帧/.test(status);
    }, null, { timeout: 180_000 });
    assert.equal(await page.locator('#previewImage').isVisible(), true);

    await page.locator('#fontSubsetEnabled').check();
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const output = path.join(outDir, 'renamed-font-identity.mkv');
    const reportPath = path.join(outDir, 'renamed-font-identity.mux-report.json');
    await saveDownload(page, '#downloadLink', output);
    await saveDownload(page, '#reportLink', reportPath);

    const attachments = streams(probe(output), 'attachment');
    assert.equal(attachments.length, 1);
    assert.match(attachments[0].tags?.filename || '', /DejaVuSans\.subset\.ttf$/i);
    assert.equal(attachments[0].tags?.mimetype, 'font/ttf');

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.fonts.attachments[0].mimeType, 'font/ttf');
    assert.equal(report.fonts.attachments[0].subset?.applied, true);
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));

    const log = await page.locator('#log').textContent();
    assert.match(log, /字体“DejaVuSans\.mmmmmm”.*扩展名 \.mmmmmm 与实际检测到的 TrueType \/ OpenType TT 不一致/);

    console.log('Scenario 36 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioCompatibilityEvidenceMatrix(browser) {
  console.log('E2E scenario 37: compatibility-evidence-matrix verifies declared Stream Copy codecs');
  const { context, page } = await openApp(browser);

  try {
    const cases = verifiedCompatibilityEvidence();
    let executed = 0;

    for (const entry of cases) {
      const sourcePath = path.join(root, entry.fixture);
      try {
        await fs.access(sourcePath);
      } catch {
        if (process.env.CI === 'true') {
          throw new Error(`CI compatibility evidence fixture missing: ${entry.fixture}`);
        }
        console.log(`Scenario 37 local skip: ${entry.id} fixture unavailable`);
        continue;
      }

      await page.setInputFiles('#videoInput', sourcePath);
      await page.setInputFiles('#subInput', path.join(root, 'sample.srt'));
      await page.waitForFunction(() => {
        const button = document.querySelector('#muxBtn');
        const status = document.querySelector('#status')?.textContent || '';
        return button && !button.disabled && !/正在读取|正在识别/.test(status);
      }, null, { timeout: 60_000 });

      await page.locator('#muxBtn').click();
      await waitForStatus(page, '完成。');

      const output = path.join(outDir, entry.id + '.mkv');
      const reportPath = path.join(outDir, entry.id + '.mux-report.json');
      await saveDownload(page, '#downloadLink', output);
      await saveDownload(page, '#reportLink', reportPath);

      const sourceProbe = probe(sourcePath);
      const outputProbe = probe(output);
      const type = entry.dimension;
      const sourceCodecs = streams(sourceProbe, type).map((stream) => stream.codec_name);
      const outputCodecs = streams(outputProbe, type).map((stream) => stream.codec_name);
      assert.ok(
        sourceCodecs.includes(entry.expectedCodec),
        `${entry.id}: source codec ${entry.expectedCodec} missing from ${JSON.stringify(sourceCodecs)}`,
      );
      assert.ok(
        outputCodecs.includes(entry.expectedCodec),
        `${entry.id}: output codec ${entry.expectedCodec} missing from ${JSON.stringify(outputCodecs)}`,
      );

      const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
      assert.equal(report.compatibility?.state, 'DIRECT_COPY', entry.id);
      assert.equal(report.compatibility?.mediaPolicy?.silentTranscode, false, entry.id);
      assert.equal(report.compatibility?.execution?.muxSucceeded, true, entry.id);
      assert.equal(report.audit?.ok, true, `${entry.id}: ${JSON.stringify(report.audit?.issues || [])}`);

      const evidence = Array.from(report.compatibility?.evidence || [])
        .find((item) => item.evidenceId === entry.id);
      assert.ok(evidence, `${entry.id}: evidence record missing from mux report`);
      assert.equal(evidence.status, 'verified-e2e', entry.id);
      assert.equal(evidence.fixture, entry.fixture, entry.id);

      executed += 1;
      console.log(`Scenario 37 PASS: ${entry.id}`);
    }

    if (process.env.CI === 'true') {
      assert.equal(executed, cases.length, 'CI must execute every verified compatibility evidence case');
    } else {
      assert.ok(executed >= 1, 'at least one compatibility evidence fixture should execute locally');
    }

    console.log(`Scenario 37 PASS: ${executed}/${cases.length} evidence cases executed`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.E2E_BROWSER_EXECUTABLE ? { executablePath: process.env.E2E_BROWSER_EXECUTABLE } : {}),
});
try {
  await scenarioTabletDesktopUi(browser);
  await scenarioContentFirstMkvIntake(browser);
  await scenarioContentFirstSourceAmbiguity(browser);
  await scenarioUnifiedWorkBenchZones(browser);
  await scenarioUnifiedContainerTreeEditing(browser);
  await scenarioUnifiedContainerAttachmentEditing(browser);
  await scenarioUnifiedContainerOrderingAndAdvancedFlags(browser);
  await scenarioResponsiveObjectEditor(browser);
  await scenarioMultiTrack(browser);
  await scenarioRenamedMediaIdentity(browser);
  await scenarioRenamedFontIdentity(browser);
  await scenarioCompatibilityEvidenceMatrix(browser);
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
  await scenarioPreviewFrame(browser);
  await scenarioPreviewTimeClamp(browser);
  await scenarioAv1PreviewFrame(browser);
  await scenarioAdditionalSubtitleFormats(browser);
  await scenarioFontSubsetting(browser);
  await scenarioBatchAmbiguousSafety(browser);
  await scenarioBatchDirectoryConflict(browser);
  await scenarioBatchDirectorySaveFallback(browser);
  await scenarioBatchQueue(browser);
  await scenarioBatchResultUrlLifetime(browser);
  await scenarioBatchContentIdentity(browser);
  await scenarioAutoLanguageInference(browser);
  await scenarioPreserveAllAppend(browser);
  await scenarioBatchGroupSubset(browser);
  console.log('All browser E2E scenarios PASS');
} finally {
  await browser.close();
}
