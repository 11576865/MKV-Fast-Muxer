import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBatchTerminalStatus } from '../src/batch-status.js';

test('fatal Group subset preparation failure is reported, never successful empty completion', () => {
  const message = formatBatchTerminalStatus({
    results: [],
    fatalError: 'simulated subtitle read failure',
  });
  assert.match(message, /^批量中断：simulated subtitle read failure/);
  assert.match(message, /已生成 0，审计通过 0，待复核 0，执行失败 0/);
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
  assert.match(message, /已生成 1，审计通过 0，待复核 1，执行失败 1/);
  assert.match(message, /其中 1 项未完整写入目录，可通过下载链接另存/);
});

test('successful completion retains existing normal wording', () => {
  assert.equal(formatBatchTerminalStatus({
    results: [{ ok: true }, { ok: true }],
  }), '批量完成：已生成 2，审计通过 0，待复核 2，执行失败 0。存在独立审计未通过或未完成的产物，不得视为已核验成品。');
});

test('user cancellation has a distinct status and preserves completed results', () => {
  assert.equal(formatBatchTerminalStatus({
    cancelled: true,
    results: [{ ok: true }, { ok: false }],
  }), '批量已取消：已生成 1，审计通过 0，待复核 1，执行失败 1。存在独立审计未通过或未完成的产物，不得视为已核验成品。');
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
  assert.match(message, /批量完成：已生成 3，审计通过 1，待复核 2，执行失败 1/);
  assert.match(message, /其中 1 项未完整写入目录/);
  assert.match(message, /存在独立审计未通过或未完成的产物/);
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
  assert.match(result, /批量完成：已生成 2，审计通过 2，待复核 0，执行失败 0/);
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

test('S11: generated but unverified and not saved cannot contribute to verified or persisted totals', () => {
  const message = formatBatchTerminalStatus({results: [
    {ok:true,auditStatus:'warning',savedToDirectory:true,destinationName:'output',directorySaveError:''},
    {ok:true,auditStatus:'pass',savedToDirectory:false,destinationName:'output',directorySaveError:'permission denied'},
    {ok:true,auditStatus:'pass',savedToDirectory:true,destinationName:'output',directorySaveError:''},
    {ok:false,error:'invalid subtitle'}
  ]});
  assert.match(message,/已生成 3，审计通过 2，待复核 1，执行失败 1/);
  assert.match(message,/完整写入目录 2\/3 项/);
  assert.match(message,/其中 1 项未完整写入目录/);
  assert.match(message,/不得视为已核验成品/);
  assert.doesNotMatch(message,/成功 3/);
});

test('S11: download-only and missing audit receipts never imply directory persistence', () => {
  const message = formatBatchTerminalStatus({results:[
    {ok:true, auditStatus:'pass', savedToDirectory:false, directorySaveError:'', destinationName:''},
    {ok:true, savedToDirectory:false, directorySaveError:'', destinationName:''},
  ]});
  assert.match(message,/已生成 2，审计通过 1，待复核 1，执行失败 0/);
  assert.doesNotMatch(message,/完整写入目录/);
  assert.doesNotMatch(message,/保存成功/);
});

test('S11: saving MKV alone is not complete pair persistence', () => {
  const message = formatBatchTerminalStatus({results:[
    {ok:true,auditStatus:'pass',mkvSavedToDirectory:true,reportSavedToDirectory:false,
      savedToDirectory:false,destinationName:'output',directorySaveError:'report failed'}
  ]});
  assert.match(message,/完整写入目录 0\/1 项/);
  assert.match(message,/1 项 MKV 已写入目录，但审计报告尚未写入/);
  assert.match(message,/审计通过 1，待复核 0/);
});
