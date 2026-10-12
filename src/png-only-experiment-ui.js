import {
  preparePngAttachmentOnlyPlan, MAX_PNG_ATTACHMENT_BYTES,
} from './attachment-only-job-plan.js';
import { executePngAttachmentOnlyCandidate } from './attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';

// Explicitly experimental, ONE PNG only, and isolated from legacy mux state.
// "Prepared" means source and output match under the current browser reader;
// it is NOT an external conformance certification or a full PNG safety scan.
export function setupPngOnlyExperimentUI({ input, prepare, save, status }) {
  if (!input || !prepare || !save || !status) {
    throw new Error('PNG_ONLY_EXPERIMENT_UI_MISSING');
  }
  let epoch = 0;
  let prepared = null;
  let currentFile = null;
  const URLs = new Set();

  function announce(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }
  function clearPrepared() {
    prepared = null;
    currentFile = null;
    save.disabled = true;
  }
  function isCurrent(file, stamp) {
    return stamp === epoch && input.files?.[0] === file;
  }
  const toHex = bytes => [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');

  input.addEventListener('change', () => {
    epoch += 1;
    clearPrepared();
    const file = input.files?.[0];
    prepare.disabled = !file;
    announce(file
      ? '待生成：仅一张 PNG 附件，不含视频/音频/字幕轨。候选写入器属于实验性功能，需先进行本地回读。'
      : '尚未选择 PNG 图片。',
    file ? 'idle' : 'empty');
  });

  prepare.addEventListener('click', async () => {
    const file = input.files?.[0];
    if (!file) {
      announce('请选择单张 PNG 后再准备。', 'error');
      return;
    }
    const stamp = ++epoch;
    clearPrepared();
    prepare.disabled = true;
    announce('正在创建实验性 Matroska，并回读检查容器和附件字节……', 'pending');
    try {
      if (file.size > MAX_PNG_ATTACHMENT_BYTES) {
        throw new Error('当前实验最多处理 16 MiB 的 PNG 文件');
      }
      const plan = preparePngAttachmentOnlyPlan({
        file, filename: file.name, outputName: 'attachments-only.mkv',
      });
      const result = await executePngAttachmentOnlyCandidate(plan);
      if (!isCurrent(file, stamp)) return;
      const reader = createMatroskaAttachmentReader(result.output);
      const inventory = await reader.inspect();
      if (!isCurrent(file, stamp)) return;
      if (inventory.state !== 'inspected' ||
          inventory.structure.hasTracksElement ||
          inventory.structure.hasClusterElement ||
          inventory.attachments.length !== 1 ||
          inventory.attachments[0].filename !== plan.attachments[0].filename ||
          inventory.attachments[0].mimeType !== 'image/png' ||
          inventory.attachments[0].fileUid !== '1' ||
          inventory.attachments[0].byteLength !== file.size) {
        throw new Error('本地回读未能确认零轨道、单 PNG 附件的结构');
      }
      const extracted = reader.openAttachment(inventory.attachments[0].id).data;
      const [sourceBytes, extractedBytes] = await Promise.all([
        file.arrayBuffer(), extracted.arrayBuffer(),
      ]);
      if (!isCurrent(file, stamp)) return;
      // Browser WebCrypto is used to compare the extracted FileData with
      // the selected original. This is NOT a hash of all Matroska semantics.
      const [sourceHash, extractedHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', sourceBytes),
        crypto.subtle.digest('SHA-256', extractedBytes),
      ]);
      if (!isCurrent(file, stamp)) return;
      if (sourceBytes.byteLength !== extractedBytes.byteLength ||
          toHex(sourceHash) !== toHex(extractedHash)) {
        throw new Error('本地回读附件与源 PNG 不一致，拒绝下载');
      }
      prepared = result;
      currentFile = file;
      save.disabled = false;
      announce('实验性 MKV 已准备：零轨道、一个 PNG 附件；本地回读与 SHA-256 对照通过。未进行外部工具或播放器兼容性验证，可手动下载。', 'prepared');
    } catch (error) {
      if (!isCurrent(file, stamp)) return;
      clearPrepared();
      announce('实验性 MKV 未通过准备：' + (error?.message || String(error)), 'error');
    } finally {
      if (isCurrent(file, stamp)) prepare.disabled = false;
    }
  });

  save.addEventListener('click', () => {
    if (!prepared || !currentFile || input.files?.[0] !== currentFile ||
        status.dataset.state !== 'prepared') {
      announce('来源或计划已失效，请重新创建并验证。', 'error');
      return;
    }
    const url = URL.createObjectURL(prepared.output);
    URLs.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = prepared.filename;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
      announce('已请求浏览器保存实验性附件-only MKV；实际保存位置与成功状态取决于浏览器。', 'prepared');
    } finally {
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        URLs.delete(url);
      }, 120000);
    }
  });
  window.addEventListener('pagehide', () => {
    for (const url of URLs) URL.revokeObjectURL(url);
    URLs.clear();
  });
  prepare.disabled = true;
  save.disabled = true;
  announce('尚未选择 PNG 图片。', 'empty');
}
