import { prepareVerifiedLimitedAppend } from './existing-mkv-limited-append-workflow.js';

/**
 * An explicitly opt-in research-only capability beside the read-only existing
 * attachment inspector. Never mutates the legacy video mux, batch FileInputs,
 * source file, or ordinary MKV output URL registry.
 */
export function setupExistingMkvLimitedAppendUI({
  sourceInput, attachmentInput, filenameInput, mimeInput, review,
  prepareButton, saveButton, status, evidence,
} = {}) {
  if (![sourceInput, attachmentInput, filenameInput, mimeInput, review,
    prepareButton, saveButton, status, evidence].every(Boolean)) return;

  let epoch = 0;
  let prepared = null;
  let downloadUrl = null;
  let busy = false;
  function forget() {
    epoch++;
    prepared = null;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    saveButton.disabled = true;
    evidence.textContent = '';
  }
  function current(source, attachment, token) {
    return token === epoch && sourceInput.files?.[0] === source &&
      attachmentInput.files?.[0] === attachment && review.checked;
  }
  function announce(message, state = 'idle') {
    status.textContent = message;
    status.dataset.state = state;
  }
  function controls() {
    prepareButton.disabled = busy || !review.checked ||
      !sourceInput.files?.[0] || !attachmentInput.files?.[0] ||
      !filenameInput.value.trim() || !mimeInput.value.trim();
  }
  for (const input of [sourceInput, attachmentInput, filenameInput, mimeInput]) {
    input.addEventListener('change', () => {
      forget();
      if (input === attachmentInput) {
        filenameInput.value = attachmentInput.files?.[0]?.name || '';
        mimeInput.value = attachmentInput.files?.[0]?.type || 'application/octet-stream';
      }
      if (input === sourceInput || input === attachmentInput) review.checked = false;
      announce('附件与来源已改变。请确认名称和 MIME，然后明确授权生成独立副本。');
      controls();
    });
    if (input === filenameInput || input === mimeInput) {
      input.addEventListener('input', () => {
        forget();
        announce('元数据已变化，必须重新验证新副本。');
        controls();
      });
    }
  }
  review.addEventListener('change', () => {
    forget();
    controls();
    announce(review.checked ? '已确认风险。可申请生成并检查受限候选副本。'
      : '尚未确认实验性修改范围。');
  });

  prepareButton.addEventListener('click', async () => {
    if (busy || !review.checked || prepareButton.disabled) return;
    const source = sourceInput.files?.[0];
    const attachment = attachmentInput.files?.[0];
    const filename = filenameInput.value.trim();
    const mimeType = mimeInput.value.trim();
    forget();
    const token = epoch;
    busy = true;
    controls();
    announce('正在执行来源资格检查、原始对象字节保护与新附件 FileData SHA-256 回读……', 'checking');
    try {
      const value = await prepareVerifiedLimitedAppend({
        source, attachment, filename, mimeType,
        approveFilenameAdjustments: false,
      });
      if (!current(source, attachment, token) || filenameInput.value.trim() !== filename ||
          mimeInput.value.trim() !== mimeType) return;
      prepared = { value, source, attachment, token, filename, mimeType };
      evidence.textContent = `原始文件 SHA-256：${value.evidence.sourceSha256}；输出 SHA-256：${value.evidence.outputSha256}；新附件 ${value.attachedFilename} FileData SHA-256：${value.evidence.attachmentSha256}。原有非 Void 对象原始字节与偏移保持不变；本地检查不等于此文件已通过外部播放器验证。`;
      saveButton.disabled = false;
      announce('受限副本字节验证通过，可手动下载实验性 MKV。仅支持符合预留 Void 布局的小型 Matroska；不支持一般修改或覆盖原文件。', 'prepared');
    } catch (error) {
      if (!current(source, attachment, token)) return;
      announce('拒绝生成：' + (error?.message || String(error)) +
        '。不尝试不安全降级或 FFmpeg 代替写入。', 'blocked');
    } finally {
      busy = false;
      controls();
    }
  });

  saveButton.addEventListener('click', () => {
    const p = prepared;
    if (!p || !current(p.source, p.attachment, p.token) ||
        p.filename !== filenameInput.value.trim() ||
        p.mimeType !== mimeInput.value.trim() ||
        status.dataset.state !== 'prepared') {
      forget();
      controls();
      announce('来源、确认状态或计划已失效，必须重新验证。', 'blocked');
      return;
    }
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(p.value.output);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = p.value.filename;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
      announce('已请求浏览器下载实验性独立副本。原文件未修改；实际持久保存由浏览器负责。', 'prepared');
    } finally {
      anchor.remove();
    }
  });
  window.addEventListener('pagehide', forget);
  controls();
  announce('仅限源 MKV 小于 60 MiB、没有原附件、具备足量预留 Void 且 UID 关系可核验的特殊布局。');
}
