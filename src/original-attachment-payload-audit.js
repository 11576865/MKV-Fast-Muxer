import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';

export const ATTACHMENT_HASH_EVIDENCE = 'source-vs-final-mkv-ebml-filedata-sha256-v1';
export const ATTACHMENT_BYTE_COMPARE_EVIDENCE = 'source-vs-final-mkv-ebml-filedata-byte-compare-v2';

// Read only bounded chunks from each Blob; no incremental SHA-256 is claimed.
// Byte-for-byte equality covers the full FileData byte range when completed.
async function compareAttachmentBlobs(sourceBlob, targetBlob, chunkBytes) {
  if (sourceBlob.size !== targetBlob.size) return false;
  for (let offset = 0; offset < sourceBlob.size; offset += chunkBytes) {
    const end = Math.min(offset + chunkBytes, sourceBlob.size);
    const [a, b] = await Promise.all([
      sourceBlob.slice(offset, end).arrayBuffer(),
      targetBlob.slice(offset, end).arrayBuffer(),
    ]);
    const left = new Uint8Array(a), right = new Uint8Array(b);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}


/**
 * Independently compare the exact FileData bytes of ORIGINAL Matroska
 * attachments selected for preservation with those in the final output.
 * This does not certify FileUID, TagAttachmentUID, chapter/linkage, unknown
 * EBML, or external playback. All nonconclusive checks fail as "unavailable"
 * or "warning", never "pass".
 *
 * `expected` contains sourceFilename and outputFilename (which may be
 * renamed by the user's existing-track inspector) and optional MIME types.
 */
export async function auditPreservedOriginalAttachmentData(source, output, expected, {
  maxFileBytes = 32 * 1024 * 1024,
  maxTotalBytes = 64 * 1024 * 1024,
  // Opt-in budget for genuinely large original FileData. This performs a
  // complete bytewise comparison, not a cryptographic hash or UID proof.
  chunkCompare = null,
} = {}) {
  const claims = Array.from(expected || []);
  const compareEnabled = chunkCompare != null;
  const compareLimitsValid = !compareEnabled || (
    Number.isSafeInteger(chunkCompare.maxFileBytes) && chunkCompare.maxFileBytes > 0 &&
    Number.isSafeInteger(chunkCompare.maxTotalBytes) && chunkCompare.maxTotalBytes > 0 &&
    Number.isSafeInteger(chunkCompare.chunkBytes) &&
    chunkCompare.chunkBytes >= 4096 && chunkCompare.chunkBytes <= 4 * 1024 * 1024
  );
  const result = (status, checked, issues, observations = []) => Object.freeze({
    status, verified: checked, total: claims.length,
    issues: Object.freeze(issues.map(String)),
    observations: Object.freeze(observations),
    evidence: observations.some(item => item.proofMethod === 'exact-byte-compare')
      ? ATTACHMENT_BYTE_COMPARE_EVIDENCE : ATTACHMENT_HASH_EVIDENCE,
    uidRelationsVerified: false,
    scope: 'original-attachment-filedata-only',
  });
  if (!claims.length) return result('not-requested', 0, []);
  if (!source?.slice || !output?.slice ||
      !Number.isSafeInteger(source.size) || !Number.isSafeInteger(output.size) ||
      !Number.isSafeInteger(maxFileBytes) || !Number.isSafeInteger(maxTotalBytes) ||
      maxFileBytes < 1 || maxTotalBytes < 1 || !compareLimitsValid) {
    return result('unavailable', 0, ['来源、成品或附件字节读取预算不可用']);
  }
  try {
    const sourceReader = createMatroskaAttachmentReader(source);
    const outputReader = createMatroskaAttachmentReader(output);
    const [before, after] = await Promise.all([
      sourceReader.inspect(), outputReader.inspect(),
    ]);
    if (before.state !== 'inspected' || after.state !== 'inspected') {
      return result('unavailable', 0, [
        '源或目标 MKV 附件 EBML 库存无法独立检查：' +
        [before.diagnostic?.code, after.diagnostic?.code].filter(Boolean).join(' / '),
      ]);
    }
    // Check the entire claimed budget before reading any large FileData.
    const matched = [];
    const issues = [];
    let shaBytes = 0;
    let comparedBytes = 0;
    for (const item of claims) {
      const sourceName = String(item?.sourceFilename || '');
      const outputName = String(item?.outputFilename || sourceName);
      if (!sourceName || !outputName) {
        return result('unavailable', 0, ['原附件缺少可靠的源名称或目标名称']);
      }
      const src = before.attachments.filter(x => x.filename === sourceName);
      const dst = after.attachments.filter(x => x.filename === outputName);
      if (src.length !== 1 || dst.length !== 1) {
        issues.push('原附件“' + sourceName + '”无法唯一对应最终成品中的“' +
          outputName + '”（来源 ' + src.length + ' 项，成品 ' + dst.length + ' 项）');
        continue;
      }
      const a = src[0], b = dst[0];
      if (a.byteLength !== b.byteLength) {
        issues.push('原附件“' + sourceName + '”的 FileData 长度发生变化');
        continue;
      }
      const sourceMime = String(item.sourceMimeType || '').toLowerCase();
      const outputMime = String(item.outputMimeType || '').toLowerCase();
      if ((sourceMime && a.mimeType.toLowerCase() !== sourceMime) ||
          (outputMime && b.mimeType.toLowerCase() !== outputMime) ||
          (!outputMime && a.mimeType.toLowerCase() !== b.mimeType.toLowerCase())) {
        issues.push('原附件“' + sourceName + '”的 MIME 声明与来源或目标预期不符');
        continue;
      }
      if (a.byteLength < 1) {
        return result('unavailable', 0, ['原附件 FileData 为空，未建立非空核验依据']);
      }
      let proofMethod = '';
      if (a.byteLength <= maxFileBytes && shaBytes + a.byteLength <= maxTotalBytes) {
        proofMethod = 'sha256';
        shaBytes += a.byteLength;
      } else if (compareEnabled &&
        a.byteLength <= chunkCompare.maxFileBytes &&
        comparedBytes + a.byteLength <= chunkCompare.maxTotalBytes) {
        proofMethod = 'exact-byte-compare';
        comparedBytes += a.byteLength;
      } else {
        return result('unavailable', 0, [
          '原附件文件大小或累计 FileData 字节超出独立核验预算',
        ]);
      }
      matched.push({ a, b, sourceName, outputName, proofMethod });
    }
    let verified = 0;
    const observations = [];
    for (const { a, b, sourceName, outputName, proofMethod } of matched) {
      const sourceBlob = sourceReader.openAttachment(a.id).data;
      const targetBlob = outputReader.openAttachment(b.id).data;
      let sha256 = null;
      if (proofMethod === 'sha256') {
        const [src, dst] = await Promise.all([
          sourceBlob.arrayBuffer(), targetBlob.arrayBuffer(),
        ]);
        const [sourceDigest, outputDigest] = await Promise.all([
          crypto.subtle.digest('SHA-256', src),
          crypto.subtle.digest('SHA-256', dst),
        ]);
        const toHex = buf => Array.from(new Uint8Array(buf),
          n => n.toString(16).padStart(2, '0')).join('');
        sha256 = toHex(sourceDigest);
        if (sha256 !== toHex(outputDigest)) {
          issues.push('原附件“' + sourceName + '”的实际 FileData SHA-256 与输出不一致');
          continue;
        }
      } else if (!await compareAttachmentBlobs(sourceBlob, targetBlob, chunkCompare.chunkBytes)) {
        issues.push('原附件“' + sourceName + '”的实际 FileData 分块逐字节比较不一致');
        continue;
      }
      verified++;
      observations.push(Object.freeze({
        sourceFilename: sourceName, outputFilename: outputName,
        sha256, proofMethod, byteLength: a.byteLength,
        comparedBytes: proofMethod === 'exact-byte-compare' ? a.byteLength : null,
        uidRetained: a.fileUid === b.fileUid,
      }));
    }
    return result(issues.length ? 'warning' : 'pass',
      verified, issues, observations);
  } catch (error) {
    return result('unavailable', 0, [
      '原附件成品字节核验未完成：' + (error?.message || String(error)),
    ]);
  }
}
