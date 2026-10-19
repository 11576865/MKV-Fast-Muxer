const GIB = 1024 ** 3;

export function sumFileSizes(files) {
  return Array.from(files || []).reduce((sum, file) => sum + Number(file?.size || 0), 0);
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let current = value;
  let unit = -1;
  do {
    current /= 1024;
    unit += 1;
  } while (current >= 1024 && unit < units.length - 1);
  const digits = current >= 100 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[unit]}`;
}

export function classifyBrowserWorkload(totalBytes) {
  const value = Math.max(0, Number(totalBytes || 0));
  if (value >= 8 * GIB) {
    return {
      level: 'high',
      label: '很大',
      message: '输入总量较大。浏览器需要额外的 WASM / 虚拟文件系统空间，可能受内存或地址空间限制。',
    };
  }
  if (value >= 2 * GIB) {
    return {
      level: 'medium',
      label: '较大',
      message: '输入体积已经较大；能否完成取决于浏览器、设备内存和同时载入的文件数量。',
    };
  }
  return {
    level: 'normal',
    label: '普通',
    message: '当前体积未触发大文件提示，但浏览器处理仍受设备内存和 WASM 限制。',
  };
}


/**
 * Advisory threshold, not an engine admission limit. The configured
 * FFmpeg/Wasm runtime may accept larger inputs; runtime memory failures and
 * Matroska preservation blocks remain separate decisions.
 */
export const MUX_SOURCE_WARNING_BYTES = 1_000_000_000;
export const MUX_SOURCE_MEMORY_WARNING =
  '文件超过 1 GB，处理可能消耗较多内存。当前浏览器允许继续尝试封装。';

export function classifyMuxSourceSize(file, { confirmedInputMaxBytes = null } = {}) {
  const size = Number(file?.size);
  if (!file || !Number.isSafeInteger(size) || size < 0) {
    return Object.freeze({
      warning: false, canAttempt: false, blockedReason: 'SOURCE_SIZE_UNKNOWN',
    });
  }
  // No artificial 1 GB input/output ceiling. The engine maximum can only
  // be supplied after it is confirmed for the actually loaded FFmpeg build.
  const knownEngineLimit = Number.isSafeInteger(confirmedInputMaxBytes) &&
    confirmedInputMaxBytes >= 0;
  const engineBlocked = knownEngineLimit && size > confirmedInputMaxBytes;
  return Object.freeze({
    warning: size > MUX_SOURCE_WARNING_BYTES,
    canAttempt: !engineBlocked,
    blockedReason: engineBlocked ? 'ENGINE_INPUT_LIMIT' : null,
  });
}
