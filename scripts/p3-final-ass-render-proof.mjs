/**
 * Test-only P3 oracle: independently render staged ASS AND delivered MKV
 * with the SYSTEM FFmpeg/libass renderer. Not part of browser product audit.
 * A green result is valid only for the named CI fixture, renderer and frame.
 */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const P3_FAMILY = 'UIGS P3 Embedded Proof';
export const P3_DIALOGUE = 'Embedded final-MKV proof 9417';

export function p3RenderFilterPath(value) {
  // Deliberately conservative CI-only path contract. Refuse unsafe input
  // rather than asking FFmpeg to interpret it as arbitrary filter syntax.
  const normalized = String(value).replace(/\\/g, '/');
  if (!/^\/[a-zA-Z0-9_.\-/]+$/.test(normalized)) {
    throw Error('P3 CI render path contains an unsupported filter character');
  }
  return normalized;
}

export function p3FontSelectionProvesFamily(log, family = P3_FAMILY) {
  if (!/^[A-Za-z0-9 ]+$/.test(family)) return false;
  // Check the SELECTED family after ->, not merely the requested family.
  const key = family.replaceAll(' ', '\\s+');
  // libass may emit the internal PostScript name instead of the human family.
  // Both names are uniquely asserted in the test-only SFNT fixture.
  const postScript = family.replaceAll(' ', '') + '-Regular';
  return new RegExp('fontselect:\\s*\\(' + key +
    ',[^\\n)]*\\)\\s*->\\s*(?:' + key + '|' + postScript +
    ')(?:,|\\s|$)', 'i').test(String(log));
}

export function p3RenderProofVerdict({
  sourcePng, demuxedPng, finishedPng, alteredPng, blankPng,
  sourceLog, demuxedLog, finalLog,
  directSsim, tamperedSsim, blankSsim,
  family = P3_FAMILY,
} = {}) {
  const bytes = x => Buffer.isBuffer(x) && x.length > 128;
  if (![sourcePng, demuxedPng, finishedPng, alteredPng, blankPng].every(bytes)) {
    return { ok: false, code: 'RENDER_FILE_UNAVAILABLE' };
  }
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  const source = hash(sourcePng), recovered = hash(demuxedPng);
  const direct = hash(finishedPng), tampered = hash(alteredPng), blank = hash(blankPng);
  if (![sourceLog, demuxedLog, finalLog].every(
    log => p3FontSelectionProvesFamily(log, family))) {
    return { ok: false, code: 'EMBEDDED_FONT_SELECTION_NOT_PROVEN' };
  }
  if (source === blank || recovered === blank || direct === blank) {
    return { ok: false, code: 'SUBTITLE_NOT_VISIBLE' };
  }
  if (source === tampered || recovered === tampered) {
    return { ok: false, code: 'TAMPER_NEGATIVE_CONTROL_FAILED' };
  }
  // Same ASS filter and image dimensions => exact rendered pixel equality.
  if (source !== recovered) {
    return { ok: false, code: 'SOURCE_AND_DEMUXED_ASS_RENDER_PIXELS_DIFFER' };
  }
  if (![directSsim, tamperedSsim, blankSsim].every(
    x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)) {
    return { ok: false, code: 'RENDER_SSIM_UNAVAILABLE' };
  }
  // Two different FFmpeg subtitle ingestion paths can change a small set of
  // antialiasing edge pixels even with identical text, styles and fonts.
  // Keep exact pixels mandatory for the demuxed ASS path above, and apply
  // an explicit SSIM bound to the direct final-MKV subtitles filter only.
  if (directSsim < 0.995) {
    return { ok: false, code: 'DIRECT_MKV_RENDER_SIMILARITY_TOO_LOW' };
  }
  if (tamperedSsim >= 0.97 || blankSsim >= 0.97) {
    return { ok: false, code: 'NEGATIVE_RENDER_CONTROL_NOT_DISTINCT' };
  }
  return {
    ok: true, code: 'PASS_P3_NAMED_FIXTURE',
    sourceReferenceSha256: source,
    demuxedFinishedAssRenderSha256: recovered,
    directMkvRenderSha256: direct,
    negativeControlSha256: tampered, noSubtitleSha256: blank,
    exactPixelsForDemuxedAss: true,
    directMkvSsimToSource: directSsim,
    tamperedSsimToSource: tamperedSsim,
    blankSsimToSource: blankSsim,
    familySelected: family,
    mode: 'system-ffmpeg-libass-demuxed-exact-plus-direct-mkv-ssim',
    testedFrameTimeSeconds: 1,
    outputDimensions: [320, 180], sampleCount: 1,
    rendererEquivalenceClaim: false, arbitraryPlayerClaim: false,
    fullFontShapingClaim: false,
  };
}

function renderPng({ filter, destination }) {
  const argv = [
    '-hide_banner', '-loglevel', 'verbose', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=10:d=2',
    ...(filter ? ['-vf', filter] : []),
    '-ss', '1', '-frames:v', '1', '-c:v', 'png',
    '-f', 'image2', destination,
  ];
  const run = spawnSync('ffmpeg', argv, {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) {
    throw Error('system FFmpeg/libass rendering failed: ' +
      (run.error?.message || String(run.stderr).slice(-700)));
  }
  return String(run.stderr || '');
}


function renderSsim(first, second) {
  const run = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info', '-nostdin',
    '-i', first, '-i', second, '-lavfi', 'ssim', '-f', 'null', '-',
  ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (run.error || run.status !== 0) {
    throw Error('system FFmpeg SSIM reference comparison unavailable');
  }
  const match = String(run.stderr || '').match(/All:([0-9]+(?:\.[0-9]+)?)/);
  if (!match) throw Error('system FFmpeg did not emit SSIM All metric');
  return Number(match[1]);
}

/** Must be called ONLY after a real-browser MKV has been downloaded. */
export async function verifyFinishedMkvAssRender({
  finalMkv, sourceAss, sourceFont, outputDir,
} = {}) {
  const output = p3RenderFilterPath(path.resolve(finalMkv));
  const staged = p3RenderFilterPath(path.resolve(sourceAss));
  const dir = p3RenderFilterPath(path.resolve(outputDir));
  const font = p3RenderFilterPath(path.resolve(sourceFont));
  assert.equal(path.dirname(font), path.dirname(staged),
    'test fixture font and ASS must share the same isolated reference font folder');
  await fs.mkdir(dir, { recursive: true });

  const paths = Object.fromEntries(['source', 'demuxed', 'final', 'altered', 'blank']
    .map(name => [name, path.join(dir, 'p3-libass-' + name + '.png')]));
  const evidencePath = path.join(dir, 'p3-final-ass-render-evidence.json');
  try {
    const sourceContents = await fs.readFile(staged, 'utf8');
    assert.ok(sourceContents.includes(P3_FAMILY) && sourceContents.includes(P3_DIALOGUE),
      'P3 render oracle needs controlled isolated font and timed dialogue');
    const isolationList = execFileSync('fc-list', [':', 'family'], {
      encoding: 'utf8', timeout: 10_000,
    });
    assert.ok(!isolationList.includes(P3_FAMILY),
      'P3 font family must NOT be globally installed in the runner');
    const mkvInfo = JSON.parse(execFileSync('mkvmerge', ['-J', output], {
      encoding: 'utf8', timeout: 30_000,
    }));
    const attachment = (mkvInfo.attachments || []).find(
      item => item.file_name === path.basename(font));
    assert.ok(attachment && Number.isInteger(attachment.id),
      'finished MKV must carry the named independently extractable font');
    const extractedFontDir = path.join(dir, 'p3-final-fonts-only');
    await fs.mkdir(extractedFontDir, { recursive: true });
    const extractedFont = path.join(extractedFontDir, path.basename(font));
    execFileSync('mkvextract', ['attachments', output,
      String(attachment.id) + ':' + extractedFont], { timeout: 30_000 });
    assert.deepEqual(await fs.readFile(extractedFont), await fs.readFile(font),
      'independently extracted delivered font bytes must match the original');
    assert.equal((mkvInfo.tracks || []).filter(item => item.type === 'subtitles').length, 1,
      'fixture must have exactly one ASS subtitle stream for si=0');

    const changedAss = path.join(dir, 'p3-deliberately-mutated.ass');
    await fs.writeFile(changedAss,
      sourceContents.replace(P3_DIALOGUE, 'Deliberately altered render proof'));
    const referenceFontDir = path.join(dir, 'p3-reference-fonts-only');
    await fs.mkdir(referenceFontDir, { recursive: true });
    await fs.copyFile(font, path.join(referenceFontDir, path.basename(font)));
    const fontDir = p3RenderFilterPath(referenceFontDir);
    const sourceLog = renderPng({
      filter: 'ass=filename=' + staged + ':fontsdir=' + fontDir,
      destination: paths.source,
    });
    // Independently extract actual ASS from the downloaded final container.
    // The source and demuxed ASS are then rendered through the SAME ass filter
    // with separately isolated original/attached font files.
    const demuxedAss = path.join(dir, 'p3-final-demuxed.ass');
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-copyts', '-i', output,
      '-map', '0:s:0', '-c:s', 'ass', '-f', 'ass', '-y', demuxedAss,
    ], { timeout: 30_000 });
    const demuxedLog = renderPng({
      filter: 'ass=filename=' + p3RenderFilterPath(demuxedAss) +
        ':fontsdir=' + p3RenderFilterPath(extractedFontDir),
      destination: paths.demuxed,
    });
    const finalLog = renderPng({
      filter: 'subtitles=filename=' + output + ':si=0',
      destination: paths.final,
    });
    renderPng({
      filter: 'ass=filename=' + p3RenderFilterPath(changedAss) + ':fontsdir=' + fontDir,
      destination: paths.altered,
    });
    renderPng({ filter: '', destination: paths.blank });
    const verdict = p3RenderProofVerdict({
      sourcePng: await fs.readFile(paths.source),
      demuxedPng: await fs.readFile(paths.demuxed),
      finishedPng: await fs.readFile(paths.final),
      alteredPng: await fs.readFile(paths.altered),
      blankPng: await fs.readFile(paths.blank),
      sourceLog, demuxedLog, finalLog,
      directSsim: renderSsim(paths.source, paths.final),
      tamperedSsim: renderSsim(paths.source, paths.altered),
      blankSsim: renderSsim(paths.source, paths.blank),
    });
    assert.equal(verdict.ok, true,
      'P3 final-MKV independent libass pixel/embedded font gate: ' + verdict.code);
    await fs.writeFile(evidencePath, JSON.stringify({
      ...verdict, evidence: 'downloaded-real-browser-mkv',
      independentFontExtractionSha256: createHash('sha256')
        .update(await fs.readFile(extractedFont)).digest('hex'),
      sourceFile: path.basename(sourceAss),
      finalFile: path.basename(finalMkv),
      limits: 'one controlled 320x180 frame and one uniquely named embedded font; same host libass',
    }, null, 2) + '\n');
    return verdict;
  } catch (error) {
    await fs.writeFile(evidencePath, JSON.stringify({
      ok: false, code: 'UNVERIFIED_OR_FAILED',
      reason: String(error?.message || error).slice(0, 800),
      scope: 'p3-real-browser-downloaded-mkv-test-only',
    }, null, 2) + '\n');
    throw error;
  }
}
