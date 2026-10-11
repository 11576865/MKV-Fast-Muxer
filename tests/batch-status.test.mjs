import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBatchTerminalStatus } from '../src/batch-status.js';

test('fatal Group subset preparation failure is reported, never successful empty completion', () => {
  const message = formatBatchTerminalStatus({
    results: [],
    fatalError: 'simulated subtitle read failure',
  });
  assert.match(message, /^批量中断：simulated subtitle read failure/);
  assert.match(message, /已完成 0，单项失败 0/);
  assert.doesNotMatch(message, /批量完成/);
});

test('fatal setup failure preserves counts and download fallback warning for finished jobs', () => {
  const message = formatBatchTerminalStatus({
    results: [
      { ok: true, directorySaveError: 'disk full' },
      { ok: false, error: 'invalid input' },
    ],
    fatalError: 'next job setup failed',
  });
  assert.match(message, /批量中断：next job setup failed/);
  assert.match(message, /已完成 1，单项失败 1/);
  assert.match(message, /其中 1 项未完整写入目录，可通过下载链接另存/);
});

test('successful completion retains existing normal wording', () => {
  assert.equal(formatBatchTerminalStatus({
    results: [{ ok: true }, { ok: true }],
  }), '批量完成：成功 2，失败 0。');
});

test('user cancellation has a distinct status and preserves completed results', () => {
  assert.equal(formatBatchTerminalStatus({
    cancelled: true,
    results: [{ ok: true }, { ok: false }],
  }), '批量已取消：完成 1，失败 1。');
});

test('fatal error outranks an in-flight cancellation flag', () => {
  assert.match(formatBatchTerminalStatus({
    cancelled: true,
    fatalError: 'setup crashed',
  }), /^批量中断：setup crashed/);
});
