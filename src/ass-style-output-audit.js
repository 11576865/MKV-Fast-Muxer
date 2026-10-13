/**
 * Bounded, independent semantic comparison of the V4+ ASS Style table
 * recovered by demuxing the FINISHED MKV. Not an actual libass rendering
 * or font-resolution check; not Script Info or unknown style extensions.
 */
export const ASS_STYLE_FIELDS = Object.freeze([
  'name', 'fontname', 'fontsize', 'primarycolour', 'secondarycolour',
  'outlinecolour', 'backcolour', 'bold', 'italic', 'underline',
  'strikeout', 'scalex', 'scaley', 'spacing', 'angle', 'borderstyle',
  'outline', 'shadow', 'alignment', 'marginl', 'marginr', 'marginv',
  'encoding',
]);
const COLORS = new Set(['primarycolour', 'secondarycolour', 'outlinecolour', 'backcolour']);
const DECIMALS = new Set(['fontsize', 'scalex', 'scaley', 'spacing', 'angle', 'outline', 'shadow']);
const INTEGERS = new Set([
  'bold', 'italic', 'underline', 'strikeout', 'borderstyle', 'alignment',
  'marginl', 'marginr', 'marginv', 'encoding',
]);

function canonicalValue(key, raw) {
  const value = raw.trim();
  if (COLORS.has(key)) {
    const match = value.match(/^&H([0-9a-f]{1,8})&?$/i);
    if (!match) throw Error('ASS Style 颜色格式不属于已验证范围');
    return '&H' + match[1].toUpperCase().padStart(8, '0');
  }
  if (DECIMALS.has(key)) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
      throw Error('ASS Style 数值格式不属于已验证范围');
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw Error('ASS Style 数值超出可靠范围');
    return String(parsed);
  }
  if (INTEGERS.has(key)) {
    if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw Error('ASS Style 整数字段不可靠');
    }
    return String(Number(value));
  }
  return value;
}

/** Full known ASS V4+ Style field set; unknown columns fail as unavailable. */
export function parseAssV4PlusStyles(text, { maxChars = 2 * 1024 * 1024,
  maxStyles = 512 } = {}) {
  if (typeof text !== 'string' || text.length > maxChars) {
    throw Error('ASS Style 回读文本超过资源预算');
  }
  let active = false;
  let seenSection = false;
  let format = null;
  const records = [];
  const names = new Set();
  for (const rawLine of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      active = section[1].toLowerCase() === 'v4+ styles';
      seenSection ||= active;
      continue;
    }
    if (!active) continue;
    const formatRow = line.match(/^Format\s*:\s*(.*)$/i);
    if (formatRow) {
      if (format) throw Error('ASS Style 存在多重 Format 声明');
      const columns = formatRow[1].split(',').map(x => x.trim().toLowerCase());
      if (columns.length !== ASS_STYLE_FIELDS.length ||
          new Set(columns).size !== columns.length ||
          ASS_STYLE_FIELDS.some(name => !columns.includes(name))) {
        throw Error('ASS Style Format 包含缺失或未知字段');
      }
      format = columns;
      continue;
    }
    const styleRow = rawLine.match(/^\s*Style\s*:\s*(.*)$/i);
    if (!styleRow) continue;
    if (!format) throw Error('ASS Style 没有有效 Format');
    if (records.length >= maxStyles) throw Error('ASS Style 数量超过回读预算');
    const fields = styleRow[1].split(',');
    if (fields.length !== format.length) throw Error('ASS Style 字段数量与 Format 不一致');
    const row = Object.freeze(Object.fromEntries(ASS_STYLE_FIELDS.map(key => [
      key, canonicalValue(key, fields[format.indexOf(key)]),
    ])));
    const id = row.name.toLocaleLowerCase('en-US');
    if (!row.name || names.has(id)) throw Error('ASS Style 存在空名称或重复名称');
    names.add(id);
    records.push(row);
  }
  if (!seenSection || !format || records.length === 0) {
    throw Error('ASS V4+ Style 数据不可用');
  }
  return Object.freeze(records);
}

export function compareAssV4PlusStyles(source, recovered) {
  const expected = parseAssV4PlusStyles(source);
  const actual = parseAssV4PlusStyles(recovered);
  if (expected.length !== actual.length) {
    return { ok: false, styleCount: expected.length, field: 'count', styleIndex: -1 };
  }
  for (let index = 0; index < expected.length; index++) {
    for (const field of ASS_STYLE_FIELDS) {
      if (expected[index][field] !== actual[index][field]) {
        // Do not disclose user-authored font names or style contents.
        return { ok: false, styleCount: expected.length, field, styleIndex: index };
      }
    }
  }
  return { ok: true, styleCount: expected.length, field: '', styleIndex: -1 };
}

/** Output ordinals identify *actual* subtitle streams (not source files). */
export async function auditProducedAssStyles({
  claims = [], outputProbe = null, outputBytes = 0, readFinalAss,
  maxOutputBytes = 512 * 1024 * 1024, maxClaims = 8,
} = {}) {
  const requested = Array.from(claims || []).filter(x => x?.formatId === 'ass');
  const make = (status, verified, styleRecords, issues) => Object.freeze({
    status, verified, total: requested.length, styleRecords,
    issues: Object.freeze([...issues]),
    evidence: 'finished-mkv-demux-ass-v4plus-styles-v1',
    scope: 'new-ass-known-v4plus-style-fields-only',
    eventsVerified: false, fontRenderingVerified: false, playerVerified: false,
  });
  if (!requested.length) return make('not-requested', 0, 0, []);
  if (requested.length > maxClaims || typeof readFinalAss !== 'function' ||
      !Number.isSafeInteger(outputBytes) || outputBytes < 1 ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 ||
      outputBytes > maxOutputBytes || !Array.isArray(outputProbe?.streams)) {
    return make('unavailable', 0, 0, ['最终成品或 ASS 样式回读预算不可用']);
  }
  const streams = outputProbe.streams.filter(s => s.codec_type === 'subtitle');
  const used = new Set();
  let verified = 0;
  let styleRecords = 0;
  const warnings = [];
  const unknown = [];
  for (const claim of requested) {
    const ordinal = claim?.ordinal;
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 ||
        used.has(ordinal) || typeof claim.outputText !== 'string' ||
        !claim.outputText) {
      return make('unavailable', verified, styleRecords, ['ASS 样式回读轨道身份不可靠']);
    }
    used.add(ordinal);
    if (streams[ordinal]?.codec_name !== 'ass') {
      warnings.push('ASS“' + String(claim.name || '') + '”的输出轨缺失或并非 ASS');
      continue;
    }
    try {
      const comparison = compareAssV4PlusStyles(claim.outputText, await readFinalAss(ordinal));
      if (!comparison.ok) {
        warnings.push('ASS“' + String(claim.name || '') +
          '”的 Style #' + (comparison.styleIndex + 1) +
          ' 中 ' + comparison.field + ' 字段或样式数不一致');
        continue;
      }
      verified++;
      styleRecords += comparison.styleCount;
    } catch (error) {
      unknown.push('ASS“' + String(claim.name || '') + '”的样式核验不可用：' +
        String(error?.message || '未知格式'));
    }
  }
  // A proved mismatch takes precedence over an unavailable parallel track.
  if (warnings.length) return make('warning', verified, styleRecords, [...warnings, ...unknown]);
  if (unknown.length) return make('unavailable', verified, styleRecords, unknown);
  return make('pass', verified, styleRecords, []);
}
