function errorText(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error);
}

function recentLog(logText, limit = 6000) {
  const text = String(logText || '');
  return text.length > limit ? text.slice(-limit) : text;
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function describeOperationError(error, { phase = 'mux', logText = '' } = {}) {
  const raw = errorText(error).trim();
  const evidence = `${raw}\n${recentLog(logText)}`;
  const lower = evidence.toLowerCase();

  const result = (category, cause, action, canSave = false) => ({
    category,
    cause,
    action,
    canSave,
    raw,
  });

  if (/外部音频.*没有可用音频轨/.test(raw)) {
    return result(
      'external-audio-no-stream',
      raw,
      '请换用确实包含音频流的文件，或移除这条外部音频后重试。'
    );
  }

  if (/字幕.*不是 \.ass 文件/.test(raw) || /字体.*不是 \.ttf \/ \.otf \/ \.ttc \/ \.otc 文件/.test(raw)) {
    return result(
      'invalid-file-type',
      raw,
      '请重新选择支持的文件类型后再执行。'
    );
  }

  if (includesAny(lower, [
    /out of memory/,
    /memory access out of bounds/,
    /cannot enlarge memory/,
    /allocation failed/,
    /abort\(oom\)/,
    /wasm[^\n]*memory/,
  ])) {
    return result(
      'memory',
      '浏览器 / WebAssembly 可用内存不足，当前任务没有完成。',
      '请关闭其他高内存页面后重试，或改用更小的输入文件；超大媒体不是本工具的主要承诺场景。'
    );
  }

  if (includesAny(lower, [
    /no space left on device/,
    /enospc/,
    /quota exceeded/,
    /storage quota/,
    /not enough space/,
  ])) {
    return result(
      'storage',
      '浏览器临时存储空间不足，当前任务没有完成。',
      '请释放设备存储空间、关闭其他占用较大的页面，再重新执行封装。'
    );
  }

  if (includesAny(lower, [
    /failed to fetch/,
    /networkerror/,
    /load failed/,
    /wasm[^\n]*(fetch|load)/,
    /worker[^\n]*(fetch|load)/,
  ])) {
    return result(
      'runtime-load',
      'ffmpeg.wasm 运行核心没有正常加载。',
      '请检查网络与浏览器拦截设置后刷新页面重试；输入媒体仍只在本地处理。'
    );
  }

  if (includesAny(lower, [
    /invalid data found when processing input/,
    /moov atom not found/,
    /ebml header parsing failed/,
    /error reading header/,
    /could not find codec parameters/,
    /invalid[^\n]{0,40}input/,
    /end of file/,
  ])) {
    return result(
      'invalid-media',
      phase === 'scan'
        ? '无法可靠读取这个 MKV 的容器结构。'
        : '至少一个输入媒体无法被 FFmpeg 正常解析，封装没有完成。',
      '请确认文件没有损坏或截断；必要时先用桌面 ffprobe / MediaInfo 检查源文件。'
    );
  }

  if (includesAny(lower, [
    /could not write header/,
    /codec[^\n]{0,60}not supported/,
    /not supported[^\n]{0,60}container/,
    /could not find tag for codec/,
    /tag [^\n]{0,80}incompatible/,
    /codec not currently supported in container/,
  ])) {
    return result(
      'container-incompatible',
      '至少一条输入轨道无法以 Stream Copy 方式写入 Matroska，封装没有完成。',
      '请检查运行日志中的 codec；本工具不会自动转码不兼容的轨道。'
    );
  }

  if (/ffprobe/i.test(raw) || /ffprobe/i.test(evidence)) {
    return result(
      'probe',
      phase === 'scan'
        ? '轨道扫描失败：无法取得可靠的媒体结构信息。'
        : '媒体结构探测失败，当前任务没有完成。',
      '请检查源文件是否完整，并查看“运行日志”中的 ffprobe 细节后重试。'
    );
  }

  if (/ffmpeg.*错误代码/i.test(raw) || /ffmpeg.*return/i.test(lower)) {
    return result(
      'ffmpeg',
      'FFmpeg 没有完成此次封装，因此没有生成可保存的成品。',
      '请展开“运行日志”查看最后的 FFmpeg 错误；常见原因是输入损坏或轨道 codec 无法直接封入 MKV。'
    );
  }

  if (phase === 'scan') {
    return result(
      'scan-unknown',
      '轨道扫描失败。',
      raw
        ? `请查看运行日志并重试。底层信息：${raw}`
        : '请查看运行日志并重试。'
    );
  }

  if (phase === 'audit') {
    return result(
      'audit-unknown',
      '封装已完成，但无法完成结构审计。',
      'MKV 成品仍可保存；请在需要时用桌面 ffprobe / MediaInfo 复核。',
      true
    );
  }

  return result(
    'mux-unknown',
    '封装没有完成，因此没有生成可保存的成品。',
    raw
      ? `请查看运行日志后重试。底层信息：${raw}`
      : '请查看运行日志后重试。'
  );
}

export function formatOperationError(error, options = {}) {
  const feedback = describeOperationError(error, options);
  return `${feedback.cause} ${feedback.action}`.trim();
}
