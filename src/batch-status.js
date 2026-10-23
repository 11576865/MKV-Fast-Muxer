/**
 * Summarize a batch without conflating a fatal setup/execution error with
 * per-job failures or a user-requested cancellation. Generated output,
 * independent audit and directory persistence are separate evidence states.
 */
export function formatBatchTerminalStatus({
  results = [],
  cancelled = false,
  fatalError = '',
} = {}) {
  // A generated Blob is not automatically audited or durably saved.
  // Missing auditStatus counts as unverified, never as a passing audit.
  const generated = results.filter(item => item.ok === true);
  const verified = generated.filter(item => item.auditStatus === 'pass').length;
  const unverified = generated.length - verified;
  const failed = results.filter(item => item.ok === false).length;
  const attemptedDirectory = generated.filter(item =>
    Boolean(item.destinationName || item.directorySaveError ||
      item.savedToDirectory === true || item.mkvSavedToDirectory === true ||
      item.reportSavedToDirectory === true));
  const savedToDirectory = attemptedDirectory.filter(item => item.savedToDirectory === true).length;
  const unsaved = generated.filter(item => item.directorySaveError).length;
  const reportOnlyFailures = generated.filter(item =>
    item.directorySaveError && item.mkvSavedToDirectory === true &&
    item.reportSavedToDirectory !== true).length;
  const totals = `已生成 ${generated.length}，审计通过 ${verified}，待复核 ${unverified}，执行失败 ${failed}。`;
  const saveStatus = attemptedDirectory.length
    ? `完整写入目录 ${savedToDirectory}/${attemptedDirectory.length} 项。`
    : '';
  const saveWarning = unsaved
    ? `其中 ${unsaved} 项未完整写入目录，可通过下载链接另存。` +
      (reportOnlyFailures
        ? `其中 ${reportOnlyFailures} 项 MKV 已写入目录，但审计报告尚未写入。`
        : '')
    : '';
  const auditWarning = unverified
    ? '存在独立审计未通过或未完成的产物，不得视为已核验成品。'
    : '';
  const prefix = fatalError ? `批量中断：${fatalError}。` :
    cancelled ? '批量已取消：' : '批量完成：';
  return prefix + totals + saveStatus + saveWarning + auditWarning;
}

/** A subset retry cannot resolve cancellation/interruption of unselected jobs. */
export function combineBatchRetryTerminal(previous = {}, current = {}) {
  return Object.freeze({
    cancelled: Boolean(previous.cancelled || current.cancelled),
    fatalError: String(current.fatalError || previous.fatalError || ''),
  });
}
