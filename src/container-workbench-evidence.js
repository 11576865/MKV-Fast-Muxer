import { outputCompositionFileKey } from './output-composition.js';

/**
 * Source-scoped *observations*, not planned output tracks. Flat ffprobe
 * chapters and global tags are not evidence of arbitrary EBML preservation.
 */
export function projectSourceStructureEvidence({ source = null, trackState = null } = {}) {
  const sourceKey = outputCompositionFileKey(source);
  const observed = Boolean(source && trackState &&
    (!trackState.fileKey || trackState.fileKey ===
      `${source.name}|${source.size}|${source.lastModified}`));
  if (!observed) return { sourceKey, observed: false, items: [], summary: '来源结构尚未核验' };
  const scope = encodeURIComponent(sourceKey);
  const items = [];
  for (const [index, chapter] of (trackState.chapters || []).entries()) {
    items.push({
      id: `${scope}:chapter:${index}`,
      kind: 'chapter', title: String(chapter.tags?.title || `Chapter #${index + 1}`),
      detail: [chapter.start_time != null ? `开始 ${chapter.start_time}s` : '',
        chapter.end_time != null ? `结束 ${chapter.end_time}s` : ''].filter(Boolean).join(' · ') || '未提供时间范围',
      evidence: 'ffprobe-flat-chapter',
    });
  }
  const tags = trackState.format?.tags || {};
  for (const key of Object.keys(tags).sort()) {
    items.push({
      id: `${scope}:global-tag:${encodeURIComponent(key)}`,
      kind: 'metadata', title: String(key),
      detail: String(tags[key] ?? ''),
      evidence: 'ffprobe-global-tag',
    });
  }
  for (const stream of trackState.streams || []) {
    if (stream.codec_type !== 'data' && ['video', 'audio', 'subtitle', 'attachment'].includes(stream.codec_type)) continue;
    items.push({
      id: `${scope}:other-stream:${stream.index}`,
      kind: stream.codec_type === 'data' ? 'data' : 'other',
      title: `${String(stream.codec_type || 'unknown')} #${stream.index}`,
      detail: String(stream.codec_name || '未知编解码类型'),
      evidence: 'ffprobe-stream',
    });
  }
  return {
    sourceKey, observed: true, items,
    summary: `${(trackState.chapters || []).length} 个扁平章节 · ${Object.keys(tags).length} 项全局标签 · ${items.filter(x => x.kind === 'data' || x.kind === 'other').length} 条其他来源流`,
  };
}

/**
 * A successful mux and an independent probe audit are separate claims.
 * A passing ffprobe audit does NOT prove byte-for-byte EBML preservation,
 * nested Chapter/Tag UID integrity, or a completed user download.
 */
export function projectActualOutputEvidence(report, {
  currentSourceKey = '', currentPlan = null, sourceKeyAtExecution = '',
  // Only the live application knows exact browser File identity. Defaults to
  // true for historic callers that project a stored report without a File.
  sourceReferenceCurrent = true,
} = {}) {
  if (!report?.output?.name || !report.output.sha256) return null;
  const sourceCurrent = !!sourceKeyAtExecution && currentSourceKey === sourceKeyAtExecution;
  const planCurrent = currentPlan != null && JSON.stringify(currentPlan) === JSON.stringify(report.plan);
  const sameDraft = sourceReferenceCurrent && sourceCurrent && planCurrent;
  const status = report.audit?.status === 'pass' ? 'pass'
    : report.audit?.status === 'warning' ? 'warning' : 'unavailable';
  const issues = Array.from(report.audit?.issues || [], String);
  return {
    status, current: sameDraft,
    title: status === 'pass' ? '成品 ffprobe 审计通过'
      : status === 'warning' ? '成品审计发现差异' : '成品审计未完成',
    name: String(report.output.name),
    sha256: String(report.output.sha256),
    bytes: Number(report.output.sizeBytes || 0),
    issues,
    counts: report.audit?.counts || null,
    fontPayload: report.audit?.fontPayloadAudit || null,
    assEvent: report.audit?.assEventAudit || null,
    assStyle: report.audit?.assStyleAudit || null,
    subripCue: report.audit?.subripCueAudit || null,
    originalAttachmentPayload: report.audit?.originalAttachmentPayloadAudit || null,
    sourceAttachmentDelivery: report.audit?.sourceAttachmentDeliveryAudit || null,
    scopeNotice: '此结论仅覆盖现有 ffprobe 审计项目；未证明完整 EBML、未知结构或所有 UID 关系均被保留。',
    revisionNotice: sameDraft ? '对应当前来源与已显示计划'
      : !sourceReferenceCurrent ? '此前执行的成品；当前浏览器 File 来源已更换，不能沿用旧证据'
        : '此前执行的成品；当前来源或计划已变化，不能套用此结论',
    publicationNotice: '浏览器已生成成品；是否下载或持久保存不在此审计范围内。',
  };
}
