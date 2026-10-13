/**
 * CI-only: real browser MKV -> independent ASS/font extraction -> system
 * libass source/output frame matrix at fractional PTS.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { p3FontSelectionProvesFamily, p3RenderFilterPath, P3_FAMILY } from './p3-final-ass-render-proof.mjs';

export const P3_DYNAMIC_TIMES = Object.freeze(['0.20', '0.65', '1.10', '1.55']);
const MUTATIONS = Object.freeze([
  { id: 'move', from: '\\move(12,15,125,45,0,1800)', to: '\\pos(12,15)' },
  { id: 'transform', from: '\\t(0,1800,\\fs38\\1c&H00FF00&)', to: '' },
  { id: 'karaoke', from: '\\kf50', to: '\\kf1' },
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function run(program, args, label) {
  const p = spawnSync(program, args, {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (p.error || p.status !== 0) throw Error(label + ': ' +
    (p.error?.message || String(p.stderr).slice(-350)));
  return String(p.stderr || '');
}

function renderP3({ input, fontDir = '', output, time, direct = false }) {
  if (!P3_DYNAMIC_TIMES.includes(time)) throw Error('unsupported sample time');
  const filter = 'settb=AVTB,setpts=PTS+' + time + '/TB,' +
    (direct
      ? 'subtitles=filename=' + p3RenderFilterPath(input) + ':si=0'
      : 'ass=filename=' + p3RenderFilterPath(input) +
        ':fontsdir=' + p3RenderFilterPath(fontDir));
  return run('ffmpeg', [
    '-hide_banner', '-loglevel', 'verbose', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=1:d=1',
    '-vf', filter, '-frames:v', '1', '-c:v', 'png', '-f', 'image2',
    p3RenderFilterPath(output),
  ], 'libass P3 render at ' + time);
}
function ssim(a, b) {
  const log = run('ffmpeg', [
    '-hide_banner', '-loglevel', 'info', '-nostdin',
    '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-',
  ], 'SSIM');
  const m = log.match(/All:([0-9]+(?:\.[0-9]+)?)/);
  if (!m) throw Error('SSIM All metric missing');
  return Number(m[1]);
}

export function p3DynamicRenderVerdict({ samples, controls, fontSha256 } = {}) {
  if (!Array.isArray(samples) || samples.length !== 4 ||
      !Array.isArray(controls) || controls.length !== 3 ||
      !/^[a-f0-9]{64}$/.test(String(fontSha256 || ''))) {
    return { ok: false, code: 'EVIDENCE_INCOMPLETE' };
  }
  const distinct = new Set();
  for (let i = 0; i < 4; i++) {
    const x = samples[i];
    if (x?.time !== P3_DYNAMIC_TIMES[i] ||
        !['sourceSha', 'recoveredSha', 'directSha'].every(
          k => /^[a-f0-9]{64}$/.test(String(x?.[k] || ''))) ||
        !x.fontSelected) {
      return { ok: false, code: 'SAMPLE_INVALID', time: P3_DYNAMIC_TIMES[i] };
    }
    if (x.sourceSha !== x.recoveredSha)
      return { ok: false, code: 'DELIVERED_FRAME_MISMATCH', time: x.time };
    distinct.add(x.sourceSha);
    if (!Number.isFinite(x.directSsim) || x.directSsim < 0.995 || x.directSsim > 1)
      return { ok: false, code: 'DIRECT_MKV_VISUAL_MISMATCH', time: x.time };
    if (!Number.isFinite(x.blankSsim) || x.blankSsim >= 0.97 || x.blankSsim < 0)
      return { ok: false, code: 'BLANK_NEGATIVE_CONTROL_FAILED', time: x.time };
  }
  if (distinct.size !== 4) return { ok: false, code: 'SUBSECOND_MOTION_NOT_PROVEN' };
  for (let i = 0; i < 3; i++) {
    if (controls[i]?.effect !== MUTATIONS[i].id ||
        !/^[a-f0-9]{64}$/.test(String(controls[i]?.sha || '')) ||
        controls[i].sha === samples[1].sourceSha) {
      return { ok: false, code: 'EFFECT_NEGATIVE_CONTROL_FAILED', effect: MUTATIONS[i].id };
    }
  }
  return {
    ok: true, code: 'PASS_P3_DYNAMIC_NAMED_FIXTURE',
    samples, controls, fontSha256,
    timesSeconds: [...P3_DYNAMIC_TIMES],
    exactSameFilterPixels: true, directMkvMinSsim: 0.995,
    fontSelectionProven: true, allFramesDistinct: true,
    realPlayerVerified: false, universalAssVerified: false,
    evidence: 'real-browser-mkv-four-fractional-pts-libass-v1',
  };
}

export async function verifyP3DynamicMkv({ finalMkv, sourceAss, sourceFont, outputDir }) {
  const mkvPath = p3RenderFilterPath(path.resolve(finalMkv));
  const assPath = p3RenderFilterPath(path.resolve(sourceAss));
  const fontPath = p3RenderFilterPath(path.resolve(sourceFont));
  const dir = p3RenderFilterPath(path.resolve(outputDir));
  await fs.mkdir(dir, { recursive: true });
  const evidence = path.join(dir, 'p3-dynamic-render-evidence.json');
  try {
    const content = await fs.readFile(assPath, 'utf8');
    assert.ok(content.includes(P3_FAMILY) &&
      MUTATIONS.every(m => content.includes(m.from)), 'test ASS effect fixture invalid');
    const systemFamilies = execFileSync('fc-list', [':', 'family'], {
      encoding: 'utf8', timeout: 10_000,
    });
    assert.ok(!systemFamilies.includes(P3_FAMILY), 'unique font was already installed');

    const mkv = JSON.parse(execFileSync('mkvmerge', ['-J', mkvPath], {
      encoding: 'utf8', timeout: 30_000,
    }));
    const fontTrack = (mkv.attachments || []).find(
      a => a.file_name === path.basename(fontPath));
    assert.ok(fontTrack && Number.isInteger(fontTrack.id), 'final MKV font not found');
    assert.equal((mkv.tracks || []).filter(t => t.type === 'subtitles').length, 1);
    const sourceFontDir = path.join(dir, 'p3-dynamic-source-font');
    const finalFontDir = path.join(dir, 'p3-dynamic-final-font');
    await fs.mkdir(sourceFontDir, { recursive: true });
    await fs.mkdir(finalFontDir, { recursive: true });
    await fs.copyFile(fontPath, path.join(sourceFontDir, path.basename(fontPath)));
    const fontOut = path.join(finalFontDir, path.basename(fontPath));
    execFileSync('mkvextract', ['attachments', mkvPath,
      String(fontTrack.id) + ':' + fontOut], { timeout: 30_000 });
    assert.deepEqual(await fs.readFile(fontOut), await fs.readFile(fontPath),
      'independently extracted font differs');

    const recoveredAss = path.join(dir, 'p3-dynamic-recovered.ass');
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-copyts', '-i', mkvPath,
      '-map', '0:s:0', '-c:s', 'ass', '-f', 'ass', '-y', recoveredAss,
    ], { timeout: 30_000 });
    const blank = path.join(dir, 'p3-dynamic-blank.png');
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=1:d=1',
      '-frames:v', '1', '-c:v', 'png', blank,
    ], 'blank reference');

    const samples = [];
    for (const time of P3_DYNAMIC_TIMES) {
      const prefix = path.join(dir, 'p3-dynamic-' + time.replace('.', '_'));
      const sourcePng = prefix + '-source.png';
      const recoveredPng = prefix + '-recovered.png';
      const directPng = prefix + '-direct.png';
      const sourceLog = renderP3({
        input: assPath, fontDir: sourceFontDir, output: sourcePng, time,
      });
      const recoveredLog = renderP3({
        input: recoveredAss, fontDir: finalFontDir, output: recoveredPng, time,
      });
      const directLog = renderP3({
        input: mkvPath, output: directPng, time, direct: true,
      });
      samples.push({
        time,
        sourceSha: sha(await fs.readFile(sourcePng)),
        recoveredSha: sha(await fs.readFile(recoveredPng)),
        directSha: sha(await fs.readFile(directPng)),
        directSsim: ssim(sourcePng, directPng),
        blankSsim: ssim(sourcePng, blank),
        fontSelected: [sourceLog, recoveredLog, directLog].every(
          log => p3FontSelectionProvesFamily(log)),
      });
    }
    const controls = [];
    for (const mutation of MUTATIONS) {
      const modifiedAss = path.join(dir, 'p3-dynamic-control-' + mutation.id + '.ass');
      const png = path.join(dir, 'p3-dynamic-control-' + mutation.id + '.png');
      await fs.writeFile(modifiedAss, content.replace(mutation.from, mutation.to));
      renderP3({
        input: modifiedAss, fontDir: sourceFontDir, output: png, time: '0.65',
      });
      controls.push({ effect: mutation.id, sha: sha(await fs.readFile(png)) });
    }
    const verdict = p3DynamicRenderVerdict({
      samples, controls, fontSha256: sha(await fs.readFile(fontOut)),
    });
    await fs.writeFile(evidence, JSON.stringify(verdict, null, 2) + '\n');
    assert.equal(verdict.ok, true, verdict.code);
    return verdict;
  } catch (error) {
    await fs.writeFile(evidence, JSON.stringify({
      ok: false, code: 'DYNAMIC_VERIFICATION_FAILED',
      detail: String(error?.message || error).slice(0, 500),
      scope: 'one-controlled-case-not-general-player-proof',
    }, null, 2) + '\n');
    throw error;
  }
}
