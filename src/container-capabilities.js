/**
 * Fail-closed product capability declarations. Standards validity, visual
 * plan modeling, writer eligibility and tested player results remain separate.
 * A "supported" label is NEVER inferred from MKV extension or track count.
 */
export const CAPABILITY_SCHEMA = 'mkv-capability-v1';
const result = (status, reason, code, proof = 'none') =>
  Object.freeze({ status, reason, code, proof });

export function resolveContainerCapabilities({
  hasSource = false, sourceContainer = 'unknown', sourceInspected = false,
  hasVideo = false, preservationStatus = 'checking',
  writerEligibility = 'unverified',
} = {}) {
  const matroska = ['matroska','matroska-webm'].includes(sourceContainer);
  const simple = ['iso-bmff','mov','webm'].includes(sourceContainer);
  const identityKnown = matroska || simple;
  const inspect = hasSource
    ? result('available', '只读识别可开始；未知对象与附件仍需独立检查。',
      'INSPECT_SOURCE', 'read-only')
    : result('requires-source', '先关联实际来源文件。', 'SOURCE_MISSING');
  const plan = result('available',
    '允许建立不含媒体轨的目标工程草稿；草稿不等于可以写出。',
    'PROJECT_MODEL_ONLY', 'domain-only');
  let mux;
  if (!hasSource) mux = result('blocked', '还没有经过授权的源文件。', 'SOURCE_MISSING');
  else if (!identityKnown) mux = result('blocked', '来源容器身份未知，拒绝封装。', 'IDENTITY_UNKNOWN');
  else if (!sourceInspected) mux = result('requires-preflight',
    '尚未确认实际视频流和来源保留风险，不能承诺成功。', 'SOURCE_NOT_PROBED');
  else if (!hasVideo) mux = result('unsupported',
    '目前的浏览器 FFmpeg 封装入口仍要求视频轨；领域模型允许无视频计划。',
    'NO_VIDEO_BACKEND');
  else if (matroska && ['blocked','checking','idle'].includes(preservationStatus))
    mux = result('blocked', 'MKV 来源保留风险未解除；运行时仍须再次独立审核。',
      'PRESERVATION_NOT_CLEARED');
  else mux = result('requires-preflight',
    '可进入视频 Stream Copy 封装路径，但必须在执行时复核来源、轨道、身份和写入后成品。',
    'RUNTIME_AUDIT_REQUIRED', 'browser-fixture-matrix');

  const attachments = !hasSource
    ? result('blocked', '尚未指定现有 MKV。', 'SOURCE_MISSING')
    : !matroska ? result('unsupported', '此专用作者只接受 Matroska 来源。', 'NEEDS_MATROSKA')
    : writerEligibility === 'verified-by-dedicated-writer'
      ? result('requires-preflight', '仅限满足有界 Void 布局、容量及 UID 安全规则的文件，最终仍需逐项复核。',
        'BOUNDED_VOID_WRITER', 'limited-writer-fixtures')
      : result('requires-preflight',
        '可打开独立附件写入器核验，但未证明当前来源符合 Void 等严格条件。',
        'ELIGIBILITY_UNVERIFIED', 'limited-writer-fixtures');
  return Object.freeze({
    schema: CAPABILITY_SCHEMA, inspect, plan,
    mux, existingAttachmentAdd: attachments,
    resourceOnlyWrite: result('experimental',
      '附件-only 的规范研究与受控实验不构成主流程的正式写入支持。',
      'RESOURCE_ONLY_NOT_RELEASED', 'research-fixture-only'),
    fullEbmlPreservation: result('unsupported',
      'FFmpeg 重封装不保证嵌套章节、目标 UID 标签或未知 EBML 元素保持。',
      'GENERAL_PRESERVATION_UNPROVEN', 'independent-negative-fixture'),
    playerCompatibility: result('unverified',
      '成品回读或单个 libass CI 样本不等于任意播放器验证。',
      'PLAYER_MATRIX_UNVERIFIED', 'bounded-linux-libass-ci'),
  });
}

export function summarizeContainerCapability(caps) {
  if (caps?.schema !== CAPABILITY_SCHEMA) throw Error('CAPABILITY_SCHEMA_MISMATCH');
  return Object.freeze([
    { label: '快速封装', ...caps.mux },
    { label: '原 MKV 附件', ...caps.existingAttachmentAdd },
    { label: '无视频目标写入', ...caps.resourceOnlyWrite },
    { label: '完整 EBML 保留', ...caps.fullEbmlPreservation },
    { label: '播放器一致性', ...caps.playerCompatibility },
  ]);
}
