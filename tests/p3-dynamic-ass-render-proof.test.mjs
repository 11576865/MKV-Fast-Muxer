import test from 'node:test';
import assert from 'node:assert/strict';
import { P3_DYNAMIC_TIMES, p3DynamicRenderVerdict } from '../scripts/p3-dynamic-ass-render-proof.mjs';
const h = char => char.repeat(64);
const samples = P3_DYNAMIC_TIMES.map((time, i) => ({
  time, sourceSha: h('a' + String(i).repeat(0)).replace(/^a/, String(i+1)),
  recoveredSha: h('a').replace(/^a/, String(i+1)),
  directSha: h('b'), directSsim: 0.998, blankSsim: 0.86,
  fontSelected: true,
}));
const controls = ['move', 'transform', 'karaoke'].map(effect => ({
  effect, sha: h('f'),
}));
const pass = overrides => p3DynamicRenderVerdict({
  samples, controls, fontSha256: h('c'), ...overrides,
});
test('four exact subsecond frames and three individually effective negative controls pass', () => {
  const result = pass();
  assert.equal(result.ok, true, result.code);
  assert.equal(result.timesSeconds.length, 4);
  assert.equal(result.exactSameFilterPixels, true);
  assert.equal(result.realPlayerVerified, false);
  assert.equal(result.universalAssVerified, false);
});
test('wrong frame ordering and repeated images fail closed', () => {
  assert.equal(pass({ samples: samples.slice().reverse() }).code, 'SAMPLE_INVALID');
  assert.equal(pass({ samples: samples.map(x => ({ ...x, sourceSha: h('a'), recoveredSha: h('a') })) }).code, 'SUBSECOND_MOTION_NOT_PROVEN');
  assert.equal(pass({ samples: samples.slice(0, 3) }).code, 'EVIDENCE_INCOMPLETE');
});
test('real output pixel corruption, font fallback and SSIM failures are not accepted', () => {
  const modify = (index, fields) => samples.map((x, i) => i === index ? { ...x, ...fields } : x);
  assert.equal(pass({ samples: modify(1, { recoveredSha: h('d') }) }).code, 'DELIVERED_FRAME_MISMATCH');
  assert.equal(pass({ samples: modify(0, { fontSelected: false }) }).code, 'SAMPLE_INVALID');
  assert.equal(pass({ samples: modify(3, { directSsim: 0.98 }) }).code, 'DIRECT_MKV_VISUAL_MISMATCH');
  assert.equal(pass({ samples: modify(2, { blankSsim: 0.98 }) }).code, 'BLANK_NEGATIVE_CONTROL_FAILED');
  assert.equal(pass({ samples: modify(2, { directSsim: NaN }) }).code, 'DIRECT_MKV_VISUAL_MISMATCH');
});
test('each move / transform / karaoke negative control must actually alter the image', () => {
  for (let i = 0; i < controls.length; i++) {
    const changed = controls.map((x, index) =>
      i === index ? { ...x, sha: samples[1].sourceSha } : x);
    const v = pass({ controls: changed });
    assert.equal(v.code, 'EFFECT_NEGATIVE_CONTROL_FAILED');
    assert.equal(v.effect, controls[i].effect);
  }
});
test('only SHA-256-representable delivered font bytes are accepted', () => {
  assert.equal(pass({ fontSha256: '' }).code, 'EVIDENCE_INCOMPLETE');
});
