import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { createExistingAttachmentEditIntent } from './existing-attachment-edit-intent.js';

// Purely read-only UI projection. It NEVER exposes existing-MKV output,
// invokes the FFmpeg muxer, modifies source files, or grants write capability.
export function setupExistingAttachmentImpactUI({
  input, inventory, status, summary,
} = {}) {
  if (![input, inventory, status, summary].every(Boolean)) {
    throw new Error('EXISTING_ATTACHMENT_IMPACT_UI_MISSING');
  }
  let epoch = 0;
  let reader = null;
  let sourceFile = null;
  let observed = [];
  const proposed = new Map();
  const textNode = (tag, text, className) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const current = (stamp, file) =>
    epoch === stamp && input.files?.[0] === file && sourceFile === file;
  function message(text, state) {
    status.textContent = text;
    status.dataset.state = state;
  }
  function clear() {
    inventory.replaceChildren();
    summary.replaceChildren();
    reader = null;
    sourceFile = null;
    observed = [];
    proposed.clear();
  }
  function renderRows() {
    inventory.replaceChildren();
    for (const item of observed) {
      const row = document.createElement('div');
      row.className = 'existing-impact-row';
      row.dataset.attachmentId = item.id;
      row.append(textNode('div', item.filename, 'existing-impact-name'));
      row.append(textNode('div', '来源 FileUID：' + item.fileUid +
        '；声明 MIME：' + item.mimeType + '；字节：' + item.byteLength,
      'attachment-extraction-help'));
      const label = document.createElement('label');
      label.append(textNode('span', '模拟操作（不会修改文件）'));
      const picker = document.createElement('select');
      picker.dataset.impactAction = item.id;
      picker.setAttribute('aria-label', '模拟附件 ' + item.filename + ' 的操作');
      for (const [value, labelText] of [
        ['retain', '保留'],
        ['remove', '模拟移除（只读）'],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelText;
        picker.append(option);
      }
      picker.value = proposed.get(item.id) || 'retain';
      label.append(picker);
      row.append(label);
      row.append(textNode('div', '正在核对来源引用……', 'existing-impact-result'));
      inventory.append(row);
    }
  }

  async function evaluate(stamp, file) {
    if (!reader || !current(stamp, file)) return;
    message('检查 Tag UID 关系及模拟移除影响；不生成任何输出……', 'pending');
    try {
      const actions = [...proposed.entries()]
        .filter(([, kind]) => kind === 'remove')
        .map(([attachmentId]) => ({ type: 'remove', attachmentId }));
      const intent = await createExistingAttachmentEditIntent({ reader, actions });
      if (!current(stamp, file)) return;
      if (intent.execution.approvedToWrite !== false ||
          intent.execution.writer !== null || intent.execution.output !== null) {
        throw new Error('READ_ONLY_WRITER_AUTHORITY_INVALID');
      }
      for (const effect of intent.proposedChanges.effects) {
        const row = [...inventory.querySelectorAll('.existing-impact-row')]
          .find(el => el.dataset.attachmentId === effect.sourceAttachmentId);
        if (!row) continue;
        const target = row.querySelector('.existing-impact-result');
        target.dataset.tagImpact = effect.tagImpact;
        const tagCount = effect.observedTargetedTags.length;
        target.textContent = tagCount
          ? '已观察到 ' + tagCount + ' 个指向此 FileUID 的 Tag 目标；' +
            (effect.tagImpact === 'would-orphan-tag-attachment-uid'
              ? '模拟移除将使这些引用悬空。'
              : '当前模拟方案保留此目标。')
          : '未在已识别 Tag 目标中发现此 FileUID 引用；不能据此断定修改安全。';
      }
      const total = intent.impactSummary.orphanedTagTargetCountIfApplied;
      const graph = intent.relationGraph;
      summary.replaceChildren(
        textNode('div', '已观察 Tag：' + graph.tags.length +
          '；UID 关系：' + graph.edges.length +
          '；模拟操作可能导致悬空的 Tag→附件引用：' + total),
        textNode('div', '关系图覆盖：' + graph.coverage.tagTargets +
          '；整体 EBML 保留：未经证明；真实写入器：不可用。'),
        textNode('div', '能力判定：' + intent.capability.code +
          '。不会生成、保存或覆盖已有 MKV。'),
      );
      summary.dataset.capabilityCode = intent.capability.code;
      summary.dataset.danglingCount = String(total);
      summary.dataset.graphState = graph.state;
      message('已完成只读引用影响分析。无论模拟结果如何，已有 MKV 写入始终被阻止。', 'inspected');
    } catch (error) {
      if (!current(stamp, file)) return;
      summary.replaceChildren();
      summary.dataset.capabilityCode = 'UNVERIFIED';
      summary.dataset.danglingCount = '';
      for (const target of inventory.querySelectorAll('.existing-impact-result')) {
        target.textContent = '来源检查不完整；未获修改授权。';
        target.dataset.tagImpact = 'unverified';
      }
      message('不能完成引用分析：' + (error?.message || String(error)), 'error');
    }
  }

  input.addEventListener('change', async () => {
    const stamp = ++epoch;
    clear();
    const file = input.files?.[0];
    if (!file) {
      message('请选择已有 Matroska 文件以查看只读附件引用。', 'empty');
      return;
    }
    sourceFile = file;
    reader = createMatroskaAttachmentReader(file);
    message('正在读取来源附件；不会运行封装器。', 'pending');
    const ownReader = reader;
    try {
      const result = await ownReader.inspect();
      if (!current(stamp, file)) return;
      if (result.state !== 'inspected') {
        throw new Error(result.diagnostic?.code || 'SOURCE_UNVERIFIED');
      }
      observed = result.attachments;
      renderRows();
      await evaluate(stamp, file);
    } catch (error) {
      if (!current(stamp, file)) return;
      clear();
      message('不能检查来源：' + (error?.message || String(error)), 'error');
    }
  });
  inventory.addEventListener('change', event => {
    const field = event.target.closest('select[data-impact-action]');
    if (!field || !inventory.contains(field)) return;
    const id = field.dataset.impactAction;
    if (!observed.some(item => item.id === id)) return;
    proposed.set(id, field.value === 'remove' ? 'remove' : 'retain');
    const stamp = ++epoch;
    void evaluate(stamp, sourceFile);
  });
  message('请选择已有 Matroska 文件以查看只读附件引用。', 'empty');
}
