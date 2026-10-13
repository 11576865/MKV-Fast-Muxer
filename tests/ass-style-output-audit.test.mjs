import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASS_STYLE_FIELDS, parseAssV4PlusStyles, compareAssV4PlusStyles, auditProducedAssStyles,
} from '../src/ass-style-output-audit.js';

const format = ASS_STYLE_FIELDS.map(x => ({
  name: 'Name', fontname: 'Fontname', fontsize: 'Fontsize',
  primarycolour: 'PrimaryColour', secondarycolour: 'SecondaryColour',
  outlinecolour: 'OutlineColour', backcolour: 'BackColour',
  scalex: 'ScaleX', scaley: 'ScaleY', borderstyle: 'BorderStyle',
  marginl: 'MarginL', marginr: 'MarginR', marginv: 'MarginV',
}[x] || x[0].toUpperCase() + x.slice(1))).join(', ');
const first = [
  'Default', 'DejaVu Sans', '24', '&H00FFFFFF', '&H000000FF', '&H00000000',
  '&H00000000', '0', '0', '0', '0', '100', '100', '0', '0', '1', '1', '0', '2', '10', '10', '10', '1',
];
const second = [
  'Caption', 'Other Font', '21.5', '&H0000FFFF', '&H000000FF', '&H00001111',
  '&H60000000', '-1', '-1', '0', '0', '120', '95', '1.5', '1', '1', '2', '3', '8', '20', '30', '40', '1',
];
const source = [
  '[Script Info]', 'ScriptType: v4.00+', '[V4+ Styles]',
  'Format: ' + format,
  'Style: ' + first.join(','),
  'Style: ' + second.join(','),
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Hello',
].join('\n');

const probe = { streams: [
  { codec_type: 'video', codec_name: 'h264' },
  { codec_type: 'subtitle', codec_name: 'ass' },
  { codec_type: 'subtitle', codec_name: 'ass' },
] };
const claims = [{ name: 'fixture.ass', formatId: 'ass', ordinal: 1, outputText: source }];
const run = (args = {}) => auditProducedAssStyles({
  claims, outputProbe: probe, outputBytes: 123456,
  readFinalAss: async () => source, ...args,
});

test('canonicalizes known V4+ fields without broadening into Script Info, unknown columns or real rendering', () => {
  const styles = parseAssV4PlusStyles(source);
  assert.equal(styles.length, 2);
  assert.equal(styles[0].fontname, 'DejaVu Sans');
  assert.equal(styles[1].bold, '-1');
  assert.equal(styles[1].fontsize, '21.5');
  assert.equal(styles[1].backcolour, '&H60000000');
  assert.deepEqual(parseAssV4PlusStyles(source.replace(/\n/g, '\r\n')), styles);
  assert.equal(compareAssV4PlusStyles(source, source).ok, true);
});

test('reordered complete format, equivalent decimal forms and color case do not create false corruption', () => {
  const swapped = ASS_STYLE_FIELDS.map((field, i) => i === 0 ? 1 : i === 1 ? 0 : i);
  const variant = source
    .replace('Format: ' + format, 'Format: ' + swapped.map(i => format.split(', ')[i]).join(', '))
    .replace('Style: ' + first.join(','), 'Style: ' + swapped.map(i => first[i]).join(','))
    .replace('Style: ' + second.join(','), 'Style: ' + swapped.map(i => second[i]).join(','))
    .replace('21.5', '21.50').replace('&H60000000', '&h60000000');
  assert.equal(compareAssV4PlusStyles(source, variant).ok, true);
});

test('missing, changed, reordered and duplicate styles never pass', () => {
  for (const changed of [
    source.replace('Other Font', 'Wrong Font'),
    source.replace('21.5', '22'),
    source.replace('&H60000000', '&H50000000'),
    source.replace('Style: ' + second.join(','), ''),
    source.replace('Style: ' + first.join(','), 'Style: ' + second.join(',')),
  ]) {
    const result = compareAssV4PlusStyles(source, changed);
    assert.equal(result.ok, false);
  }
  assert.throws(() => parseAssV4PlusStyles(source + '\n[V4+ Styles]\nStyle: ' + first.join(',')), /重复名称/);
});

test('unknown columns, ambiguous color and exhausted parsing budgets are unavailable', () => {
  assert.throws(() => parseAssV4PlusStyles(source.replace('Format: ' + format, 'Format: ' + format + ', Experimental')), /Format/);
  assert.throws(() => parseAssV4PlusStyles(source.replace('&H60000000', 'not-a-color')), /颜色/);
  assert.throws(() => parseAssV4PlusStyles(source, { maxStyles: 1 }), /预算/);
  assert.throws(() => parseAssV4PlusStyles(source, { maxChars: 20 }), /预算/);
  assert.throws(() => parseAssV4PlusStyles(source.replace('Style: ', 'NoStyle: ').replace('Style: ', 'NoStyle: ')), /不可用/);
});

test('real finished ASS style audit verifies correct output ordinal and records total rows', async () => {
  const result = await run();
  assert.equal(result.status, 'pass');
  assert.equal(result.verified, 1);
  assert.equal(result.total, 1);
  assert.equal(result.styleRecords, 2);
  assert.equal(result.eventsVerified, false);
  assert.equal(result.fontRenderingVerified, false);
  assert.equal(result.playerVerified, false);
});

test('true Style property difference is warning; unsupported schema is unavailable', async () => {
  const changed = await run({ readFinalAss: async () => source.replace('Other Font', 'Wrong Font') });
  assert.equal(changed.status, 'warning');
  assert.equal(changed.verified, 0);
  assert.match(changed.issues[0], /fontname/);
  assert.doesNotMatch(changed.issues[0], /Wrong Font|Other Font/);
  assert.equal((await run({ readFinalAss: async () => '[Events]\nDialogue: malformed' })).status, 'unavailable');
  assert.equal((await run({ readFinalAss: async () => { throw Error('demux failed'); } })).status, 'unavailable');
});

test('stale mapping, wrong codec, oversized file and irrelevant subtitle types never appear verified', async () => {
  assert.equal((await run({ claims: [{ ...claims[0], ordinal: -1 }] })).status, 'unavailable');
  assert.equal((await run({ claims: [claims[0], claims[0]] })).status, 'unavailable');
  assert.equal((await run({ outputProbe: { streams: [] } })).status, 'warning');
  assert.equal((await run({ outputBytes: 513 * 1024 * 1024 })).status, 'unavailable');
  assert.equal((await run({ claims: [{ ...claims[0], formatId: 'ssa' }] })).status, 'not-requested');
});

test('scope is bound once to shared single/batch actual mux and evidence inspector', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/container-workbench-evidence.js', import.meta.url), 'utf8');
  assert.match(main, /auditProducedAssStyles\(\{/);
  assert.match(main, /finalAudit\.assStyleAudit = assStyleAudit/);
  assert.match(main, /const recoveredAssCache = new Map\(\)/);
  assert.match(model, /assStyle: report\.audit\?\.assStyleAudit/);
});
