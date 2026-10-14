import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { verifiedCompatibilityEvidence } from '../../src/compatibility-evidence.js';
import { parseAssDialogueEvents } from '../../src/ass-event-output-audit.js';
import { compareAssV4PlusStyles } from '../../src/ass-style-output-audit.js';
import { verifyFinishedMkvAssRender } from '../../scripts/p3-final-ass-render-proof.mjs';
import { verifyP3DynamicMkv } from '../../scripts/p3-dynamic-ass-render-proof.mjs';
import { createResearchFixture, pngBytes } from '../../scripts/r02-attachment-only-fixture.mjs';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../../src/mkvmerge-exact-uid-json.js';

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

async function scenarioFiveStepRecipeAndCapabilityWorkbench(browser) {
  console.log('Five-step E2E: portable recipe review and source capability truth');
  const { context, page } = await openApp(browser);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.batch-drawer > summary').click();
    // Group subsetting is intentionally unavailable without a real, recognized
    // font; exercise the executable policy rather than forcing a disabled UI.
    await page.setInputFiles('#batchFontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#batchPreserveAttachments').uncheck();
    await page.locator('#batchFontSubsetEnabled').check();
    await page.waitForFunction(() => !document.querySelector('#batchSubsetScope')?.disabled,
      null, { timeout: 30_000 });
    await page.locator('#batchSubsetScope').selectOption('group');
    const wire = path.join(outDir, 'five-step-batch-recipe-v1.json');
    await saveDownload(page, '#batchRecipeExportBtn', wire);
    const raw = JSON.parse(await fs.readFile(wire, 'utf8'));
    assert.equal(raw.schema, 'batch-recipe-v1');
    assert.deepEqual(raw.policy, {
      preserveAttachments: false, subsetEnabled: true, subsetScope: 'group',
    });
    assert.equal(raw.sourceBindings, 'must-reselect-and-review');
    assert.equal(raw.outputDirectoryPermission, 'not-exported');
    assert.equal(raw.savedArtifacts, 'not-included');
    assert.equal(raw.reviewRequired, true);
    assert.equal(raw.fileHandles, undefined);
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);

    // Rejected foreign schema must not change the current working policy.
    await page.setInputFiles('#batchRecipeImportInput', {
      name: 'untrusted.json', mimeType: 'application/json',
      buffer: Buffer.from('{"schema":"evil","policy":{}}'),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#batchRecipeNotice')?.textContent || '').includes('配方被拒绝'));
    assert.equal(await page.locator('#batchSubsetScope').inputValue(), 'group');
    assert.equal(await page.locator('#batchFontSubsetEnabled').isChecked(), true);

    await page.locator('#batchPreserveAttachments').check();
    // Choose scope while the font-subset control is still enabled. Disabling
    // subsetting deliberately disables the scope picker in the real UI.
    await page.locator('#batchSubsetScope').selectOption('job');
    await page.locator('#batchFontSubsetEnabled').uncheck();
    await page.setInputFiles('#batchRecipeImportInput', wire);
    await page.waitForFunction(() =>
      (document.querySelector('#batchRecipeNotice')?.textContent || '').includes('已加载配方规则'));
    assert.equal(await page.locator('#batchPreserveAttachments').isChecked(), false);
    assert.equal(await page.locator('#batchFontSubsetEnabled').isChecked(), true);
    assert.equal(await page.locator('#batchSubsetScope').inputValue(), 'group');
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);
    assert.equal(await page.locator('#batchVideoInput').evaluate(input => input.files.length), 0);

    // Source identity and plan readiness are reconstructed after real selection.
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      return plan.includes('Batch S01E01.mp4') &&
        !document.querySelector('#batchStartBtn')?.disabled;
    }, null, { timeout: 60_000 });
    assert.equal(await page.locator('#batchResults a.download').count(), 0,
      'import must never start an implicit mux or fabricate a delivered artifact');

    // The legacy #videoInput is a hidden execution adapter. Export belongs
    // to the real source workbench, which is populated by unified intake.
    // Desktop layouts intentionally hide the phone-only jump navigation:
    // do not try to click it or force-click a hidden editor control.
    await page.setInputFiles('#unifiedAssetInput', path.join(root, 'base.mp4'));
    await page.waitForFunction(() => {
      const panel = document.querySelector('#outputCompositionPanel');
      const actual = document.querySelector('#videoInput')?.files?.[0]?.name;
      return actual === 'base.mp4' && panel && !panel.hidden &&
        panel.getClientRects().length > 0 &&
        document.querySelector('#containerCapabilitySummary')?.textContent.includes('快速封装');
    }, null, { timeout: 60_000 });
    assert.equal(await page.locator('#outputCompositionPanel').isVisible(), true);
    assert.equal(await page.locator('#containerProjectExportBtn').isVisible(), true,
      'project export must be accessible on desktop, not inside mobile-only sticky actions');
    const status = await page.locator('#containerCapabilitySummary').getAttribute('data-mux-status');
    assert.notEqual(status, 'available', 'capability projection cannot replace runtime execution preflight');
    assert.match(await page.locator('#containerCapabilitySummary').textContent(), /快速封装/);
    await page.locator('#containerCapabilityDetails > summary').click();
    assert.match(await page.locator('#containerCapabilityDetailsList').textContent(), /完整 EBML 保留/);
    assert.match(await page.locator('#containerCapabilityDetailsList').textContent(), /未验证/);
    await page.waitForFunction(() =>
      !document.querySelector('#containerProjectExportBtn')?.disabled);
    const projectOutput = path.join(outDir, 'five-step-container-project-v1.json');
    // Capturing native click events distinguishes a transiently disabled button
    // from a handler that returned on stale authority, or a blocked download.
    await page.evaluate(() => {
      const b = document.querySelector('#containerProjectExportBtn');
      b.dataset.testPointerdowns = '0';
      b.dataset.testClicks = '0';
      b.addEventListener('pointerdown', () => {
        b.dataset.testPointerdowns = String(Number(b.dataset.testPointerdowns) + 1);
      }, { capture: true });
      b.addEventListener('click', () => {
        b.dataset.testClicks = String(Number(b.dataset.testClicks) + 1);
      }, { capture: true });
    });
    try {
      await saveDownload(page, '#containerProjectExportBtn', projectOutput);
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const b = document.querySelector('#containerProjectExportBtn');
        return {
          status: document.querySelector('#status')?.textContent,
          disabled: b?.disabled,
          connected: b?.isConnected,
          pointerdowns: b?.dataset.testPointerdowns,
          clicks: b?.dataset.testClicks,
          readout: document.querySelector('#containerCapabilitySummary')?.textContent,
          source: document.querySelector('#videoInput')?.files?.[0]?.name,
        };
      });
      throw new Error('Project export yielded no download; diagnostic=' +
        JSON.stringify(diagnostic) + '; ' + (error?.message || String(error)));
    }
    const project = JSON.parse(await fs.readFile(projectOutput, 'utf8'));
    assert.equal(project.schema, 'container-project-v1');
    assert.equal(project.execution, 'requires-fresh-source-authorization');
    assert.ok(project.objects.length > 0);
    assert.ok(project.sources.every(src => src.authorization === 'requires-relink'));
    assert.equal(project.fileHandles, undefined);
    assert.equal(project.sources.length, 1);
    assert.equal(project.sources[0].sha256,
      createHash('sha256').update(await fs.readFile(path.join(root,'base.mp4'))).digest('hex'),
      'the downloaded detached draft must commit to the full actual source bytes');

    // Actually roundtrip the browser-downloaded draft back through the
    // always-visible project control. Review is detached: neither old source
    // permissions nor an executable target plan may be restored.
    await page.setInputFiles('#containerProjectImportInput', projectOutput);
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('已读取工程草稿'), null, { timeout: 30_000 });
    assert.equal(await page.locator('#containerProjectImportReview').isVisible(), true);
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /来源字节一致|来源身份不同或未关联/);
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /未恢复编辑状态、封装权限或媒体文件/);
    assert.equal(await page.locator('#containerProjectVerifySourceBtn').isVisible(), true);
    assert.equal(await page.locator('#containerProjectVerifySourceBtn').isDisabled(), false);
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state === 'digest-matches-draft');
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /完整源文件 SHA-256/);
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /未恢复编辑状态、封装权限或媒体文件/);
    assert.equal(await page.locator('#videoInput').evaluate(x => x.files?.[0]?.name), 'base.mp4');
    assert.equal(await page.locator('#batchResults a.download').count(), 0);

    // Altering the claimed hash in an otherwise schema-valid draft cannot
    // authorize replay even when displayed source name/size/time match.
    const wrongDigestProject = {
      ...project, sources: [{ ...project.sources[0], sha256:'0'.repeat(64) }],
    };
    await page.setInputFiles('#containerProjectImportInput', {
      name:'wrong-digest-project.json', mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(wrongDigestProject)),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '').includes('已读取工程草稿'));
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state === 'digest-mismatch');
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /不得恢复原编辑意图/);
    assert.equal(await page.locator('#batchResults a.download').count(),0);

    // Forged writer authority must be rejected; current File and draft
    // capabilities may not change in response to malicious project JSON.
    await page.setInputFiles('#containerProjectImportInput', {
      name: 'forged-project.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...project, writerStatus: 'verified' })),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('工程草稿被拒绝'), null, { timeout: 30_000 });
    assert.match(await page.locator('#containerProjectImportReview').textContent(), /PROJECT_IMPORT_SCHEMA_UNSUPPORTED/);
    assert.equal(await page.locator('#videoInput').evaluate(x => x.files?.[0]?.name), 'base.mp4');
    await page.setInputFiles('#containerProjectImportInput', projectOutput);
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('已读取工程草稿'));

    // A coherent detached semantic edit must appear as an explicit READ-ONLY
    // preview. No current track flag, binary source or permission is restored.
    const validIntentDraft = {
      ...project,
      revision: 1,
      objects: project.objects.map((object, index) =>
        index === 0 ? { ...object, included: false } : object),
      editIntents: [{
        revision: 1, type: 'include', objectId: project.objects[0].id,
        field: null, from: true, to: false,
      }],
    };
    await page.setInputFiles('#containerProjectImportInput', {
      name: 'coherent-edit-preview.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(validIntentDraft)),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectIntentSummary')?.textContent || '').includes('1 项内部一致'));
    assert.equal(await page.locator('#containerProjectIntentReview').isVisible(), true);
    await page.locator('#containerProjectIntentReview > summary').click();
    assert.match(await page.locator('#containerProjectIntentList').textContent(), /是否保留：是 → 否/);
    assert.match(await page.locator('#containerProjectIntentReview').textContent(), /不证明编辑发生过/);
    // A coherent detached edit never becomes executable on import. Full
    // source hash and fresh structural inspection are separate preconditions.
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectConflictReview')?.dataset.state === 'PREVIEW_BLOCKED');
    await page.locator('#containerProjectConflictReview > summary').click();
    assert.match(await page.locator('#containerProjectConflictList').textContent(), /未完成来源字节 SHA-256 核对/);
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state === 'digest-matches-draft');
    assert.match(await page.locator('#containerProjectConflictList').textContent(), /当前真实轨道尚未扫描/);
    assert.match(await page.locator('#containerProjectConflictSummary').textContent(), /受阻/);
    assert.equal(await page.locator('#batchResults a.download').count(), 0);
    assert.equal(await page.locator('#videoInput').evaluate(x => x.files?.[0]?.name), 'base.mp4');
    assert.equal(await page.locator('#batchResults a.download').count(), 0);

    // Valid JSON/field names alone are insufficient: the final object cannot
    // retain "true" if the last recorded edit says it became "false".
    const contradictory = {
      ...validIntentDraft, objects: project.objects,
    };
    await page.setInputFiles('#containerProjectImportInput', {
      name: 'contradictory-edit.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(contradictory)),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('PROJECT_INTENT_CHAIN_INVALID:TO_STATE_CONTRADICTION'));
    assert.equal(await page.locator('#videoInput').evaluate(x => x.files?.[0]?.name), 'base.mp4');
    // Re-import only the validated sample for screenshot audit.
    await page.setInputFiles('#containerProjectImportInput', {
      name: 'coherent-edit-preview.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(validIntentDraft)),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectIntentSummary')?.textContent || '').includes('1 项内部一致'));

    await page.screenshot({
      path: path.join(outDir, 'five-step-workbench-1440.png'), animations: 'disabled',
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.locator('#containerProjectExportBtn').isVisible(), true,
      'project export must remain in tablet composition header');
    await page.screenshot({
      path: path.join(outDir, 'five-step-workbench-1024.png'), animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#containerProjectExportBtn').isVisible(), true,
      'project export must remain visible in mobile source work area');
    await page.screenshot({
      path: path.join(outDir, 'five-step-workbench-390.png'), animations: 'disabled',
    });
    console.log('Five-step recipe export/import and capability truthful UI PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP3FinalMkvRealLibassRendering(browser) {
  console.log('P3 E2E: downloaded MKV ASS with unique embedded font renders identically to source reference');
  const { context, page } = await openApp(browser);
  try {
    const ass = path.join(root, 'p3-embedded-proof.ass');
    const font = path.join(root, 'P3EmbeddedProof.ttf');
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', ass);
    await page.setInputFiles('#fontInput', font);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const finished = path.join(outDir, 'p3-real-libass-delivery.mkv');
    const reportFile = path.join(outDir, 'p3-real-libass-delivery.report.json');
    await saveDownload(page, '#downloadLink', finished);
    await saveDownload(page, '#reportLink', reportFile);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    assert.equal(report.audit?.assEventAudit?.status, 'pass');
    assert.equal(report.audit?.assStyleAudit?.status, 'pass');
    assert.equal(report.audit?.fontPayloadAudit?.status, 'pass');
    const result = await verifyFinishedMkvAssRender({
      finalMkv: finished, sourceAss: ass, sourceFont: font, outputDir: outDir,
    });
    assert.equal(result.code, 'PASS_P3_NAMED_FIXTURE');
    // Independent libass render is a CI fixture proof, not a general browser
    // playback claim. Preserve the separate browser audit's truthful scope.
    assert.equal(report.compatibility?.playback?.verified, false);
    assert.equal(report.audit?.assEventAudit?.fontRenderingVerified, false);
    assert.equal(report.audit?.assStyleAudit?.fontRenderingVerified, false);
    console.log('P3 final MKV independent libass rendered-pixel and embedded-font proof PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP3DynamicAssDelivery(browser) {
  console.log('P3 dynamic E2E: actual browser MKV preserves move, transition and karaoke frames');
  const { context, page } = await openApp(browser);
  try {
    const ass = path.join(root, 'p3-dynamic-proof.ass');
    const font = path.join(root, 'P3EmbeddedProof.ttf');
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', ass);
    await page.setInputFiles('#fontInput', font);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');

    const finished = path.join(outDir, 'p3-dynamic-delivery.mkv');
    const reportFile = path.join(outDir, 'p3-dynamic-delivery.report.json');
    await saveDownload(page, '#downloadLink', finished);
    await saveDownload(page, '#reportLink', reportFile);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    assert.equal(report.audit?.assEventAudit?.status, 'pass');
    assert.equal(report.audit?.assStyleAudit?.status, 'pass');
    assert.equal(report.audit?.fontPayloadAudit?.status, 'pass');

    const verdict = await verifyP3DynamicMkv({
      finalMkv: finished, sourceAss: ass, sourceFont: font, outputDir: outDir,
    });
    assert.equal(verdict.code, 'PASS_P3_DYNAMIC_NAMED_FIXTURE');
    assert.equal(verdict.samples.length, 4);
    assert.equal(verdict.controls.length, 3);
    assert.equal(report.compatibility?.playback?.verified, false);
    console.log('P3 dynamic final-MKV 4 subsecond snapshots and 3 effect negative controls PASS');
  } finally {
    await context.close();
  }
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
    const manifest = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.equal(report.application.version, manifest.version, 'exported report version must match package.json');
    assert.equal(report.compatibility?.state, 'DIRECT_COPY');
    assert.equal(report.compatibility?.execution?.muxSucceeded, true);
    assert.equal(report.compatibility?.playback?.verified, false);
    assert.equal(report.fonts.selectedCount, 2);
    assert.equal(report.fonts.uniqueCount, 1);
    assert.equal(report.fonts.duplicateCount, 1);
    assert.equal(report.externalAudio.length, 1);
    assert.equal(report.externalAudio[0].codec, 'flac');
    // External system FFmpeg independently demuxes the actual downloaded
    // artifact. Compare persisted ASS events and timing against both source
    // subtitles, not against a mock output or planned track inventory.
    for (const [index, filename] of ['zh.ass', 'en.ass'].entries()) {
      const recovered = execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-copyts', '-i', output,
        '-map', '0:s:' + index, '-c:s', 'ass', '-f', 'ass', '-',
      ], { encoding: 'utf8' });
      const stagedAss = await fs.readFile(path.join(root, filename), 'utf8');
      assert.deepEqual(parseAssDialogueEvents(recovered),
        parseAssDialogueEvents(stagedAss),
        'external FFmpeg must recover unchanged ASS Dialogue events for ' + filename);
      assert.equal(compareAssV4PlusStyles(stagedAss, recovered).ok, true,
        'external FFmpeg must recover unchanged ASS Style semantics for ' + filename);
    }
    assert.equal(report.audit?.ok, true, JSON.stringify(report.audit?.issues || []));
    assert.equal(report.audit?.fontPayloadAudit?.status, 'pass',
      JSON.stringify(report.audit?.fontPayloadAudit));
    assert.equal(report.audit?.fontPayloadAudit?.verified, 1);
    assert.equal(report.audit?.fontPayloadAudit?.total, 1);
    // The finished MKV, not the uploaded .ass, is demuxed and checked for
    // exact new-ASS Dialogue text/timing/order. Renderer fidelity is separate.
    assert.equal(report.audit?.assEventAudit?.status, 'pass',
      JSON.stringify(report.audit?.assEventAudit));
    assert.equal(report.audit?.assEventAudit?.verified, 2);
    assert.equal(report.audit?.assEventAudit?.total, 2);
    assert.equal(report.audit?.assEventAudit?.fontRenderingVerified, false);
    assert.equal(report.audit?.assStyleAudit?.status, 'pass',
      JSON.stringify(report.audit?.assStyleAudit));
    assert.equal(report.audit?.assStyleAudit?.verified, 2);
    assert.equal(report.audit?.assStyleAudit?.total, 2);
    assert.equal(report.audit?.assStyleAudit?.styleRecords, 2);
    assert.equal(report.audit?.assStyleAudit?.fontRenderingVerified, false);
    assert.match(await page.locator('#outputEvidenceFacts').textContent(), /新增 ASS 事件成品回读：2\/2/);
    assert.match(await page.locator('#outputEvidenceFacts').textContent(), /新增 ASS 样式成品回读：2\/2/);
    assert.match(await page.locator('#outputEvidenceFacts').textContent(), /新字体附件字节验证：1\/1/);
    // Real output audit evidence must stay separate from a blanket EBML claim.
    await page.locator('#outputEvidencePanel').waitFor({ state: 'visible' });
    assert.match(await page.locator('#outputEvidenceTitle').textContent(), /ffprobe 审计通过/);
    assert.match(await page.locator('#outputEvidenceFacts').textContent(), new RegExp(report.output.sha256));
    assert.match(await page.locator('.output-evidence-limits').textContent(), /不等于完整 EBML/);

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
    // The central output workbench must expose source-only chapter/tag
    // observations, without implying the future writer will preserve them.
    await page.locator('#compositionSourceEvidence > summary').click();
    assert.equal(await page.locator('#compositionSourceEvidenceList [data-evidence-kind="chapter"]').count(), 2);
    assert.ok((await page.locator('#compositionSourceEvidenceList').textContent()).includes('Fixture Container'));
    assert.match(await page.locator('.source-evidence-scope').textContent(), /不是最终成品的保留承诺/);
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
    assert.equal(report.audit?.originalAttachmentPayloadAudit?.status, 'pass',
      JSON.stringify(report.audit?.originalAttachmentPayloadAudit));
    assert.equal(report.audit?.originalAttachmentPayloadAudit?.verified, 1);
    assert.equal(report.audit?.originalAttachmentPayloadAudit?.total, 1);
    assert.match(await page.locator('#outputEvidenceFacts').textContent(),
      /原附件字节验证：1\/1/);

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
    // The editable DOM and the actual planned output must agree BEFORE
    // execution. Catch a stale external-domain epoch or silently rejected
    // input before an independently probed MKV appears with a wrong title.
    const secondTitleActual =
      await page.locator('input[data-new-sub-field="title"][data-index="0"]').inputValue();
    if (secondTitleActual !== 'Second Task') {
      const diagnostic = await page.evaluate(() => ({
        status: document.querySelector('#status')?.textContent || '',
        subtitleControls: Array.from(document.querySelectorAll('#newSubtitleList [data-new-sub-field]'))
          .map(el => ({field: el.dataset.newSubField, index: el.dataset.index,
            value: el.type === 'checkbox' ? el.checked : el.value})),
        audioEpoch: document.querySelector('#newAudioList')?.dataset.externalDomainEpoch,
        subtitleEpoch: document.querySelector('#newSubtitleList')?.dataset.externalDomainEpoch,
        plan: document.querySelector('#muxPlan')?.textContent?.slice(0, 1200),
        subtitleLabel: document.querySelector('#subName')?.textContent,
      }));
      console.error('Second task pre-mux editor authority diagnostic:', JSON.stringify(diagnostic));
    }
    assert.equal(secondTitleActual, 'Second Task',
      'second-task editable title must survive selection and input dispatch');
    await page.waitForFunction(() =>
      (document.querySelector('#muxPlan')?.textContent || '').includes('Second Task'),
    null, { timeout: 15_000 });
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
    try {
      await page.waitForFunction(() => !document.querySelector('#muxBtn')?.disabled, null, { timeout: 15000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        readiness: {
          state: document.querySelector('#preservationReadiness')?.dataset.status,
          title: document.querySelector('#preservationReadinessTitle')?.textContent,
          description: document.querySelector('#preservationReadinessDescription')?.textContent,
        },
        videoIdentity: document.querySelector('#videoIdentityLabel')?.textContent,
        fontName: document.querySelector('#fontName')?.textContent,
        fontModeHint: document.querySelector('#fontModeHint')?.textContent,
        subtitle: document.querySelector('#subName')?.textContent,
        source: document.querySelector('#videoInput')?.files?.[0]?.name,
        disabled: document.querySelector('#muxBtn')?.disabled,
        status: document.querySelector('#status')?.textContent,
      }));
      throw new Error('valid-font recovery remained blocked: ' + JSON.stringify(state) + '; ' + error.message);
    }
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

async function scenarioExternalAssetDomainAuthority(browser) {
  console.log('E2E P1: external audio/subtitle/domain font policy -> real mux and same-metadata File replacement');
  const {context,page}=await openApp(browser);
  try {
    await page.setInputFiles('#videoInput',path.join(root,'base.mp4'));
    await page.setInputFiles('#audioInput',path.join(root,'external.flac'));
    await page.setInputFiles('#subInput',path.join(root,'zh.ass'));
    await page.setInputFiles('#fontInput',path.join(root,'DejaVuSans.ttf'));
    const audio=page.locator('#newAudioList input[data-new-audio-field="title"][data-index="0"]');
    const subtitle=page.locator('#newSubtitleList input[data-new-sub-field="title"][data-index="0"]');
    await audio.fill('Old-selection private title');
    assert.equal(await audio.inputValue(),'Old-selection private title');

    // Browser File grants are object identity, not just name|size|mtime.
    // Re-select a different File object containing the exact same bytes and
    // identical display metadata. The stale form and title MUST NOT leak.
    await page.evaluate(async ()=>{
      const input=document.querySelector('#audioInput');
      const old=input.files[0];
      const clone=new File([await old.arrayBuffer()],old.name,{
        lastModified:old.lastModified,type:old.type,
      });
      const transfer=new DataTransfer();
      transfer.items.add(clone);
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>{
      const text=document.querySelector('#newAudioList input[data-new-audio-field="title"][data-index="0"]');
      return text && text.value==='external';
    },null,{timeout:30000});
    assert.equal(await audio.inputValue(),'external');
    await audio.fill('Domain external audio');
    await page.locator('#newAudioList select[data-new-audio-field="language"]').selectOption('eng');
    await page.locator('#newAudioList details.track-advanced summary').click();
    await page.locator('#newAudioList input[data-new-audio-field="commentary"]').check();
    await subtitle.fill('Domain Chinese subtitles');
    await page.locator('#newSubtitleList select[data-new-sub-field="language"]').selectOption('zho');
    await page.locator('#newSubtitleList input[data-new-sub-field="forced"]').check();
    await page.locator('#fontMode').selectOption('force');
    assert.equal(await page.locator('#fontMode').inputValue(),'force');

    await page.locator('#muxBtn').click();
    await waitForStatus(page,'完成。');
    const output=path.join(outDir,'p1-external-domain-authored.mkv');
    await saveDownload(page,'#downloadLink',output);
    const checked=probe(output);
    const audios=streams(checked,'audio');
    const subtitles=streams(checked,'subtitle');
    const fonts=streams(checked,'attachment');
    assert.equal(audios.at(-1).tags?.title,'Domain external audio');
    assert.equal(audios.at(-1).tags?.language,'eng');
    assert.equal(Boolean(audios.at(-1).disposition?.comment),true);
    assert.equal(subtitles.at(-1).tags?.title,'Domain Chinese subtitles');
    assert.equal(subtitles.at(-1).tags?.language,'zho');
    assert.equal(Boolean(subtitles.at(-1).disposition?.forced),true);
    assert.ok(fonts.some(font=>font.tags?.filename==='DejaVuSans.ttf'),
      'font inventory and mode must be compatible with actual executor output');
    console.log('External asset domain and independent finished-MKV oracle PASS');
  } finally {
    await context.close();
  }
}

async function scenarioExternalCheckpointRecoveryRealMux(browser) {
  console.log('E2E P1 ROUND3: external JSON checkpoint -> SHA rebind -> consent -> undo -> apply -> actual MKV');
  const {context,page}=await openApp(browser);
  try {
    await page.setInputFiles('#videoInput',path.join(root,'base.mp4'));
    await page.setInputFiles('#audioInput',path.join(root,'external.flac'));
    const title=page.locator('#newAudioList input[data-new-audio-field="title"]').first();
    await title.fill('R3 Restored FLAC');
    const [download]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('#externalCheckpointExportBtn').click(),
    ]);
    const exported=await download.path();
    assert.ok(exported);
    const draftText=await fs.readFile(exported,'utf8');
    assert.match(draftText,/"mkv-external-metadata-checkpoint-v1"/);
    assert.doesNotMatch(draftText,/"authorization":\s*"session"/);
    await title.fill('R3 Current Before Restore');
    await page.setInputFiles('#externalCheckpointImportInput',{
      name:'checkpoint.json',mimeType:'application/json',buffer:Buffer.from(draftText),
    });
    assert.equal(await page.locator('#externalCheckpointApplyBtn').isDisabled(),true);
    await page.locator('#externalCheckpointPrepareBtn').click();
    await page.waitForFunction(()=>document.querySelector('#externalCheckpointConfirm')?.disabled===false);
    assert.equal(await title.inputValue(),'R3 Current Before Restore');
    await page.locator('#externalCheckpointConfirm').check();
    await page.locator('#externalCheckpointApplyBtn').click();
    await page.waitForFunction(()=>document.querySelector('#externalCheckpointStatus')?.textContent.includes('已明确应用'));
    assert.equal(await title.inputValue(),'R3 Restored FLAC');
    await page.locator('#externalCheckpointUndoBtn').click();
    assert.equal(await title.inputValue(),'R3 Current Before Restore');
    await page.locator('#externalCheckpointPrepareBtn').click();
    await page.waitForFunction(()=>document.querySelector('#externalCheckpointConfirm')?.disabled===false);
    await page.locator('#externalCheckpointConfirm').check();
    await page.locator('#externalCheckpointApplyBtn').click();
    assert.equal(await title.inputValue(),'R3 Restored FLAC');
    await page.locator('#muxBtn').click();
    await waitForStatus(page,'完成。');
    const output=path.join(outDir,'p1-round3-external-checkpoint-recovered.mkv');
    await saveDownload(page,'#downloadLink',output);
    const final=probe(output);
    assert.equal(streams(final,'audio').at(-1).tags?.title,'R3 Restored FLAC');
    console.log('P1 ROUND3 external checkpoint complete UI/real output/ffprobe PASS');
  } finally { await context.close(); }
}

async function scenarioSharedContainerProjectRealMux(browser) {
  console.log('E2E P1 ROUND2: source + external + font share ONE live ContainerProject -> real MKV');
  const {context,page}=await openApp(browser);
  try {
    await page.setInputFiles('#videoInput',path.join(root,'source-multitrack.mkv'));
    await waitForStatus(page,'轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    await page.setInputFiles('#audioInput',path.join(root,'external.flac'));
    await page.setInputFiles('#subInput',path.join(root,'zh.ass'));
    await page.setInputFiles('#fontInput',path.join(root,'DejaVuSans.ttf'));
    await page.locator('.track-row.track-audio input[data-track-field="title"]').first()
      .fill('R2 Original Source');
    await page.locator('#newAudioList input[data-new-audio-field="title"]').first()
      .fill('R2 Added Audio');
    await page.locator('#newSubtitleList input[data-new-sub-field="title"]').first()
      .fill('R2 Added ASS');
    await page.locator('#newSubtitleList input[data-new-sub-field="forced"]').first()
      .check();
    await page.locator('#fontMode').selectOption('force');
    const plan=await page.locator('#muxPlan').textContent();
    assert.match(plan,/R2 Original Source/);
    assert.match(plan,/R2 Added Audio/);
    assert.match(plan,/R2 Added ASS/);
    await page.locator('#muxBtn').click();
    await waitForStatus(page,'完成。');
    const output=path.join(outDir,'p1-round2-shared-source-external.mkv');
    await saveDownload(page,'#downloadLink',output);
    const final=probe(output);
    const audios=streams(final,'audio'), subs=streams(final,'subtitle');
    assert.equal(audios[0].tags?.title,'R2 Original Source');
    assert.equal(audios.at(-1).tags?.title,'R2 Added Audio');
    // Preserve-all original subtitle order is not an identity guarantee.
    const addedAss=subs.filter(s=>s.tags?.title==='R2 Added ASS');
    assert.equal(addedAss.length,1,'one actual R2 authored ASS output stream');
    assert.equal(Boolean(addedAss[0].disposition?.forced),true);
    assert.ok(streams(final,'attachment').some(s=>
      s.tags?.filename==='DejaVuSans.ttf'));
    console.log('P1 ROUND2 shared-domain source + external + font actual MKV/ffprobe PASS');
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

async function scenarioLiveSourceAttachmentDomainMux(browser) {
  console.log('E2E P1: domain-owned source attachment changes -> real MKV -> independent ffprobe');
  const {context,page}=await openApp(browser);
  try {
    const input=path.join(root,'source-with-attachments.mkv');
    const original=await fs.readFile(input);
    await page.setInputFiles('#videoInput',input);
    await waitForStatus(page,'轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    const items=page.locator('.attachment-item');
    assert.equal(await items.count(),2);
    await items.nth(0).locator('input[data-attachment-field="filename"]')
      .fill('domain-renamed-font.ttf');
    await items.nth(0).locator('input[data-attachment-field="mimetype"]')
      .fill('font/ttf');
    await items.nth(1).locator('input[data-attachment-action="include"]').uncheck();
    assert.equal(await items.nth(1)
      .locator('input[data-attachment-action="include"]').isChecked(),false);
    const draftPath=path.join(outDir,'p1-domain-attachment-detached.json');
    await saveDownload(page,'#containerProjectExportBtn',draftPath);
    const draft=JSON.parse(await fs.readFile(draftPath,'utf8'));
    const attachment=draft.objects.find(o=>o.kind==='attachment' &&
      o.attributes?.name==='domain-renamed-font.ttf');
    assert.ok(attachment && attachment.sourceId,
      'immutable project represents the actual source attachment changes');
    assert.equal(attachment.attributes.mime,'font/ttf');
    assert.ok(draft.editIntents.some(intent => intent.objectId===attachment.id &&
      intent.type==='set-attribute' && intent.field==='name' &&
      intent.to==='domain-renamed-font.ttf'),
      'the real attachment filename delta must have an explicit scan-baseline intent');
    assert.ok(draft.editIntents.some(intent => intent.objectId===attachment.id &&
      intent.type==='set-attribute' && intent.field==='mime' && intent.to==='font/ttf'));
    assert.ok(draft.editIntents.some(intent => intent.type==='include' && intent.to===false &&
      draft.objects.some(obj => obj.kind==='attachment' && obj.id===intent.objectId)));
    assert.match(await page.locator('#status').textContent(),
      /来源附件的保留、文件名和 MIME 修改已记录为可核验的草稿意图/);

    // Explicitly restore the original inspected attachment baseline. A saved
    // draft must not silently mutate the source on import, but verified replay
    // should reapply the exact previously reviewed output intention.
    await items.nth(0).locator('input[data-attachment-field="filename"]')
      .fill('fixture-original.ttf');
    await items.nth(0).locator('input[data-attachment-field="mimetype"]')
      .fill('application/x-truetype-font');
    await items.nth(1).locator('input[data-attachment-action="include"]').check();
    assert.equal(await items.nth(1).locator('input[data-attachment-action="include"]').isChecked(),true);
    await page.setInputFiles('#containerProjectImportInput',draftPath);
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('已读取工程草稿'));
    assert.equal(await items.nth(0).locator('input[data-attachment-field="filename"]').inputValue(),
      'fixture-original.ttf', 'import itself must never apply edits');
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state===
      'digest-matches-draft',null,{timeout:120_000});
    await page.locator('#containerProjectRestoreConfirm').check();
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(),false);
    await page.locator('#containerProjectRestoreBtn').click();
    assert.equal(await items.nth(0).locator('input[data-attachment-field="filename"]').inputValue(),
      'domain-renamed-font.ttf');
    assert.equal(await items.nth(0).locator('input[data-attachment-field="mimetype"]').inputValue(),
      'font/ttf');
    assert.equal(await items.nth(1).locator('input[data-attachment-action="include"]').isChecked(),false);
    assert.match(await page.locator('#containerProjectRestoreStatus').textContent(), /2 个来源附件/);
    await page.locator('#containerProjectRestoreUndoBtn').click();
    assert.equal(await items.nth(0).locator('input[data-attachment-field="filename"]').inputValue(),
      'fixture-original.ttf');
    assert.equal(await items.nth(1).locator('input[data-attachment-action="include"]').isChecked(),true);
    await page.locator('#containerProjectRestoreConfirm').check();
    await page.locator('#containerProjectRestoreBtn').click();
    assert.equal(await items.nth(0).locator('input[data-attachment-field="filename"]').inputValue(),
      'domain-renamed-font.ttf');

    await page.locator('#muxBtn').click();
    await waitForStatus(page,'完成。');
    const dest=path.join(outDir,'p1-domain-source-attachment-final.mkv');
    await saveDownload(page,'#downloadLink',dest);
    const result=probe(dest);
    const attachments=streams(result,'attachment');
    assert.equal(attachments.length,1);
    assert.equal(attachments[0].tags?.filename,'domain-renamed-font.ttf');
    assert.equal(attachments[0].tags?.mimetype,'font/ttf');
    assert.deepEqual(await fs.readFile(input),original,
      'source attachment edits must never mutate the source media bytes');
    console.log('Domain source attachment -> real finished MKV and external probe PASS');
  } finally {
    await context.close();
  }
}


async function scenarioVerifiedDetachedSourceTrackOrder(browser) {
  console.log('E2E P1: actual source order -> detached permutation -> SHA rebind -> explicit atomic restore -> real MKV');
  const {context,page}=await openApp(browser);
  try {
    const input=path.join(root,'source-multitrack.mkv');
    const sourceBefore=await fs.readFile(input);
    await page.setInputFiles('#unifiedAssetInput',input);
    await waitForStatus(page,'轨道扫描完成：');
    await page.locator('#sourceFilesDetails > summary').click();
    const tree=page.locator('.asset-container-tree');
    await tree.waitFor({state:'visible'});
    await tree.locator('[data-tree-preserve-all]').uncheck();
    const audio=tree.locator('[data-tree-group="audio"] .asset-tree-row');
    const inspector=page.locator('#assetInspectorHost .asset-tree-inspector');
    assert.equal(await audio.count(),2);
    const originals=[];
    for(let i=0;i<2;i++) {
      await audio.nth(i).locator('[data-tree-select]').click();
      const input=inspector.locator('[data-tree-track-field="title"]');
      originals.push(await input.inputValue());
      await input.fill('Portable source audio '+(i===0?'A':'B'));
    }
    await audio.nth(1).locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-track-move="-1"]').click();
    assert.deepEqual(await audio.locator('.asset-tree-index-name').allTextContents(),
      ['Portable source audio B','Portable source audio A']);
    const draftPath=path.join(outDir,'p1-verified-source-track-order.json');
    await saveDownload(page,'#containerProjectExportBtn',draftPath);
    const draft=JSON.parse(await fs.readFile(draftPath,'utf8'));
    const swaps=draft.editIntents.filter(change=>change.type==='reorder');
    assert.equal(swaps.length,2,'both peers require explicit slot edits');
    assert.equal(new Set(swaps.map(change=>change.from)).size,2);
    assert.deepEqual(new Set(swaps.map(change=>change.from)),
      new Set(swaps.map(change=>change.to)));
    assert.match(await page.locator('#status').textContent(),
      /轨道排序修改已记录为可核验的草稿意图/);

    // Restore the current editor to its scanned source baseline BEFORE import.
    // Import is completely inert; only a verified and explicitly confirmed
    // replay may change source track order or metadata.
    await audio.nth(0).locator('[data-tree-select]').click();
    await inspector.locator('[data-tree-track-move="1"]').click();
    for(let i=0;i<2;i++) {
      await audio.nth(i).locator('[data-tree-select]').click();
      await inspector.locator('[data-tree-track-field="title"]').fill(originals[i]);
    }
    await page.setInputFiles('#containerProjectImportInput',draftPath);
    await page.waitForFunction(()=>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('已读取工程草稿'));
    assert.notDeepEqual(await audio.locator('.asset-tree-index-name').allTextContents(),
      ['Portable source audio B','Portable source audio A'],
      'parsing untrusted JSON must not silently reorder source tracks');
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(()=>
      document.querySelector('#containerProjectImportReview')?.dataset.state===
      'digest-matches-draft',null,{timeout:120_000});
    await page.locator('#containerProjectRestoreConfirm').check();
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(),false);
    await page.locator('#containerProjectRestoreBtn').click();
    assert.deepEqual(await audio.locator('.asset-tree-index-name').allTextContents(),
      ['Portable source audio B','Portable source audio A']);
    await page.locator('#containerProjectRestoreUndoBtn').click();
    assert.notDeepEqual(await audio.locator('.asset-tree-index-name').allTextContents(),
      ['Portable source audio B','Portable source audio A']);
    await page.locator('#containerProjectRestoreConfirm').check();
    await page.locator('#containerProjectRestoreBtn').click();
    assert.deepEqual(await audio.locator('.asset-tree-index-name').allTextContents(),
      ['Portable source audio B','Portable source audio A']);

    await page.locator('#muxBtn').click();
    await waitForStatus(page,'完成。');
    const output=path.join(outDir,'p1-verified-source-track-order-final.mkv');
    await saveDownload(page,'#downloadLink',output);
    assert.deepEqual(streams(probe(output),'audio').map(stream=>stream.tags?.title),
      ['Portable source audio B','Portable source audio A'],
      'independent native ffprobe must inspect delivered track order');
    assert.deepEqual(await fs.readFile(input),sourceBefore);
    console.log('Verified detached track order, inverse and final output PASS');
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
    const r6Vtt = path.join(outDir, 'r6-plain-millisecond.vtt');
    await fs.writeFile(r6Vtt, 'WEBVTT\n\ncue-one\n00:00.123 --> 00:01.456\n第一行\nsecond line\n\n00:01.000 --> 00:01.789\nOverlapping cue\n');
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', [
      path.join(root, 'sample.ssa'),
      path.join(root, 'sample.srt'),
      r6Vtt,
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
    assert.equal(report.audit?.subripCueAudit?.status, 'pass');
    assert.equal(report.audit.subripCueAudit.verified, 2);
    assert.equal(report.audit.subripCueAudit.presentationVerified, false);
    assert.equal(report.audit.subripCueAudit.playerVerified, false);
    assert.ok((await page.locator('#outputEvidenceFacts').textContent()).includes('SRT/WebVTT 成品回读'));
    // Independent native demux, with an explicit expected string rather than
    // the browser audit/parser as its oracle. Preserve subsecond overlap/text.
    const actualVttSrt = execFileSync('ffmpeg', ['-v', 'error', '-copyts', '-i', output,
      '-map', '0:s:2', '-c:s', 'srt', '-f', 'srt', 'pipe:1'], { encoding: 'utf8' });
    assert.equal(actualVttSrt.replace(/\r\n?/g, '\n').trimEnd(),
      '1\n00:00:00,123 --> 00:00:01,456\n第一行\nsecond line\n\n2\n00:00:01,000 --> 00:00:01,789\nOverlapping cue');
    // A valid WebVTT layout cue still muxes, but must never claim presentation
    // or plain-text equivalence from the successful ffprobe track audit.
    // This scenario uses the legacy hidden inputs. Their completed-task
    // cleanup clears the primary media too; stage a complete second task.
    await page.waitForFunction(() => !document.querySelector('#videoInput').disabled);
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', { name: 'r6-layout.vtt', mimeType: 'text/vtt',
      buffer: Buffer.from('WEBVTT\n\n00:00.123 --> 00:01.456 align:start\nlayout cue\n') });
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const layoutReportPath = path.join(outDir, 'r6-layout.mux-report.json');
    await saveDownload(page, '#reportLink', layoutReportPath);
    const layoutReport = JSON.parse(await fs.readFile(layoutReportPath, 'utf8'));
    assert.equal(layoutReport.audit?.subripCueAudit?.status, 'unavailable');
    assert.equal(layoutReport.audit.subripCueAudit.presentationVerified, false);
    assert.ok((await page.locator('#outputEvidenceFacts').textContent()).includes('SRT/WebVTT 成品回读：未验证'));
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
    assert.equal(report.audit?.fontPayloadAudit?.status, 'pass',
      JSON.stringify(report.audit?.fontPayloadAudit));
    assert.equal(report.audit?.fontPayloadAudit?.verified, 1);
    console.log('Scenario 27 PASS');
  } finally {
    await context.close();
  }
}

async function scenarioUnifiedBatchContentIntake(browser) {
  console.log('E2E: unified batch import identifies mixed contents, blocks unsupported files, then muxes MKV');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchUnifiedInput', [
      path.join(root, 'Batch S01E01.mp4'),
      path.join(root, 'Batch S01E01.zh-Hans.ass'),
      path.join(root, 'DejaVuSans.ttf'),
      path.join(root, 'external.flac'),
    ]);
    await page.waitForFunction(() => {
      const count = document.querySelectorAll('#batchAssetInventory .asset-entry').length;
      const status = document.querySelector('#batchAssetStatus')?.textContent || '';
      return count === 4 && status.includes('1 不可用');
    }, null, { timeout: 120_000 });
    assert.deepEqual(await page.locator('#batchAssetInventory .asset-entry').evaluateAll(items =>
      items.map(item => item.dataset.kind)
    ), ['container','subtitle','font','audio']);
    assert.deepEqual(await page.evaluate(() => [
      [...document.querySelector('#batchVideoInput').files].map(f => f.name),
      [...document.querySelector('#batchSubtitleInput').files].map(f => f.name),
      [...document.querySelector('#batchFontInput').files].map(f => f.name),
    ]), [['Batch S01E01.mp4'], ['Batch S01E01.zh-Hans.ass'], ['DejaVuSans.ttf']]);
    assert.equal(await page.locator('.batch-legacy-intake').count(), 0);
    assert.equal(await page.locator('#batchVideoInput').isVisible(), false);
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);

    const removeUnsupportedBatch = page.locator('#batchAssetInventory .asset-entry[data-kind="audio"] [data-batch-asset-remove]');
    await removeUnsupportedBatch.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() =>
      document.activeElement?.closest('#batchAssetInventory .asset-entry')?.dataset.kind),
    'font', 'after removing last batch asset, focus returns to previous available row');
    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      return document.querySelectorAll('#batchAssetInventory .asset-entry').length === 3 &&
        plan.includes('Batch S01E01.mp4') &&
        plan.includes('1 ASS') &&
        !document.querySelector('#batchStartBtn').disabled;
    }, null, { timeout: 120_000 });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), false);
    await page.setViewportSize({ width: 1440, height: 900 });
    const sectionSeparation = await page.evaluate(() => {
      const output = document.querySelector('.output-hub').getBoundingClientRect();
      const batch = document.querySelector('.batch-workspace').getBoundingClientRect();
      return { outputBottom: output.bottom, batchTop: batch.top };
    });
    assert.ok(sectionSeparation.outputBottom <= sectionSeparation.batchTop + 2,
      `single-task output rail overlaps the batch workbench: ${JSON.stringify(sectionSeparation)}`);
    await page.locator('.batch-workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-batch-desktop-1440.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench-jump-nav a[href="#batch-title"]').click();
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.locator('.batch-workspace').isVisible(), true);
    assert.equal(await page.locator('.stage-input').isVisible(), false);
    assert.equal(await page.locator('#batchAssetInventory .asset-entry').count(), 3);
    await page.locator('.batch-unified-intake').screenshot({
      path: path.join(outDir, 'mkv-container-tree-batch-phone-390.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#batchStatus')?.textContent || '';
      return value.startsWith('批量完成：') || value.startsWith('批量已取消：');
    }, null, { timeout: 360_000 });
    assert.match(await page.locator('#batchStatus').textContent(), /成功 1，失败 0/);
    assert.equal(await page.locator('#batchResults a.download').count(), 1);
    const resultPath = path.join(outDir, 'unified-batch-content-first.mkv');
    const link = page.locator('#batchResults a.download').first();
    const downloadPromise = page.waitForEvent('download');
    await link.click();
    await (await downloadPromise).saveAs(resultPath);
    const output = probe(resultPath);
    assert.ok(output.streams.some(stream => stream.codec_type === 'video'));
    assert.ok(output.streams.some(stream => stream.codec_type === 'subtitle'));
    assert.ok(output.streams.some(stream => stream.codec_type === 'attachment'));

    // Backward-compatible internal test injection must clear the earlier
    // unified inventory; no categorized import form remains visible.
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E02.mp4'));
    await page.waitForFunction(() => {
      return document.querySelector('#batchVideoInput')?.files[0]?.name === 'Batch S01E02.mp4' &&
        document.querySelector('#batchSubtitleInput')?.files.length === 0 &&
        document.querySelector('#batchFontInput')?.files.length === 0 &&
        document.querySelectorAll('#batchAssetInventory .asset-entry').length === 0;
    });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true,
      'no matched subtitle means no executable legacy batch job');
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E02.en.srt'));
    await page.waitForFunction(() => {
      const text = document.querySelector('#batchPlan')?.textContent || '';
      return text.includes('Batch S01E02.mp4') && text.includes('1 SRT') &&
        !text.includes('Batch S01E01.mp4') &&
        !document.querySelector('#batchStartBtn').disabled;
    });
    console.log('Unified batch import, MKV mux and internal adapter isolation PASS');
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

    // The reviewer must be able to resolve a genuine tie without renaming
    // source files or silently accepting the first enumerated candidate.
    await page.locator('#batchPlan select[data-batch-tie-index="0"]').selectOption('1');
    await page.waitForFunction(() =>
      (document.querySelector('#batchReviewSummary')?.textContent || '').includes('1 项已人工确认') &&
      !document.querySelector('#batchStartBtn').disabled
    );
    assert.match(await page.locator('#batchJobInspector').textContent(), /Series B S01E01/);
    assert.match(await page.locator('#batchJobInspector').textContent(), /S01E01.zh-Hans.ass/);
    await page.locator('#batchJobInspector button[data-batch-revoke]').click();
    await page.waitForFunction(() =>
      (document.querySelector('#batchPlan')?.textContent || '').includes('字幕匹配多个视频') &&
      document.querySelector('#batchStartBtn').disabled
    );

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

async function scenarioBatchReportSavePartialPersistence(browser) {
  console.log('E2E: actual MKV persisted while report write fails and remains downloadable');
  const { context, page } = await openApp(browser);
  try {
    await page.evaluate(() => {
      const files = new Map();
      window.__batchPairDirectoryFiles = files;
      window.__batchPairWrites = [];
      window.__batchReportFail = true;
      window.showDirectoryPicker = async () => ({
        name: 'partial-report-failure-dir',
        requestPermission: async () => 'granted',
        entries: async function* () {
          for (const name of files.keys()) yield [name, { kind: 'file' }];
        },
        getFileHandle: async (name, { create = false } = {}) => {
          if (!files.has(name)) {
            if (!create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
            files.set(name, null);
          }
          return {
            getFile: async () => files.get(name),
            createWritable: async () => {
              let pending = null;
              return {
                write: async blob => {
                  window.__batchPairWrites.push(name);
                  if (window.__batchReportFail && name.endsWith('.mux-report.json')) throw new Error('report-specific simulated disk quota');
                  pending = blob;
                },
                close: async () => { files.set(name, pending); },
                abort: async () => {},
              };
            },
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
      return start && !start.disabled;
    }, null, { timeout: 90_000 });
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#batchStatus')?.textContent || '';
      return text.startsWith('批量完成：') || text.startsWith('批量中断：');
    }, null, { timeout: 360_000 });
    const summary = await page.locator('#batchStatus').textContent();
    assert.match(summary, /成功 1，失败 0/);
    assert.match(summary, /其中 1 项 MKV 已写入目录，但审计报告尚未写入/);
    const result = await page.locator('#batchResults').textContent();
    assert.match(result, /MKV 已写入目录，但报告写入失败/);
    assert.match(result, /report-specific simulated disk quota/);
    assert.equal(await page.locator('#batchResults a.download').count(), 1);
    assert.equal(await page.locator('#batchResults a.report-download').count(), 1);
    const published = await page.evaluate(() => {
      const files = window.__batchPairDirectoryFiles;
      return {
        names: [...files.keys()],
        mkvIsBlob: files.get('Batch S01E01.mkv') instanceof Blob,
        mkvBytes: files.get('Batch S01E01.mkv')?.size || 0,
        reportIsBlob: files.get('Batch S01E01.mux-report.json') instanceof Blob,
      };
    });
    assert.equal(published.mkvIsBlob, true, JSON.stringify(published));
    assert.ok(published.mkvBytes > 0);
    assert.equal(published.reportIsBlob, false);
    const completedLog = await page.locator('#log').textContent();
    const originalMkvHash = await page.evaluate(async () => {
      const blob = window.__batchPairDirectoryFiles.get('Batch S01E01.mkv');
      window.__batchOriginalMkv = blob;
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
      return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
    });
    const retry = page.locator('#batchResults [data-batch-save-retry]');
    assert.equal(await retry.count(),1);
    // An aborted report left its directory entry. Retry must refuse rather
    // than deleting/truncating it or remuxing the already valid MKV.
    await retry.click();
    await page.waitForFunction(()=>document.querySelector('#batchStatus').textContent.startsWith('批量完成：'));
    assert.match(await page.locator('#batchResults').textContent(), /保存目标已存在/);
    assert.deepEqual(await page.evaluate(()=>window.__batchPairWrites),
      ['Batch S01E01.mkv','Batch S01E01.mux-report.json']);
    // TEST-ONLY: emulate the user explicitly removing inspected failure
    // residue and resolving quota; production never deletes directory entries.
    await page.evaluate(()=>{
      window.__batchPairDirectoryFiles.delete('Batch S01E01.mux-report.json');
      window.__batchReportFail=false;
    });
    await retry.click();
    await page.waitForFunction(()=>!document.querySelector('#batchResults [data-batch-save-retry]'));
    assert.equal(await page.locator('#log').textContent(),completedLog,'save-only retry must not execute mux again');
    assert.deepEqual(await page.evaluate(()=>window.__batchPairWrites),
      ['Batch S01E01.mkv','Batch S01E01.mux-report.json','Batch S01E01.mux-report.json']);
    assert.equal(await page.evaluate(()=>window.__batchPairDirectoryFiles.get('Batch S01E01.mkv')===window.__batchOriginalMkv),true);
    assert.match(await page.locator('#batchResults').textContent(), /MKV 与报告均已写入/);
    assert.doesNotMatch(await page.locator('#batchStatus').textContent(), /尚未写入|未完整写入/);
    const finished = path.join(outDir,'r7-save-only-retained.mkv');
    const finalReport = path.join(outDir,'r7-save-only-retained.mux-report.json');
    await saveDownload(page,'#batchResults a.download',finished);
    await saveDownload(page,'#batchResults a.report-download',finalReport);
    assert.equal(createHash('sha256').update(await fs.readFile(finished)).digest('hex'),originalMkvHash);
    assert.equal(streams(probe(finished),'video').length,1);
    assert.equal(JSON.parse(await fs.readFile(finalReport,'utf8')).output.sha256,originalMkvHash);
    console.log('Batch report-only write failure honest persistence PASS');
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

async function scenarioBatchRecipeV2PerOutputRealMux(browser) {
  console.log('E2E Batch Recipe v2: 2 separate episode metadata rules -> frozen job plan -> independently probed MKVs');
  const {context,page}=await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput',[
      path.join(root,'Batch S01E01.mp4'),
      path.join(root,'Batch S01E02.mp4'),
    ]);
    await page.setInputFiles('#batchSubtitleInput',[
      path.join(root,'Batch S01E01.zh-Hans.ass'),
      path.join(root,'Batch S01E02.en.srt'),
    ]);
    await page.waitForFunction(()=>
      !document.querySelector('#batchStartBtn')?.disabled &&
      document.querySelectorAll('#batchPlan [data-batch-job-index]').length===2,
      null,{timeout:60000});
    const original=path.join(outDir,'batch-recipe-v2-original.json');
    await saveDownload(page,'#batchRecipeV2ExportBtn',original);
    const source=JSON.parse(await fs.readFile(original,'utf8'));
    assert.equal(source.schema,'batch-recipe-v2');
    assert.equal(source.jobs.length,2);
    assert.equal(source.sourceBindings,'must-reselect-and-verify');
    assert.equal(source.directoryPermission,'not-exported');
    assert.equal(source.jobs[0].subtitleRules.length,1);
    assert.equal(source.jobs[1].subtitleRules.length,1);
    assert.equal(source.savedArtifacts,'not-included');
    assert.equal(source.fileHandles,undefined);

    source.jobs[0].subtitleRules[0].title='Episode One V2 Approved';
    source.jobs[0].subtitleRules[0].language='jpn';
    source.jobs[0].subtitleRules[0].forced=true;
    source.jobs[1].subtitleRules[0].title='Episode Two V2 Approved';
    source.jobs[1].subtitleRules[0].language='eng';
    source.jobs[1].subtitleRules[0].commentary=true;
    const edited=path.join(outDir,'batch-recipe-v2-user-edited.json');
    await fs.writeFile(edited,JSON.stringify(source,null,2)+'\n');
    await page.setInputFiles('#batchRecipeV2ImportInput',edited);
    await page.waitForFunction(()=>
      (document.querySelector('#batchRecipeV2Notice')?.textContent||'')
        .includes('已读取 2 个逐输出任务'));
    assert.equal(await page.locator('#batchRecipeV2ConfirmBtn').isDisabled(),false);
    assert.equal(await page.locator('#batchResults a.download').count(),0);

    // A parsed JSON cannot grant execution, even if the actual sources happen
    // to match. The confirmation is an explicit distinct user interaction.
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(()=>
      (document.querySelector('#batchStatus')?.textContent||'').includes('v2 规则尚未确认'),
      null,{timeout:60000});
    assert.equal(await page.locator('#batchResults a.download').count(),0);
    await page.locator('#batchRecipeV2ConfirmBtn').click();
    await page.waitForFunction(()=>
      (document.querySelector('#batchRecipeV2Notice')?.textContent||'')
        .includes('已确认 2 个逐输出字幕规则'),null,{timeout:60000});
    await page.waitForFunction(()=>
      !document.querySelector('#batchStartBtn')?.disabled,null,{timeout:60000});
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(()=>
      (document.querySelector('#batchStatus')?.textContent||'')
        .startsWith('批量完成：'),null,{timeout:360000});
    assert.match(await page.locator('#batchStatus').textContent(),/成功 2，失败 0/);
    const rows=page.locator('#batchResults .new-track-row');
    assert.equal(await rows.count(),2);
    const first=path.join(outDir,'batch-recipe-v2-first.mkv');
    const second=path.join(outDir,'batch-recipe-v2-second.mkv');
    await saveDownload(page,'#batchResults .new-track-row:nth-child(1) a.download',first);
    await saveDownload(page,'#batchResults .new-track-row:nth-child(2) a.download',second);
    const firstSub=streams(probe(first),'subtitle')[0];
    const secondSub=streams(probe(second),'subtitle')[0];
    assert.equal(firstSub.tags?.title,'Episode One V2 Approved');
    assert.equal(firstSub.tags?.language,'jpn');
    assert.equal(Boolean(firstSub.disposition?.forced),true);
    assert.equal(secondSub.tags?.title,'Episode Two V2 Approved');
    assert.equal(secondSub.tags?.language,'eng');
    assert.equal(Boolean(secondSub.disposition?.comment),true);
    const report=path.join(outDir,'batch-recipe-v2-first-report.json');
    await saveDownload(page,'#batchResults .new-track-row:nth-child(1) a.report-download',report);
    const firstAudit=JSON.parse(await fs.readFile(report,'utf8'));
    assert.equal(firstAudit.plan.execution,'frozen-batch-context-v1');
    assert.equal(firstAudit.plan.subtitles[0].title,'Episode One V2 Approved');
    assert.equal(firstAudit.plan.outputName,'Batch S01E01.mkv');
    assert.equal(await page.locator('#batchPlan .batch-review-state[data-state="awaitingSave"]').count(),2);
    console.log('Batch Recipe v2 independent output and execution audit PASS');
  } finally { await context.close(); }
}

async function scenarioBatchFailedJobRetry(browser) {
  console.log('R7: actual batch failed-job retry retains other finished artifacts');
  const { context, page } = await openApp(browser);
  try {
    // Fault injection only at the worker boundary. Successful outputs and the
    // retry still use the real wasm worker; no production test hooks exist.
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      window.__batchMuxAttempts = 0;
      window.__batchFailSecond = true;
      Worker.prototype.postMessage = function(message, ...rest) {
        if (message?.type === 'EXEC' && message.data?.args?.at(-1)?.endsWith('-output.mkv')) {
          window.__batchMuxAttempts++;
          if (window.__batchFailSecond && window.__batchMuxAttempts === 2) {
            window.__batchFailSecond = false;
            queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
              data: {id: message.id, type: 'EXEC', data: 1},
            })));
            return;
          }
        }
        return original.call(this, message, ...rest);
      };
    });
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', [path.join(root,'Batch S01E01.mp4'), path.join(root,'Batch S01E02.mp4')]);
    await page.setInputFiles('#batchSubtitleInput', [path.join(root,'Batch S01E01.zh-Hans.ass'), path.join(root,'Batch S01E02.en.srt')]);
    await page.waitForFunction(() => !document.querySelector('#batchStartBtn').disabled);
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => /批量完成：成功 1，失败 1/.test(document.querySelector('#batchStatus').textContent), null, {timeout:360_000});
    const originalUrl = await page.locator('#batchResults a.download').getAttribute('href');
    const firstPath = path.join(outDir,'r7-retry-retained-first.mkv');
    await saveDownload(page, '#batchResults a.download', firstPath);
    const firstHash = createHash('sha256').update(await fs.readFile(firstPath)).digest('hex');
    assert.equal(await page.evaluate(()=>window.__batchMuxAttempts),2);
    // Live batch input/policy edits must not replace frozen failed-job choices.
    await page.setInputFiles('#batchSubtitleInput', path.join(root,'Batch S01E01.zh-Hans.ass'));
    await page.locator('[data-batch-job-retry]').click();
    await page.waitForFunction(() => /批量完成：成功 2，失败 0/.test(document.querySelector('#batchStatus').textContent), null, {timeout:360_000});
    assert.equal(await page.evaluate(()=>window.__batchMuxAttempts),3,'only the failed task is muxed again');
    assert.equal(await page.locator('#batchResults .new-track-row:first-child a.download').getAttribute('href'), originalUrl);
    assert.equal(await page.locator('[data-batch-job-retry]').count(),0);
    const retryPath = path.join(outDir,'r7-retry-second.mkv');
    const reportPath = path.join(outDir,'r7-retry-second-report.json');
    await saveDownload(page,'#batchResults .new-track-row:last-child a.download',retryPath);
    await saveDownload(page,'#batchResults .new-track-row:last-child a.report-download',reportPath);
    const report = JSON.parse(await fs.readFile(reportPath,'utf8'));
    assert.equal(report.plan.outputName,'Batch S01E02.mkv');
    assert.equal(report.output.sha256,createHash('sha256').update(await fs.readFile(retryPath)).digest('hex'));
    // Matroska/FFmpeg normalizes the frozen `en` request to ISO 639-2 `eng` in the delivered report.
    assert.equal(report.subtitle.tracks[0].language,'eng');
    assert.equal(streams(probe(retryPath),'subtitle')[0].codec_name,'subrip');
    // Independently check actual recovered cue payload, not just report fields.
    const recovered = execFileSync('ffmpeg',['-v','error','-i',retryPath,'-map','0:s:0','-f','srt','-'],{encoding:'utf8'});
    const expected = await fs.readFile(path.join(root,'Batch S01E02.en.srt'),'utf8');
    const text = value => value.replace(/\r/g,'').trim();
    assert.equal(text(recovered),text(expected));
    const retainedAgain = path.join(outDir,'r7-retry-retained-first-again.mkv');
    await saveDownload(page,'#batchResults .new-track-row:first-child a.download',retainedAgain);
    assert.equal(createHash('sha256').update(await fs.readFile(retainedAgain)).digest('hex'),firstHash);
    console.log('R7 actual failed-job retry PASS');
  } finally { await context.close(); }
}

async function scenarioBatchQueue(browser) {
  console.log('E2E scenario 28: two-job batch queue with filename pairing');
  const { context, page } = await openApp(browser);

  try {
    // A separate single-task draft must survive the complete frozen queue:
    // batch no longer stages content into the single-task FileList controls.
    await page.setInputFiles('#videoInput', path.join(root, 'base.mp4'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.waitForFunction(() => Boolean(
      document.querySelector('#videoInput')?.files?.length === 1 &&
      document.querySelector('#subInput')?.files?.length === 1 &&
      document.querySelector('select[data-new-sub-field="language"][data-index="0"]')
    ), null, { timeout: 30_000 });
    const draftBeforeBatch = await page.evaluate(() => ({
      source: document.querySelector('#videoInput')?.files?.[0]?.name,
      subtitle: document.querySelector('#subInput')?.files?.[0]?.name,
      language: document.querySelector('select[data-new-sub-field="language"][data-index="0"]')?.value,
    }));
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
    // Generated blobs without a selected write directory are NOT persisted files.
    await page.waitForFunction(() =>
      document.querySelectorAll('#batchPlan .batch-review-state[data-state="awaitingSave"]').length === 2
    );
    assert.match(await page.locator('#batchJobInspector').textContent(), /待下载保存/);
    const draftAfterBatch = await page.evaluate(() => ({
      source: document.querySelector('#videoInput')?.files?.[0]?.name,
      subtitle: document.querySelector('#subInput')?.files?.[0]?.name,
      language: document.querySelector('select[data-new-sub-field="language"][data-index="0"]')?.value,
    }));
    assert.deepEqual(draftAfterBatch, draftBeforeBatch,
      'a batch must not stage and restore over an independent single-task draft');
    const reportPath = path.join(outDir, 'batch-explicit-context-first-report.json');
    await saveDownload(page, '#batchResults .new-track-row:first-child a.report-download', reportPath);
    const itemReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(itemReport.plan.execution, 'frozen-batch-context-v1');
    assert.match(itemReport.plan.jobId, /^batch:/);
    assert.equal(itemReport.plan.outputName, 'Batch S01E01.mkv');
    assert.equal(itemReport.subtitle.tracks[0].language, 'zh-Hans');
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

async function scenarioBatchGroupSubsetPreparationFailure(browser) {
  console.log('E2E: Group font-subset preparation failure is visible and input state is restored');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.setInputFiles('#batchFontInput', path.join(root, 'DejaVuSans.ttf'));
    await page.locator('#batchFontSubsetEnabled').check();
    await page.locator('#batchSubsetScope').selectOption('group');

    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      const start = document.querySelector('#batchStartBtn');
      return plan.includes('Batch S01E01.mp4') && start && !start.disabled;
    }, null, { timeout: 60_000 });

    // Inject only after preflight/cached file identity checks are complete.
    // Group preparation then reads the actual ASS bytes with readAssText().
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function (...args) {
        if (this.name === 'Batch S01E01.zh-Hans.ass') {
          return Promise.reject(new Error('simulated group subtitle read failure'));
        }
        return original.apply(this, args);
      };
    });

    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => {
      const message = document.querySelector('#batchStatus')?.textContent || '';
      return message.startsWith('批量中断：');
    }, null, { timeout: 120_000 });

    const message = await page.locator('#batchStatus').textContent();
    assert.match(message, /批量中断：simulated group subtitle read failure/);
    assert.match(message, /已完成 0，单项失败 0/);
    assert.doesNotMatch(message, /批量完成/);
    assert.equal(await page.locator('#batchResults a.download').count(), 0);
    await page.waitForFunction(() => {
      const start = document.querySelector('#batchStartBtn');
      return start && !start.disabled;
    }, null, { timeout: 60_000 });
    console.log('Batch Group preparation failure feedback PASS');
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
    for (const selector of ['#batchUnifiedInput', '#batchUnifiedFolderInput', '#batchAssetDropzone', '#batchSubsetScope', '#batchOutputDirBtn']) {
      assert.equal(await page.locator(selector).isVisible(), true, selector);
    }
    assert.equal(await page.locator('.batch-legacy-intake').count(), 0);
    assert.equal(await page.locator('#batchVideoInput').isVisible(), false);
    assert.equal(await page.locator('#batchVideoInput').isVisible(), false,
      'internal adapters must never appear as a user-facing batch import');
    assert.equal(await page.locator('.batch-legacy-intake').count(), 0);
    for (const selector of ['#batchVideoInput', '#batchSubtitleFolderInput', '#batchFontFolderInput']) {
      assert.equal(await page.locator(selector).isVisible(), false, selector);
    }
    // mobile two-mode editor and disclosure behavior
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
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
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    assert.equal(await page.locator('#muxPlan').isVisible(), false);
    await page.locator('#mobilePlanToggle').click();
    assert.equal(await page.locator('#muxPlan').isVisible(), true);
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
    await page.locator('[data-editor-filter="source"]').click();
    assert.equal(await page.locator('#appendPreserveAll').isVisible(), true);
    assert.equal(await page.locator('#fontMode').isVisible(), false);
    await page.locator('[data-editor-filter="all"]').click();
    assert.equal(await page.locator('#fontMode').isVisible(), true);
    assert.equal(await page.locator('#newAudioList').isVisible(), true);
    assert.equal(await page.locator('#newSubtitleList').isVisible(), true);
    // mobile all mode excludes source structure; source remains its own mode
    assert.equal(await page.locator('#appendPreserveAll').isVisible(), false);
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    const mobileIntake = await page.locator('.unified-intake').boundingBox();
    assert.ok(mobileIntake && mobileIntake.width > 250, 'unified intake should remain usable on phones');
    assert.equal(await page.locator('.legacy-source-picker').isVisible(), false);

    for (const width of [1920, 1440, 1360, 1280, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });

      if (width <= 600) {
        await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
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
        return { scroll: document.documentElement.scrollWidth, viewport: innerWidth, ratio: rect.width / rect.height, previewBottom: rect.bottom, editorTop: editor.top };
      });
      assert.ok(layout.scroll <= layout.viewport, `horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
      assert.ok(Math.abs(layout.ratio - 16 / 9) < .01, `preview ratio at ${width}: ${layout.ratio}`);
      if (width >= 1440) assert.ok(layout.previewBottom <= layout.editorTop + 2,
        `desktop should show subtitle preview before secondary configuration at ${width}: ${JSON.stringify(layout)}`);
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
    assert.equal(await page.locator('#outputCompositionPanel').isVisible(), true);
    assert.equal(await page.locator('.composition-select[data-composition-id^="external:subtitle:"]').count(), 1);
    assert.equal(await page.locator('.composition-select[data-composition-id^="external:audio:"]').count(), 1);
    assert.equal(await page.locator('.composition-select[data-composition-id^="font:"]').count(), 1);
    assert.equal(await page.locator('#sourceFilesDetails').getAttribute('open'), null,
      'source evidence is secondary when file recognition has no blocking conflict');
    await page.locator('.composition-select[data-composition-id^="external:subtitle:"]').click();
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'subtitle');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"]').evaluate(el => el === document.activeElement), true);
    await page.locator('.composition-select[data-composition-id^="external:audio:"]').click();
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'audio');
    assert.equal(await page.locator('#newAudioList [data-new-audio-field="title"]').evaluate(el => el === document.activeElement), true);
    await page.locator('#sourceFilesDetails > summary').click();

    // Resource inventory selection must land on the correct *existing* editor
    // without mounting duplicate forms or mutating mux state.
    await page.locator('.asset-entry[data-kind="subtitle"] [data-asset-focus-key]').click();
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'subtitle');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"]').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('.asset-entry[data-kind="subtitle"]').getAttribute('data-focused'), 'true');
    await page.locator('.asset-entry[data-kind="audio"] [data-asset-focus-key]').click();
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'audio');
    assert.equal(await page.locator('#newAudioList [data-new-audio-field="title"]').evaluate(el => el === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    await page.locator('.asset-entry[data-kind="font"] [data-asset-focus-key]').click();
    assert.equal(await page.locator('.editor-column').isVisible(), true);
    assert.equal(await page.locator('.stage-input').isVisible(), false);
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'font');
    assert.equal(await page.locator('#fontMode').evaluate(el => el === document.activeElement), true);
    await page.setViewportSize({ width: 1440, height: 900 });

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
    const removeUnknown = page.locator('.asset-entry[data-kind="unknown"] [data-asset-remove]');
    await removeUnknown.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() =>
      document.activeElement?.closest('#assetInventory .asset-entry')?.dataset.kind),
    'font', 'after removing last single asset, focus must not fall onto document.body');
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

    const selectMkvSource = page.locator('.asset-entry[data-kind="container"]')
      .filter({ hasText: 'source-with-attachments.mkv' }).locator('[data-asset-source]');
    await selectMkvSource.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-asset-source')),
      await selectMkvSource.getAttribute('data-asset-source'),
      'switching source by keyboard must preserve the focused radio after inventory redraw');
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

async function scenarioLiveSourceTrackDomainToRealMux(browser) {
  console.log('E2E P1: one live source-track domain for legacy fields, bulk actions and real delivered MKV');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    await page.locator('#trackBulkTools > summary').click();
    // Bulk and ordinary source controls must update the SAME
    // authoritative ContainerProject and legacy FFmpeg output projection.
    await page.locator('#bulkLanguage').fill('eng');
    await page.locator('#applyAudioLanguage').click();
    await page.locator('#firstAudioDefault').click();
    await page.locator('.track-row.track-audio input[data-track-field="title"]').first()
      .fill('Domain authored main audio');
    await page.locator('#dropAllSubtitles').click();
    assert.equal(await page.locator('.track-row.track-subtitle input[data-track-action="include"]:checked').count(),0);
    await page.locator('#keepAllSubtitles').click();
    assert.equal(await page.locator('.track-row.track-subtitle input[data-track-action="include"]:checked').count(),1);
    assert.match(await page.locator('#muxPlan').textContent(), /Domain authored main audio/);
    const rows = page.locator('.track-row.track-audio');
    assert.equal(await rows.nth(0).locator('input[data-track-field="language"]').inputValue(), 'eng');
    assert.equal(await rows.nth(1).locator('input[data-track-field="language"]').inputValue(), 'eng');
    assert.equal(await rows.nth(0).locator('input[data-track-action="default"]').isChecked(),true);
    assert.equal(await rows.nth(1).locator('input[data-track-action="default"]').isChecked(),false);

    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'p1-live-domain-authority-final.mkv');
    await saveDownload(page, '#downloadLink', output);
    const result = probe(output);
    const audios = streams(result,'audio');
    assert.equal(audios.length,2);
    assert.ok(audios.every(track => track.tags?.language === 'eng'));
    assert.equal(audios[0].tags?.title,'Domain authored main audio');
    assert.equal(audios[0].disposition?.default,1);
    assert.equal(audios[1].disposition?.default,0);
    assert.equal(streams(result,'subtitle').length,1);
    console.log('Live domain -> legacy writer -> independent ffprobe output PASS');
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
    await page.locator('#sourceFilesDetails > summary').click();
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
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    assert.equal(await page.locator('#muxBtn').isVisible(), true);
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
    await page.locator('#sourceFilesDetails > summary').click();

    const tree = page.locator('.asset-container-tree');
    await tree.waitFor({ state: 'visible' });
    assert.match(await page.locator('.asset-entry[data-kind="container"] .asset-entry-type').textContent(),
      /已扫描/, 'file identity label must reflect the completed actual source probe');
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
    assert.equal(await audioRows.nth(1).locator('.asset-tree-index-name').textContent(),
      'Second tree audio', 'source index updates without remounting the edited text input');

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
    await tree.locator('[data-tree-advanced-tools]').click();
    const advancedAudioRow = page.locator(
      `.track-row.track-audio:has(input[data-track-action="commentary"][data-track-index="${editedSourceIndex}"])`
    );
    await advancedAudioRow.locator('details.track-advanced > summary').click();
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

    // Source flags and the complete within-kind track permutation are
    // projected into typed, scan-baseline detached edit intents. Real replay
    // requires proof and never executes from JSON without explicit consent.
    const advancedDraftPath = path.join(outDir, 'p1-advanced-dispositions-draft.json');
    await saveDownload(page, '#containerProjectExportBtn', advancedDraftPath);
    const advancedDraft = JSON.parse(await fs.readFile(advancedDraftPath, 'utf8'));
    assert.match(await page.locator('#status').textContent(),
      /轨道排序修改已记录为可核验的草稿意图/,
      'a project export after reordering must describe proof-bound, consent-gated restoration');
    assert.equal(advancedDraft.schema, 'container-project-v1');
    assert.ok(advancedDraft.editIntents.some(intent =>
      intent.field === 'commentary' && intent.to === true),
      'advanced commentary edit must survive portable project export');
    assert.ok(advancedDraft.editIntents.some(intent =>
      intent.field === 'hearingImpaired' && intent.to === true),
      'advanced hearing-impaired disposition must survive portable project export');
    assert.equal(advancedDraft.editIntents.filter(intent=>intent.type==='reorder').length,2,
      'a two-audio-track swap must export a complete two-object permutation, never one arbitrary order assignment');

    // Visual acceptance captures the normal workbench, not the deliberately
    // expanded advanced track tools used to test reverse synchronization.
    await tree.locator('[data-tree-advanced-tools]').click();
    assert.equal(await page.locator('.source-track-card').isVisible(), true,
      'source-level preserve and scan controls remain available for the active stream');
    assert.equal(await page.locator('.source-track-card #trackList').isVisible(), false,
      'the old full stream list must not compete with the single selected inspector');

    // Capture the actual default composition view; source/probe evidence
    // remains available from the secondary disclosure, not a duplicate list.
    await page.locator('#sourceFilesDetails > summary').click();
    assert.equal(await page.locator('#sourceFilesDetails').getAttribute('open'), null);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outDir, 'mkv-container-tree-desktop-viewport-1440.png'),
      animations: 'disabled',
    });
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-desktop-1440.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outDir, 'mkv-container-tree-phone-viewport-390.png'),
      animations: 'disabled',
    });
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-phone-390.png'),
      animations: 'disabled',
    });
    assert.equal(await page.locator('#sourceFilesDetails').getAttribute('open'), null);
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-editor-phone-390.png'),
      animations: 'disabled',
    });
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    await page.locator('.workspace').screenshot({
      path: path.join(outDir, 'mkv-container-tree-output-phone-390.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#sourceFilesDetails > summary').click();

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
    await page.locator('#sourceFilesDetails > summary').click();
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
    assert.equal(await page.locator('#outputCompositionPanel').isVisible(), true);
    assert.equal(await page.locator('.composition-select[data-composition-id="source:audio:2"]').count(), 1,
      'composed output must have one stable source audio stream row');
    await page.locator('.composition-select[data-composition-id="source:audio:2"]').click();
    assert.equal(await page.locator('#assetInspectorHost').isVisible(), true,
      'composition row must activate the original inspector without a second editor');
    await page.locator('#sourceFilesDetails > summary').click();
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
    assert.equal(await page.locator('#assetInspectorHost').isVisible(), true,
      'composition selected object must have an active inspector');
    assert.ok(regions.scrollWidth <= regions.viewport, 'desktop must not overflow horizontally');
    const desktopFileActionTop = await page.evaluate(() => {
      const control = document.querySelector('#unifiedAssetInput').closest('.intake-picker');
      return control.getBoundingClientRect().top + scrollY;
    });
    assert.ok(desktopFileActionTop < 210, 'file action must be at the top of the desktop tool');
    assert.equal(await page.locator('.workspace-overview').count(), 0,
      'retired descriptive billboard must not consume the workspace');
    assert.equal(await page.locator('.asset-tree-inspector').count(), 1,
      'one visible editor, not repeated per stream');
    assert.equal(await page.locator('#muxBtn').getByText('开始封装 MKV').isVisible(), true);

    const nav = page.locator('[data-tree-group="audio"] [data-tree-select]');
    await nav.nth(1).focus();
    await page.keyboard.press('Enter');
    assert.equal(await nav.nth(1).getAttribute('aria-pressed'), 'true');
    const activeInspector = await page.evaluate(() => {
      const editor = document.querySelector('.editor-column').getBoundingClientRect();
      const inspector = document.querySelector('#assetInspectorHost').getBoundingClientRect();
      return { editorLeft: editor.left, editorRight: editor.right, left: inspector.left, right: inspector.right, width: inspector.width };
    });
    assert.ok(activeInspector.width > 0 && activeInspector.left >= activeInspector.editorLeft - 1 &&
      activeInspector.right <= activeInspector.editorRight + 2,
      `selected object inspector must live inside the actual editor: ${JSON.stringify(activeInspector)}`);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-tree-select')),
      'audio:2', 'keyboard focus should survive navigator re-render');
    assert.equal(await page.locator('.editor-grid').getAttribute('data-editor-focus'), 'source',
      'selecting an MKV stream makes that source object the active editor, not the All form');
    assert.equal(await page.locator('.source-track-card #trackList').isVisible(), false,
      'the single source inspector must not have a competing full track list');
    const selectedSourceIndex = await page.locator('#assetInspectorHost [data-tree-track-include]')
      .getAttribute('data-tree-track-include');
    assert.equal(selectedSourceIndex, '2', 'keyboard selection must target the correct source stream');
    // Preserve-all is the safe default: editing a source track is intentionally
    // disabled until the user chooses selective modification.
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').isDisabled(), true);
    await page.locator('[data-tree-preserve-all]').uncheck();
    await page.waitForFunction(() => {
      const field = document.querySelector('#assetInspectorHost [data-tree-track-field="title"]');
      return field && !field.disabled;
    });
    await page.locator('#assetInspectorHost [data-tree-track-field="title"]').fill('Viewport persistent audio');
    assert.equal(await nav.nth(1).locator('.asset-tree-index-name').textContent(),
      'Viewport persistent audio', 'navigator must stay in sync with the active inspector');

    await page.screenshot({
      path: path.join(outDir, 'mkv-round5-workspace-desktop-1600.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.locator('#outputCompositionPanel').isVisible(), true);
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').inputValue(),
      'Viewport persistent audio', 'selected object edit must survive tablet reflow');
    await page.screenshot({
      path: path.join(outDir, 'mkv-round5-workspace-tablet-768.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('#assetInspectorHost');
      return inspector && inspector.getBoundingClientRect().width > 0;
    });
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').inputValue(),
      'Viewport persistent audio', 'edited stream attributes survive desktop-to-phone reflow');
    assert.equal(await nav.nth(1).getAttribute('aria-pressed'), 'true',
      'source track selection survives viewport changes');
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
    assert.equal(await page.locator('.stage-input').isVisible(), false,
      'mobile editor must not be buried under the file inventory');
    assert.equal(await page.locator('.output-hub').isVisible(), false,
      'mobile editing must not stack an unrelated output form');
    assert.equal(await page.locator('.editor-column').isVisible(), true);
    assert.ok(mobile.inspectorRight <= mobile.viewport + 1, 'mobile inspector must not clip');
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-include]').isVisible(), true);
    assert.equal(await page.locator('.workbench-jump-nav').isVisible(), true);
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    const mobileFileActionTop = await page.evaluate(() => {
      const control = document.querySelector('#unifiedAssetInput').closest('.intake-picker');
      return control.getBoundingClientRect().top + scrollY;
    });
    assert.ok(mobileFileActionTop < 300, 'phone first screen must expose add-file action');
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    assert.equal(await page.locator('#muxBtn').isVisible(), true);
    const actionOrder = await page.evaluate(() => ({
      action: document.querySelector('.execution-panel').getBoundingClientRect().top,
      details: document.querySelector('.plan-panel').getBoundingClientRect().top,
    }));
    assert.ok(actionOrder.action < actionOrder.details,
      'execute/status must precede detailed plan in visual and DOM order');
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    assert.equal(await page.evaluate(() => location.hash), '#workbench-output-title');
    await page.waitForFunction(() =>
      document.querySelector('.workbench-jump-nav a[href="#workbench-output-title"]')?.getAttribute('aria-current') === 'location'
    );
    await page.waitForFunction(() => {
      const r = document.querySelector('#muxBtn').getBoundingClientRect();
      return r.height > 0 && r.top >= 40 && r.bottom <= innerHeight;
    }, null, { timeout: 10000 });
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => location.hash), '#workbench-editor-title');
    await page.waitForFunction(() =>
      document.querySelector('.workbench-jump-nav a[href="#workbench-editor-title"]')?.getAttribute('aria-current') === 'location'
    );
    assert.equal(await page.locator('.workbench-jump-nav a[aria-current="location"]').count(), 1);

    // The narrowest supported phone viewport must keep a real, reachable
    // MKV action and selected inspector without horizontal page clipping.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.locator('#outputCompositionPanel').isVisible(), true);
    assert.equal(await page.locator('.composition-select[data-composition-id="source:audio:2"]').count(), 1);
    assert.equal(await page.locator('#compositionMuxBtn').isVisible(), true);
    await page.locator('.workbench-jump-nav a[href="#workbench-editor-title"]').click();
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').inputValue(),
      'Viewport persistent audio', '320px work-area switch must retain the selected track metadata');
    await page.locator('.workbench-jump-nav a[href="#workbench-output-title"]').click();
    assert.equal(await page.locator('#muxBtn').isVisible(), true);
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);

    await page.setViewportSize({ width: 1600, height: 960 });
    await page.waitForFunction(() => {
      const nav = document.querySelector('.workbench-jump-nav');
      return nav && getComputedStyle(nav).display === 'none' &&
        document.documentElement.scrollWidth <= innerWidth;
    });
    assert.equal(await page.locator('.workbench-jump-nav').isVisible(), false,
      'desktop workbench must not waste an extra row on duplicate task navigation');
    assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').inputValue(),
      'Viewport persistent audio', 'edited stream attributes survive phone-to-desktop reflow');
    assert.equal(await nav.nth(1).getAttribute('aria-pressed'), 'true',
      'source selection must be stable across both viewport transitions');
    assert.equal(await page.locator('.asset-tree-inspector').count(), 1,
      'responsive reflow must not mount a second editable stream inspector');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench-jump-nav a[href="#source-title"]').click();
    await page.locator('[data-tree-group="subtitle"] [data-tree-select]').first().click();
    assert.equal(await page.locator('.editor-column').isVisible(), true,
      'choosing a source track on the phone opens the actual object editor');
    assert.equal(await page.locator('.stage-input').isVisible(), false);
    assert.equal(await page.locator('.asset-tree-inspector').count(), 1,
      'phone source-to-editor transition must preserve one shared inspector');
    console.log('Three-zone MKV workbench, responsive edit retention, keyboard selection and task jumps PASS');
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

    await page.waitForFunction(() => !document.querySelector('#scanTracksBtn')?.disabled);
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

// P0 regression: independently authored MKV contains nested Chapters and
// UID-targeted Tags. The browser must reject before creating an output.
// P1: holding a real MKV EBML preflight must never allow a different subtitle
// selected during the await to enter the old writer or erase old artifacts.
async function scenarioP1SubtitleIntentInvalidation(browser) {
  console.log('P1 subtitle execution: delayed source preflight rejects stale subtitle edit');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#videoInput', path.join(root, 'source-multitrack.mkv'));
    await page.setInputFiles('#subInput', path.join(root, 'zh.ass'));
    await page.waitForFunction(() => {
      const button = document.querySelector('#muxBtn');
      const subtitles = document.querySelector('#newSubtitleList')?.textContent || '';
      return button && !button.disabled && subtitles.includes('zh.ass') &&
        document.querySelector('#appendPreserveAll')?.checked;
    }, null, { timeout: 90_000 });

    await page.evaluate(() => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      window.__p1SubtitleRead = { entered: false, used: false, release };
      const originalSlice = File.prototype.slice;
      File.prototype.slice = function (...args) {
        const part = originalSlice.apply(this, args);
        if (this.name !== 'source-multitrack.mkv') return part;
        const originalRead = part.arrayBuffer.bind(part);
        part.arrayBuffer = async () => {
          if (!window.__p1SubtitleRead.used) {
            window.__p1SubtitleRead.used = true;
            window.__p1SubtitleRead.entered = true;
            await gate;
          }
          return originalRead();
        };
        return part;
      };
    });

    await page.locator('#muxBtn').click();
    await page.waitForFunction(() => window.__p1SubtitleRead?.entered,
      null, { timeout: 45_000 });
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);

    // Deliberately change a disabled native picker programmatically. Browser
    // disabling is not a trustworthy state/plan revision check.
    await page.setInputFiles('#subInput', path.join(root, 'en.ass'));
    await page.waitForFunction(() => {
      const selected = document.querySelector('#subInput')?.files?.[0]?.name;
      const displayed = document.querySelector('#newSubtitleList')?.textContent || '';
      return selected === 'en.ass' && displayed.includes('en.ass');
    }, null, { timeout: 45_000 });
    await page.evaluate(() => window.__p1SubtitleRead.release());

    await page.waitForFunction(() => {
      const message = document.querySelector('#status')?.textContent || '';
      return message.includes('执行准备期间字幕来源、格式或轨道选项已改变');
    }, null, { timeout: 90_000 });
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    assert.equal(await page.locator('#reportLink').isVisible(), false);
    console.log('P1 subtitle stale-preflight rejection PASS');
  } finally {
    await context.close();
  }
}

// P2 generic attachment extraction is independent of the video-rooted mux.
async function scenarioP2GenericAttachmentExtraction(browser) {
  console.log('P2: inspect generic attachments and independently compare downloaded bytes');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#attachmentExtractionDetails > summary').click();
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    await page.setInputFiles('#attachmentInspectInput',
      path.join(root, 'p0-independent-attachmenttag.mkv'));
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'ready'
        && document.querySelectorAll('.attachment-extraction-row').length === 2,
      null, { timeout: 90_000 });

    const status = await page.locator('#attachmentInspectStatus').textContent();
    assert.match(status, /2 个附件/);
    const first = page.locator('.attachment-extraction-row').first();
    assert.match(await first.textContent(), /p0-attachment-evidence.bin/);
    assert.match(await first.textContent(), /未验证内容/);
    const downloaded = path.join(outDir, 'p2-independent-attachment.bin');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      first.locator('button[data-attachment-download]').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'p0-attachment-evidence.bin');
    await download.saveAs(downloaded);
    assert.deepEqual(await fs.readFile(downloaded), await fs.readFile(path.join(root, 'notes.txt')));
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);

    // The view must not retain extractable rows after a failed new inspection.
    await page.setInputFiles('#attachmentInspectInput', {
      name: 'malformed.mkv', mimeType: 'application/octet-stream',
      buffer: Buffer.from('not Matroska'),
    });
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'unverified',
      null, { timeout: 30_000 });
    assert.equal(await page.locator('[data-attachment-download]').count(), 0);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    console.log('P2 independently-authored attachment browser extraction PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP2R02NoTrackAndMimeEvidence(browser) {
  console.log('P2 R-02: no-video PNG-only Matroska real browser inspect, prefix check and byte download');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#attachmentExtractionDetails > summary').click();
    await page.setInputFiles('#attachmentInspectInput', {
      name: 'r02-attachment-only.mkv', mimeType: 'application/octet-stream',
      buffer: createResearchFixture(),
    });
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'ready' &&
      document.querySelectorAll('.attachment-extraction-row').length === 1,
      null, { timeout: 45_000 });
    const row = page.locator('.attachment-extraction-row').first();
    assert.match(await row.textContent(), /pixel\.png/);
    assert.match(await row.textContent(), /未检查/);
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    await row.locator('button[data-attachment-check]').click();
    await page.waitForFunction(() =>
      document.querySelector('.attachment-extraction-row')?.textContent?.includes('PNG 文件头'),
      null, { timeout: 30_000 });
    assert.match(await row.textContent(), /仅文件头匹配/);

    const downloaded = path.join(outDir, 'p2-r02-browser-no-video-pixel.png');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      row.locator('button[data-attachment-download]').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'pixel.png');
    await download.saveAs(downloaded);
    assert.deepEqual(await fs.readFile(downloaded), pngBytes);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);

    // Same PNG FileData, deliberately false Matroska MIME declaration.
    await page.setInputFiles('#attachmentInspectInput', {
      name: 'r02-declared-pdf.mkv', mimeType: 'application/octet-stream',
      buffer: createResearchFixture({ declaredMimeType: 'application/pdf' }),
    });
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'ready' &&
      document.querySelectorAll('.attachment-extraction-row').length === 1,
      null, { timeout: 45_000 });
    const mismatchRow = page.locator('.attachment-extraction-row').first();
    await mismatchRow.locator('button[data-attachment-check]').click();
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'warning',
      null, { timeout: 30_000 });
    assert.match(await mismatchRow.textContent(), /内容警告/);
    assert.match(await mismatchRow.textContent(), /application\/pdf/);
    assert.match(await mismatchRow.textContent(), /image\/png/);
    assert.equal(await page.locator('#attachmentInspectList .attachment-extraction-warning').count(), 1);
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    console.log('P2 R-02 no-track browser extract + MIME mismatch warning PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP2R02BrowserCreateOnlyPng(browser) {
  console.log('P2 R-02-CREATE: browser experimental JobPlan writer and independent MKVToolNix audit');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#pngOnlyExperimentDetails > summary').click();
    assert.equal(await page.locator('#pngOnlySaveButton').isDisabled(), true);
    await page.setInputFiles('#pngOnlyCreateInput', {
      name: 'pixel.png', mimeType: 'image/png', buffer: pngBytes,
    });
    await page.locator('#pngOnlyPrepareButton').click();
    await page.waitForFunction(() =>
      document.querySelector('#pngOnlyExperimentStatus')?.dataset.state === 'prepared',
      null, { timeout: 60_000 });
    assert.match(await page.locator('#pngOnlyExperimentStatus').textContent(),
      /SHA-256 对照通过/);
    assert.equal(await page.locator('#pngOnlySaveButton').isEnabled(), true);
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);

    const candidateOutput = path.join(outDir, 'p2-r02-real-browser-writer.mkv');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#pngOnlySaveButton').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'attachments-only.mkv');
    await download.saveAs(candidateOutput);

    // Independent reader/extractor of a real BROWSER-produced candidate Blob.
    const info = JSON.parse(execFileSync('mkvmerge', ['-J', candidateOutput], {
      encoding: 'utf8', timeout: 30_000,
    }));
    assert.equal((info.tracks || []).length, 0,
      'candidate writer must not invent a video/audio/subtitle track');
    assert.equal((info.attachments || []).length, 1);
    const item = info.attachments[0];
    assert.equal(item.file_name, 'pixel.png');
    assert.equal(item.content_type, 'image/png');
    assert.equal(item.size, pngBytes.length);
    assert.ok(Number.isInteger(item.id));
    const extracted = path.join(outDir, 'p2-r02-real-browser-extracted.png');
    execFileSync('mkvextract', ['attachments', candidateOutput,
      String(item.id) + ':' + extracted], { encoding: 'utf8', timeout: 30_000 });
    assert.deepEqual(await fs.readFile(extracted), pngBytes);
    const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
    await fs.writeFile(path.join(outDir, 'p2-r02-browser-candidate-report.json'),
      JSON.stringify({
        schema: 'r02-browser-candidate-writer-e2e-v0',
        result: 'BROWSER_WRITER_INDEPENDENT_ZERO_TRACK_AND_PNG_BYTES_MATCH',
        downloadedMkv: candidateOutput,
        observedTracks: (info.tracks || []).length,
        observedAttachments: (info.attachments || []).length,
        sourceSha256: sha256(pngBytes),
        independentExtractedSha256: sha256(await fs.readFile(extracted)),
        browserDownloadedMkvSha256: sha256(await fs.readFile(candidateOutput)),
        browserOnly: true,
        generalMatroskaWriter: 'not-supported',
      }, null, 2) + '\n');
    assert.equal(await page.locator('#downloadLink').isVisible(), false);

    // Direct source change invalidates the approved candidate download.
    await page.setInputFiles('#pngOnlyCreateInput', {
      name: 'not-really-png.png', mimeType: 'image/png',
      buffer: Buffer.from('%PDF-malicious-mislabeled-input'),
    });
    assert.equal(await page.locator('#pngOnlySaveButton').isDisabled(), true);
    await page.locator('#pngOnlyPrepareButton').click();
    await page.waitForFunction(() =>
      document.querySelector('#pngOnlyExperimentStatus')?.dataset.state === 'error',
      null, { timeout: 30_000 });
    assert.match(await page.locator('#pngOnlyExperimentStatus').textContent(),
      /SIGNATURE_MISMATCH/);
    assert.equal(await page.locator('#pngOnlySaveButton').isDisabled(), true);
    console.log('P2 R-02 browser-produced candidate independently extracted bytes PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP2MultiAttachmentBrowserCreate(browser) {
  console.log('P2-M: Chromium reviewed two-file Matroska creation with external attachment extraction');
  const { context, page } = await openApp(browser);
  const licenseBytes = Buffer.from('Browser license test: unencrypted generic attached document.\n');
  try {
    await page.locator('#multiAttachmentExperimentDetails > summary').click();
    await page.setInputFiles('#multiAttachmentCreateInput', [
      { name: 'cover.png', mimeType: 'image/png', buffer: pngBytes },
      { name: 'LICENSE.txt', mimeType: 'text/plain', buffer: licenseBytes },
    ]);
    assert.equal(await page.locator('.multi-attachment-item').count(), 2);
    assert.equal(await page.locator('#multiAttachmentPrepareButton').isDisabled(), true,
      'review must precede output creation');
    assert.match(await page.locator('#multiAttachmentCreateInventory').textContent(),
      /拟写入名称：cover\.png/);
    assert.match(await page.locator('#multiAttachmentCreateInventory').textContent(),
      /拟写入名称：LICENSE\.txt/);
    await page.locator('#multiAttachmentReview').check();
    assert.equal(await page.locator('#multiAttachmentPrepareButton').isEnabled(), true);
    await page.locator('#multiAttachmentPrepareButton').click();
    await page.waitForFunction(() =>
      document.querySelector('#multiAttachmentExperimentStatus')?.dataset.state === 'prepared',
      null, { timeout: 60_000 });
    assert.match(await page.locator('#multiAttachmentExperimentStatus').textContent(),
      /全部经本地 SHA-256 回读一致/);

    const output = path.join(outDir, 'p2-multi-real-browser-created.mkv');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#multiAttachmentSaveButton').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'multiple-attachments-only.mkv');
    await download.saveAs(output);
    const parsed = JSON.parse(execFileSync('mkvmerge', ['-J', output],
      { encoding: 'utf8', timeout: 30_000 }));
    assert.equal((parsed.tracks || []).length, 0,
      'browser writer cannot smuggle in video/audio tracks');
    const attachments = parsed.attachments || [];
    assert.equal(attachments.length, 2);
    const expected = [
      { name: 'cover.png', mime: 'image/png', bytes: pngBytes },
      { name: 'LICENSE.txt', mime: 'text/plain', bytes: licenseBytes },
    ];
    const extracted = [];
    for (let index = 0; index < 2; index++) {
      const a = attachments[index];
      assert.equal(a.file_name, expected[index].name);
      assert.equal(a.content_type, expected[index].mime);
      assert.equal(a.size, expected[index].bytes.length);
      assert.ok(Number.isInteger(a.id));
      const pathTo = path.join(outDir, 'p2-multi-browser-extracted-' + index + '.bin');
      execFileSync('mkvextract', ['attachments', output, String(a.id) + ':' + pathTo],
        { encoding: 'utf8', timeout: 30_000 });
      const got = await fs.readFile(pathTo);
      assert.deepEqual(got, expected[index].bytes);
      extracted.push({
        file_name: a.file_name,
        sha256: createHash('sha256').update(got).digest('hex'),
      });
    }
    await fs.writeFile(path.join(outDir, 'p2-multi-browser-candidate-report.json'),
      JSON.stringify({
        schema: 'p2-multi-attachment-browser-external-audit-v0',
        result: 'BROWSER_MULTI_ATTACHMENT_INDEPENDENT_UIDS_AND_BYTES_MATCH',
        tracks: (parsed.tracks || []).length,
        attachments: extracted,
        downloadSha256: createHash('sha256')
          .update(await fs.readFile(output)).digest('hex'),
        nonMediaContainer: true,
        productionGeneralWriter: false,
      }, null, 2) + '\n');
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);

    // Edits to metadata revoke authorization; the old Blob may not be saved.
    await page.locator('input[data-multi-attachment-mime="1"]').fill('application/json');
    assert.equal(await page.locator('#multiAttachmentSaveButton').isDisabled(), true);
    assert.equal(await page.locator('#multiAttachmentReview').isChecked(), false);
    await page.locator('#multiAttachmentReview').check();
    assert.equal(await page.locator('#multiAttachmentSaveButton').isDisabled(), true,
      'review alone cannot reuse a stale prepared artifact');

    // Case-colliding filenames are disclosed and require a new review.
    await page.setInputFiles('#multiAttachmentCreateInput', [
      { name: 'cover.png', mimeType: 'image/png', buffer: pngBytes },
      { name: 'COVER.PNG', mimeType: 'image/png', buffer: pngBytes },
    ]);
    assert.match(await page.locator('#multiAttachmentCreateInventory').textContent(),
      /COVER \(2\)\.PNG/);
    assert.match(await page.locator('#multiAttachmentCreateInventory').textContent(),
      /collision-renamed/);
    assert.equal(await page.locator('#multiAttachmentPrepareButton').isDisabled(), true);

    // A single resource never enters the multi-file writer.
    await page.setInputFiles('#multiAttachmentCreateInput', [
      { name: 'solo.png', mimeType: 'image/png', buffer: pngBytes },
    ]);
    await page.locator('#multiAttachmentReview').check();
    assert.equal(await page.locator('#multiAttachmentPrepareButton').isDisabled(), true);
    console.log('P2-M browser multi-attachment byte audit + review invalidation PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP2ExistingAttachmentImpactReadonlyUI(browser) {
  console.log('P2-RG UI: inspect real AttachmentUID-tagged MKV and distinguish linked vs decoy removal');
  const sourcePath = path.join(root, 'p0-independent-attachmenttag.mkv');
  const originalSha = createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#existingAttachmentImpactDetails > summary').click();
    await page.setInputFiles('#existingImpactInput', sourcePath);
    await page.waitForFunction(() =>
      document.querySelector('#existingImpactStatus')?.dataset.state === 'inspected',
      null, { timeout: 60_000 });
    assert.equal(await page.locator('.existing-impact-row').count(), 2);
    const linked = page.locator('.existing-impact-row')
      .filter({ hasText: 'p0-attachment-evidence.bin' });
    const decoy = page.locator('.existing-impact-row')
      .filter({ hasText: 'p0-attachment-decoy.txt' });
    assert.equal(await linked.count(), 1);
    assert.equal(await decoy.count(), 1);
    assert.match(await linked.locator('.existing-impact-result').textContent(),
      /已观察到 1 个指向此 FileUID 的 Tag 目标/);
    assert.match(await decoy.locator('.existing-impact-result').textContent(),
      /不能据此断定修改安全/);
    assert.equal(await page.locator('#existingImpactSummary').getAttribute('data-capability-code'),
      'NO_WRITE_REQUESTED');

    await linked.locator('select[data-impact-action]').selectOption('remove');
    await page.waitForFunction(() =>
      document.querySelector('#existingImpactSummary')?.dataset.danglingCount === '1',
      null, { timeout: 60_000 });
    assert.equal(await linked.locator('.existing-impact-result').getAttribute('data-tag-impact'),
      'would-orphan-tag-attachment-uid');
    assert.match(await linked.locator('.existing-impact-result').textContent(), /悬空/);
    assert.equal(await page.locator('#existingImpactSummary').getAttribute('data-capability-code'),
      'SOURCE_UID_RELATIONS_UNVERIFIED');

    // A decoy removal never inherits the tagged source's identity.
    await linked.locator('select[data-impact-action]').selectOption('retain');
    await decoy.locator('select[data-impact-action]').selectOption('remove');
    await page.waitForFunction(() =>
      document.querySelector('#existingImpactSummary')?.dataset.danglingCount === '0' &&
      document.querySelector('#existingImpactSummary')?.dataset.capabilityCode ===
        'SOURCE_UID_RELATIONS_UNVERIFIED',
      null, { timeout: 60_000 });
    assert.equal(await decoy.locator('.existing-impact-result').getAttribute('data-tag-impact'),
      'no-targeted-tag-observed-not-proof-of-safety');
    assert.match(await page.locator('#existingImpactSummary').textContent(),
      /真实写入器：不可用/);
    assert.equal(await page.locator('#videoInput').evaluate(el => el.files.length), 0);
    const after = createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
    assert.equal(after, originalSha);

    // A new source invalidates all previous target identities/impact rows.
    await page.setInputFiles('#existingImpactInput', {
      name: 'single-png-attachment.mkv',
      mimeType: 'application/octet-stream',
      buffer: createResearchFixture(),
    });
    await page.waitForFunction(() =>
      document.querySelector('#existingImpactStatus')?.dataset.state === 'inspected' &&
      document.querySelectorAll('.existing-impact-row').length === 1,
      null, { timeout: 30_000 });
    assert.match(await page.locator('#existingImpactInventory').textContent(), /pixel\.png/);
    assert.doesNotMatch(await page.locator('#existingImpactInventory').textContent(),
      /p0-attachment-evidence\.bin/);
    assert.equal(await page.locator('#existingImpactSummary').getAttribute('data-capability-code'),
      'NO_WRITE_REQUESTED');
    await fs.writeFile(path.join(outDir, 'p2-existing-attachment-impact-browser-report.json'),
      JSON.stringify({
        schema: 'p2-existing-attachment-impact-browser-v0',
        result: 'BROWSER_UID_TARGET_GRAPH_IMPACT_AND_SOURCE_ISOLATION_MATCH',
        independentSourceSha256Before: originalSha,
        independentSourceSha256After: after,
        linkedRemovalWouldOrphanTag: true,
        decoyRemovalWouldOrphanTag: false,
        actualSourceWriterUsed: false,
        existingMkvModificationEnabled: false,
      }, null, 2) + '\n');
    console.log('P2-RG UI actual tagged source read-only impact and decoy isolation PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP2AttachmentInspectionStaleFile(browser) {
  console.log('P2: changing container while a seek-read is held never reveals stale attachments');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#attachmentExtractionDetails > summary').click();
    await page.evaluate(() => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      window.__p2InspectRead = { entered: false, release, used: false };
      const originalSlice = File.prototype.slice;
      File.prototype.slice = function (...args) {
        const part = originalSlice.apply(this, args);
        if (this.name !== 'p0-independent-attachmenttag.mkv') return part;
        const read = part.arrayBuffer.bind(part);
        part.arrayBuffer = async () => {
          if (!window.__p2InspectRead.used) {
            window.__p2InspectRead.used = true;
            window.__p2InspectRead.entered = true;
            await gate;
          }
          return read();
        };
        return part;
      };
    });
    await page.setInputFiles('#attachmentInspectInput',
      path.join(root, 'p0-independent-attachmenttag.mkv'));
    await page.waitForFunction(() => window.__p2InspectRead?.entered,
      null, { timeout: 30_000 });
    await page.setInputFiles('#attachmentInspectInput', {
      name: 'not-mkv.bin', mimeType: 'application/octet-stream',
      buffer: Buffer.from([0,1,2,3]),
    });
    await page.waitForFunction(() =>
      document.querySelector('#attachmentInspectStatus')?.dataset.state === 'unverified',
      null, { timeout: 30_000 });
    await page.evaluate(() => window.__p2InspectRead.release());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-attachment-download]').count(), 0);
    assert.equal(await page.locator('#attachmentInspectStatus').getAttribute('data-state'),
      'unverified');
    console.log('P2 source-switch async inspection rejection PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP0PreservationBlocksSingle(browser) {
  console.log('P0 preservation gate: block high-risk original MKV in single mux');
  const { context, page } = await openApp(browser);
  try {
    await page.setViewportSize({ width: 1600, height: 960 });
    await page.setInputFiles('#videoInput', path.join(root, 'p0-independent-mkvtoolnix.mkv'));
    // The visible preflight must block before the user can click "Mux".
    await page.waitForFunction(() =>
      document.querySelector('#preservationReadiness')?.dataset.status === 'blocked',
      null, { timeout: 90_000 });
    assert.equal(await page.locator('#appendPreserveAll').isChecked(), true);
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);
    assert.equal(await page.locator('#compositionMuxBtn').isDisabled(), true);
    assert.match(await page.locator('#preservationReadinessDescription').textContent(), /嵌套章节/);
    assert.match(await page.locator('#preservationReadinessDescription').textContent(),
      /指向特定章节 UID 的标签/);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    await page.screenshot({
      path: path.join(outDir, 'mkv-round5-p0-source-blocked-1600.png'),
      animations: 'disabled',
    });

    // The live FFprobe inventory may still be finishing after the seek-based
    // EBML preview. Wait until the media core is idle before bypass testing.
    await waitForStatus(page, '轨道扫描完成：');
    // scanSourceContainer writes its success status BEFORE the finally block
    // clears scanning/isBusy and refreshes the controls. A synthetic click at
    // that instant is correctly ignored by executeCurrentMuxTask and never
    // reaches the runtime preservation guard. Wait for its real idle control
    // projection, not an arbitrary sleep or an increased status timeout.
    await page.waitForFunction(() =>
      document.querySelector('#cancelBtn')?.disabled === true,
      null, { timeout: 30_000 });
    // A programmatic event must not bypass the mandatory execution-time guard.
    // Exercise the *runtime* authorization path even if the native disabled
    // button suppresses synthetic click events. This is test-only UI tampering.
    await page.evaluate(() => {
      const button = document.querySelector('#muxBtn');
      button.disabled = false;
      button.click();
    });
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent || '').includes('结构保留预检阻断'),
      null, { timeout: 90_000 });
    assert.match(await page.locator('#status').textContent(), /嵌套章节/);
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    assert.equal(await page.locator('#reportLink').isVisible(), false);

    // After a source switch, the old File reference's hard-block is not
    // transferable. The new source gets an independent preflight.
    await page.setInputFiles('#videoInput', path.join(root, 'source-with-attachments.mkv'));
    await page.waitForFunction(() =>
      ['clear', 'warning'].includes(document.querySelector('#preservationReadiness')?.dataset.status) &&
      !document.querySelector('#muxBtn')?.disabled,
      null, { timeout: 90_000 });
    assert.doesNotMatch(await page.locator('#preservationReadinessDescription').textContent(), /嵌套章节/);

    // P1: Unknown bytes with a credible MKV extension must NOT be treated
    // as proven non-MKV when content sniffing cannot identify the header.
    await page.setInputFiles('#videoInput', {
      name: 'unverified-header.mkv',
      mimeType: 'video/x-matroska',
      buffer: Buffer.from('untrusted source with no valid EBML header'),
    });
    await page.waitForFunction(() =>
      document.querySelector('#preservationReadiness')?.dataset.status === 'blocked',
      null, { timeout: 30000 });
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);
    // Exercise the *runtime* authorization path even if the native disabled
    // button suppresses synthetic click events. This is test-only UI tampering.
    await page.evaluate(() => {
      const button = document.querySelector('#muxBtn');
      button.disabled = false;
      button.click();
    });
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent || '').includes('无法确认当前来源容器身份'),
      null, { timeout: 30000 });
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    console.log('P0/P1 pre-mux safety, unknown-header refusal and source-switch freshness PASS');
  } finally {
    await context.close();
  }
}

// A transient first header-read failure cannot turn a complex MKV into an
// "unknown therefore skip structural preflight" source. Runtime preflight is
// independent of the pre-click UI verdict.
async function scenarioP0UnknownHeaderFailsClosed(browser) {
  console.log('P0 unknown header: transient sniff failure cannot bypass source preservation gate');
  const { context, page } = await openApp(browser);
  try {
    await page.evaluate(() => {
      let rejectFirstRead = true;
      const original = File.prototype.slice;
      File.prototype.slice = function (...args) {
        const part = original.apply(this, args);
        if (this.name === 'p0-independent-mkvtoolnix.mkv' && rejectFirstRead) {
          rejectFirstRead = false;
          part.arrayBuffer = () => Promise.reject(new Error('injected first header-read failure'));
        }
        return part;
      };
    });
    await page.setInputFiles('#videoInput', path.join(root, 'p0-independent-mkvtoolnix.mkv'));
    await page.waitForFunction(() =>
      document.querySelector('#preservationReadiness')?.dataset.status === 'blocked',
      null, { timeout: 90_000 });
    assert.equal(await page.locator('#muxBtn').isDisabled(), true);
    // Exercise the *runtime* authorization path even if the native disabled
    // button suppresses synthetic click events. This is test-only UI tampering.
    await page.evaluate(() => {
      const button = document.querySelector('#muxBtn');
      button.disabled = false;
      button.click();
    });
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent || '').includes('无法确认当前来源容器身份'),
      null, { timeout: 90_000 });
    assert.equal(await page.locator('#downloadLink').isVisible(), false);
    assert.equal(await page.locator('#reportLink').isVisible(), false);
    console.log('P0 transient unknown source header fail-closed PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP0PreservationBlocksWholeBatch(browser) {
  console.log('P0 preservation gate: reject batch before any output is started');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', [
      path.join(root, 'Batch S01E01.mp4'),
      path.join(root, 'p0-independent-mkvtoolnix.mkv'),
    ]);
    await page.setInputFiles('#batchSubtitleInput', [
      path.join(root, 'Batch S01E01.zh-Hans.ass'),
      path.join(root, 'p0-independent-mkvtoolnix.zh.ass'),
    ]);
    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      const button = document.querySelector('#batchStartBtn');
      return button && !button.disabled &&
        plan.includes('Batch S01E01.mp4') &&
        plan.includes('p0-independent-mkvtoolnix.mkv');
    }, null, { timeout: 90_000 });
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() =>
      (document.querySelector('#batchStatus')?.textContent || '').includes('结构保留预检阻断'),
      null, { timeout: 90_000 });
    assert.match(await page.locator('#batchStatus').textContent(), /批量未开始/);
    assert.equal(await page.locator('#batchResults a.download').count(), 0);
    assert.equal(await page.locator('#batchResults .new-track-row').count(), 0);
    console.log('P0 whole-batch preservation gate PASS');
  } finally {
    await context.close();
  }
}

// Issue #79: deterministic preflight interleaving. Holding one File.slice()
// read tests that batch startup remains locked, an input change invalidates the
// approved plan, and stale jobs never begin after the read completes.
async function scenarioP0BatchStartPlanInvalidation(browser) {
  console.log('P0 batch preflight: delayed EBML read must not execute stale plan');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'p0-independent-mkvtoolnix.mkv'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'p0-independent-mkvtoolnix.zh.ass'));
    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      return plan.includes('p0-independent-mkvtoolnix.mkv') &&
        !document.querySelector('#batchStartBtn')?.disabled;
    }, null, { timeout: 90_000 });

    await page.evaluate(() => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      window.__p0BatchRead = { entered: false, release, used: false };
      const originalSlice = File.prototype.slice;
      File.prototype.slice = function (...args) {
        const part = originalSlice.apply(this, args);
        if (this.name !== 'p0-independent-mkvtoolnix.mkv') return part;
        const originalRead = part.arrayBuffer.bind(part);
        part.arrayBuffer = async () => {
          if (!window.__p0BatchRead.used) {
            window.__p0BatchRead.used = true;
            window.__p0BatchRead.entered = true;
            await gate;
          }
          return originalRead();
        };
        return part;
      };
    });

    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => window.__p0BatchRead?.entered, null, { timeout: 30000 });
    assert.equal(await page.locator('#batchStartBtn').isDisabled(), true);
    assert.equal(await page.locator('#batchVideoInput').isDisabled(), true);
    assert.equal(await page.locator('#batchCancelBtn').isDisabled(), false);

    // Simulate a programmatic replacement while native input is disabled.
    // Locking the visible picker alone is not enough; generation must reject.
    await page.setInputFiles('#batchVideoInput', path.join(root, 'Batch S01E01.mp4'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'Batch S01E01.zh-Hans.ass'));
    await page.evaluate(() => window.__p0BatchRead.release());

    await page.waitForFunction(() =>
      (document.querySelector('#batchStatus')?.textContent || '')
        .includes('预检期间输入或规则发生变化'),
      null, { timeout: 30000 });
    assert.equal(await page.locator('#batchResults a.download').count(), 0);
    const status = await page.locator('#batchStatus').textContent();
    assert.match(status, /批量未开始/);
    await page.waitForFunction(() => {
      const plan = document.querySelector('#batchPlan')?.textContent || '';
      return plan.includes('Batch S01E01.mp4') &&
        !document.querySelector('#batchStartBtn')?.disabled;
    }, null, { timeout: 30000 });
    console.log('P0 stale batch start PASS');
  } finally {
    await context.close();
  }
}

async function scenarioP0BatchStartCancellation(browser) {
  console.log('P0 batch preflight: explicit cancellation while source read is pending');
  const { context, page } = await openApp(browser);
  try {
    await page.locator('.batch-drawer > summary').click();
    await page.setInputFiles('#batchVideoInput', path.join(root, 'p0-independent-mkvtoolnix.mkv'));
    await page.setInputFiles('#batchSubtitleInput', path.join(root, 'p0-independent-mkvtoolnix.zh.ass'));
    await page.waitForFunction(() =>
      !document.querySelector('#batchStartBtn')?.disabled &&
      (document.querySelector('#batchPlan')?.textContent || '')
        .includes('p0-independent-mkvtoolnix.mkv'),
      null, { timeout: 90000 });
    await page.evaluate(() => {
      let resume;
      const wait = new Promise((resolve) => { resume = resolve; });
      window.__p0CancelRead = { entered: false, resume, used: false };
      const original = File.prototype.slice;
      File.prototype.slice = function (...args) {
        const piece = original.apply(this, args);
        if (this.name !== 'p0-independent-mkvtoolnix.mkv') return piece;
        const read = piece.arrayBuffer.bind(piece);
        piece.arrayBuffer = async () => {
          if (!window.__p0CancelRead.used) {
            window.__p0CancelRead.used = true;
            window.__p0CancelRead.entered = true;
            await wait;
          }
          return read();
        };
        return piece;
      };
    });
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(() => window.__p0CancelRead?.entered, null, { timeout: 30000 });
    await page.locator('#batchCancelBtn').click();
    await page.evaluate(() => window.__p0CancelRead.resume());
    await page.waitForFunction(() =>
      (document.querySelector('#batchStatus')?.textContent || '')
        .includes('批量启动预检已取消'),
      null, { timeout: 30000 });
    assert.equal(await page.locator('#batchResults a.download').count(), 0);
    await page.waitForFunction(() => !document.querySelector('#batchStartBtn')?.disabled,
      null, { timeout: 30000 });
    console.log('P0 batch start cancellation PASS');
  } finally {
    await context.close();
  }
}

// P0 independent evidence experiment: no nested chapters and a valid,
// explicitly target-linked video TrackUID custom tag. Unlike the hard-blocked
// ChapterUID fixture, this source is currently allowed with a warning.
// Audit semantic target resolution, not raw UID equality after remux.
async function scenarioP0TrackTargetedTagSurvival(browser) {
  console.log('P0 experiment: preservation of a flat MKV video TrackUID-targeted tag');
  const source = path.join(root, 'p0-independent-tracktag.mkv');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#videoInput', source);
    await page.waitForFunction(() => {
      const button = document.querySelector('#muxBtn');
      return button && !button.disabled;
    }, null, { timeout: 90_000 });
    assert.equal(await page.locator('#appendPreserveAll').isChecked(), true);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const logText = await page.locator('#log').textContent();
    assert.match(logText, /WARNING: 指向特定轨道 UID 的标签/);
    const output = path.join(outDir, 'p0-independent-tracktag-output.mkv');
    const audit = path.join(outDir, 'p0-tracktag-relation-audit.json');
    await saveDownload(page, '#downloadLink', output);
    // Writes explicit JSON on pass, semantic difference, or audit inability.
    // A difference is a real, independent P0 signal — not a reason to weaken
    // the oracle or to assert all MkV files have this behavior.
    execFileSync(process.env.E2E_PYTHON || 'python3', [
      path.resolve('scripts/p0-audit-track-tag-relations.py'),
      source, output, audit,
    ], { stdio: 'inherit', timeout: 120_000 });
    console.log('P0 TrackUID target relation PASS for checked fixture markers.');
  } finally {
    await context.close();
  }
}

// P0: a flat MKV has two distinct attachments, and exactly one P0 marker
// targets the binary attachment UID. Verify the browser output independently
// by extracted payload SHA-256 and semantic target, not original UID number.
async function scenarioP0AttachmentTargetedTagSurvival(browser) {
  console.log('P0 experiment: flat MKV AttachmentUID-targeted custom tag');
  const source = path.join(root, 'p0-independent-attachmenttag.mkv');
  const { context, page } = await openApp(browser);
  try {
    await page.setInputFiles('#videoInput', source);
    await page.waitForFunction(() => {
      const button = document.querySelector('#muxBtn');
      return button && !button.disabled;
    }, null, { timeout: 90_000 });
    assert.equal(await page.locator('#appendPreserveAll').isChecked(), true);
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const log = await page.locator('#log').textContent();
    assert.match(log, /WARNING: 指向特定附件 UID 的标签/);
    const output = path.join(outDir, 'p0-independent-attachmenttag-output.mkv');
    const audit = path.join(outDir, 'p0-attachmenttag-relation-audit.json');
    await saveDownload(page, '#downloadLink', output);
    execFileSync(process.env.E2E_PYTHON || 'python3', [
      path.resolve('scripts/p0-audit-attachment-tag-relations.py'),
      source, output, audit,
    ], { stdio: 'inherit', timeout: 120_000 });
    console.log('P0 AttachmentUID relation PASS for the checked source/output.');
  } finally {
    await context.close();
  }
}

async function scenarioVerifiedNestedAttachmentCrcRelocation(browser) {
  console.log('P0/P2-C real Chromium: valid ORIGINAL nested + parent CRC32, changed FileData, independent Python zlib and native MKV oracle');
  const nativeOriginal=path.join(outDir,'p2-crc-mkvtoolnix-original.mkv');
  const crcSource=path.join(outDir,'p2-crc-mkvtoolnix-valid-source.mkv');
  const resultFile=path.join(outDir,'p2-crc-native-chromium-delivered.mkv');
  await fs.copyFile(path.join(root,'p0-independent-attachmenttag.mkv'),nativeOriginal);
  execFileSync('mkvpropedit',[nativeOriginal,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  execFileSync('python3',[
    path.join(process.cwd(),'scripts/p2-crc32-native-attachment-oracle.py'),
    'prepare',nativeOriginal,crcSource,
  ],{timeout:60000,encoding:'utf8'});
  execFileSync('python3',[
    path.join(process.cwd(),'scripts/p2-crc32-native-attachment-oracle.py'),
    'audit',crcSource,
  ],{timeout:60000});
  const native=file=>parseMkvmergeJsonWithExactUids(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  const first=native(crcSource);
  assert.equal(first.attachments?.length,2,'native MKVToolNix must recognize CRC-bearing original');
  const linked=first.attachments.find(x=>x.file_name==='p0-attachment-evidence.bin');
  const free=first.attachments.find(x=>x.file_name==='p0-attachment-decoy.txt');
  assert.ok(linked&&free);
  const firstUid=exactPositiveUid(linked.properties.uid);
  const freeUid=exactPositiveUid(free.properties.uid);
  assert.notEqual(firstUid,freeUid);
  const originalHash=createHash('sha256').update(await fs.readFile(crcSource)).digest('hex');
  const replacement=Buffer.alloc(721,0x41);
  assert.notEqual(replacement.length,free.size);
  const packets=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',timeout:60000,maxBuffer:24*1024*1024})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const oldPackets=packets(crcSource);
  const {context,page}=await openApp(browser);
  try{
    await page.locator('#existingMkvRelayDetails > summary').click();
    await page.setInputFiles('#existingMkvRelaySource',crcSource);
    await page.waitForFunction(()=>
      document.querySelector('#existingMkvRelayTarget')?.options.length===2,
      null,{timeout:60000});
    const options=await page.locator('#existingMkvRelayTarget option')
      .evaluateAll(nodes=>nodes.map(x=>({uid:x.value,name:x.textContent,disabled:x.disabled})));
    assert.equal(options.find(x=>x.name.includes('p0-attachment-evidence.bin'))?.disabled,true,
      'real TagAttachmentUID still blocks linked target despite CRC');
    const unreferenced=options.find(x=>x.name.includes('p0-attachment-decoy.txt'));
    assert.ok(unreferenced&&!unreferenced.disabled);
    assert.equal(unreferenced.uid,freeUid);
    await page.locator('#existingMkvRelayTarget').selectOption(freeUid);
    await page.setInputFiles('#existingMkvRelayReplacement',{
      name:'new-p2-crc-payload.bin',mimeType:'application/octet-stream',buffer:replacement,
    });
    assert.equal(await page.locator('#existingMkvRelayPrepare').isDisabled(),true);
    await page.locator('#existingMkvRelayReview').check();
    assert.equal(await page.locator('#existingMkvRelayPrepare').isEnabled(),true);
    await page.locator('#existingMkvRelayPrepare').click();
    await page.waitForFunction(()=>['prepared','blocked'].includes(
      document.querySelector('#existingMkvRelayStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvRelayStatus').getAttribute('data-state'),
      'prepared',await page.locator('#existingMkvRelayStatus').textContent());
    const uiProof=await page.locator('#existingMkvRelayEvidence').textContent();
    assert.match(uiProof,/SHA-256/);
    assert.match(uiProof,/CRC-32/);
    assert.equal((uiProof.match(/已重算并复验/g)||[]).length,2,
      'review UI must show independently checked inner + outer CRC coverage');
    await page.setViewportSize({width:768,height:1024});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    await page.locator('#existingMkvRelayDetails').screenshot({
      path:path.join(outDir,'mkv-nonterminal-crc32-relay-tablet-768.png'),animations:'disabled',
    });
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#existingMkvRelaySave').click(),
    ]);
    await download.saveAs(resultFile);
    assert.equal(createHash('sha256').update(await fs.readFile(crcSource)).digest('hex'),
      originalHash,'CRC source must remain untouched');
    const crcOutput=execFileSync('python3',[
      path.join(process.cwd(),'scripts/p2-crc32-native-attachment-oracle.py'),
      'audit',resultFile,
    ],{timeout:60000,encoding:'utf8'});
    assert.match(crcOutput,/PYTHON_ZLIB_NATIVE_MKV_PARENT_AND_NESTED_CRC32_PASS/);
    const final=native(resultFile);
    assert.equal(final.attachments?.length,2);
    for(const name of ['p0-attachment-evidence.bin','p0-attachment-decoy.txt']){
      const a=first.attachments.find(x=>x.file_name===name);
      const b=final.attachments.find(x=>x.file_name===name);
      assert.ok(a&&b);
      assert.equal(exactPositiveUid(b.properties.uid),exactPositiveUid(a.properties.uid));
      assert.equal(b.content_type,a.content_type);
    }
    for(const kind of ['chapters','tags']){
      const a=path.join(outDir,'p2-crc-source-'+kind+'.xml'),
        b=path.join(outDir,'p2-crc-result-'+kind+'.xml');
      execFileSync('mkvextract',[crcSource,kind,a],{timeout:60000});
      execFileSync('mkvextract',[resultFile,kind,b],{timeout:60000});
      assert.deepEqual(await fs.readFile(b),await fs.readFile(a));
    }
    const linkedBefore=path.join(outDir,'p2-crc-linked-before.bin'),
      linkedAfter=path.join(outDir,'p2-crc-linked-after.bin'),
      replacementAfter=path.join(outDir,'p2-crc-free-after.bin');
    execFileSync('mkvextract',[crcSource,'attachments',
      String(linked.id)+':'+linkedBefore],{timeout:60000});
    const newLinked=final.attachments.find(x=>x.file_name===linked.file_name);
    const newFree=final.attachments.find(x=>x.file_name===free.file_name);
    execFileSync('mkvextract',[resultFile,'attachments',
      String(newLinked.id)+':'+linkedAfter,
      String(newFree.id)+':'+replacementAfter],{timeout:60000});
    assert.deepEqual(await fs.readFile(linkedAfter),await fs.readFile(linkedBefore));
    assert.deepEqual(await fs.readFile(replacementAfter),replacement);
    assert.deepEqual(packets(resultFile),oldPackets,
      'original compressed packets and packet timestamps must survive both nested CRC edits');
    console.log('P0/P2-C ORIGINAL native CRC32 Attachments + AttachedFile → Chromium changed FileData → INDEPENDENT Python zlib nested+parent CRC32 + mkvmerge/mkvextract/ffprobe PASS');
  }finally{await context.close();}
}

async function scenarioNonfinalAttachedFileRelayNative(browser) {
  console.log('P0/P2-N2 original native 3-attachment nonterminal: resize MIDDLE FileData, preserve LATER attachment UID, SHA and tags');
  const original=path.join(outDir,'p2-relay-original-native-three-attached.mkv');
  const resultPath=path.join(outDir,'p2-relay-nonfinal-uid-browser-output.mkv');
  const tagPath=path.join(outDir,'p2-relay-native-three-tags.xml');
  execFileSync('mkvmerge',[
    '--quiet','--output',original,
    '--chapters',path.join(root,'p0-independent-chapters.xml'),
    '--attachment-name','p0-attachment-evidence.bin',
    '--attachment-mime-type','application/octet-stream',
    '--attach-file',path.join(root,'notes.txt'),
    '--attachment-name','p0-attachment-decoy.txt',
    '--attachment-mime-type','text/plain',
    '--attach-file',path.join(root,'zh.ass'),
    '--attachment-name','p0-following-fixed.bin',
    '--attachment-mime-type','application/octet-stream',
    '--attach-file',path.join(root,'notes.txt'),
    path.join(root,'base.mp4'),
  ],{timeout:60000});
  const native=file=>parseMkvmergeJsonWithExactUids(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  let before=native(original);
  assert.deepEqual(before.attachments.map(a=>a.file_name),[
    'p0-attachment-evidence.bin','p0-attachment-decoy.txt','p0-following-fixed.bin']);
  // Reuse the project's proven lossless MKVToolNix uint64 UID adapter:
  // JSON.parse would round >2^53 FileUID and author an orphan target.
  const referenceUid=exactPositiveUid(before.attachments[0].properties.uid);
  const tagXml=`<?xml version="1.0" encoding="UTF-8"?>
<Tags>
  <Tag><Targets><TargetTypeValue>20</TargetTypeValue><AttachmentUID>${referenceUid}</AttachmentUID></Targets>
    <Simple><Name>P0_ORIGINAL_ATTACHMENT_KEEP</Name><String>tagged-first</String></Simple></Tag>
  <Tag><Targets><TargetTypeValue>30</TargetTypeValue><ChapterUID>510011</ChapterUID></Targets>
    <Simple><Name>P0_NESTED_CHAPTER_KEEP</Name><String>untouched-nested</String></Simple></Tag>
</Tags>`;
  await fs.writeFile(tagPath,tagXml);
  execFileSync('mkvpropedit',[original,'--tags','all:'+tagPath],{timeout:60000});
  const verifiedTags=path.join(outDir,'p2-nonfinal-native-source-tags.xml');
  execFileSync('mkvextract',[original,'tags',verifiedTags],{timeout:60000});
  const verifiedTagXml=await fs.readFile(verifiedTags,'utf8');
  assert.match(verifiedTagXml,/<AttachmentUID>/,
    'native authored source must genuinely contain an AttachmentUID target');
  assert.match(verifiedTagXml,new RegExp('<AttachmentUID>'+referenceUid+'</AttachmentUID>'),
    'native output must target exact FIRST attachment UID');
  assert.match(verifiedTagXml,/P0_NESTED_CHAPTER_KEEP/,
    'native source must retain nested chapter targeted metadata');
  before=native(original);
  assert.equal(before.attachments.length,3);
  const editable=before.attachments[1],following=before.attachments[2];
  exactPositiveUid(editable.properties.uid);
  exactPositiveUid(following.properties.uid);
  const replacement=Buffer.alloc(700,0x39);
  assert.notEqual(replacement.length,editable.size);
  const originalSha=createHash('sha256').update(await fs.readFile(original)).digest('hex');
  const packets=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const originalPackets=packets(original);
  const {context,page}=await openApp(browser);
  try {
    await page.locator('#existingMkvRelayDetails > summary').click();
    await page.setInputFiles('#existingMkvRelaySource',original);
    await page.waitForFunction(()=>document.querySelector(
      '#existingMkvRelayTarget')?.options.length===3,null,{timeout:60000});
    const options=await page.locator('#existingMkvRelayTarget option')
      .evaluateAll(rows=>rows.map(x=>({id:x.value,label:x.textContent,disabled:x.disabled})));
    assert.equal(options.find(x=>x.label.includes('p0-attachment-evidence.bin'))?.disabled,true);
    assert.ok(options.find(x=>x.label.includes('p0-following-fixed.bin'))?.disabled===false);
    const target=options.find(x=>x.label.includes('p0-attachment-decoy.txt'));
    assert.ok(target&&!target.disabled);
    await page.locator('#existingMkvRelayTarget').selectOption(target.id);
    await page.setInputFiles('#existingMkvRelayReplacement',{
      name:'resized-middle.bin',mimeType:'application/octet-stream',buffer:replacement,
    });
    assert.equal(await page.locator('#existingMkvRelayPrepare').isDisabled(),true);
    await page.locator('#existingMkvRelayReview').check();
    await page.locator('#existingMkvRelayPrepare').click();
    await page.waitForFunction(()=>['prepared','blocked'].includes(
      document.querySelector('#existingMkvRelayStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvRelayStatus').getAttribute('data-state'),
      'prepared',await page.locator('#existingMkvRelayStatus').textContent());
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#existingMkvRelaySave').click(),
    ]);
    await download.saveAs(resultPath);
    assert.equal(createHash('sha256').update(await fs.readFile(original)).digest('hex'),
      originalSha,'original Matroska source cannot change');
    const after=native(resultPath);
    assert.equal(after.attachments.length,3,
      'native MKVToolNix must discover all three existing FileUIDs through relayed SeekHead');
    for(let i=0;i<3;i++){
      assert.equal(after.attachments[i].file_name,before.attachments[i].file_name);
      assert.equal(after.attachments[i].properties.uid,before.attachments[i].properties.uid);
      assert.equal(after.attachments[i].content_type,before.attachments[i].content_type);
    }
    assert.deepEqual(after.tracks.map(x=>[x.id,x.type,x.codec,x.properties?.uid]),
      before.tracks.map(x=>[x.id,x.type,x.codec,x.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const a=path.join(outDir,'p2-nonfinal-before-'+kind+'.xml'),
        b=path.join(outDir,'p2-nonfinal-after-'+kind+'.xml');
      execFileSync('mkvextract',[original,kind,a],{timeout:60000});
      execFileSync('mkvextract',[resultPath,kind,b],{timeout:60000});
      assert.deepEqual(await fs.readFile(b),await fs.readFile(a),
        'native nested '+kind+' exact XML retained');
    }
    for(let i=0;i<3;i++){
      const file=path.join(outDir,'p2-nonfinal-extract-'+i+'.bin');
      execFileSync('mkvextract',[resultPath,'attachments',
        String(after.attachments[i].id)+':'+file],{timeout:60000});
      const expected=i===1?replacement:await fs.readFile(
        i===0?path.join(root,'notes.txt'):path.join(root,'notes.txt'));
      assert.deepEqual(await fs.readFile(file),expected,
        'native mkvextract output for attachment position '+i+' must be exact');
    }
    assert.deepEqual(packets(resultPath),originalPackets,
      'all original codec packets, hashes and PTS/DTS unchanged');
    console.log('P0/P2-N2 NONFINAL FileUID original 3 attachments → relayed SeekHead with later FileData moved internally + native Chapters/Tags/UID/FileData/ffprobe full PASS');
  }finally{await context.close();}
}

async function scenarioNonterminalIndexedAttachmentRelay(browser) {
  console.log('P0/P2-N real Chromium: original nonterminal indexed Attachments, no test-only relocation; relay new copy with independent native MKVToolNix proof');
  const original=path.join(outDir,'p2-relay-original-native-source.mkv');
  const final=path.join(outDir,'p2-relay-browser-output.mkv');
  await fs.copyFile(path.join(root,'p0-independent-attachmenttag.mkv'),original);
  execFileSync('mkvpropedit',[original,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  const native=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  const first=native(original);
  assert.equal(first.attachments?.length,2);
  const targeted=first.attachments.find(x=>x.file_name==='p0-attachment-evidence.bin');
  const free=first.attachments.find(x=>x.file_name==='p0-attachment-decoy.txt');
  assert.ok(targeted&&free);
  const packet=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',timeout:60000,maxBuffer:24*1024*1024})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const packets=packet(original),beforeBytes=await fs.readFile(original);
  const originalHash=createHash('sha256').update(beforeBytes).digest('hex');
  const larger=Buffer.alloc(687,0x56);
  assert.notEqual(larger.length,free.size);
  const {context,page}=await openApp(browser);
  try{
    await page.locator('#existingMkvRelayDetails > summary').click();
    await page.setInputFiles('#existingMkvRelaySource',original);
    await page.waitForFunction(()=>document.querySelector(
      '#existingMkvRelayTarget')?.options.length===2,null,{timeout:60000});
    const options=await page.locator('#existingMkvRelayTarget option')
      .evaluateAll(list=>list.map(x=>({uid:x.value,label:x.textContent,disabled:x.disabled})));
    assert.equal(options.find(x=>x.label.includes('p0-attachment-evidence.bin'))?.disabled,true);
    const choice=options.find(x=>x.label.includes('p0-attachment-decoy.txt'));
    assert.ok(choice&&!choice.disabled);
    assert.equal(await page.locator('#existingMkvRelayTarget').inputValue(),choice.uid);
    await page.setInputFiles('#existingMkvRelayReplacement',{
      name:'large-relocated.bin',mimeType:'application/octet-stream',buffer:larger,
    });
    assert.equal(await page.locator('#existingMkvRelayPrepare').isDisabled(),true);
    await page.locator('#existingMkvRelayReview').check();
    assert.equal(await page.locator('#existingMkvRelayPrepare').isEnabled(),true,
      await page.locator('#existingMkvRelayStatus').textContent());
    await page.locator('#existingMkvRelayPrepare').click();
    await page.waitForFunction(()=>['prepared','blocked'].includes(
      document.querySelector('#existingMkvRelayStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvRelayStatus').getAttribute('data-state'),
      'prepared',await page.locator('#existingMkvRelayStatus').textContent());
    assert.match(await page.locator('#existingMkvRelayEvidence').textContent(),
      /SHA-256/);
    await page.setViewportSize({width:768,height:1024});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    await page.locator('#existingMkvRelayDetails').screenshot({
      path:path.join(outDir,'mkv-nonterminal-seekhead-relay-tablet-768.png'),
      animations:'disabled',
    });
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#existingMkvRelaySave').click(),
    ]);
    assert.match(download.suggestedFilename(),/\.nonterminal-attachment-relocated\.experimental\.mkv$/);
    await download.saveAs(final);
    assert.equal(createHash('sha256').update(await fs.readFile(original)).digest('hex'),
      originalHash,'original Matroska cannot be modified');
    const second=native(final);
    assert.equal(second.attachments?.length,2,
      'native MKVToolNix must discover appended Attachments through real chained SeekHead');
    for(const name of ['p0-attachment-evidence.bin','p0-attachment-decoy.txt']){
      const a=first.attachments.find(x=>x.file_name===name);
      const b=second.attachments.find(x=>x.file_name===name);
      assert.ok(a&&b);
      assert.equal(b.properties?.uid,a.properties?.uid);
      assert.equal(b.content_type,a.content_type);
    }
    assert.deepEqual(second.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]),
      first.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const beforePath=path.join(outDir,'p2-relay-source-'+kind+'.xml'),
        afterPath=path.join(outDir,'p2-relay-final-'+kind+'.xml');
      execFileSync('mkvextract',[original,kind,beforePath],{timeout:60000});
      execFileSync('mkvextract',[final,kind,afterPath],{timeout:60000});
      assert.deepEqual(await fs.readFile(afterPath),await fs.readFile(beforePath),
        'original nested '+kind+' must be semantically identical');
    }
    const taggedBefore=path.join(outDir,'p2-relay-tagged-old.bin'),
      taggedAfter=path.join(outDir,'p2-relay-tagged-new.bin'),
      replacedAfter=path.join(outDir,'p2-relay-free-new.bin');
    const newTagged=second.attachments.find(x=>x.file_name===targeted.file_name);
    const newFree=second.attachments.find(x=>x.file_name===free.file_name);
    execFileSync('mkvextract',[original,'attachments',
      String(targeted.id)+':'+taggedBefore],{timeout:60000});
    execFileSync('mkvextract',[final,'attachments',
      String(newTagged.id)+':'+taggedAfter,
      String(newFree.id)+':'+replacedAfter],{timeout:60000});
    assert.deepEqual(await fs.readFile(taggedAfter),await fs.readFile(taggedBefore));
    assert.deepEqual(await fs.readFile(replacedAfter),larger);
    assert.deepEqual(packet(final),packets,
      'all compressed media packet SHA and timestamps remain unchanged');
    console.log('P0/P2-N real ORIGINAL NONTERMINAL Attachments → CHAINED SEEKHEAD → Segment tail variable FileData browser output + independent native Chapter/Tag/UID/Cues-packet audit PASS');
  }finally{await context.close();}
}

async function scenarioTailNoVoidExistingAttachmentResize(browser) {
  console.log('P0/P2-T real Chromium: existing no-Void tail Attachments edit, four size fields, independent native preservation');
  const original=path.join(outDir,'p2-tail-mkvtoolnix-original.mkv');
  const tail=path.join(outDir,'p2-tail-mkvtoolnix-native-prepared.mkv');
  const output=path.join(outDir,'p2-tail-native-browser-delivered.mkv');
  await fs.copyFile(path.join(root,'p0-independent-attachmenttag.mkv'),original);
  execFileSync('mkvpropedit',[original,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  execFileSync(process.execPath,[
    path.join(process.cwd(),'scripts/p2-tail-last-attachments-native-source-fixture.mjs'),
    original,tail,
  ],{timeout:60000});
  const native=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  const before=native(tail);
  assert.equal((before.attachments||[]).length,2,
    'native mkvmerge must read both original attachments on tail-prepared source');
  const tagged=before.attachments.find(a=>a.file_name==='p0-attachment-evidence.bin');
  const candidate=before.attachments.find(a=>a.file_name==='p0-attachment-decoy.txt');
  assert.ok(tagged&&candidate);
  const baseline=await fs.readFile(tail);
  const sourceHash=createHash('sha256').update(baseline).digest('hex');
  const replacement=Buffer.alloc(690,0x51);
  assert.notEqual(replacement.length,candidate.size||0);
  const packet=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const packets=packet(tail);
  const {context,page}=await openApp(browser);
  try {
    await page.locator('#existingMkvTailResizeDetails > summary').click();
    await page.setInputFiles('#existingMkvTailSource',tail);
    await page.waitForFunction(()=>document.querySelector(
      '#existingMkvTailTarget')?.options.length===2,null,{timeout:60000});
    const options=await page.locator('#existingMkvTailTarget option')
      .evaluateAll(nodes=>nodes.map(x=>({uid:x.value,label:x.textContent,disabled:x.disabled})));
    assert.equal(options.find(x=>x.label.includes('p0-attachment-evidence.bin'))?.disabled,true);
    const row=options.find(x=>x.label.includes('p0-attachment-decoy.txt'));
    assert.ok(row&&!row.disabled);
    assert.equal(await page.locator('#existingMkvTailTarget').inputValue(),row.uid);
    await page.setInputFiles('#existingMkvTailReplacement',{
      name:'tail-grown.bin',mimeType:'application/octet-stream',buffer:replacement,
    });
    assert.equal(await page.locator('#existingMkvTailPrepare').isDisabled(),true);
    await page.locator('#existingMkvTailReview').check();
    assert.equal(await page.locator('#existingMkvTailPrepare').isEnabled(),true,
      await page.locator('#existingMkvTailStatus').textContent());
    await page.locator('#existingMkvTailPrepare').click();
    await page.waitForFunction(()=>['prepared','blocked'].includes(
      document.querySelector('#existingMkvTailStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvTailStatus').getAttribute('data-state'),
      'prepared',await page.locator('#existingMkvTailStatus').textContent());
    assert.match(await page.locator('#existingMkvTailEvidence').textContent(),/SHA-256/);
    await page.setViewportSize({width:768,height:1024});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    await page.locator('#existingMkvTailResizeDetails').screenshot({
      path:path.join(outDir,'mkv-container-tree-tail-master-tablet-768.png'),
      animations:'disabled',
    });
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#existingMkvTailSave').click(),
    ]);
    assert.match(download.suggestedFilename(),/\.tail-attachment-resized\.experimental\.mkv$/);
    await download.saveAs(output);
    const after=native(output);
    assert.equal((after.attachments||[]).length,2);
    assert.equal((await fs.stat(output)).size,
      baseline.length+replacement.length-(candidate.size||0),
      'only approved FileData growth changes Segment and file byte length');
    assert.equal(createHash('sha256').update(await fs.readFile(tail)).digest('hex'),
      sourceHash,'source MKV bytes unchanged');
    for(const name of ['p0-attachment-evidence.bin','p0-attachment-decoy.txt']){
      const a=before.attachments.find(x=>x.file_name===name);
      const b=after.attachments.find(x=>x.file_name===name);
      assert.ok(a&&b);
      assert.equal(b.properties?.uid,a.properties?.uid);
      assert.equal(b.content_type,a.content_type);
    }
    assert.deepEqual(after.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]),
      before.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const first=path.join(outDir,'p2-tail-source-'+kind+'.xml');
      const second=path.join(outDir,'p2-tail-output-'+kind+'.xml');
      execFileSync('mkvextract',[tail,kind,first],{timeout:60000});
      execFileSync('mkvextract',[output,kind,second],{timeout:60000});
      assert.deepEqual(await fs.readFile(second),await fs.readFile(first),
        'native '+kind+' with nested UID-targeted hierarchy must survive');
    }
    const tagBefore=path.join(outDir,'p2-tail-linked-before.bin');
    const tagAfter=path.join(outDir,'p2-tail-linked-after.bin');
    const changedAfter=path.join(outDir,'p2-tail-target-after.bin');
    const link=after.attachments.find(x=>x.file_name===tagged.file_name);
    const free=after.attachments.find(x=>x.file_name===candidate.file_name);
    execFileSync('mkvextract',[tail,'attachments',
      String(tagged.id)+':'+tagBefore],{timeout:60000});
    execFileSync('mkvextract',[output,'attachments',
      String(link.id)+':'+tagAfter,
      String(free.id)+':'+changedAfter],{timeout:60000});
    assert.deepEqual(await fs.readFile(tagAfter),await fs.readFile(tagBefore));
    assert.deepEqual(await fs.readFile(changedAfter),replacement);
    assert.deepEqual(packet(output),packets,
      'all native codec packet hashes and packet timestamps preserved');
    console.log('P0/P2-T tail no-Void FOUR SIZE FIELD real browser output + native MKVToolNix chapters, targeted Tags, FileUID, FileData and ffprobe packet audit PASS');
  }finally{await context.close();}
}

async function scenarioReservedVoidExistingFileDataVariableReplace(browser) {
  console.log('P0/P2-V real Chromium: grow existing unreferenced FileData into adjacent Void, verify native chapter/tag/UID/packet invariance');
  const original=path.join(outDir,'p2-variable-native-mkvtoolnix-original.mkv');
  const reserved=path.join(outDir,'p2-variable-native-reserved-void-source.mkv');
  await fs.copyFile(path.join(root,'p0-independent-attachmenttag.mkv'),original);
  execFileSync('mkvpropedit',[original,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  const native=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  const originalInfo=native(original);
  assert.equal((originalInfo.attachments||[]).length,2);
  execFileSync(process.execPath,[
    path.join(process.cwd(),'scripts/p2-reserved-void-independent-layout-fixture.mjs'),
    original,reserved,'p0-attachment-decoy.txt','64',
  ],{timeout:60000});
  const sourceInfo=native(reserved);
  assert.equal((sourceInfo.attachments||[]).length,2,
    'independent native MKVToolNix must actually read the reserved-void fixture');
  const tagged=sourceInfo.attachments.find(a=>a.file_name==='p0-attachment-evidence.bin');
  const free=sourceInfo.attachments.find(a=>a.file_name==='p0-attachment-decoy.txt');
  assert.ok(tagged&&free);
  const oldBytes=await fs.readFile(path.join(root,'zh.ass'));
  const grown=Buffer.alloc(oldBytes.length-32,0x53);
  assert.ok(grown.length>0&&grown.length!==oldBytes.length-64);
  const nativePacket=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  assert.deepEqual(nativePacket(reserved),nativePacket(original),
    'test-only reserved Void fixture must retain independent native packets');
  const originalOutput=path.join(outDir,'p2-variable-native-browser-result.mkv');
  const oldSourceHash=createHash('sha256').update(await fs.readFile(reserved)).digest('hex');
  const {context,page}=await openApp(browser);
  try{
    await page.locator('#existingMkvReservedVoidDetails > summary').click();
    await page.setInputFiles('#existingMkvReservedVoidSource',reserved);
    await page.waitForFunction(()=>
      document.querySelector('#existingMkvReservedVoidTarget')?.options.length===2,
      null,{timeout:60000});
    const options=await page.locator('#existingMkvReservedVoidTarget option').evaluateAll(
      nodes=>nodes.map(x=>({value:x.value,text:x.textContent,disabled:x.disabled})));
    assert.equal(options.find(x=>x.text.includes('p0-attachment-evidence.bin'))?.disabled,true);
    const available=options.find(x=>x.text.includes('p0-attachment-decoy.txt'));
    assert.ok(available&&!available.disabled);
    assert.equal(await page.locator('#existingMkvReservedVoidTarget').inputValue(),
      available.value);
    await page.setInputFiles('#existingMkvReservedVoidReplacement',{
      name:'bigger.bin',mimeType:'application/octet-stream',buffer:grown,
    });
    assert.equal(await page.locator('#existingMkvReservedVoidPrepare').isDisabled(),true);
    await page.locator('#existingMkvReservedVoidReview').check();
    const ready=await page.locator('#existingMkvReservedVoidPrepare').isEnabled();
    if(!ready){
      const diagnostic=await page.evaluate(()=>{
        const src=document.querySelector('#existingMkvReservedVoidSource');
        const newer=document.querySelector('#existingMkvReservedVoidReplacement');
        const target=document.querySelector('#existingMkvReservedVoidTarget');
        return {sourceName:src?.files?.[0]?.name,sourceSize:src?.files?.[0]?.size,
          replacementName:newer?.files?.[0]?.name,
          replacementSize:newer?.files?.[0]?.size,
          selectedUid:target?.value,
          reviewed:document.querySelector('#existingMkvReservedVoidReview')?.checked,
          controlsDisabled:document.querySelector('#existingMkvReservedVoidPrepare')?.disabled,
          blockedReason:document.querySelector('#existingMkvReservedVoidPrepare')?.dataset.blockReason,
          guardDiagnostic:document.querySelector('#existingMkvReservedVoidPrepare')?.dataset.guardDiagnostic,
          status:document.querySelector('#existingMkvReservedVoidStatus')?.textContent,
          inventory:document.querySelector('#existingMkvReservedVoidInventory')?.textContent,
          options:[...target.options].map(x=>({uid:x.value,disabled:x.disabled}))};
      });
      console.error('P0/P2-V preflight disabled diagnostic:',JSON.stringify(diagnostic));
    }
    assert.equal(ready,true,'reviewed variable replacement must enable prepare for source-bound unreferenced UID');
    await page.locator('#existingMkvReservedVoidPrepare').click();
    await page.waitForFunction(()=>
      ['prepared','blocked'].includes(
        document.querySelector('#existingMkvReservedVoidStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvReservedVoidStatus').getAttribute('data-state'),
      'prepared',await page.locator('#existingMkvReservedVoidStatus').textContent());
    assert.match(await page.locator('#existingMkvReservedVoidEvidence').textContent(),
      /SHA-256/);
    await page.setViewportSize({width:768,height:1024});
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    await page.locator('#existingMkvReservedVoidDetails').screenshot({
      path:path.join(outDir,'mkv-container-tree-reserved-void-tablet-768.png'),
      animations:'disabled',
    });
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#existingMkvReservedVoidSave').click(),
    ]);
    assert.match(download.suggestedFilename(),/\.void-filedata-replaced\.experimental\.mkv$/);
    await download.saveAs(originalOutput);
    assert.equal((await fs.stat(originalOutput)).size,(await fs.stat(reserved)).size,
      'all original top-level offsets and total file size remain exact');
    assert.equal(createHash('sha256').update(await fs.readFile(reserved)).digest('hex'),
      oldSourceHash,'source cannot be overwritten');
    const result=native(originalOutput);
    assert.equal((result.attachments||[]).length,2);
    for(const key of ['p0-attachment-evidence.bin','p0-attachment-decoy.txt']){
      const before=sourceInfo.attachments.find(x=>x.file_name===key);
      const after=result.attachments.find(x=>x.file_name===key);
      assert.ok(after);
      assert.equal(after.properties.uid,before.properties.uid);
      assert.equal(after.content_type,before.content_type);
    }
    assert.deepEqual(result.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]),
      sourceInfo.tracks.map(t=>[t.id,t.type,t.codec,t.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const beforeXml=path.join(outDir,'p2-variable-source-'+kind+'.xml');
      const afterXml=path.join(outDir,'p2-variable-output-'+kind+'.xml');
      execFileSync('mkvextract',[reserved,kind,beforeXml],{timeout:60000});
      execFileSync('mkvextract',[originalOutput,kind,afterXml],{timeout:60000});
      assert.deepEqual(await fs.readFile(afterXml),await fs.readFile(beforeXml),
        kind+' nested chapter hierarchy and target Tag identities must remain intact');
    }
    const taggedBefore=path.join(outDir,'p2-variable-tagged-before.bin');
    const taggedAfter=path.join(outDir,'p2-variable-tagged-after.bin');
    const replacedAfter=path.join(outDir,'p2-variable-untagged-after.bin');
    const afterTag=result.attachments.find(x=>x.file_name===tagged.file_name);
    const afterFree=result.attachments.find(x=>x.file_name===free.file_name);
    execFileSync('mkvextract',[reserved,'attachments',
      String(tagged.id)+':'+taggedBefore],{timeout:60000});
    execFileSync('mkvextract',[originalOutput,'attachments',
      String(afterTag.id)+':'+taggedAfter,
      String(afterFree.id)+':'+replacedAfter],{timeout:60000});
    assert.deepEqual(await fs.readFile(taggedAfter),await fs.readFile(taggedBefore));
    assert.deepEqual(await fs.readFile(replacedAfter),grown);
    assert.deepEqual(nativePacket(originalOutput),nativePacket(reserved),
      'all original packets, PTS/DTS and hashes must match');
    console.log('P0/P2-V reserved Void variable-length browser output + independent MKVToolNix/ffprobe chapters, tags, UID, FileData and packet audit PASS');
  }finally{await context.close();}
}

async function scenarioTracklessMkaRealChapterTagTextEdit(browser) {
  console.log('P2 R5 native AUDIO-ONLY Matroska: UI TagString + nested ChapString byte-preserving edit');
  const input=path.join(outDir,'p2-r5-audio-only-source.mka');
  execFileSync('mkvmerge',['--quiet','-o',input,
    '--chapters',path.join(root,'p0-independent-chapters.xml'),
    path.join(root,'external.flac')],{timeout:60000});
  execFileSync('mkvpropedit',[input,'--tags',
    'all:'+path.join(root,'p0-independent-tags.xml')],{timeout:60000});
  const tracks=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],{
    encoding:'utf8',timeout:60000,
  })).tracks;
  const probePackets=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',timeout:60000,maxBuffer:24*1024*1024})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const xml=(file,kind,prefix)=>{
    const output=path.join(outDir,'p2-r5-'+prefix+'-'+kind+'.xml');
    execFileSync('mkvextract',[file,kind,output],{timeout:60000});
    return fs.readFile(output,'utf8');
  };
  const origChap=await xml(input,'chapters','before');
  const origTag=await xml(input,'tags','before');
  assert.match(origChap,/P0 nested chapter/);
  assert.match(origTag,/linked-chapter-metadata/);
  assert.match(origTag,/<ChapterUID>510011<\/ChapterUID>/);
  assert.equal(tracks(input).some(x=>x.type==='video'),false);
  const originalHash=createHash('sha256').update(await fs.readFile(input)).digest('hex');
  const {context,page}=await openApp(browser);
  try{
    await page.locator('#p2MetadataInlineDetails > summary').click();
    const load=async(file,marker)=>{
      await page.setInputFiles('#p2MetadataSource',file);
      await page.waitForFunction(value=>
        [...document.querySelectorAll('#p2MetadataField option')]
          .some(x=>x.textContent.includes(value)),marker,{timeout:60000});
      const selected=await page.locator('#p2MetadataField option').evaluateAll(
        (els,m)=>els.find(x=>x.textContent.includes(m))?.value,marker);
      assert.ok(selected);
      await page.locator('#p2MetadataField').selectOption(selected);
    };
    const save=async(expected,pathTo)=>{
      await page.locator('#p2MetadataNewText').fill(expected);
      assert.equal(await page.locator('#p2MetadataPrepare').isDisabled(),true);
      await page.locator('#p2MetadataReview').check();
      await page.locator('#p2MetadataPrepare').click();
      await page.waitForFunction(()=>['ready','blocked'].includes(
        document.querySelector('#p2MetadataStatus')?.dataset.state),
        null,{timeout:120000});
      assert.equal(await page.locator('#p2MetadataStatus').getAttribute('data-state'),
        'ready',await page.locator('#p2MetadataStatus').textContent());
      const [download]=await Promise.all([
        page.waitForEvent('download'),
        page.locator('#p2MetadataSave').click(),
      ]);
      await download.saveAs(pathTo);
    };
    await load(input,'linked-chapter-metadata');
    const changedTag='R'.repeat('linked-chapter-metadata'.length);
    const intermediate=path.join(outDir,'p2-r5-tag-changed.mkv');
    await save(changedTag,intermediate);
    await load(intermediate,'P0 nested chapter');
    const final=path.join(outDir,'p2-r5-audio-only-chapter-tag-final.mkv');
    await save('R5 nested chapter',final);
    assert.equal(tracks(final).some(x=>x.type==='video'),false);
    assert.deepEqual(tracks(final).map(x=>[x.id,x.type,x.codec,x.properties?.uid]),
      tracks(input).map(x=>[x.id,x.type,x.codec,x.properties?.uid]));
    assert.deepEqual(probePackets(final),probePackets(input));
    const finalChap=await xml(final,'chapters','after');
    const finalTag=await xml(final,'tags','after');
    assert.equal(finalChap,origChap.replace('P0 nested chapter','R5 nested chapter'));
    assert.equal(finalTag,origTag.replace('linked-chapter-metadata',changedTag));
    assert.match(finalTag,/<ChapterUID>510011<\/ChapterUID>/);
    assert.equal(createHash('sha256').update(await fs.readFile(input))
      .digest('hex'),originalHash);
    console.log('P2 R5 native audio-only chapters/tag output and UID/packet oracle PASS');
  }finally{await context.close();}
}

async function scenarioRoutedExistingMkvNativeOutput(browser) {
  console.log('P2 Round4 unified writer router: native MKV + UID risk -> one path -> independent output');
  const source=path.join(outDir,'p2-r4-router-native-source.mkv');
  await fs.copyFile(path.join(root,'p0-independent-attachmenttag.mkv'),source);
  execFileSync('mkvpropedit',[source,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  const inspect=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],{
    encoding:'utf8',timeout:60000,
  }));
  const sourceInfo=inspect(source);
  const tagged=sourceInfo.attachments.find(x=>x.file_name==='p0-attachment-evidence.bin');
  const target=sourceInfo.attachments.find(x=>x.file_name==='p0-attachment-decoy.txt');
  assert.ok(tagged&&target);
  const original=await fs.readFile(source);
  const originalDigest=createHash('sha256').update(original).digest('hex');
  const originalData=await fs.readFile(path.join(root,'zh.ass'));
  const replacement=Buffer.alloc(originalData.length,0x61);
  const {context,page}=await openApp(browser);
  try{
    await page.locator('#existingMkvRoutedEditDetails > summary').click();
    await page.setInputFiles('#existingMkvRoutedSource',source);
    await page.waitForFunction(()=>
      document.querySelector('#existingMkvRoutedTarget')?.options.length===2,
      null,{timeout:60000});
    const opts=await page.locator('#existingMkvRoutedTarget option').evaluateAll(
      options=>options.map(x=>({value:x.value,text:x.textContent})));
    const selected=opts.find(x=>x.text.includes('p0-attachment-decoy.txt'));
    assert.ok(selected);
    await page.locator('#existingMkvRoutedTarget').selectOption(selected.value);
    await page.setInputFiles('#existingMkvRoutedReplacement',{
      name:'replacement.bin',mimeType:'application/octet-stream',buffer:replacement,
    });
    assert.equal(await page.locator('#existingMkvRoutedPrepare').isDisabled(),true);
    await page.locator('#existingMkvRoutedReview').check();
    await page.locator('#existingMkvRoutedPrepare').click();
    await page.waitForFunction(()=>['ready','blocked'].includes(
      document.querySelector('#existingMkvRoutedStatus')?.dataset.state),
      null,{timeout:120000});
    assert.equal(await page.locator('#existingMkvRoutedStatus').getAttribute('data-state'),
      'ready',await page.locator('#existingMkvRoutedStatus').textContent());
    assert.match(await page.locator('#existingMkvRoutedEvidence').textContent(),
      /same-size/);
    const output=path.join(outDir,'p2-r4-router-native-output.mkv');
    const [download]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('#existingMkvRoutedSave').click(),
    ]);
    await download.saveAs(output);
    assert.equal(createHash('sha256').update(await fs.readFile(source))
      .digest('hex'),originalDigest);
    const final=inspect(output);
    assert.deepEqual((final.tracks||[]).map(x=>[x.id,x.type,x.codec,x.properties?.uid]),
      (sourceInfo.tracks||[]).map(x=>[x.id,x.type,x.codec,x.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const a=path.join(outDir,'p2-r4-before-'+kind+'.xml');
      const b=path.join(outDir,'p2-r4-after-'+kind+'.xml');
      execFileSync('mkvextract',[source,kind,a],{timeout:60000});
      execFileSync('mkvextract',[output,kind,b],{timeout:60000});
      assert.deepEqual(await fs.readFile(b),await fs.readFile(a));
    }
    const newTarget=final.attachments.find(x=>x.file_name===target.file_name);
    const newTagged=final.attachments.find(x=>x.file_name===tagged.file_name);
    assert.equal(newTarget?.properties?.uid,target.properties.uid);
    assert.equal(newTagged?.properties?.uid,tagged.properties.uid);
    const extracted=path.join(outDir,'p2-r4-replaced-content.bin');
    execFileSync('mkvextract',[output,'attachments',
      String(newTarget.id)+':'+extracted],{timeout:60000});
    assert.deepEqual(await fs.readFile(extracted),replacement);
    console.log('P2 Round4 routed operator actual native MKV/UID/Chapter/Tag SHA PASS');
  }finally{await context.close();}
}

async function scenarioExistingMkvSameSizeAttachmentReplace(browser) {
  console.log('P0/P2 real browser: replace one existing unreferenced FileData, preserve tagged UID and nested Chapters');
  // This source was authored independently by MKVToolNix and already has
  // TWO AttachedFiles and a TagAttachmentUID targeting the first file.
  const source=path.join(outDir,'p2-same-size-complex-source.mkv');
  const original=path.join(root,'p0-independent-attachmenttag.mkv');
  await fs.copyFile(original,source);
  execFileSync('mkvpropedit',[source,'--chapters',
    path.join(root,'p0-independent-chapters.xml')],{timeout:60000});
  const info=file=>JSON.parse(execFileSync('mkvmerge',['-J',file],
    {encoding:'utf8',timeout:60000}));
  const before=info(source);
  assert.equal((before.attachments||[]).length,2);
  const tagged=before.attachments.find(a=>a.file_name==='p0-attachment-evidence.bin');
  const target=before.attachments.find(a=>a.file_name==='p0-attachment-decoy.txt');
  assert.ok(tagged&&target);
  const replacementOriginal=await fs.readFile(path.join(root,'zh.ass'));
  assert.ok(replacementOriginal.length>0);
  const replacement=Buffer.alloc(replacementOriginal.length,0x58);
  const readPacketData=file=>JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
  ],{encoding:'utf8',timeout:60000,maxBuffer:24*1024*1024})).packets
    .map(x=>[x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
  const srcStat=await fs.stat(source);
  const {context,page}=await openApp(browser);
  try {
    await page.locator('#existingMkvSameSizeReplaceDetails > summary').click();
    await page.setInputFiles('#existingMkvSameSizeSource',source);
    await page.waitForFunction(()=>
      document.querySelector('#existingMkvSameSizeTarget')?.options.length===2,
      null,{timeout:60000});
    const items=page.locator('#existingMkvSameSizeTarget option');
    const options=await items.evaluateAll(nodes=>nodes.map(el=>({
      value:el.value,text:el.textContent,disabled:el.disabled,
    })));
    assert.equal(options.length,2);
    assert.equal(options.find(x=>x.text.includes('p0-attachment-evidence.bin'))?.disabled,true);
    const decoy=options.find(x=>x.text.includes('p0-attachment-decoy.txt'));
    assert.ok(decoy&&!decoy.disabled);
    assert.equal(await page.locator('#existingMkvSameSizeTarget').inputValue(),decoy.value);
    // Wrong size, then corrected same-size bytes; stale review may never execute.
    await page.setInputFiles('#existingMkvSameSizeReplacement',{
      name:'replacement.bin',mimeType:'application/octet-stream',
      buffer:Buffer.from('short'),
    });
    await page.locator('#existingMkvSameSizeReview').check();
    assert.equal(await page.locator('#existingMkvSameSizePrepare').isDisabled(),true);
    await page.setInputFiles('#existingMkvSameSizeReplacement',{
      name:'replacement.bin',mimeType:'application/octet-stream',buffer:replacement,
    });
    assert.equal(await page.locator('#existingMkvSameSizeReview').isChecked(),false);
    assert.equal(await page.locator('#existingMkvSameSizeSave').isDisabled(),true);
    await page.locator('#existingMkvSameSizeReview').check();
    await page.locator('#existingMkvSameSizePrepare').click();
    await page.waitForFunction(()=>
      ['prepared','blocked'].includes(
        document.querySelector('#existingMkvSameSizeStatus')?.dataset.state),
      null,{timeout:120000});
    const state=await page.locator('#existingMkvSameSizeStatus').getAttribute('data-state');
    assert.equal(state,'prepared',
      await page.locator('#existingMkvSameSizeStatus').textContent());
    assert.match(await page.locator('#existingMkvSameSizeEvidence').textContent(),
      /SHA-256/);
    const output=path.join(outDir,'p2-same-size-complex-browser-result.mkv');
    const [download]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('#existingMkvSameSizeSave').click(),
    ]);
    assert.match(download.suggestedFilename(),/\.one-filedata-replaced\.experimental\.mkv$/);
    await download.saveAs(output);
    assert.equal((await fs.stat(output)).size,srcStat.size);
    const after=info(output);
    assert.equal((after.attachments||[]).length,2);
    const tagAfter=after.attachments.find(a=>a.file_name===tagged.file_name);
    const targetAfter=after.attachments.find(a=>a.file_name===target.file_name);
    assert.equal(tagAfter?.properties?.uid,tagged.properties.uid);
    assert.equal(targetAfter?.properties?.uid,target.properties.uid);
    assert.deepEqual((after.tracks||[]).map(t=>[t.id,t.type,t.codec,t.properties?.uid]),
      (before.tracks||[]).map(t=>[t.id,t.type,t.codec,t.properties?.uid]));
    for(const kind of ['chapters','tags']){
      const a=path.join(outDir,'p2-same-size-original-'+kind+'.xml');
      const b=path.join(outDir,'p2-same-size-output-'+kind+'.xml');
      execFileSync('mkvextract',[source,kind,a],{timeout:60000});
      execFileSync('mkvextract',[output,kind,b],{timeout:60000});
      assert.deepEqual(await fs.readFile(b),await fs.readFile(a),
        'complex original '+kind+' preserved in output');
    }
    const origTag=path.join(outDir,'p2-same-size-tagged-original.bin');
    const finalTag=path.join(outDir,'p2-same-size-tagged-output.bin');
    const finalReplace=path.join(outDir,'p2-same-size-replaced-output.bin');
    execFileSync('mkvextract',[source,'attachments',
      String(tagged.id)+':'+origTag],{timeout:60000});
    execFileSync('mkvextract',[output,'attachments',
      String(tagAfter.id)+':'+finalTag,
      String(targetAfter.id)+':'+finalReplace],{timeout:60000});
    assert.deepEqual(await fs.readFile(finalTag),await fs.readFile(origTag),
      'tag-targeted original FileData cannot change');
    assert.deepEqual(await fs.readFile(finalReplace),replacement);
    assert.deepEqual(readPacketData(output),readPacketData(source),
      'original compressed stream packets and timestamps unchanged');
    assert.equal((await fs.stat(source)).size,srcStat.size);
    console.log('P0/P2 same-size existing attachment replacement + independent external chapter/tag/UID/packet/FileData audit PASS');
  } finally { await context.close(); }
}

async function scenarioExistingMkvLimitedAppendReviewed(browser) {
  console.log('P2-A product opt-in: real MKVToolNix source with nested ChapterUID tags, independently audited limited attachment copy');
  const source = path.join(outDir, 'limited-existing-source.mkv');
  const payload = Buffer.from('Real browser-only attachment payload verified with independent extractors.\\n');
  execFileSync('mkvmerge', [
    '--quiet', '--output', source,
    '--chapters', path.join(root, 'p0-independent-chapters.xml'),
    path.join(root, 'base.mp4'),
  ], { timeout: 60_000 });
  execFileSync('mkvpropedit', [
    source, '--tags', 'all:' + path.join(root, 'p0-independent-tags.xml'),
  ], { timeout: 60_000 });
  const { context, page } = await openApp(browser);
  try {
    await page.locator('#existingMkvLimitedDetails > summary').click();
    await page.setInputFiles('#existingMkvLimitedSource', source);
    await page.setInputFiles('#existingMkvLimitedAttachment', {
      name: 'readme.txt', mimeType: 'text/plain', buffer: payload,
    });
    assert.equal(await page.locator('#existingMkvLimitedPrepare').isDisabled(), true);
    assert.equal(await page.locator('#existingMkvLimitedSave').isDisabled(), true);
    await page.locator('#existingMkvLimitedReview').check();
    // Single-file metadata changes must also invalidate prior risk approval.
    await page.locator('#existingMkvLimitedMime').fill('application/x-temporary');
    assert.equal(await page.locator('#existingMkvLimitedReview').isChecked(), false);
    assert.equal(await page.locator('#existingMkvLimitedPrepare').isDisabled(), true);
    await page.locator('#existingMkvLimitedMime').fill('text/plain');
    await page.locator('#existingMkvLimitedReview').check();
    await page.locator('#existingMkvLimitedPrepare').click();
    await page.waitForFunction(() =>
      ['prepared','blocked'].includes(
        document.querySelector('#existingMkvLimitedStatus')?.dataset.state),
      null, { timeout: 120_000 });
    assert.equal(await page.locator('#existingMkvLimitedStatus').getAttribute('data-state'),
      'prepared', await page.locator('#existingMkvLimitedStatus').textContent());
    assert.match(await page.locator('#existingMkvLimitedEvidence').textContent(),
      /FileData SHA-256/);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    await page.locator('#existingMkvLimitedDetails').screenshot({
      path: path.join(outDir, 'mkv-limited-existing-append-tablet-768.png'),
      animations: 'disabled',
    });
    const output = path.join(outDir, 'limited-existing-browser-result.mkv');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#existingMkvLimitedSave').click(),
    ]);
    assert.match(download.suggestedFilename(), /\.one-new-attachment\.experimental\.mkv$/);
    await download.saveAs(output);
    assert.equal((await fs.stat(output)).size, (await fs.stat(source)).size);
    const read = file => JSON.parse(execFileSync('mkvmerge', ['-J', file],
      { encoding: 'utf8', timeout: 60_000 }));
    const before = read(source);
    const after = read(output);
    assert.equal((before.attachments || []).length, 0);
    assert.equal((after.attachments || []).length, 1);
    assert.equal(after.attachments[0].file_name, 'readme.txt');
    assert.equal(after.attachments[0].content_type, 'text/plain');
    assert.deepEqual((after.tracks || []).map(t => [t.id,t.type,t.codec]),
      (before.tracks || []).map(t => [t.id,t.type,t.codec]));
    for (const kind of ['chapters', 'tags']) {
      const originalXml = path.join(outDir, 'limited-source-' + kind + '.xml');
      const outputXml = path.join(outDir, 'limited-output-' + kind + '.xml');
      execFileSync('mkvextract', [source, kind, originalXml], { timeout: 60_000 });
      execFileSync('mkvextract', [output, kind, outputXml], { timeout: 60_000 });
      assert.deepEqual(await fs.readFile(outputXml), await fs.readFile(originalXml),
        kind + ' raw semantic XML must survive limited source writer');
    }
    const extractedPath = path.join(outDir, 'limited-existing-extracted.txt');
    execFileSync('mkvextract', [output, 'attachments',
      String(after.attachments[0].id) + ':' + extractedPath], { timeout: 60_000 });
    assert.deepEqual(await fs.readFile(extractedPath), payload);
    const packetRecords = file => JSON.parse(execFileSync('ffprobe', [
      '-v','error','-show_packets','-show_data_hash','sha256','-of','json', file,
    ], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, timeout: 60_000 }))
      .packets.map(x => [x.stream_index,x.pts,x.dts,x.duration,x.size,x.data_hash]);
    assert.deepEqual(packetRecords(output), packetRecords(source));

    // Same independent source, but now TWO AttachedFiles inside one
    // reserved-Void replacement. Check external discovery/extraction for both.
    const secondPayload = Buffer.from('second exact binary attachment\\n');
    await page.setInputFiles('#existingMkvLimitedAttachment', [
      { name: 'readme.txt', mimeType: 'text/plain', buffer: payload },
      { name: 'second.bin', mimeType: 'application/octet-stream', buffer: secondPayload },
    ]);
    assert.ok((await page.locator('#existingMkvLimitedInventory').textContent()).includes('second.bin'));
    assert.equal(await page.locator('#existingMkvLimitedReview').isChecked(), false);
    assert.equal(await page.locator('#existingMkvLimitedFilename').isDisabled(), true);
    assert.equal(await page.locator('#existingMkvLimitedSave').isDisabled(), true);
    await page.locator('#existingMkvLimitedReview').check();
    await page.locator('#existingMkvLimitedPrepare').click();
    await page.waitForFunction(() => ['prepared', 'blocked'].includes(
      document.querySelector('#existingMkvLimitedStatus')?.dataset.state), null, { timeout: 120_000 });
    assert.equal(await page.locator('#existingMkvLimitedStatus').getAttribute('data-state'),
      'prepared', await page.locator('#existingMkvLimitedStatus').textContent());
    assert.match(await page.locator('#existingMkvLimitedEvidence').textContent(), /已验证 2 个附件/);
    // Changing a verified item must revoke both review and previously prepared
    // output, and invalid names must be corrected manually rather than silently
    // renamed by the EBML writer.
    const outputNameEditor = page.locator(
      '#existingMkvLimitedInventory input[data-limited-index="1"][data-limited-field="filename"]');
    const outputMimeEditor = page.locator(
      '#existingMkvLimitedInventory input[data-limited-index="1"][data-limited-field="mimeType"]');
    assert.equal(await outputNameEditor.inputValue(), 'second.bin');
    await outputNameEditor.fill('readme.txt');
    assert.equal(await page.locator('#existingMkvLimitedReview').isChecked(), false);
    assert.equal(await page.locator('#existingMkvLimitedSave').isDisabled(), true);
    await page.locator('#existingMkvLimitedReview').check();
    assert.equal(await page.locator('#existingMkvLimitedPrepare').isDisabled(), true,
      'duplicate final names require explicit correction');
    assert.match(await page.locator('#existingMkvLimitedStatus').textContent(), /重复|不安全/);
    await outputNameEditor.fill('renamed-second.bin');
    await outputMimeEditor.fill('application/x-audit-data');
    assert.equal(await page.locator('#existingMkvLimitedReview').isChecked(), false);
    await page.locator('#existingMkvLimitedReview').check();
    await page.locator('#existingMkvLimitedPrepare').click();
    await page.waitForFunction(() => ['prepared','blocked'].includes(
      document.querySelector('#existingMkvLimitedStatus')?.dataset.state), null, { timeout: 120_000 });
    assert.equal(await page.locator('#existingMkvLimitedStatus').getAttribute('data-state'),
      'prepared', await page.locator('#existingMkvLimitedStatus').textContent());
    assert.ok((await page.locator('#existingMkvLimitedEvidence').textContent()).includes('renamed-second.bin'));
    const multiOutput = path.join(outDir, 'limited-existing-browser-two-attachments.mkv');
    const [multiDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('#existingMkvLimitedSave').click(),
    ]);
    assert.ok(multiDownload.suggestedFilename().endsWith('.multiple-new-attachments.experimental.mkv'));
    await multiDownload.saveAs(multiOutput);
    assert.equal((await fs.stat(multiOutput)).size, (await fs.stat(source)).size);
    const afterMulti = read(multiOutput);
    assert.equal((afterMulti.attachments || []).length, 2);
    assert.deepEqual(afterMulti.attachments.map(item => item.file_name).sort(),
      ['readme.txt', 'renamed-second.bin'].sort());
    assert.equal(afterMulti.attachments.find(item => item.file_name === 'renamed-second.bin').content_type,
      'application/x-audit-data');
    assert.deepEqual((afterMulti.tracks || []).map(t => [t.id, t.type, t.codec]),
      (before.tracks || []).map(t => [t.id, t.type, t.codec]));
    for (const kind of ['chapters', 'tags']) {
      const extractedXml = path.join(outDir, 'limited-two-' + kind + '.xml');
      execFileSync('mkvextract', [multiOutput, kind, extractedXml], { timeout: 60_000 });
      assert.deepEqual(await fs.readFile(extractedXml),
        await fs.readFile(path.join(outDir, 'limited-source-' + kind + '.xml')));
    }
    for (const [name, bytes] of [['readme.txt', payload], ['renamed-second.bin', secondPayload]]) {
      const item = afterMulti.attachments.find(entry => entry.file_name === name);
      const extracted = path.join(outDir, 'limited-two-' + name);
      execFileSync('mkvextract', [multiOutput, 'attachments',
        String(item.id) + ':' + extracted], { timeout: 60_000 });
      assert.deepEqual(await fs.readFile(extracted), bytes);
    }
    assert.deepEqual(packetRecords(multiOutput), packetRecords(source));

    // Changing source immediately revokes the prepared artifact authorization.
    await page.setInputFiles('#existingMkvLimitedSource',
      path.join(root, 'source-with-attachments.mkv'));
    assert.equal(await page.locator('#existingMkvLimitedSave').isDisabled(), true);
    await page.locator('#existingMkvLimitedReview').check();
    await page.locator('#existingMkvLimitedPrepare').click();
    await page.waitForFunction(() =>
      document.querySelector('#existingMkvLimitedStatus')?.dataset.state === 'blocked',
      null, { timeout: 120_000 });
    assert.equal(await page.locator('#existingMkvLimitedSave').isDisabled(), true);
    assert.match(await page.locator('#existingMkvLimitedStatus').textContent(),
      /APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED/);
    console.log('P2-A opt-in existing MKV independent browser writer PASS');
  } finally {
    await context.close();
  }
}

async function scenarioVerifiedDetachedTrackRestore(browser) {
  console.log('E2E P1: source digest + old-field proof -> explicit track transaction -> actual MKV');
  const { context, page } = await openApp(browser);
  const original = path.join(root, 'source-with-attachments.mkv');
  const sourceBefore = await fs.readFile(original);
  try {
    await page.setInputFiles('#videoInput', original);
    await waitForStatus(page, '轨道扫描完成：');
    await page.locator('#appendPreserveAll').uncheck();
    // Real user editing first: the exported file must encode an actual
    // scan-baseline delta without hand-authoring any JSON intent.
    const finalTitle = 'Verified detached restored audio';
    const liveTitle = page.locator('.track-row.track-audio input[data-track-field="title"]').first();
    const scanTitle = await liveTitle.inputValue();
    await liveTitle.fill(finalTitle);
    await page.waitForFunction(() =>
      !document.querySelector('#containerProjectExportBtn')?.disabled);
    const projectFile = path.join(outDir, 'verified-track-restore-draft.json');
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('#containerProjectExportBtn').click(),
    ]);
    await download.saveAs(projectFile);
    const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    assert.equal(project.sources.length, 1);
    assert.match(project.sources[0].sha256, /^[0-9a-f]{64}$/);
    const audio = project.objects.find(item => item.kind === 'audio' && item.sourceId);
    assert.ok(audio, 'scanned source audio must be bound, not an external proposal');
    assert.equal(audio.attributes.title, finalTitle);
    assert.equal(project.editIntents.length, 1,
      'real source editor must export its scan-to-current change');
    assert.deepEqual({
      field: project.editIntents[0].field,
      from: project.editIntents[0].from,
      to: project.editIntents[0].to,
    }, { field: 'title', from: scanTitle, to: finalTitle });
    // Restore the actual live track to its scan baseline before reviewing.
    await liveTitle.fill(scanTitle);
    assert.equal(await liveTitle.inputValue(), scanTitle);
    await page.setInputFiles('#containerProjectImportInput', {
      name: 'verified-track-restore.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '').includes('已读取工程草稿'));
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(), true,
      'source byte digest has not been verified and explicit consent is absent');
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state === 'digest-matches-draft');
    assert.equal(await page.locator('#containerProjectRestorePanel').isVisible(), true);
    assert.equal(await page.locator('#containerProjectRestorePanel').getAttribute('data-ready'), 'true');
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(), true,
      'matching digest and track baseline must not silently authorize a mutation');
    await page.locator('#containerProjectRestoreConfirm').check();
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(), false);
    await page.locator('#containerProjectRestoreBtn').click();
    assert.match(await page.locator('#containerProjectRestoreStatus').textContent(), /一次应用到/);
    assert.equal(await page.locator('.track-row.track-audio input[data-track-field="title"]').first().inputValue(),
      finalTitle);
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(), true,
      'the same old-value proposal cannot overwrite the now-changed track');
    assert.match(await page.locator('#containerProjectConflictList').textContent(), /当前字段值与草稿修改前记录冲突/);
    assert.equal(await page.locator('#containerProjectRestoreUndoBtn').isDisabled(), false);
    await page.locator('#containerProjectRestoreUndoBtn').click();
    assert.equal(await liveTitle.inputValue(), scanTitle, 'undo must restore exactly the previous live field');
    assert.match(await page.locator('#containerProjectRestoreStatus').textContent(), /已撤销本次恢复/);
    await page.locator('#containerProjectRestoreConfirm').check();
    await page.locator('#containerProjectRestoreBtn').click();
    assert.equal(await liveTitle.inputValue(), finalTitle);
    assert.deepEqual(await fs.readFile(original), sourceBefore, 'never modify source bytes');
    await page.locator('#muxBtn').click();
    await waitForStatus(page, '完成。');
    const output = path.join(outDir, 'verified-track-restore-final.mkv');
    await saveDownload(page, '#downloadLink', output);
    assert.equal(streams(probe(output), 'audio')[0]?.tags?.title, finalTitle,
      'real finished MKV must carry the restored source-track title');
    console.log('Verified detached track restored and delivered PASS');
  } finally {
    await context.close();
  }
}

async function scenarioStreamedSourceDigestBrowser(browser) {
  console.log('E2E P1: real workbench exports and verifies >64 MiB complete SHA-256');
  const { context, page } = await openApp(browser);
  try {
    const prefix = await fs.readFile(path.join(root, 'base.mp4'));
    const bytes = Buffer.alloc(65 * 1024 * 1024 + 13, 0x61);
    assert.ok(prefix.length < bytes.length);
    prefix.copy(bytes);
    const expected = createHash('sha256').update(bytes).digest('hex');
    // A valid MP4 prefix avoids MKV auto-scan; the export is still a genuine
    // production-workbench action on a >64 MiB File reference, not a
    // synthesized call to a duplicated test-only hashing implementation.
    // Playwright's in-memory setInputFiles buffer is capped at 50 MB.
    // Use a real runner-side fixture path for this >=65 MiB regression.
    const largeSourcePath = path.join(outDir, 'large-source.mp4');
    await fs.writeFile(largeSourcePath, bytes);
    await page.setInputFiles('#videoInput', largeSourcePath);
    await page.waitForFunction(() => {
      const btn = document.querySelector('#containerProjectExportBtn');
      return btn && !btn.disabled;
    }, null, { timeout: 60_000 });
    const output = path.join(outDir, 'large-streamed-container-project.json');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.locator('#containerProjectExportBtn').click(),
    ]);
    await download.saveAs(output);
    const project = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(project.sources.length, 1);
    assert.equal(project.sources[0].sha256, expected,
      'real browser must calculate standard SHA-256 over EVERY source byte');
    assert.match(await page.locator('#status').textContent(), /完整来源 SHA-256/);
    await page.setInputFiles('#containerProjectImportInput', output);
    await page.waitForFunction(() =>
      (document.querySelector('#containerProjectImportReview')?.textContent || '')
        .includes('已读取工程草稿'));
    await page.locator('#containerProjectVerifySourceBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#containerProjectImportReview')?.dataset.state ===
        'digest-matches-draft', null, { timeout: 120_000 });
    assert.equal(await page.locator('#containerProjectRestoreBtn').isDisabled(), true,
      'byte identity on unscanned media does not authorize editing');
    assert.equal(await page.locator('#containerProjectHashCancelBtn').count(), 1,
      'real UI must provide independent source-hash cancellation');
    assert.equal(await page.locator('#containerProjectHashActions').isVisible(), false,
      'completed operation must dismiss transient progress');
    assert.equal(await page.locator('#downloadLink').isVisible(), false,
      'project source hashing must never start media mux or forge an artifact');
    console.log('Browser full-file digest export/re-import PASS');
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
  await scenarioLiveSourceTrackDomainToRealMux(browser);
  await scenarioUnifiedContainerAttachmentEditing(browser);
  await scenarioUnifiedContainerOrderingAndAdvancedFlags(browser);
  await scenarioVerifiedDetachedSourceTrackOrder(browser);
  await scenarioResponsiveObjectEditor(browser);
  await scenarioMultiTrack(browser);
  await scenarioFiveStepRecipeAndCapabilityWorkbench(browser);
  await scenarioVerifiedDetachedTrackRestore(browser);
  await scenarioStreamedSourceDigestBrowser(browser);
  await scenarioP3FinalMkvRealLibassRendering(browser);
  await scenarioP3DynamicAssDelivery(browser);
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
  await scenarioExternalAssetDomainAuthority(browser);
  await scenarioSharedContainerProjectRealMux(browser);
  await scenarioExternalCheckpointRecoveryRealMux(browser);
  await scenarioWorkbenchEfficiency(browser);
  await scenarioLiveSourceAttachmentDomainMux(browser);
  await scenarioPreviewFrame(browser);
  await scenarioPreviewTimeClamp(browser);
  await scenarioAv1PreviewFrame(browser);
  await scenarioAdditionalSubtitleFormats(browser);
  await scenarioFontSubsetting(browser);
  await scenarioUnifiedBatchContentIntake(browser);
  await scenarioBatchAmbiguousSafety(browser);
  await scenarioBatchDirectoryConflict(browser);
  await scenarioBatchDirectorySaveFallback(browser);
  await scenarioBatchReportSavePartialPersistence(browser);
  await scenarioBatchRecipeV2PerOutputRealMux(browser);
  await scenarioBatchQueue(browser);
  await scenarioBatchFailedJobRetry(browser);
  await scenarioBatchResultUrlLifetime(browser);
  await scenarioBatchContentIdentity(browser);
  await scenarioAutoLanguageInference(browser);
  await scenarioPreserveAllAppend(browser);
  await scenarioP1SubtitleIntentInvalidation(browser);
  await scenarioP2GenericAttachmentExtraction(browser);
  await scenarioP2R02NoTrackAndMimeEvidence(browser);
  await scenarioP2R02BrowserCreateOnlyPng(browser);
  await scenarioP2MultiAttachmentBrowserCreate(browser);
  await scenarioP2ExistingAttachmentImpactReadonlyUI(browser);
  await scenarioExistingMkvLimitedAppendReviewed(browser);
  await scenarioExistingMkvSameSizeAttachmentReplace(browser);
  await scenarioRoutedExistingMkvNativeOutput(browser);
  await scenarioTracklessMkaRealChapterTagTextEdit(browser);
  await scenarioReservedVoidExistingFileDataVariableReplace(browser);
  await scenarioTailNoVoidExistingAttachmentResize(browser);
  await scenarioNonterminalIndexedAttachmentRelay(browser);
  await scenarioNonfinalAttachedFileRelayNative(browser);
  await scenarioVerifiedNestedAttachmentCrcRelocation(browser);
  await scenarioP2AttachmentInspectionStaleFile(browser);
  await scenarioP0PreservationBlocksSingle(browser);
  await scenarioP0UnknownHeaderFailsClosed(browser);
  await scenarioP0PreservationBlocksWholeBatch(browser);
  await scenarioP0BatchStartPlanInvalidation(browser);
  await scenarioP0BatchStartCancellation(browser);
  await scenarioP0TrackTargetedTagSurvival(browser);
  await scenarioP0AttachmentTargetedTagSurvival(browser);
  await scenarioBatchGroupSubset(browser);
  await scenarioBatchGroupSubsetPreparationFailure(browser);
  console.log('All browser E2E scenarios PASS');
} finally {
  await browser.close();
}
