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
      uidRelationsVerified:false, savedToDiskVerified:false,
    };
    const srcUnique = originalName &&
      count(rows,'originalFilename',originalName) === 1;
    if (!Number.isSafeInteger(sourceIndex) || !srcUnique || !outputStreams)
      return Object.freeze(base);
    if (included) {
      const matched = observations.filter(o =>
        o.sourceFilename === originalName && o.outputFilename === intendedName);
      if (matched.length === 1 && matched[0].sha256 &&
          matched[0].byteLength > 0 &&
          count(rows.filter(r=>r.include),'filename',intendedName) === 1 &&
          outputStreams.filter(s => outputName(s) === intendedName).length === 1) {
        return Object.freeze({ ...base, status:'filedata-verified',
          evidence:'source-vs-final-mkv-ebml-filedata-sha256-v1',
          message:'最终 MKV 中该附件的名称、MIME 与 FileData SHA-256 已独立核对；UID/引用与实际保存未验证',
          sha256:matched[0].sha256, byteLength:matched[0].byteLength });
      }
      return Object.freeze(base);
    }
    // Absence is verified only within the COMPLETE ffprobe attachment inventory.
    // If another original, renamed or new attachment uses the same name,
    // the removed object's identity is ambiguous and must remain unresolved.
    if (ffprobeStatus === 'pass' &&
        outputStreams.every(s => outputName(s) !== originalName)) {
      return Object.freeze({ ...base, status:'absent-in-probe',
        evidence:'final-mkv-ffprobe-attachment-inventory',
        message:'最终 MKV 的 ffprobe 附件清单未出现原名称；不证明 UID/引用完全保真，也不代表已保存' });
    }
    return Object.freeze(base);
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
