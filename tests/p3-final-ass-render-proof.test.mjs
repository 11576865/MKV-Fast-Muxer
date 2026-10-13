import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P3_FAMILY, p3FontSelectionProvesFamily, p3RenderFilterPath, p3RenderProofVerdict,
} from '../scripts/p3-final-ass-render-proof.mjs';

const png = text => Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(text.padEnd(500, '.')),
]);
const selected = '[Parsed_ass_0 @ 0x123] fontselect: (UIGS P3 Embedded Proof, 400, 0) -> UIGS P3 Embedded Proof, 0, UIGSP3EmbeddedProof-Regular';
const fallback = '[Parsed_subtitles_0] fontselect: (UIGS P3 Embedded Proof, 400, 0) -> DejaVu Sans, 0, DejaVuSans';
const uniquePostScript = '[Parsed_subtitles_0] fontselect: (UIGS P3 Embedded Proof, 400, 0) -> UIGSP3EmbeddedProof-Regular, 0, UIGSP3EmbeddedProof-Regular';

const evidence = overrides => p3RenderProofVerdict({
  sourcePng: png('right-reference'), demuxedPng: png('right-reference'),
  finishedPng: png('slightly different direct MKV antialiasing'),
  alteredPng: png('tampered'), blankPng: png('empty-background'),
  sourceLog: selected, demuxedLog: selected, finalLog: selected,
  directSsim: 0.99895, tamperedSsim: 0.83612, blankSsim: 0.82479,
  ...overrides,
});

test('positive fixture is only a named libass frame claim, never player equivalence', () => {
  const result = evidence();
  assert.equal(result.ok, true);
  assert.equal(result.code, 'PASS_P3_NAMED_FIXTURE');
  assert.equal(result.sampleCount, 1);
  assert.equal(result.rendererEquivalenceClaim, false);
  assert.equal(result.arbitraryPlayerClaim, false);
  assert.equal(result.fullFontShapingClaim, false);
});

test('fontselect must resolve the unique selected font, not merely request it', () => {
  assert.equal(p3FontSelectionProvesFamily(selected), true);
  assert.equal(p3FontSelectionProvesFamily(uniquePostScript), true);
  assert.equal(evidence({ finalLog: uniquePostScript }).ok, true);
  assert.equal(p3FontSelectionProvesFamily(fallback), false);
  assert.equal(p3FontSelectionProvesFamily('Loading font ' + P3_FAMILY), false);
  assert.equal(p3FontSelectionProvesFamily('fontselect: (other) -> other'), false);
  assert.equal(evidence({ finalLog: fallback }).code, 'EMBEDDED_FONT_SELECTION_NOT_PROVEN');
  assert.equal(evidence({ demuxedLog: fallback }).code, 'EMBEDDED_FONT_SELECTION_NOT_PROVEN');
  assert.equal(evidence({ sourceLog: fallback }).ok, false);
});

test('pixel changes and blank/mutated controls must fail independently', () => {
  assert.equal(evidence({ demuxedPng: png('a DIFFERENT frame') }).code,
    'SOURCE_AND_DEMUXED_ASS_RENDER_PIXELS_DIFFER');
  assert.equal(evidence({ directSsim: 0.98 }).code, 'DIRECT_MKV_RENDER_SIMILARITY_TOO_LOW');
  assert.equal(evidence({ tamperedSsim: 0.98 }).code, 'NEGATIVE_RENDER_CONTROL_NOT_DISTINCT');
  assert.equal(evidence({ directSsim: NaN }).code, 'RENDER_SSIM_UNAVAILABLE');
  assert.equal(evidence({ blankPng: png('right-reference') }).code, 'SUBTITLE_NOT_VISIBLE');
  assert.equal(evidence({ alteredPng: png('right-reference') }).code,
    'TAMPER_NEGATIVE_CONTROL_FAILED');
  assert.equal(evidence({ sourcePng: Buffer.alloc(0) }).code, 'RENDER_FILE_UNAVAILABLE');
});

test('CI-only filter paths reject quotes, spaces, colon, comma and newlines', () => {
  assert.equal(p3RenderFilterPath('/tmp/test/fixture.ass'), '/tmp/test/fixture.ass');
  assert.throws(() => p3RenderFilterPath("/tmp/source':overlay=evil"), /unsupported/);
  assert.throws(() => p3RenderFilterPath('/tmp/spaced file.ass'), /unsupported/);
  assert.throws(() => p3RenderFilterPath('/tmp/a,b.ass'), /unsupported/);
  assert.throws(() => p3RenderFilterPath('/tmp/a\nb.ass'), /unsupported/);
});
