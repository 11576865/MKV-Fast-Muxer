import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMuxCommand } from '../src/mux-command.js';
import {
  captureSubtitleExecutionWitness,
  validateSubtitleExecutionWitness,
  verifyStagedSubtitleCommandParity,
} from '../src/subtitle-execution-gate.js';

const file = (name, size = 256, lastModified = 12) =>
  ({ name, size, lastModified });
const source = file('show.mkv', 999);
const ass = file('signs.ass');
const vtt = file('subs.vtt', 333);
const opts = () => ({
  source,
  appendMode: true,
  tracks: [
    { file: ass, title: 'Signs', language: 'jpn', default: true, forced: false,
      format: { id: 'ass', inputExtension: '.ass', ffmpegOutputCodec: null } },
    { file: vtt, title: 'English', language: 'eng', forced: true, default: false,
      format: { id: 'webvtt', inputExtension: '.vtt', ffmpegOutputCodec: 'srt' } },
  ],
});
const valid = value => assert.deepEqual(value, { ok: true });
const rejected = (value, reason) => {
  assert.equal(value.ok, false);
  assert.equal(value.reason, reason);
};

test('witness is current for source and subtitle objects with the same edits', () => {
  const current = opts();
  const witness = captureSubtitleExecutionWitness(current);
  valid(validateSubtitleExecutionWitness(witness, current));
  assert.equal(Object.isFrozen(witness), true);
  assert.equal(Object.isFrozen(witness.trackRefs), true);
  assert.equal(Object.isFrozen(current.tracks[0]), false, 'legacy editable state stays writable');
});

test('same metadata but replacement File references and source switches invalidate execution witness', () => {
  const current = opts();
  const witness = captureSubtitleExecutionWitness(current);
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current, source: file('show.mkv', 999),
  }), 'source-changed');
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current, tracks: [{ ...current.tracks[0], file: file('signs.ass') }, current.tracks[1]],
  }), 'subtitle-input-changed');
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current, tracks: [current.tracks[0]],
  }), 'subtitle-count-changed');
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current, appendMode: false,
  }), 'source-mode-changed');
});

test('format, sidecar and staged text/flags changes invalidate before exec', () => {
  const current = opts();
  const witness = captureSubtitleExecutionWitness(current);
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current,
    tracks: [{ ...current.tracks[0], format: { id: 'srt' } }, current.tracks[1]],
  }), 'subtitle-input-changed');
  rejected(validateSubtitleExecutionWitness(witness, {
    ...current,
    tracks: [{ ...current.tracks[0], sidecarFile: file('sidecar.sub') }, current.tracks[1]],
  }), 'subtitle-input-changed');
  for (const [key, value] of [
    ['title', 'Changed'], ['language', 'zho'], ['default', false],
    ['forced', true], ['original', true], ['commentary', true],
    ['hearingImpaired', true],
  ]) {
    rejected(validateSubtitleExecutionWitness(witness, {
      ...current, tracks: [{ ...current.tracks[0], [key]: value }, current.tracks[1]],
    }), 'subtitle-edit-changed');
  }
});

test('runtime shadow mapper accepts exact existing command for append and selective mode', () => {
  for (const appendMode of [true, false]) {
    const prepared = [
      { ...opts().tracks[0], path: 'stage-0.ass', inputIndex: 1, codecOverride: null },
      { ...opts().tracks[1], path: 'stage-1.vtt', inputIndex: 2, codecOverride: 'srt' },
    ];
    const commandOptions = {
      mainInputPath: 'source.mkv', outputPath: 'out.mkv',
      preserveAllSourceStreams: appendMode,
      sourceSubtitleCount: 2,
      preserveAllOriginalSubtitles: appendMode,
      newSubtitleTracks: prepared,
    };
    const expectedArgs = buildMuxCommand(commandOptions);
    const report = verifyStagedSubtitleCommandParity({
      source, runtimeSubtitles: prepared, commandOptions, expectedArgs,
    });
    assert.equal(report.state, 'COMMAND_ARGUMENTS_MATCH');
    assert.equal(report.checkedSubtitles, 2);
  }
});

test('runtime shadow mapper refuses altered command, mismatched staging and unsupported source', () => {
  const prepared = [
    { ...opts().tracks[0], path: 'stage-0.ass', inputIndex: 1, codecOverride: null },
  ];
  const commandOptions = {
    mainInputPath: 'source.mkv', outputPath: 'out.mkv', newSubtitleTracks: prepared,
  };
  const good = buildMuxCommand(commandOptions);
  assert.throws(() => verifyStagedSubtitleCommandParity({
    source, runtimeSubtitles: prepared, commandOptions,
    expectedArgs: [...good.slice(0, -2), 'malformed', good.at(-1)],
  }), /不一致/);
  assert.throws(() => verifyStagedSubtitleCommandParity({
    source: null, runtimeSubtitles: prepared, commandOptions, expectedArgs: good,
  }), /valid source/);
  assert.throws(() => verifyStagedSubtitleCommandParity({
    source, runtimeSubtitles: [{ ...prepared[0], inputIndex: 0 }],
    commandOptions, expectedArgs: good,
  }), /mismatch/);
});

test('source-only job has no invented subtitles and retains its legacy command', () => {
  const empty = { source, tracks: [], appendMode: true };
  const witness = captureSubtitleExecutionWitness(empty);
  valid(validateSubtitleExecutionWitness(witness, empty));
  const commandOptions = {
    mainInputPath: 'source.mkv', outputPath: 'out.mkv',
    preserveAllSourceStreams: true, newSubtitleTracks: [],
  };
  const args = buildMuxCommand(commandOptions);
  assert.equal(verifyStagedSubtitleCommandParity({
    source, runtimeSubtitles: [], commandOptions, expectedArgs: args,
  }).checkedSubtitles, 0);
});
