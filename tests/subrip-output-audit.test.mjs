import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/subrip-output-audit.js').catch(() => ({}));
const srt = '1\n00:00:00,123 --> 00:00:01,456\n第一行\nsecond line\n\n2\n00:00:01,000 --> 00:00:02,789\n重复\n';
const vtt = 'WEBVTT\n\ncue-a\n00:00.123 --> 00:01.456\n第一行\nsecond line\n\n00:01.000 --> 00:02.789\n重复\n';
const options = (source = vtt, recovered = srt) => ({
  claims: [{ name: 'sample.vtt', formatId: 'webvtt', ordinal: 1, outputText: source }],
  outputProbe: { streams: [{ codec_type: 'subtitle', codec_name: 'ass' }, { codec_type: 'subtitle', codec_name: 'subrip' }] },
  outputBytes: 1000, readFinalSrt: async () => recovered,
});

test('plain WebVTT and final SubRip preserve millisecond timing, multiline text and overlap', async () => {
  assert.equal(typeof module.auditProducedSubripCues, 'function', 'finished-output cue audit must exist');
  const result = await module.auditProducedSubripCues(options());
  assert.equal(result.status, 'pass');
  assert.equal(result.verified, 1);
  assert.equal(result.observations[0].cues, 2);
  assert.equal(result.presentationVerified, false);
  assert.equal(result.playerVerified, false);
  assert.ok(!JSON.stringify(result).includes('第一行'));
});

test('one millisecond shift, lost duplicate and changed text cannot pass', async () => {
  for (const changed of [srt.replace(',123', ',124'), srt.replace('重复', '改变'), srt.split('\n\n')[0]]) {
    assert.equal((await module.auditProducedSubripCues(options(vtt, changed))).status, 'warning');
  }
  const duplicated = vtt + '\n00:01.000 --> 00:02.789\n重复\n';
  assert.equal((await module.auditProducedSubripCues(options(duplicated))).status, 'warning');
});

test('WebVTT layout, styles, regions, entities and markup remain explicitly unverified', async () => {
  for (const changed of [vtt.replace(' --> 00:01.456', ' --> 00:01.456 align:start'),
    vtt.replace('第一行', '<b>第一行</b>'), vtt.replace('第一行', '&amp;'),
    vtt.replace('\n\ncue-a', '\n\nSTYLE\n::cue {color:red}\n\ncue-a'),
    vtt.replace('\n\ncue-a', '\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\ncue-a')]) {
    assert.equal((await module.auditProducedSubripCues(options(changed))).status, 'unavailable');
  }
});

test('malformed intervals, corrupt readback, stale track, duplicate ordinals and budgets refuse false green', async () => {
  for (const change of [
    { outputBytes: 0 }, { maxOutputBytes: 10 }, { readFinalSrt: async () => 'garbage' },
    { readFinalSrt: async () => { throw new Error('demux failed'); } },
    { outputProbe: { streams: [{ codec_type: 'subtitle', codec_name: 'ass' }] } },
    { claims: [options().claims[0], options().claims[0]] },
  ]) {
    assert.notEqual((await module.auditProducedSubripCues({ ...options(), ...change })).status, 'pass');
  }
  assert.equal((await module.auditProducedSubripCues(options(vtt.replace('00:01.456', '00:00.100')))).status, 'unavailable');
});

test('SRT is audited too; unrelated subtitle kinds are not claimed', async () => {
  const opts = options(srt);
  opts.claims[0].formatId = 'srt';
  assert.equal((await module.auditProducedSubripCues(opts)).status, 'pass');
  opts.claims[0].formatId = 'ass';
  assert.equal((await module.auditProducedSubripCues(opts)).status, 'not-requested');
});
