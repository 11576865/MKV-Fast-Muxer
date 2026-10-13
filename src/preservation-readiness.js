/**
 * One UI projection of the existing fail-closed preservation preflight.
 * UI results are advisory. The mux executor MUST independently run its own
 * preflight on the selected source immediately before opening any writer.
 *
 * A File object is compared by reference so two files with identical
 * name/size/timestamp cannot inherit one another's safety result.
 */
export function preservationReadiness({
  source = null, inspectionSource = null, state = 'idle', inspection = null,
} = {}) {
  if (!source) return {
    status: 'idle', blocking: false, severity: 'neutral',
    title: '等待选择来源', description: '添加媒体后显示 Matroska 结构保留风险。',
  };
  if (inspectionSource !== source || state === 'checking' || state === 'idle') {
    return {
      status: 'checking', blocking: true, severity: 'neutral',
      title: '正在验证来源结构',
      description: '正在按实际文件内容读取 EBML 章节与标签；检查结束前不可开始封装。',
    };
  }
  if (state === 'not-applicable') return {
    status: 'not-applicable', blocking: false, severity: 'neutral',
    title: '不需要 Matroska 源结构预检',
    description: '当前来源不是 Matroska；仍须通过普通的媒体来源与输出预检。',
  };
  const blocked = !inspection || !['NO_KNOWN_HAZARD','UNVERIFIED_REFERENCES','NOT_MATROSKA'].includes(inspection.state);
  if (blocked) return {
    status: 'blocked', blocking: true, severity: 'danger',
    title: '禁止重封装此来源',
    description: (inspection?.reasons || ['源结构安全性无法确认']).join('；') +
      '。执行器无法证明保留这些结构；源文件不会被修改。',
  };
  if (inspection.state === 'UNVERIFIED_REFERENCES') return {
    status: 'warning', blocking: false, severity: 'warning',
    title: '检测到未验证的 UID 关联',
    description: (inspection.warnings || []).join('；') +
      '。当前不属于已知硬阻断，但其关联保真未获独立证明。请验证导出副本。',
  };
  return {
    status: 'clear', blocking: false, severity: 'neutral',
    title: inspection.state === 'NOT_MATROSKA'
      ? '来源为 WebM' : '未检出已知硬阻断结构',
    description: inspection.caveat ||
      '未检测到已知阻断结构不等于所有 EBML 或流数据可无损保留。',
  };
}
