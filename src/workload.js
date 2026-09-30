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
