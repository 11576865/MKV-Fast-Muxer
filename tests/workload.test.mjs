import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBrowserWorkload, formatBytes, sumFileSizes } from '../src/workload.js';

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
