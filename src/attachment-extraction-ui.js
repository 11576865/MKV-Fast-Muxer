import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { planAttachmentExportNames } from './attachment-export-policy.js';

// Independent source-inspection tool: never touches legacy video/FFmpeg inputs.
// All user-controlled FileName / MIME is displayed as untrusted metadata.
export function setupAttachmentExtractionUI({ input, list, status }) {
  if (!input || !list || !status) throw new Error('ATTACHMENT_EXTRACT_UI_MISSING');
  let generation = 0;
  let inspectedFile = null;
  let reader = null;
  let inventory = null;
  let names = null;
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
      if (proposal.reasons.length) {
        field(properties, '文件名调整', proposal.reasons.join(', '));
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-small attachment-extraction-download';
      button.dataset.attachmentDownload = item.id;
      button.textContent = '下载附件';
      button.setAttribute('aria-label', '下载附件：' + proposal.proposedSaveName);
      row.append(properties, button);
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
