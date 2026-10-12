import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMuxCommand } from '../src/mux-command.js';
import { buildContainerDocument } from '../src/container-document.js';
import { outputCompositionFileKey } from '../src/output-composition.js';
import {
  buildSubtitleEditIntentSnapshot,
  isSubtitleEditIntentSnapshotCurrent,
  bindSubtitleIntentsToLegacyDescriptors,
} from '../src/subtitle-edit-intent.js';

const file = (name, size = 512, lastModified = 123) => ({ name, size, lastModified });
const source = file('episode.mkv', 4096);
const makeInputs = () => ({
  source,
  newSubtitles: [
    { file: file('Signs.ass'), title: '标识', language: 'zh-hans', default: true, forced: false },
    { file: file('English.vtt'), title: 'English', language: 'eng', default: false,
      forced: true, codecOverride: 'srt', hearingImpaired: true },
  ],
});
const bindings = (inputs) => inputs.newSubtitles.map((item, ordinal) => ({
  assetKey: outputCompositionFileKey(item.file),
  path: ordinal === 0 ? 'signs.ass' : 'english.vtt',
  inputIndex: ordinal + 1,
}));

test('snapshot preserves explicit subtitle draft intent and never mutates source state', () => {
  const inputs = makeInputs();
  const before = JSON.stringify(inputs);
  const snapshot = buildSubtitleEditIntentSnapshot(inputs);
  assert.equal(snapshot.intents.length, 2);
  assert.equal(snapshot.intents[0].desired.language, 'zh-Hans');
  assert.equal(snapshot.intents[1].desired.codecOverride, 'srt');
  assert.equal(snapshot.intents[1].desired.forced, true);
  assert.equal(snapshot.state, 'inspectable-not-executable');
  assert.equal(Object.isFrozen(snapshot.intents[0].desired), true);
  assert.equal(JSON.stringify(inputs), before);
});

test('source switch and subtitle title/flag/codec/order changes invalidate draft revision', () => {
  const inputs = makeInputs();
  const snapshot = buildSubtitleEditIntentSnapshot(inputs);
  assert.equal(isSubtitleEditIntentSnapshotCurrent(snapshot, inputs), true);
  assert.equal(isSubtitleEditIntentSnapshotCurrent(snapshot, {
    ...inputs, source: file('other-episode.mkv', 4096),
  }), false);
  for (const key of ['title', 'default', 'forced', 'language', 'codecOverride']) {
    const changed = makeInputs();
    changed.newSubtitles[0][key] = ({
      title: 'Changed', default: false, forced: true,
      language: 'jpn', codecOverride: 'srt',
    })[key];
    assert.equal(isSubtitleEditIntentSnapshotCurrent(snapshot, changed), false, key);
  }
  const reordered = { ...inputs, newSubtitles: [...inputs.newSubtitles].reverse() };
  assert.equal(isSubtitleEditIntentSnapshotCurrent(snapshot, reordered), false);
});

test('dual-path equivalence: both append-all and selective mode emit exactly the same legacy FFmpeg command', () => {
  const inputs = makeInputs();
  const snapshot = buildSubtitleEditIntentSnapshot(inputs);
  const staged = bindings(inputs);
  const viaSnapshot = bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    bindings: staged, expectedRevision: snapshot.revision,
  });
  const oldRows = inputs.newSubtitles.map((row, index) => ({
    ...row, path: staged[index].path, inputIndex: staged[index].inputIndex,
  }));
  for (const preserveAllSourceStreams of [true, false]) {
    const common = {
      mainInputPath: 'episode.mkv', outputPath: 'out.mkv',
      sourceAudioCount: 1, sourceSubtitleCount: 2,
      preserveAllSourceStreams,
      preserveAllOriginalSubtitles: preserveAllSourceStreams,
      preserveAllOriginalAttachments: preserveAllSourceStreams,
    };
    const legacyCommand = buildMuxCommand({ ...common, newSubtitleTracks: oldRows });
    const projectedCommand = buildMuxCommand({ ...common, newSubtitleTracks: viaSnapshot });
    assert.deepEqual(projectedCommand, legacyCommand);
    assert.ok(projectedCommand.includes('-c:s:' +
      (preserveAllSourceStreams ? '3' : '1')));
    assert.ok(projectedCommand.includes('title=标识'));
    assert.ok(projectedCommand.includes('language=zh-Hans'));
    assert.ok(projectedCommand.includes('forced+hearing_impaired'));
  }
});

test('binding refuses stale revision, wrong file identity or wrong FFmpeg staging indices', () => {
  const inputs = makeInputs();
  const snapshot = buildSubtitleEditIntentSnapshot(inputs);
  const valid = bindings(inputs);
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    bindings: valid, expectedRevision: 'stale',
  }), /revision/);
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    bindings: [{ ...valid[0], assetKey: 'wrong' }, valid[1]],
    expectedRevision: snapshot.revision,
  }), /identity/);
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    bindings: [valid[0], { ...valid[1], inputIndex: 1 }],
    expectedRevision: snapshot.revision,
  }), /Repeated/);
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(snapshot, {
    bindings: [valid[0]], expectedRevision: snapshot.revision,
  }), /count/);
});

test('missing source or track file cannot yield descriptors; repeated asset is observable', () => {
  const inputs = makeInputs();
  const withoutSource = buildSubtitleEditIntentSnapshot({
    newSubtitles: inputs.newSubtitles,
  });
  assert.equal(withoutSource.state, 'requires-source');
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(withoutSource, {
    bindings: bindings(inputs), expectedRevision: withoutSource.revision,
  }), /source/);
  const missing = buildSubtitleEditIntentSnapshot({
    source, newSubtitles: [{ title: 'No file' }],
  });
  assert.deepEqual(missing.diagnostics.map(x => x.code), ['MISSING_SUBTITLE_FILE']);
  assert.throws(() => bindSubtitleIntentsToLegacyDescriptors(missing, {
    bindings: [], expectedRevision: missing.revision,
  }), /revision/);
  const duplicate = buildSubtitleEditIntentSnapshot({
    source, newSubtitles: [
      { file: file('repeat.ass'), title: 'First' },
      { file: file('repeat.ass'), title: 'Second' },
    ],
  });
  assert.equal(duplicate.intents.length, 2);
  assert.equal(duplicate.diagnostics[0].code, 'REPEATED_ASSET_IN_DRAFT');
  assert.notEqual(duplicate.intents[0].id, duplicate.intents[1].id);
});

test('ContainerDocument exposes same immutable draft without claiming whole-container preservation', () => {
  const inputs = makeInputs();
  const document = buildContainerDocument({
    video: inputs.source, newSubtitles: inputs.newSubtitles,
  });
  const snapshot = buildSubtitleEditIntentSnapshot(inputs);
  assert.deepEqual(document.subtitleEditIntents, snapshot);
  assert.equal(document.execution.wholeEbmlPreservation, 'unverified');
  assert.equal(Object.isFrozen(document.subtitleEditIntents), true);
});
