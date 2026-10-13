import { prepareVerifiedLimitedAppend, prepareVerifiedLimitedAppendMultiple } from './existing-mkv-limited-append-workflow.js';
import { draftLimitedAttachmentItems, validateLimitedAttachmentItems, snapshotLimitedAttachmentItems, matchLimitedAttachmentSnapshot } from './existing-mkv-attachment-draft.js';

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
  let draftItems = [];
  function forget() {
    epoch++;
    prepared = null;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    saveButton.disabled = true;
    evidence.textContent = '';
  }
  const selected = () => Array.from(attachmentInput.files || []);
  function current(source, attachments, token, acceptedMetadata = null) {
    const fresh = selected();
    return token === epoch && sourceInput.files?.[0] === source &&
      fresh.length === attachments.length &&
      attachments.every((file, index) => fresh[index] === file) &&
      review.checked &&
      (!acceptedMetadata || matchLimitedAttachmentSnapshot(acceptedMetadata, liveItems()));
  }
  function liveItems() {
    const files = selected();
    if (files.length === 1) return [{
      file: files[0], filename: filenameInput.value.trim(), mimeType: mimeInput.value.trim(),
    }];
    return files.map((file, index) => ({
      file,
      filename: inventory?.querySelector(
        `input[data-limited-index="${index}"][data-limited-field="filename"]`)?.value.trim() ??
        (draftItems[index]?.file === file ? draftItems[index].filename : ''),
      mimeType: inventory?.querySelector(
        `input[data-limited-index="${index}"][data-limited-field="mimeType"]`)?.value.trim() ??
        (draftItems[index]?.file === file ? draftItems[index].mimeType : ''),
    }));
  }
  function renderInventory() {
    if (!inventory) return;
    const files = selected();
    inventory.replaceChildren();
    if (!files.length) {
      inventory.textContent = '请导入 1–8 个附件（总计不超过 4 MiB）。';
      return;
    }
    if (files.length === 1) {
      inventory.textContent = '已选择 1 个附件。请使用下方单附件名称及 MIME 字段。';
      return;
    }
    const intro = document.createElement('p');
    intro.textContent = `已选择 ${files.length} 个附件。每项名称及 MIME 可单独修改；更改后须重新确认。`;
    inventory.append(intro);
    files.forEach((file, index) => {
      const item = draftItems[index]?.file === file
        ? draftItems[index]
        : { file, filename: file.name, mimeType: file.type || 'application/octet-stream' };
      const row = document.createElement('div');
      row.className = 'existing-mkv-limited-file-row';
      const source = document.createElement('strong');
      source.textContent = `来源 #${index + 1}：${file.name} · ${file.size} bytes`;
      row.append(source);
      for (const [field, title, max] of [
        ['filename', '输出附件名称', 240], ['mimeType', '输出 MIME 类型', 100],
      ]) {
        const label = document.createElement('label');
        label.textContent = `${title} #${index + 1}`;
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = max;
        input.value = item[field];
        input.dataset.limitedIndex = String(index);
        input.dataset.limitedField = field;
        input.setAttribute('aria-label', `${title} #${index + 1}，来源 ${file.name}`);
        label.append(input);
        row.append(label);
      }
      inventory.append(row);
    });
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
    const validation = validateLimitedAttachmentItems(liveItems());
    prepareButton.disabled = busy || !review.checked || !sourceInput.files?.[0] || !validation.ok;
  }
  inventory?.addEventListener('input', (event) => {
    const target = event.target;
    const index = Number(target?.dataset?.limitedIndex);
    const field = target?.dataset?.limitedField;
    if (!Number.isInteger(index) || index < 0 || index >= draftItems.length ||
        !['filename', 'mimeType'].includes(field)) return;
    draftItems[index] = { ...draftItems[index], [field]: target.value };
    forget();
    review.checked = false;
    announce('附件元数据已修改，原有验证和下载已失效；请重新核对并确认。');
    controls();
  });
  for (const input of [sourceInput, attachmentInput, filenameInput, mimeInput]) {
    input.addEventListener('change', () => {
      forget();
      if (input === attachmentInput) {
        draftItems = draftLimitedAttachmentItems(selected());
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
    const selectedMetadata = liveItems();
    forget();
    const token = epoch;
    busy = true;
    controls();
    announce('正在执行来源资格检查、原始对象字节保护与新附件 FileData SHA-256 回读……', 'checking');
    try {
      const acceptedMetadata = snapshotLimitedAttachmentItems(selectedMetadata);
      const value = attachments.length === 1
        ? await prepareVerifiedLimitedAppend({
            source, attachment: attachments[0], filename, mimeType,
            approveFilenameAdjustments: false,
          })
        : await prepareVerifiedLimitedAppendMultiple({
            source,
            attachments: acceptedMetadata,
            approveFilenameAdjustments: false,
          });
      if (!current(source, attachments, token, acceptedMetadata)) return;
      prepared = { value, source, attachments, token, filename, mimeType, acceptedMetadata };
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
    if (!p || !current(p.source, p.attachments, p.token, p.acceptedMetadata) ||
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
  draftItems = draftLimitedAttachmentItems(selected());
  renderInventory();
  controls();
  announce('仅限源 MKV 小于 60 MiB、无原附件、足量预留 Void、最多 8 个新附件且合计不超过 4 MiB 的特殊布局。');
}
