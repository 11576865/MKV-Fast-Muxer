/**
 * Read-only per-source-attachment outcome projection for a FINISHED MKV.
 * FileData SHA-256, ffprobe inventory and a user-saved download are
 * separate facts. Never infer EBML UID/TagTargets or user-side persistence.
 *
 * sourceRows: exact source scan + planned edits SNAPSHOTTED at task start.
 * outputProbe: actual independent ffprobe result of finished MKV.
 * payloadAudit: independent Matroska EBML FileData audit.
 */
export function auditSourceAttachmentDelivery({
  sourceRows = [], outputProbe = null, payloadAudit = null,
  ffprobeStatus = 'unavailable',
} = {}) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const outputStreams = Array.isArray(outputProbe?.streams)
    ? outputProbe.streams.filter(s => s?.codec_type === 'attachment') : null;
  const observations = Array.isArray(payloadAudit?.observations)
    ? payloadAudit.observations : [];
  // Only the actual finished-MKV EBML FileData reader may authorize a digest
  // claim. An imported report carrying a truthy hash or an unrelated ffprobe
  // result is NOT evidence of a source-to-output byte comparison.
  const payloadProvenanceValid = ['pass','warning'].includes(payloadAudit?.status) &&
    payloadAudit?.evidence === 'source-vs-final-mkv-ebml-filedata-sha256-v1' &&
    payloadAudit?.scope === 'original-attachment-filedata-only' &&
    Number.isSafeInteger(payloadAudit?.verified) &&
    Number.isSafeInteger(payloadAudit?.total) &&
    payloadAudit.verified === observations.length &&
    payloadAudit.total >= observations.length &&
    observations.every(item =>
      typeof item?.sourceFilename === 'string' &&
      typeof item?.outputFilename === 'string' &&
      /^[a-f0-9]{64}$/i.test(item?.sha256 || '') &&
      Number.isSafeInteger(item?.byteLength) && item.byteLength > 0);
  const count = (items, key, value) => items.filter(row => row?.[key] === value).length;
  const name = x => String(x || '');
  const outputName = x => name(x?.tags?.filename);
  const entries = rows.map(row => {
    const sourceIndex = row.index;
    const originalName = name(row.originalFilename);
    const intendedName = name(row.filename);
    const included = Boolean(row.include);
    const intent = !included ? 'exclude' :
      intendedName !== originalName ||
      name(row.mimetype) !== name(row.originalMimetype) ? 'modify' : 'keep';
    const base = {
      sourceIndex, originalName, intendedName, intendedMime: name(row.mimetype),
      intent, status:'unavailable', evidence:'not-established',
      message:'缺少可唯一对应当前附件的独立成品证据',
      reasonCode:'EVIDENCE_NOT_ESTABLISHED',
      uidRelationsVerified:false, savedToDiskVerified:false,
    };
    const unresolved = (reasonCode, message) => Object.freeze({
      ...base, reasonCode, message,
    });
    const srcUnique = originalName &&
      count(rows,'originalFilename',originalName) === 1;
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0)
      return unresolved('SOURCE_INDEX_INVALID', '来源附件轨道索引无效，不能建立成品对应关系');
    if (!srcUnique)
      return unresolved('SOURCE_NAME_AMBIGUOUS',
        '来源附件名称缺失或不唯一，不能仅靠文件名证明成品身份');
    if (!outputStreams)
      return unresolved('OUTPUT_INVENTORY_UNAVAILABLE', '最终 MKV 的附件清单尚未独立取得');
    if (included) {
      // Structural evidence is diagnostic even when byte-level proof is
      // missing. Missing, duplicated or incorrectly typed finished objects
      // must not be hidden behind a generic FileData-unavailable message.
      if (count(rows.filter(r=>r.include),'filename',intendedName) !== 1)
        return unresolved('OUTPUT_NAME_AMBIGUOUS',
          '多个拟保留来源附件使用相同目标名称，无法唯一追踪输出对象');
      const actual = outputStreams.filter(s => outputName(s) === intendedName);
      if (!actual.length)
        return unresolved('OUTPUT_ATTACHMENT_MISSING',
          '最终 MKV 附件清单未找到拟保留的“' + intendedName +
          '”；这是成品结构缺失，不是通过 FileData 核验');
      if (actual.length !== 1)
        return unresolved('OUTPUT_NAME_AMBIGUOUS',
          '最终 MKV 包含多个同名附件，无法唯一追踪此来源对象');
      const actualMime = name(actual[0]?.tags?.mimetype);
      const intendedMime = name(row.mimetype);
      if (intendedMime && actualMime.toLowerCase() !== intendedMime.toLowerCase())
        return unresolved('OUTPUT_MIME_MISMATCH',
          '最终 MKV 附件“' + intendedName + '”的 MIME 为“' +
          (actualMime || '未提供') + '”，与草稿“' + intendedMime + '”不符');
      if (!payloadProvenanceValid)
        return unresolved('FILEDATA_AUDIT_UNTRUSTED',
          '已观察到最终附件，但缺少具有正确证据类型、完整 SHA-256 和一致核验计数的独立 FileData 审计');
      const matched = observations.filter(o =>
        o.sourceFilename === originalName && o.outputFilename === intendedName);
      if (matched.length !== 1)
        return unresolved('FILEDATA_MATCH_UNAVAILABLE',
          '无法从实际 FileData 审计中唯一对应此来源与拟输出附件');
      return Object.freeze({ ...base, status:'filedata-verified',
        evidence:'source-vs-final-mkv-ebml-filedata-sha256-v1',
        reasonCode:'VERIFIED_FILEDATA',
        message:'最终 MKV 中该附件的名称、MIME 与 FileData SHA-256 已独立核对；UID/引用与实际保存未验证',
        sha256:matched[0].sha256, byteLength:matched[0].byteLength });
    }
    // Absence is verified only within the COMPLETE ffprobe attachment inventory.
    // If another original, renamed or new attachment uses the same name,
    // the removed object's identity is ambiguous and must remain unresolved.
    if (ffprobeStatus === 'pass' &&
        outputStreams.every(s => outputName(s) !== originalName)) {
      return Object.freeze({ ...base, status:'absent-in-probe',
        evidence:'final-mkv-ffprobe-attachment-inventory',
        reasonCode:'ABSENT_IN_COMPLETE_INVENTORY',
        message:'最终 MKV 的 ffprobe 附件清单未出现原名称；不证明 UID/引用完全保真，也不代表已保存' });
    }
    return unresolved(ffprobeStatus !== 'pass' ? 'OUTPUT_AUDIT_NOT_PASS' :
      'EXCLUDED_IDENTITY_AMBIGUOUS',
      ffprobeStatus !== 'pass'
        ? '整体输出审计尚未通过，不能据此断言附件已排除'
        : '最终 MKV 仍出现相同附件名，或无法唯一证明此对象已排除');

  });
  return Object.freeze({
    schema:'source-attachment-delivery-v1',
    entries:Object.freeze(entries),
    verifiedFileData:entries.filter(x=>x.status==='filedata-verified').length,
    observedAbsent:entries.filter(x=>x.status==='absent-in-probe').length,
    unresolved:entries.filter(x=>x.status==='unavailable').length,
    uidRelationsVerified:false, savedToDiskVerified:false,
  });
}
