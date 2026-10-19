import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBrowserWorkload, classifyMuxSourceSize, MUX_SOURCE_WARNING_BYTES, MUX_SOURCE_MEMORY_WARNING, formatBytes, sumFileSizes } from '../src/workload.js';

test('formats binary file sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KiB');
  assert.equal(formatBytes(1024 ** 2 * 12.5), '12.5 MiB');
  assert.equal(formatBytes(1024 ** 3 * 9), '9.00 GiB');
});

test('sums selected input sizes', () => {
  assert.equal(sumFileSizes([{ size: 10 }, { size: 20 }, { size: 0 }]), 30);
});

test('classifies large browser workloads without claiming a hard limit', () => {
  assert.equal(classifyBrowserWorkload(512 * 1024 ** 2).level, 'normal');
  assert.equal(classifyBrowserWorkload(2 * 1024 ** 3).level, 'medium');
  assert.equal(classifyBrowserWorkload(8 * 1024 ** 3).level, 'high');
});

test('Softmux 1.0: decimal 1 GB triggers only an advisory, never an artificial admission block', () => {
  assert.equal(MUX_SOURCE_WARNING_BYTES, 1_000_000_000);
  assert.match(MUX_SOURCE_MEMORY_WARNING, /允许继续尝试封装/);
  for (const n of [0, 256 * 1024 ** 2, 999_999_999, 1_000_000_000]) {
    assert.deepEqual(classifyMuxSourceSize({ size: n }), {
      warning: false, canAttempt: true, blockedReason: null,
    });
  }
  for (const n of [1_000_000_001, 1_200_000_000, 1_500_000_000]) {
    assert.deepEqual(classifyMuxSourceSize({ size: n }), {
      warning: true, canAttempt: true, blockedReason: null,
    });
  }
  // The limit belongs to the *confirmed* runtime configuration, not the
  // warning threshold or a vague upstream approximate "2 GB" claim.
  assert.deepEqual(
    classifyMuxSourceSize({ size: 2_000_000_001 }, { confirmedInputMaxBytes: 2_000_000_000 }),
    { warning: true, canAttempt: false, blockedReason: 'ENGINE_INPUT_LIMIT' },
  );
  assert.equal(classifyMuxSourceSize({ size: 2_000_000_001 }).canAttempt, true,
    'unconfirmed engine limit must not silently become a hard gate');
  assert.equal(classifyMuxSourceSize(null).blockedReason, 'SOURCE_SIZE_UNKNOWN');
  assert.equal(classifyMuxSourceSize({ size: NaN }).canAttempt, false);
});

test('Softmux 1.0: batch advisory is per media source, never aggregate size', () => {
  const files = [{ size: 700_000_000 }, { size: 700_000_000 }];
  assert.equal(sumFileSizes(files), 1_400_000_000);
  assert.deepEqual(files.map(file => classifyMuxSourceSize(file).warning), [false, false]);
  assert.equal(classifyMuxSourceSize({ size: 1_100_000_000 }).warning, true);
});
