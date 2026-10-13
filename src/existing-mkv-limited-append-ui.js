import { prepareVerifiedLimitedAppend, prepareVerifiedLimitedAppendMultiple } from './existing-mkv-limited-append-workflow.js';

/**
 * An explicitly opt-in research-only capability beside the read-only existing
 * attachment inspector. Never mutates the legacy video mux, batch FileInputs,
 * source file, or ordinary MKV output URL registry.
 */
export function setupExistingMkvLimitedAppendUI({
  sourceInput, attachmentInput, filenameInput, mimeInput, review,
  prepareButton, saveButton, status, evidence, inventory,
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
  const selected = () => Array.from(attachmentInput.files || []);
  function current(source, attachments, token) {
    const fresh = selected();
    return token === epoch && sourceInput.files?.[0] === source &&
      fresh.length === attachments.length &&
      attachments.every((file, index) => fresh[index] === file) && review.checked;
  }
  function renderInventory() {
    const attachments = selected();
    if (inventory) inventory.textContent = attachments.length > 1
      ? attachments.map((file, i) =>
          `${i + 1}. ${file.name} · ${file.type || 'application/octet-stream'} · ${file.size} bytes`).join('；')
      : attachments.length === 1 ? '当前选择 1 个附件。可以修改附件名称与 MIME。'
        : '请导入 1–8 个新增附件（总计不超过 4 MiB）。';
  }
  function announce(message, state = 'idle') {
    status.textContent = message;
    status.dataset.state = state;
  }
  function controls() {
    const files = selected();
    const multiple = files.length > 1;
    filenameInput.disabled = multiple;
    mimeInput.disabled = multiple;
    prepareButton.disabled = busy || !review.checked || !sourceInput.files?.[0] ||
      !files.length || files.length > 8 ||
      (!multiple && (!filenameInput.value.trim() || !mimeInput.value.trim()));
  }
  for (const input of [sourceInput, attachmentInput, filenameInput, mimeInput]) {
    input.addEventListener('change', () => {
      forget();
      if (input === attachmentInput) {
        filenameInput.value = selected().length === 1 ? selected()[0].name : '';
        mimeInput.value = selected().length === 1
          ? selected()[0].type || 'application/octet-stream' : '';
        renderInventory();
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
    const attachments = selected();
    const filename = attachments.length === 1 ? filenameInput.value.trim() : '';
    const mimeType = attachments.length === 1 ? mimeInput.value.trim() : '';
    forget();
    const token = epoch;
    busy = true;
    controls();
    announce('正在执行来源资格检查、原始对象字节保护与新附件 FileData SHA-256 回读……', 'checking');
    try {
      const value = attachments.length === 1
        ? await prepareVerifiedLimitedAppend({
            source, attachment: attachments[0], filename, mimeType,
            approveFilenameAdjustments: false,
          })
        : await prepareVerifiedLimitedAppendMultiple({
            source,
            attachments: attachments.map(file => ({
              file, filename: file.name, mimeType: file.type || 'application/octet-stream',
            })),
            approveFilenameAdjustments: false,
          });
      if (!current(source, attachments, token) ||
          (attachments.length === 1 &&
            (filenameInput.value.trim() !== filename || mimeInput.value.trim() !== mimeType))) return;
      prepared = { value, source, attachments, token, filename, mimeType };
      evidence.textContent = `原始文件 SHA-256：${value.evidence.sourceSha256}；输出 SHA-256：${value.evidence.outputSha256}；已验证 ${value.evidence.verifiedAttachmentCount} 个附件的 FileData SHA-256：${value.attachedFilenames.map((name,i) =>
        name + '=' + value.evidence.attachmentSha256s[i]).join('；')}。原有非 Void 对象原始字节与偏移保持不变；本地检查不等于此文件已通过外部播放器验证。`;
      saveButton.disabled = false;
      announce('受限副本字节验证通过，可手动下载实验性 MKV。仅支持符合预留 Void 布局的小型 Matroska；不支持一般修改或覆盖原文件。', 'prepared');
    } catch (error) {
      if (!current(source, attachments, token)) return;
      announce('拒绝生成：' + (error?.message || String(error)) +
        '。不尝试不安全降级或 FFmpeg 代替写入。', 'blocked');
    } finally {
      busy = false;
      controls();
    }
  });

  saveButton.addEventListener('click', () => {
    const p = prepared;
    if (!p || !current(p.source, p.attachments, p.token) ||
        (p.attachments.length === 1 && (p.filename !== filenameInput.value.trim() ||
        p.mimeType !== mimeInput.value.trim())) ||
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
  renderInventory();
  controls();
  announce('仅限源 MKV 小于 60 MiB、无原附件、足量预留 Void、最多 8 个新附件且合计不超过 4 MiB 的特殊布局。');
}
