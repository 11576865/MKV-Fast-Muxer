import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditProducedAssEvents, parseAssDialogueEvents } from '../src/ass-event-output-audit.js';

const sourceAss = [
  '[Script Info]', 'ScriptType: v4.00+', '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize',
  'Style: Default,Arial,48',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello {\\i1}world{\\i0}, again',
  'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,汉字和emoji 😀',
].join('\n');
const probe = {
  streams: [
    { codec_type: 'video', codec_name: 'h264' },
    { codec_type: 'subtitle', codec_name: 'ass' },
    { codec_type: 'subtitle', codec_name: 'ass' },
  ],
};
const claims = [{ name: 'new.ass', formatId: 'ass', ordinal: 1, outputText: sourceAss }];
const run = (overrides = {}) => auditProducedAssEvents({
  claims, outputProbe: probe, outputBytes: 10000,
  readFinalAss: async () => sourceAss, ...overrides,
});

test('ordered Dialogue events preserve commas, ASS override tags and UTF-8 text', () => {
  const parsed = parseAssDialogueEvents(sourceAss);
  assert.equal(parsed.length, 2);
  assert.match(parsed[0], /world/);
  assert.match(parsed[0], /again/);
  assert.match(parsed[1], /汉字和emoji/);
  assert.deepEqual(parseAssDialogueEvents(sourceAss.replace(/\r?\n/g, '\r\n')), parsed);
});

test('final MKV ASS track at offset after preserved source subtitles can pass independently', async () => {
  const result = await run();
  assert.equal(result.status, 'pass');
  assert.equal(result.verified, 1);
  assert.equal(result.total, 1);
  assert.equal(result.observations[0].ordinal, 1);
  assert.equal(result.observations[0].dialogueEvents, 2);
  assert.equal(result.stylesVerified, false);
  assert.equal(result.fontRenderingVerified, false);
  assert.equal(result.playerVerified, false);
});

test('text loss, shifted event times and reordered equal-count events must not pass', async () => {
  for (const extracted of [
    sourceAss.replace('again', 'lost'),
    sourceAss.replace('0:00:03.50', '0:00:03.60'),
    sourceAss.replace('Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,汉字和emoji 😀', ''),
  ]) {
    const result = await run({ readFinalAss: async () => extracted });
    assert.equal(result.status, 'warning', extracted);
    assert.equal(result.verified, 0);
    assert.match(result.issues[0], /Dialogue/);
  }
});

test('noncanonical unknown custom event formats are unavailable, never called correct', async () => {
  const source = sourceAss.replace(', Effect, Text', ', Text, Effect');
  const result = await run({ claims: [{ ...claims[0], outputText: source }] });
  assert.equal(result.status, 'unavailable');
  assert.match(result.issues[0], /Format/);
});

test('missing/wrong codec, duplicated mapping or stale source cannot silently pass', async () => {
  const missing = await run({ outputProbe: { streams: [] } });
  assert.equal(missing.status, 'warning');
  const duplicate = await run({ claims: [claims[0], claims[0]] });
  assert.equal(duplicate.status, 'unavailable');
  const stale = await run({ claims: [{ ...claims[0], outputText: '' }] });
  assert.equal(stale.status, 'unavailable');
});

test('budget, unavailable output probe and failed actual demux have distinct unavailable status', async () => {
  assert.equal((await run({ outputBytes: 600 * 1024 * 1024 })).status, 'unavailable');
  assert.equal((await run({ outputProbe: null })).status, 'unavailable');
  assert.equal((await run({ readFinalAss: async () => { throw Error('demux failed'); } })).status, 'unavailable');
  assert.equal((await run({ readFinalAss: async () => '[Events]\nDialogue: bad' })).status, 'unavailable');
});

test('SSA, SRT, PGS and existing-only subtitles are explicitly outside v1 scope', async () => {
  const result = await run({ claims: [
    { name: 'legacy.ssa', formatId: 'ssa', ordinal: 0, outputText: sourceAss },
    { name: 'text.srt', formatId: 'srt', ordinal: 1, outputText: null },
  ], readFinalAss: async () => { throw Error('must not execute'); } });
  assert.equal(result.status, 'not-requested');
  assert.equal(result.total, 0);
});

test('shared real single/batch mux and output inspector wire exactly one audit owner', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/container-workbench-evidence.js', import.meta.url), 'utf8');
  assert.match(main, /auditProducedAssEvents\(assAuditSource\)/);
  assert.match(main, /finalAudit\.assEventAudit = assEventAudit/);
  assert.match(main, /-map', '0:s:' \+ ordinal/);
  assert.match(main, /'-copyts', '-i', outputPath/);
  assert.match(model, /assEvent: report\.audit\?\.assEventAudit/);
});
