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


test('generated outputs with unverified audits are counted without erasing mux completion or download fallback', () => {
  const message = formatBatchTerminalStatus({
    results: [
      { ok: true, auditStatus: 'pass' },
      { ok: true, auditStatus: 'warning', directorySaveError: 'permission denied' },
      { ok: true, auditStatus: 'unavailable' },
      { ok: false, error: 'bad source' },
    ],
  });
  assert.match(message, /批量完成：成功 3，失败 1/);
  assert.match(message, /其中 1 项未完整写入目录/);
  assert.match(message, /其中 2 项独立审计存在差异或不可用，需复核成品/);
});


test('partial persistence is not counted as a fully saved MKV+report pair', () => {
  const result = formatBatchTerminalStatus({
    results: [
      { ok: true, auditStatus: 'pass', savedToDirectory: false,
        mkvSavedToDirectory: true, reportSavedToDirectory: false,
        directorySaveError: 'report quota reached' },
      { ok: true, auditStatus: 'pass', savedToDirectory: true,
        mkvSavedToDirectory: true, reportSavedToDirectory: true },
    ],
  });
  assert.match(result, /批量完成：成功 2，失败 0/);
  assert.match(result, /其中 1 项未完整写入目录/);
  assert.match(result, /其中 1 项 MKV 已写入目录，但审计报告尚未写入/);
});

test('successful subset retry cannot erase cancellation or fatal interruption of other tasks', async () => {
  const api = await import('../src/batch-status.js');
  assert.equal(typeof api.combineBatchRetryTerminal, 'function');
  const current = {cancelled:false, fatalError:''};
  const fatal = api.combineBatchRetryTerminal({cancelled:false,fatalError:'job2 setup failed'},current);
  assert.match(formatBatchTerminalStatus({...fatal,results:[{ok:true}]}),/^批量中断：job2 setup failed/);
  const cancelled = api.combineBatchRetryTerminal({cancelled:true,fatalError:''},current);
  assert.match(formatBatchTerminalStatus({...cancelled,results:[{ok:true}]}),/^批量已取消/);
  assert.deepEqual(api.combineBatchRetryTerminal(current,{cancelled:true,fatalError:'retry setup failed'}),
    {cancelled:true,fatalError:'retry setup failed'});
});
