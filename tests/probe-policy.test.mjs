import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProbeArgs, PROBE_STREAM_ENTRIES } from '../src/probe-policy.js';

test('default probe skips find_stream_info and limits requested fields', () => {
  const args = buildProbeArgs('input.mkv', 'probe.json');

  assert.ok(args.includes('-no_find_stream_info'));
  assert.deepEqual(args.slice(-4), ['-of', 'json', 'input.mkv', '-o', 'probe.json'].slice(-4));

  const showEntriesIndex = args.indexOf('-show_entries');
  assert.ok(showEntriesIndex >= 0);
  assert.equal(args[showEntriesIndex + 1], PROBE_STREAM_ENTRIES);

  assert.match(PROBE_STREAM_ENTRIES, /codec_type/);
  assert.match(PROBE_STREAM_ENTRIES, /codec_name/);
  assert.match(PROBE_STREAM_ENTRIES, /language/);
  assert.match(PROBE_STREAM_ENTRIES, /title/);
  assert.match(PROBE_STREAM_ENTRIES, /filename/);
  assert.match(PROBE_STREAM_ENTRIES, /default/);
  assert.match(PROBE_STREAM_ENTRIES, /forced/);
  assert.doesNotMatch(PROBE_STREAM_ENTRIES, /pix_fmt|width|height|profile/);
});

test('explicit decode fallback enables normal stream-info probing', () => {
  const args = buildProbeArgs('input.mkv', 'probe.json', { decodeStreams: true });
  assert.equal(args.includes('-no_find_stream_info'), false);
  assert.ok(args.includes('-show_streams'));
});

test('probe input and output paths are preserved verbatim', () => {
  const args = buildProbeArgs('task-1-input.av1.mp4', 'task-1-probe.json');
  assert.ok(args.includes('task-1-input.av1.mp4'));
  assert.equal(args.at(-1), 'task-1-probe.json');
});
