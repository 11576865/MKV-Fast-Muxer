import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { planAttachmentExportNames } from './attachment-export-policy.js';
import { inspectAttachmentPrefix } from './attachment-signature.js';

// Independent source-inspection tool: never touches legacy video/FFmpeg inputs.
// All user-controlled FileName / MIME is displayed as untrusted metadata.
export function setupAttachmentExtractionUI({ input, list, status }) {
  if (!input || !list || !status) throw new Error('ATTACHMENT_EXTRACT_UI_MISSING');
  let generation = 0;
  let inspectedFile = null;
  let reader = null;
  let inventory = null;
  let names = null;
  const observations = new Map();
  const activeUrls = new Set();

  function announce(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }
  function clear() {
    inspectedFile = null;
    reader = null;
    inventory = null;
    names = null;
    observations.clear();
    list.replaceChildren();
  }
  function field(parent, label, value) {
    const row = document.createElement('div');
    row.className = 'attachment-extraction-field';
    const name = document.createElement('span');
    name.className = 'attachment-extraction-field-label';
    name.textContent = label;
    const data = document.createElement('bdi');
    data.textContent = String(value);
    data.dir = 'auto';
    row.append(name, data);
    parent.append(row);
    return row; // Required for attaching scoped warning semantics after rendering.
  }
  function render() {
    list.replaceChildren();
    const proposals = names.entries;
    inventory.attachments.forEach((item, index) => {
      const proposal = proposals[index];
      const row = document.createElement('div');
      row.className = 'attachment-extraction-row';
      const properties = document.createElement('div');
      properties.className = 'attachment-extraction-properties';
      field(properties, '源名称（不可信）', item.filename);
      field(properties, '建议保存名', proposal.proposedSaveName);
      field(properties, '声明类型（未验证内容）', item.mimeType);
      field(properties, '附件大小', item.byteLength + ' B');
      const observed = observations.get(item.id);
      if (!observed) {
        field(properties, '内容签名', '未检查（可按需读取最多 64 B）');
      } else if (observed.state === 'prefix-mismatch') {
        const warning = field(properties, '内容警告',
          '声明 ' + item.mimeType + '，但文件头识别为 ' +
          observed.observedMimeType + '；二者不一致，内容安全性未验证。');
        warning.classList.add('attachment-extraction-warning');
      } else if (observed.state === 'prefix-matches') {
        field(properties, '内容签名',
          observed.signatureLabel + '（仅文件头匹配，非完整内容验证）');
      } else if (observed.state === 'declared-missing') {
        field(properties, '内容签名',
          observed.signatureLabel + '（无可信声明类型，非完整验证）');
      } else {
        field(properties, '内容签名',
          observed.state === 'read-failed'
            ? '读取文件头失败；类型未验证。'
            : '未识别文件头；不代表文件损坏或安全。');
      }
      if (proposal.reasons.length) {
        field(properties, '文件名调整', proposal.reasons.join(', '));
      }
      const actions = document.createElement('div');
      actions.className = 'attachment-extraction-actions';
      const checkButton = document.createElement('button');
      checkButton.type = 'button';
      checkButton.className = 'button button-small';
      checkButton.dataset.attachmentCheck = item.id;
      checkButton.textContent = '检查签名';
      checkButton.setAttribute('aria-label', '检查附件文件头：' + proposal.proposedSaveName);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-small attachment-extraction-download';
      button.dataset.attachmentDownload = item.id;
      button.textContent = '下载附件';
      button.setAttribute('aria-label', '下载附件：' + proposal.proposedSaveName);
      actions.append(checkButton, button);
      row.append(properties, actions);
      list.append(row);
    });
  }

  input.addEventListener('change', async () => {
    const token = ++generation;
    const file = input.files?.[0] || null;
    clear();
    if (!file) {
      announce('尚未选择待检查容器。', 'idle');
      return;
    }
    announce('正在读取 Matroska 附件结构，不载入附件正文……', 'pending');
    const newReader = createMatroskaAttachmentReader(file);
    try {
      const result = await newReader.inspect();
      if (token !== generation || input.files?.[0] !== file) return;
      if (result.state !== 'inspected') {
        announce('附件结构无法安全确认：' +
          (result.diagnostic?.code || 'INSPECTION_FAILED') +
          '。本次不提供提取。', 'unverified');
        return;
      }
      inspectedFile = file;
      reader = newReader;
      inventory = result;
      names = planAttachmentExportNames(result.attachments);
      render();
      announce(result.attachments.length
        ? '已读取 ' + result.attachments.length +
          ' 个附件。名称与 MIME 均是未验证的源元数据，下载不代表内容安全。'
        : '未检测到附件。无视频轨的 Matroska 也可用于检查。',
      'ready');
    } catch (error) {
      if (token !== generation || input.files?.[0] !== file) return;
      clear();
      announce('附件检查失败：' + (error?.message || String(error)), 'unverified');
    }
  });

  list.addEventListener('click', async event => {
    const checkButton = event.target.closest('button[data-attachment-check]');
    if (!checkButton || !list.contains(checkButton)) return;
    const id = checkButton.dataset.attachmentCheck;
    if (!reader || !inventory || !inspectedFile ||
        input.files?.[0] !== inspectedFile) {
      announce('来源已变化，请重新检查容器。', 'unverified');
      return;
    }
    const token = generation;
    checkButton.disabled = true;
    try {
      const observed = await inspectAttachmentPrefix(reader, id);
      if (token !== generation || input.files?.[0] !== inspectedFile) return;
      observations.set(id, observed);
      render();
      announce(observed.state === 'prefix-mismatch'
        ? '注意：附件声明类型与实际文件头不一致。已保留提取功能，但不得按声明类型自动预览或执行。'
        : '文件头检查完成：这不是完整格式验证，也不是恶意内容检测。',
      observed.state === 'prefix-mismatch' || observed.state === 'read-failed'
        ? 'warning' : 'ready');
    } catch (error) {
      if (token !== generation || input.files?.[0] !== inspectedFile) return;
      announce('无法确认附件内容签名：' + (error?.message || String(error)), 'warning');
    } finally {
      if (checkButton.isConnected) checkButton.disabled = false;
    }
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-attachment-download]');
    if (!button || !list.contains(button)) return;
    const id = button.dataset.attachmentDownload;
    if (!inspectedFile || input.files?.[0] !== inspectedFile ||
        !reader || !inventory || !names) {
      announce('源文件已变化，必须重新检查后才能提取。', 'unverified');
      return;
    }
    const ordinal = inventory.attachments.findIndex(item => item.id === id);
    if (ordinal < 0 || !names.entries[ordinal]) {
      announce('附件选择已失效，请重新检查。', 'unverified');
      return;
    }
    try {
      const opened = reader.openAttachment(id);
      // The Matroska MIME metadata is not trusted. Never make downloaded
      // attachments browser-executable or inline-previewable by that claim.
      const opaque = new Blob([opened.data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(opaque);
      activeUrls.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = names.entries[ordinal].proposedSaveName;
      link.rel = 'noopener';
      link.hidden = true;
      document.body.append(link);
      try {
        link.click(); // Direct user click only, not an auto-download after scan.
      } finally {
        link.remove();
        // Browser download may still be reading Blob data asynchronously.
        setTimeout(() => {
          URL.revokeObjectURL(url);
          activeUrls.delete(url);
        }, 120_000);
      }
      announce('已请求浏览器下载“' + names.entries[ordinal].proposedSaveName +
        '”。是否成功保存由浏览器决定；附件内容未经哈希验证。', 'ready');
    } catch (error) {
      announce('附件未能提交下载：' + (error?.message || String(error)), 'unverified');
    }
  });

  window.addEventListener('pagehide', () => {
    for (const url of activeUrls) URL.revokeObjectURL(url);
    activeUrls.clear();
  });
  announce('尚未选择待检查容器。', 'idle');
  return Object.freeze({ kind: 'read-only-attachment-extraction-ui' });
}
