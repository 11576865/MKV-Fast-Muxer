/** Bounded plain-text cue evidence, never WebVTT layout/render equivalence. */
function milliseconds(value, vtt) {
  const pattern = vtt ? /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/
    : /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/;
  const match = value.match(pattern);
  if (!match) throw new Error('字幕时间不在受支持的毫秒格式范围内');
  const result = ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  if (!Number.isSafeInteger(result)) throw new Error('字幕时间超出安全整数范围');
  return result;
}

export function parsePlainSubtitleCues(text, formatId, {
  maxChars = 2 * 1024 * 1024, maxCues = 50000,
} = {}) {
  if (!['srt', 'webvtt'].includes(formatId) || typeof text !== 'string' || text.length > maxChars) {
    throw new Error('字幕格式或内容超出纯文本回读范围');
  }
  const vtt = formatId === 'webvtt';
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.replace(/\n+$/, '').split(/\n{2,}/);
  if (vtt && blocks.shift() !== 'WEBVTT') {
    throw new Error('WebVTT 头部或时间映射不在当前回读范围内');
  }
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (!lines[0]?.includes('-->')) {
      const identifier = lines.shift();
      if ((!vtt && !/^\d+$/.test(identifier || '')) ||
          (vtt && /^(NOTE|STYLE|REGION)(\s|$)/.test(identifier || ''))) {
        throw new Error('字幕标识或 WebVTT 样式/区域不在纯文本回读范围内');
      }
    }
    const timing = lines.shift()?.match(/^(\S+) --> (\S+)$/);
    if (!timing || !lines.length || cues.length >= maxCues) {
      throw new Error('字幕时间、内容或条目数量无法完整回读');
    }
    const start = milliseconds(timing[1], vtt);
    const end = milliseconds(timing[2], vtt);
    const payload = lines.join('\n');
    // FFmpeg conversion can discard cue settings, inline timestamps, entities
    // and styling. Never call those cases equivalent from plain text alone.
    if (end <= start || /[<>&\u0000]/.test(payload) || /\{\\/.test(payload)) {
      throw new Error('字幕区间或带标记文本不在纯文本等价范围内');
    }
    cues.push(Object.freeze({ start, end, text: payload }));
  }
  if (!cues.length) throw new Error('字幕没有可核对的条目');
  return Object.freeze(cues);
}

export async function auditProducedSubripCues({
  claims = [], outputProbe = null, outputBytes = 0, readFinalSrt,
  maxOutputBytes = 512 * 1024 * 1024, maxClaims = 8,
} = {}) {
  const requested = Array.from(claims || []).filter(x => ['srt', 'webvtt'].includes(x?.formatId));
  const make = (status, verified, issues, observations = []) => Object.freeze({
    status, verified, total: requested.length,
    issues: Object.freeze(issues), observations: Object.freeze(observations),
    evidence: 'finished-mkv-demux-subrip-plain-cues-v1',
    scope: 'new-plain-text-subrip-cue-text-millisecond-times-and-order',
    presentationVerified: false, playerVerified: false,
  });
  if (!requested.length) return make('not-requested', 0, []);
  if (requested.length > maxClaims || typeof readFinalSrt !== 'function' ||
      !Number.isSafeInteger(outputBytes) || outputBytes < 1 ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 ||
      outputBytes > maxOutputBytes || !Array.isArray(outputProbe?.streams)) {
    return make('unavailable', 0, ['成品 SubRip 回读或资源预算不可用']);
  }
  const used = new Set();
  if (requested.some(claim => {
    if (!Number.isSafeInteger(claim.ordinal) || claim.ordinal < 0 || used.has(claim.ordinal)) return true;
    used.add(claim.ordinal);
    return false;
  })) return make('unavailable', 0, ['字幕成品轨身份不可靠']);
  const subtitles = outputProbe.streams.filter(x => x.codec_type === 'subtitle');
  const issues = [], observations = [];
  let verified = 0, unavailable = false;
  for (const claim of requested) {
    const label = String(claim.name || '');
    if (subtitles[claim.ordinal]?.codec_name !== 'subrip') {
      issues.push('字幕“' + label + '”的成品轨道缺失或不是 SubRip');
      continue;
    }
    try {
      const wanted = parsePlainSubtitleCues(claim.outputText, claim.formatId);
      const actual = parsePlainSubtitleCues(await readFinalSrt(claim.ordinal), 'srt');
      if (JSON.stringify(wanted) !== JSON.stringify(actual)) {
        issues.push('字幕“' + label + '”成品条目的时间、文本、数量或顺序存在差异');
        continue;
      }
      verified++;
      observations.push(Object.freeze({ name: label, ordinal: claim.ordinal,
        sourceFormat: claim.formatId, outputFormat: 'subrip', cues: wanted.length }));
    } catch {
      unavailable = true;
      issues.push('字幕“' + label + '”纯文本回读未完成（解析、带标记格式或执行限制）');
    }
  }
  // A concrete mismatch takes precedence over an unrelated unavailable claim.
  const mismatch = issues.length > 0 && issues.some(x => !x.includes('回读未完成'));
  return make(mismatch ? 'warning' : unavailable ? 'unavailable' : 'pass', verified, issues, observations);
}
