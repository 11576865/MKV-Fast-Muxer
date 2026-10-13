import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';

/**
 * Checks only NEW font attachments against the exact bytes submitted to
 * FFmpeg's in-memory FS. Existing source attachments and arbitrary EBML
 * structure are intentionally outside this audit.
 */
export async function auditProducedFontAttachments(output, stagedFonts, {
  maxPerFontBytes = 32 * 1024 * 1024,
  maxTotalBytes = 64 * 1024 * 1024,
} = {}) {
  const expected = Array.from(stagedFonts || []);
  if (!expected.length) {
    return Object.freeze({ status: 'not-requested', verified: 0, total: 0,
      issues: Object.freeze([]), evidence: 'no-new-font-attachments' });
  }
  const failure = (status, issues, verified = 0) => Object.freeze({
    status, verified, total: expected.length,
    issues: Object.freeze(issues.map(String)),
    evidence: 'bounded-output-ebml-filedata-sha256-v1',
  });
  try {
    if (!output?.slice || !Number.isSafeInteger(output.size)) {
      return failure('unavailable', ['输出 MKV 字节对象不可读取']);
    }
    let total = 0;
    const names = new Set();
    for (const item of expected) {
      if (!item?.filename || !/^[a-f0-9]{64}$/i.test(item.sha256 || '') ||
          !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1 ||
          item.sizeBytes > maxPerFontBytes) {
        return failure('unavailable', ['待验证字体附件超出受支持的校验范围']);
      }
      if (names.has(item.filename)) {
        return failure('warning', ['新字体附件文件名发生重复，无法唯一绑定校验对象']);
      }
      names.add(item.filename);
      total += item.sizeBytes;
      if (total > maxTotalBytes) {
        return failure('unavailable', ['新字体附件累计字节数超出校验预算']);
      }
    }
    const reader = createMatroskaAttachmentReader(output);
    const inventory = await reader.inspect();
    if (inventory.state !== 'inspected') {
      return failure('unavailable', ['输出 EBML 附件结构未能独立读取：' +
        (inventory.diagnostic?.code || '未知原因')]);
    }
    const issues = [];
    let verified = 0;
    for (const wanted of expected) {
      const found = inventory.attachments.filter(item => item.filename === wanted.filename);
      if (found.length !== 1) {
        issues.push('新字体“' + wanted.filename + '”的实际附件数量为 ' + found.length + '（预期 1）');
        continue;
      }
      if (found[0].byteLength !== wanted.sizeBytes) {
        issues.push('新字体“' + wanted.filename + '”的实际字节数与已封装输入不符');
        continue;
      }
      if (wanted.mimeType && found[0].mimeType.toLowerCase() !== wanted.mimeType.toLowerCase()) {
        issues.push('新字体“' + wanted.filename + '”的实际 MIME 声明与计划不一致');
        continue;
      }
      const data = await reader.openAttachment(found[0].id).data.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      const hash = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== wanted.sha256.toLowerCase()) {
        issues.push('新字体“' + wanted.filename + '”在成品中的 SHA-256 与封装输入不一致');
      } else {
        verified++;
      }
    }
    return failure(issues.length ? 'warning' : 'pass', issues, verified);
  } catch (error) {
    return failure('unavailable', ['无法完成成品附件字节核验：' +
      (error?.message || String(error))]);
  }
}
