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
  return new RegExp('fontselect:\\s*\\(' + key +
    ',[^\\n)]*\\)\\s*->\\s*' + key + '(?:,|\\s|$)', 'i').test(String(log));
}

export function p3RenderProofVerdict({
  sourcePng, finishedPng, alteredPng, blankPng, sourceLog, finalLog,
  family = P3_FAMILY,
} = {}) {
  const bytes = x => Buffer.isBuffer(x) && x.length > 128;
  if (![sourcePng, finishedPng, alteredPng, blankPng].every(bytes)) {
    return { ok: false, code: 'RENDER_FILE_UNAVAILABLE' };
  }
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  const a = hash(sourcePng), b = hash(finishedPng);
  const tampered = hash(alteredPng), blank = hash(blankPng);
  if (!p3FontSelectionProvesFamily(sourceLog, family) ||
      !p3FontSelectionProvesFamily(finalLog, family)) {
    return { ok: false, code: 'EMBEDDED_FONT_SELECTION_NOT_PROVEN' };
  }
  if (b === blank || a === blank) {
    return { ok: false, code: 'SUBTITLE_NOT_VISIBLE' };
  }
  if (b === tampered) {
    return { ok: false, code: 'TAMPER_NEGATIVE_CONTROL_FAILED' };
  }
  if (a !== b) {
    return { ok: false, code: 'SOURCE_AND_FINAL_RENDER_PIXELS_DIFFER' };
  }
  return {
    ok: true, code: 'PASS_P3_NAMED_FIXTURE',
    renderedPixelImageSha256: b,
    sourceReferenceSha256: a,
    negativeControlSha256: tampered,
    noSubtitleSha256: blank,
    familySelected: family,
    mode: 'system-ffmpeg-libass-final-mkv-versus-source-reference',
    testedFrameTimeSeconds: 1,
    outputDimensions: [320, 180],
    sampleCount: 1,
    rendererEquivalenceClaim: false,
    arbitraryPlayerClaim: false,
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

  const paths = Object.fromEntries(['source', 'final', 'altered', 'blank']
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
    const extractedFont = path.join(dir, 'p3-final-extracted-font.ttf');
    execFileSync('mkvextract', ['attachments', output,
      String(attachment.id) + ':' + extractedFont], { timeout: 30_000 });
    assert.deepEqual(await fs.readFile(extractedFont), await fs.readFile(font),
      'independently extracted delivered font bytes must match the original');
    assert.equal((mkvInfo.tracks || []).filter(item => item.type === 'subtitles').length, 1,
      'fixture must have exactly one ASS subtitle stream for si=0');

    const changedAss = path.join(dir, 'p3-deliberately-mutated.ass');
    await fs.writeFile(changedAss,
      sourceContents.replace(P3_DIALOGUE, 'Deliberately altered render proof'));
    const fontDir = p3RenderFilterPath(path.dirname(font));
    const sourceLog = renderPng({
      filter: 'ass=filename=' + staged + ':fontsdir=' + fontDir,
      destination: paths.source,
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
      finishedPng: await fs.readFile(paths.final),
      alteredPng: await fs.readFile(paths.altered),
      blankPng: await fs.readFile(paths.blank),
      sourceLog, finalLog,
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
