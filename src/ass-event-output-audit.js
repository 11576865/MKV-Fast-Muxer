/**
 * Independent, bounded verification of NEW ASS Dialogue events recovered from
 * the FINISHED MKV. This intentionally does not assert Style/extradata, font
 * resolution, libass rendering, source MKV UID preservation, or player support.
 * The caller supplies an actual output-track demuxer, not a planned file.
 */
const REQUIRED = Object.freeze([
  'layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr',
  'marginv', 'effect', 'text',
]);
const NUMERIC = new Set(['layer', 'marginl', 'marginr', 'marginv']);

function centiseconds(value) {
  const match = String(value || '').trim().match(/^(\d+):([0-5]\d):([0-5]\d)\.(\d{1,3})$/);
  if (!match) throw new Error('不支持的 ASS 事件时间格式');
  const fraction = match[4].padEnd(3, '0');
  const ms = Number(fraction);
  if (ms % 10 !== 0) throw new Error('ASS 事件时间不是可持久化的厘秒');
  return String((Number(match[1]) * 3600 + Number(match[2]) * 60 +
    Number(match[3])) * 100 + ms / 10);
}

function fieldsOf(payload, length) {
  const fields = [];
  let start = 0;
  for (let i = 0; i < length - 1; i++) {
    const next = payload.indexOf(',', start);
    if (next < 0) throw new Error('ASS Dialogue 字段少于 Format 定义');
    fields.push(payload.slice(start, next));
    start = next + 1;
  }
  fields.push(payload.slice(start));
  return fields;
}

/** Returns a strictly ordered event sequence, preserving duplicate events. */
export function parseAssDialogueEvents(text, { maxChars = 2 * 1024 * 1024,
  maxEvents = 50000 } = {}) {
  if (typeof text !== 'string' || text.length > maxChars) {
    throw new Error('ASS 字幕内容超过事件回读校验预算');
  }
  let section = '';
  let format = null;
  const events = [];
  for (const rawLine of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (/^\[[^\]]+\]$/.test(line)) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }
    if (section !== 'events') continue;
    const formatMatch = line.match(/^Format\s*:\s*(.*)$/i);
    if (formatMatch) {
      const names = formatMatch[1].split(',').map(x => x.trim().toLowerCase());
      if (names.length !== REQUIRED.length || names.some((name, i) =>
        !REQUIRED.includes(name) || names.indexOf(name) !== i) ||
        names[names.length - 1] !== 'text') {
        throw new Error('ASS 事件 Format 不在当前无损回读比较范围内');
      }
      format = names;
      continue;
    }
    const dialogue = rawLine.match(/^\s*Dialogue\s*:\s*(.*)$/i);
    if (!dialogue) continue;
    if (!format) throw new Error('ASS Dialogue 没有可用的 Format 定义');
    if (events.length >= maxEvents) throw new Error('ASS 事件数量超出回读校验预算');
    const data = fieldsOf(dialogue[1], format.length);
    const canonical = REQUIRED.map(name => {
      const value = data[format.indexOf(name)];
      if (name === 'text') return value;
      if (name === 'start' || name === 'end') return centiseconds(value);
      if (NUMERIC.has(name)) {
        const trimmed = value.trim();
        if (!/^-?\d+$/.test(trimmed)) throw new Error('ASS 整数字段无效');
        return String(Number(trimmed));
      }
      return value.trim();
    });
    events.push(JSON.stringify(canonical));
  }
  if (!format) throw new Error('ASS 文件缺少事件 Format');
  return Object.freeze(events);
}

/**
 * Claims are emitted in actual output subtitle-track order. Each claim is:
 * { name, formatId, ordinal, outputText }. Only .ass is currently comparable.
 * readFinalAss(ordinal) MUST demux from the finished output, not read a source.
 */
export async function auditProducedAssEvents({
  claims = [], outputProbe = null, outputBytes = 0, readFinalAss,
  maxOutputBytes = 512 * 1024 * 1024, maxClaims = 8,
} = {}) {
  const requested = Array.from(claims || []).filter(x => x?.formatId === 'ass');
  const evidence = 'finished-mkv-demux-ass-dialogue-sequence-v1';
  const make = (status, verified, issues, observations = []) => Object.freeze({
    status, verified, total: requested.length, issues: Object.freeze(issues.map(String)),
    observations: Object.freeze(observations), evidence,
    scope: 'new-ass-dialogue-events-and-order-only',
    stylesVerified: false, fontRenderingVerified: false, playerVerified: false,
  });
  if (!requested.length) return make('not-requested', 0, []);
  if (requested.length > maxClaims || typeof readFinalAss !== 'function' ||
      !Number.isSafeInteger(outputBytes) || outputBytes < 1 ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 ||
      outputBytes > maxOutputBytes || !Array.isArray(outputProbe?.streams)) {
    return make('unavailable', 0, ['最终成品或 ASS 回读资源预算不可用']);
  }
  const subtitles = outputProbe.streams.filter(x => x.codec_type === 'subtitle');
  const issues = [];
  const observations = [];
  let verified = 0;
  const used = new Set();
  for (const claim of requested) {
    if (!Number.isSafeInteger(claim.ordinal) || claim.ordinal < 0 ||
        used.has(claim.ordinal) || !claim.outputText) {
      return make('unavailable', verified, ['ASS 输出轨身份或待写入文本不可靠'], observations);
    }
    used.add(claim.ordinal);
    const actual = subtitles[claim.ordinal];
    if (!actual || actual.codec_name !== 'ass') {
      issues.push('ASS“' + (claim.name || '') + '”最终轨道缺失或不是 ASS');
      continue;
    }
    try {
      const source = parseAssDialogueEvents(claim.outputText);
      const recovered = parseAssDialogueEvents(await readFinalAss(claim.ordinal));
      if (source.length !== recovered.length ||
          source.some((item, index) => item !== recovered[index])) {
        issues.push('ASS“' + (claim.name || '') +
          '”的最终 Dialogue 事件、时间、顺序或覆盖标签与待封装文本不同');
        continue;
      }
      verified++;
      observations.push(Object.freeze({
        name: String(claim.name || ''), ordinal: claim.ordinal,
        dialogueEvents: source.length,
      }));
    } catch (error) {
      return make('unavailable', verified,
        ['ASS 最终回读无法完成：' + (error?.message || String(error))], observations);
    }
  }
  return make(issues.length ? 'warning' : 'pass', verified, issues, observations);
}
