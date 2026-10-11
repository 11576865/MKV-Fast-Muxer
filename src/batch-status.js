/**
 * Summarize a batch without conflating a fatal setup/execution error with
 * per-job failures or a user-requested cancellation.
 */
export function formatBatchTerminalStatus({
  results = [],
  cancelled = false,
  fatalError = '',
} = {}) {
  const done = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;
  const unsaved = results.filter((item) => item.ok && item.directorySaveError).length;
  const saveWarning = unsaved ? `其中 ${unsaved} 项未完整写入目录，可通过下载链接另存。` : '';

  if (fatalError) {
    return `批量中断：${fatalError}。已完成 ${done}，单项失败 ${failed}。${saveWarning}`;
  }
  return cancelled
    ? `批量已取消：完成 ${done}，失败 ${failed}。${saveWarning}`
    : `批量完成：成功 ${done}，失败 ${failed}。${saveWarning}`;
}
