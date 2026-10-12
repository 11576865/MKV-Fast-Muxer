import {
  prepareMultiAttachmentOnlyPlan, MAX_ATTACHED_FILES,
  MAX_SINGLE_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES,
} from './multi-attachment-only-job-plan.js';
import { executeMultiAttachmentOnlyCandidate } from './multi-attachment-only-candidate-writer.js';
import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { planAttachmentExportNames } from './attachment-export-policy.js';

// Separate, explicitly experimental UI. Never modifies the legacy video mux
// file inputs, source/editor state, BatchRunner or the single-PNG experiment.
export function setupMultiAttachmentExperimentUI({
  input, inventory, review, prepare, save, status,
} = {}) {
  if (![input, inventory, review, prepare, save, status].every(Boolean)) {
    throw new Error('MULTI_ATTACHMENT_EXPERIMENT_UI_MISSING');
  }
  let generation = 0;
  let currentFiles = [];
  let rows = [];
  let prepared = null;
  const urls = new Set();
  const hex = bytes => [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');

  function announce(text, state) {
    status.textContent = text;
    status.dataset.state = state;
  }
  function invalidate() {
    generation++;
    prepared = null;
    save.disabled = true;
    prepare.disabled = !review.checked || rows.length < 2 ||
      rows.length > MAX_ATTACHED_FILES;
  }
  function sameSources(files, token) {
    const now = [...(input.files || [])];
    return generation === token && now.length === files.length &&
      now.every((file, i) => file === files[i]);
  }
  const makeText = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function render() {
    inventory.replaceChildren();
    rows.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'multi-attachment-item';
      card.dataset.multiAttachmentOrdinal = String(i);
      card.append(makeText('div', (i + 1) + '. ' + item.file.name,
        'multi-attachment-source'));
      const details = makeText('div',
        '来源大小：' + item.file.size + ' B；类型为声明元数据，尚未验证内容。',
        'attachment-extraction-help');
      card.append(details);
      const labels = document.createElement('div');
      labels.className = 'multi-attachment-fields';
      const declaredLabel = document.createElement('label');
      declaredLabel.append(makeText('span', '拟写入 MIME（未验证）'));
      const typeInput = document.createElement('input');
      typeInput.type = 'text';
      typeInput.value = item.mimeType;
      typeInput.dataset.multiAttachmentMime = String(i);
      typeInput.setAttribute('aria-label', '附件 ' + (i + 1) + ' 的拟写入 MIME');
      declaredLabel.append(typeInput);
      labels.append(declaredLabel);
      const destination = makeText('div',
        '拟写入名称：' + (item.proposedName || '待计算'),
        'multi-attachment-proposal');
      labels.append(destination);
      card.append(labels);
      if (item.reasons?.length) {
        card.append(makeText('div', '名称调整：' + item.reasons.join(', '),
          'attachment-extraction-warning'));
      }
      inventory.append(card);
    });
  }

  function updateProposals() {
    const proposals = planAttachmentExportNames(rows.map((row, i) => ({
      id: String(i), filename: row.file.name,
      mimeType: row.mimeType,
    })));
    rows.forEach((row, i) => {
      row.proposedName = proposals.entries[i].proposedSaveName;
      row.reasons = [...proposals.entries[i].reasons];
    });
  }

  input.addEventListener('change', () => {
    currentFiles = [...(input.files || [])];
    rows = currentFiles.map(file => ({
      file,
      // Browser file.type may be inferred from extension or supplied by the
      // input origin. The explicit field does not claim content authenticity.
      mimeType: file.type || 'application/octet-stream',
    }));
    review.checked = false;
    try {
      updateProposals();
      render();
    } catch (error) {
      rows = [];
      inventory.replaceChildren();
      invalidate();
      announce('无法列出附件计划：' + (error?.message || String(error)), 'error');
      return;
    }
    invalidate();
    const total = currentFiles.reduce((sum, file) => sum + file.size, 0);
    const withinBudget = currentFiles.length >= 2 &&
      currentFiles.length <= MAX_ATTACHED_FILES &&
      total <= MAX_TOTAL_ATTACHMENT_BYTES &&
      currentFiles.every(file => file.size > 0 &&
        file.size <= MAX_SINGLE_ATTACHMENT_BYTES);
    if (!withinBudget) {
      announce('需要 2–8 个非空附件；单文件不超过 16 MiB，合计不超过 32 MiB。当前不允许生成。', 'error');
      prepare.disabled = true;
      return;
    }
    announce('请逐项核对将一同分发的文件、MIME 声明和名称调整，然后明确勾选确认。', 'review');
  });

  inventory.addEventListener('input', event => {
    const field = event.target.closest('input[data-multi-attachment-mime]');
    if (!field || !inventory.contains(field)) return;
    const ordinal = Number(field.dataset.multiAttachmentMime);
    if (!Number.isSafeInteger(ordinal) || !rows[ordinal]) return;
    rows[ordinal].mimeType = field.value;
    review.checked = false;
    invalidate();
    announce('MIME 声明已变更，请重新核对附件清单并确认。内容类型仍未经验证。', 'review');
  });

  review.addEventListener('change', () => {
    invalidate();
    announce(review.checked
      ? '已确认附件清单。可以生成实验性 MKV；内容安全性及外部兼容性尚未验证。'
      : '已撤销附件清单确认。必须再次确认才能生成。',
    review.checked ? 'reviewed' : 'review');
  });

  prepare.addEventListener('click', async () => {
    const files = [...(input.files || [])];
    if (!review.checked || files.length !== rows.length ||
        !files.every((f, i) => f === rows[i].file)) {
      announce('来源或确认已失效；请重新核对。', 'error');
      return;
    }
    const token = ++generation;
    prepared = null;
    save.disabled = true;
    prepare.disabled = true;
    announce('正在创建实验性多附件 MKV，并逐项回读与比较 SHA-256……', 'pending');
    try {
      const plan = prepareMultiAttachmentOnlyPlan({
        attachments: rows.map(row => ({
          file: row.file, filename: row.file.name, mimeType: row.mimeType,
        })),
        outputName: 'multiple-attachments-only.mkv',
        approveFilenameAdjustments: review.checked,
      });
      const candidate = await executeMultiAttachmentOnlyCandidate(plan);
      if (!sameSources(files, token)) return;
      const reader = createMatroskaAttachmentReader(candidate.output);
      const observed = await reader.inspect();
      if (!sameSources(files, token)) return;
      if (observed.state !== 'inspected' ||
          observed.structure.hasTracksElement ||
          observed.structure.hasClusterElement ||
          observed.attachments.length !== plan.attachments.length) {
        throw new Error('MULTI_ATTACHMENT_BROWSER_READER_STRUCTURE_MISMATCH');
      }
      for (let i = 0; i < plan.attachments.length; i++) {
        const expected = plan.attachments[i];
        const actual = observed.attachments[i];
        if (actual.filename !== expected.filename ||
            actual.mimeType !== expected.declaredMimeType ||
            actual.fileUid !== expected.fileUid ||
            actual.byteLength !== files[i].size) {
          throw new Error('MULTI_ATTACHMENT_BROWSER_METADATA_MISMATCH_' + i);
        }
        // Read per file, sequentially, only on explicit generate. Not eager
        // FileData scanning on initial import or while listing proposals.
        const extracted = await reader.openAttachment(actual.id).data.arrayBuffer();
        const original = await files[i].arrayBuffer();
        if (!sameSources(files, token)) return;
        const sourceDigest = await crypto.subtle.digest('SHA-256', original);
        const extractDigest = await crypto.subtle.digest('SHA-256', extracted);
        if (!sameSources(files, token)) return;
        if (original.byteLength !== extracted.byteLength ||
            hex(sourceDigest) !== hex(extractDigest)) {
          throw new Error('MULTI_ATTACHMENT_BROWSER_BYTES_MISMATCH_' + i);
        }
      }
      prepared = { candidate, files, token };
      save.disabled = false;
      announce('实验性 MKV 准备完成：零媒体轨、' + files.length +
        ' 个附件，全部经本地 SHA-256 回读一致。尚未通过外部工具或安全扫描；可明确点击下载。',
      'prepared');
    } catch (error) {
      if (!sameSources(files, token)) return;
      prepared = null;
      save.disabled = true;
      announce('无法生成或验证多附件 MKV：' + (error?.message || String(error)), 'error');
    } finally {
      if (sameSources(files, token)) prepare.disabled = !review.checked;
    }
  });

  save.addEventListener('click', () => {
    if (!prepared || !review.checked ||
        !sameSources(prepared.files, prepared.token) ||
        status.dataset.state !== 'prepared') {
      announce('附件清单已改变，须重新确认并验证。', 'error');
      save.disabled = true;
      return;
    }
    const url = URL.createObjectURL(prepared.candidate.output);
    urls.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = prepared.candidate.filename;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
      announce('已请求浏览器下载实验性多附件 MKV。实际保存由浏览器负责；任何取得该文件的人均可提取附件。', 'prepared');
    } finally {
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
      }, 120000);
    }
  });
  window.addEventListener('pagehide', () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  });
  prepare.disabled = true;
  save.disabled = true;
  announce('尚未选择多附件文件。', 'empty');
}
