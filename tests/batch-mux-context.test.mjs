import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBatchJobs } from '../src/batch.js';
import { freezeBatchJobPlan } from '../src/batch-job-plan.js';
import { createFrozenBatchMuxContext } from '../src/batch-mux-context.js';

const file = name => Object.freeze({ name, size: 70, lastModified: 77 });
function plan({ source = 'Show S01E01.mkv', preserve = true, subset = false, scope = 'job' } = {}) {
  const video = file(source);
  const subtitle = file('Show S01E01.zh.ass');
  const pairing = buildBatchJobs([video], [subtitle]);
  pairing.fonts = [file('Font.ttf')];
  pairing.fontRecognition = { recognized: [{ file: pairing.fonts[0],
    identity: { valid: true, descriptors: [{ family: 'Example Sans' }] } }], ignored: [] };
  pairing.videoRecognition = { recognized: [], ignored: [] };
  pairing.directoryConflicts = [];
  pairing.directoryCheckError = '';
  return freezeBatchJobPlan(pairing, {
    generation: 6, preserveAttachments: preserve,
    subsetEnabled: subset, subsetScope: scope,
  });
}

test('explicit batch context keeps video, subtitle, output and policy in frozen domain objects', () => {
  const p = plan();
  const fonts = p.fonts;
  const identities = p.fontRecognition.recognized;
  const ctx = createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: { container: 'matroska', evidence: 'ebml-doctype' },
    fonts, fontIdentities: identities,
  });
  assert.equal(ctx.source, p.jobs[0].video);
  assert.equal(ctx.jobId, p.jobs[0].jobId);
  assert.equal(ctx.outputName, p.jobs[0].outputName);
  assert.equal(ctx.appendPreserveAll, true);
  assert.equal(ctx.preserveAttachments, true);
  assert.equal(ctx.fontMode, 'preserve');
  assert.equal(ctx.fonts[0], fonts[0]);
  assert.equal(ctx.fontRecognition.recognized[0].identity, identities[0].identity);
  assert.equal(ctx.subtitles[0].file, p.jobs[0].subtitleTracks[0].file);
  assert.equal(ctx.subtitles[0].default, true);
  assert.equal(ctx.subtitles[0].forced, false);
  assert.ok(ctx.subtitles[0].language && ctx.subtitles[0].language !== 'und');
  assert.ok(Object.isFrozen(ctx) && Object.isFrozen(ctx.subtitles));
  assert.equal(ctx.reportPlan.jobId, p.jobs[0].jobId);
  assert.equal(ctx.reportPlan.policy, p.policy);
});

test('group subset files are bound to freshly checked transformed identities with no second job subset', () => {
  const p = plan({ source: 'Show S01E01.mp4', subset: true, scope: 'group' });
  const transformed = file('Group.subset.ttf');
  const ctx = createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: { container: 'iso-bmff' },
    fonts: [transformed],
    fontIdentities: [{ file: transformed, identity: { valid: true, descriptors: [] } }],
  });
  assert.equal(ctx.appendPreserveAll, false);
  assert.equal(ctx.fonts[0], transformed);
  assert.equal(ctx.subsetEnabled, false);
  assert.equal(ctx.fontRecognition.recognized[0].file, transformed);
});

test('job-local subset is retained, source-only webm never gains MKV preserve-all flag', () => {
  const p = plan({ source: 'Show S01E01.webm', subset: true, scope: 'job' });
  const ctx = createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: { container: 'webm' }, fonts: [],
  });
  assert.equal(ctx.subsetEnabled, true);
  assert.equal(ctx.appendPreserveAll, false);
  assert.equal(ctx.fonts.length, 0);
});

test('unreviewed job, unknown container and font identity drift are refused', () => {
  const p = plan();
  const identity = { container: 'matroska' };
  assert.throws(() => createFrozenBatchMuxContext(p, { ...p.jobs[0] }, {
    headerIdentity: identity,
  }), /BATCH_MUX_CONTEXT_NOT_AUTHORIZED/);
  assert.throws(() => createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: { container: 'unknown' },
  }), /BATCH_MUX_CONTEXT_NOT_AUTHORIZED/);
  assert.throws(() => createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: identity, fonts: p.fonts, fontIdentities: [],
  }), /BATCH_MUX_FONT_IDENTITY_MISMATCH/);
  assert.throws(() => createFrozenBatchMuxContext(p, p.jobs[0], {
    headerIdentity: identity, fonts: p.fonts,
    fontIdentities: [{ file: file('Other.ttf'), identity: {} }],
  }), /BATCH_MUX_FONT_IDENTITY_MISMATCH/);
});

test('production mux and batch queue use context, never batch-stage a single-file picker', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const segment = main.slice(main.indexOf("batchStartBtn?.addEventListener('click', async () => {"),
    main.lastIndexOf('resetTrackState();'));
  assert.match(segment, /createFrozenBatchMuxContext\(frozenPlan, job,/);
  assert.match(segment, /executeCurrentMuxTask\(activeBatchMuxContext\)/);
  assert.doesNotMatch(segment, /setInputFiles\((?:videoInput|audioInput|subInput|fontInput),/);
  assert.doesNotMatch(segment, /await (?:videoSniffPromise|subtitleInspectPromise|fontInspectPromise)/);
  assert.match(main, /plan: independent \? explicit\.reportPlan : buildMuxPlan\(\)/);
});
