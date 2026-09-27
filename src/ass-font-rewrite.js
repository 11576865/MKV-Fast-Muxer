// Read the OpenType `name` table in the browser. For ASS, the family name is
// the name libass/fontconfig should resolve after the font is attached.
export async function readFontFamily(file) {
  const view = new DataView(await file.arrayBuffer());
  validateSfnt(view);
  const table = findTable(view, 'name');
  if (!table || table.offset + 6 > view.byteLength) {
    throw new Error('字体缺少可读取的内部名称');
  }

  const { offset, length } = table;
  if (offset + length > view.byteLength) throw new Error('字体 name 表损坏');

  const count = view.getUint16(offset + 2, false);
  const strings = offset + view.getUint16(offset + 4, false);
  const found = new Map();

  for (let i = 0; i < count; i++) {
    const p = offset + 6 + i * 12;
    if (p + 12 > view.byteLength) break;
    const platform = view.getUint16(p, false);
    const language = view.getUint16(p + 4, false);
    const nameId = view.getUint16(p + 6, false);
    const bytes = view.getUint16(p + 8, false);
    const relative = view.getUint16(p + 10, false);
    const start = strings + relative;
    if (start + bytes > view.byteLength || ![1, 4, 6, 16].includes(nameId)) continue;

    const text = decodeName(view, start, bytes, platform).trim();
    if (!text) continue;

    const score = (platform === 3 ? 10 : 0) + ([0x0409, 0x0804, 0x0404].includes(language) ? 2 : 0);
    const old = found.get(nameId);
    if (!old || score > old.score) found.set(nameId, { text, score });
  }

  const family = found.get(16)?.text || found.get(1)?.text || found.get(4)?.text || found.get(6)?.text;
  if (!family) throw new Error('字体缺少 Family Name / Full Name');
  return family;
}

// Check the uploaded font's Unicode cmap against visible ASS dialogue text.
// This is advisory only: shaping, variation selectors and fallback behavior are
// renderer-dependent, so a "covered" result is not a rendering guarantee.
export async function checkFontCoverage(file, assText) {
  const view = new DataView(await file.arrayBuffer());
  validateSfnt(view);
  const cmap = findTable(view, 'cmap');
  if (!cmap || cmap.offset + 4 > view.byteLength) {
    throw new Error('字体缺少 Unicode cmap，无法检查缺字');
  }

  const checkers = readUnicodeCmapCheckers(view, cmap.offset, cmap.length);
  if (!checkers.length) {
    throw new Error('字体没有可识别的 Unicode cmap（仅支持常见 format 4 / 12）');
  }

  const characters = extractAssCharacters(assText);
  const missing = [];

  for (const char of characters) {
    const codePoint = char.codePointAt(0);
    if (!checkers.some((hasGlyph) => hasGlyph(codePoint))) {
      missing.push(char);
    }
  }

  return {
    checkedCount: characters.length,
    missing,
  };
}

// The muxer accepts one explicit uploaded font, therefore leaving a different
// ASS font request would silently cause fallback. Rewrite styles and inline \fn.
export function forceAssFontFamily(text, family) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let styleFormat = [];
  let eventFormat = [];

  return lines.map(raw => {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      return raw;
    }

    if (section === 'v4+ styles' || section === 'v4 styles') {
      if (/^\s*Format\s*:/i.test(raw)) {
        styleFormat = fieldsAfterColon(raw).split(',').map(x => x.trim().toLowerCase());
      } else if (/^\s*Style\s*:/i.test(raw) && styleFormat.length) {
        const values = splitAssFields(fieldsAfterColon(raw), styleFormat.length);
        const index = styleFormat.indexOf('fontname');
        if (index >= 0) values[index] = family;
        return raw.slice(0, raw.indexOf(':') + 1) + ' ' + values.join(',');
      }
    } else if (section === 'events') {
      if (/^\s*Format\s*:/i.test(raw)) {
        eventFormat = fieldsAfterColon(raw).split(',').map(x => x.trim().toLowerCase());
      } else if (/^\s*(Dialogue|Comment)\s*:/i.test(raw) && eventFormat.length) {
        const values = splitAssFields(fieldsAfterColon(raw), eventFormat.length);
        const index = eventFormat.indexOf('text');
        if (index >= 0) values[index] = values[index].replace(/\\fn([^\\}]+)/gi, `\\fn${family}`);
        return raw.slice(0, raw.indexOf(':') + 1) + ' ' + values.join(',');
      }
    }

    return raw;
  }).join('\n');
}

function validateSfnt(view) {
  if (view.byteLength < 12) throw new Error('字体文件过小');
  const tag = readTag(view, 0);
  const signature = view.getUint32(0, false);
  if (!(signature === 0x00010000 || tag === 'OTTO' || tag === 'true' || tag === 'typ1')) {
    throw new Error('字体不是有效的 TTF 或 OTF 文件');
  }
}

function findTable(view, wantedTag) {
  const tableCount = view.getUint16(4, false);
  for (let i = 0; i < tableCount; i++) {
    const p = 12 + i * 16;
    if (p + 16 > view.byteLength) break;
    if (readTag(view, p) !== wantedTag) continue;

    const offset = view.getUint32(p + 8, false);
    const length = view.getUint32(p + 12, false);
    if (offset + length > view.byteLength) return null;
    return { offset, length };
  }
  return null;
}

function readUnicodeCmapCheckers(view, cmapOffset, cmapLength) {
  const end = cmapOffset + cmapLength;
  const count = view.getUint16(cmapOffset + 2, false);
  const subtables = [];

  for (let i = 0; i < count; i++) {
    const p = cmapOffset + 4 + i * 8;
    if (p + 8 > end) break;

    const platform = view.getUint16(p, false);
    const encoding = view.getUint16(p + 2, false);
    const relative = view.getUint32(p + 4, false);
    const offset = cmapOffset + relative;
    if (offset + 2 > end) continue;

    const isUnicode = platform === 0 || (platform === 3 && [1, 10].includes(encoding));
    if (!isUnicode) continue;

    const format = view.getUint16(offset, false);
    if (format === 12 && offset + 16 <= end) {
      subtables.push({ priority: 20, checker: makeFormat12Checker(view, offset, end) });
    } else if (format === 4 && offset + 14 <= end) {
      subtables.push({ priority: 10, checker: makeFormat4Checker(view, offset, end) });
    }
  }

  return subtables
    .filter(item => item.checker)
    .sort((a, b) => b.priority - a.priority)
    .map(item => item.checker);
}

function makeFormat12Checker(view, offset, cmapEnd) {
  const length = view.getUint32(offset + 4, false);
  const tableEnd = Math.min(cmapEnd, offset + length);
  const groups = view.getUint32(offset + 12, false);
  const groupStart = offset + 16;
  if (groupStart + groups * 12 > tableEnd) return null;

  return (codePoint) => {
    let lo = 0;
    let hi = groups - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = groupStart + mid * 12;
      const start = view.getUint32(p, false);
      const end = view.getUint32(p + 4, false);

      if (codePoint < start) hi = mid - 1;
      else if (codePoint > end) lo = mid + 1;
      else {
        const startGlyph = view.getUint32(p + 8, false);
        return startGlyph + (codePoint - start) !== 0;
      }
    }

    return false;
  };
}

function makeFormat4Checker(view, offset, cmapEnd) {
  const length = view.getUint16(offset + 2, false);
  const tableEnd = Math.min(cmapEnd, offset + length);
  const segCount = view.getUint16(offset + 6, false) / 2;
  if (!Number.isInteger(segCount) || segCount <= 0) return null;

  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  if (idRangeOffsets + segCount * 2 > tableEnd) return null;

  return (codePoint) => {
    if (codePoint > 0xffff) return false;

    for (let i = 0; i < segCount; i++) {
      const end = view.getUint16(endCodes + i * 2, false);
      if (codePoint > end) continue;

      const start = view.getUint16(startCodes + i * 2, false);
      if (codePoint < start) return false;

      const delta = view.getInt16(idDeltas + i * 2, false);
      const rangeWord = idRangeOffsets + i * 2;
      const rangeOffset = view.getUint16(rangeWord, false);

      if (rangeOffset === 0) {
        return ((codePoint + delta) & 0xffff) !== 0;
      }

      const glyphAddress = rangeWord + rangeOffset + 2 * (codePoint - start);
      if (glyphAddress + 2 > tableEnd) return false;

      const glyph = view.getUint16(glyphAddress, false);
      if (glyph === 0) return false;
      return ((glyph + delta) & 0xffff) !== 0;
    }

    return false;
  };
}

function extractAssCharacters(text) {
  const lines = text.split(/\r?\n/);
  let section = '';
  let eventFormat = [];
  const chars = new Set();

  for (const raw of lines) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }
    if (section !== 'events') continue;

    if (/^\s*Format\s*:/i.test(raw)) {
      eventFormat = fieldsAfterColon(raw).split(',').map(x => x.trim().toLowerCase());
      continue;
    }
    if (!/^\s*Dialogue\s*:/i.test(raw) || !eventFormat.length) continue;

    const values = splitAssFields(fieldsAfterColon(raw), eventFormat.length);
    const index = eventFormat.indexOf('text');
    if (index < 0 || index >= values.length) continue;

    const visible = values[index]
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ');

    for (const char of visible) {
      if (/\s/u.test(char)) continue;
      const codePoint = char.codePointAt(0);
      if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) continue;
      chars.add(char);
    }
  }

  return [...chars];
}

function fieldsAfterColon(line) {
  return line.slice(line.indexOf(':') + 1);
}

function splitAssFields(value, count) {
  const items = value.split(',');
  if (items.length <= count) return items;
  return [...items.slice(0, count - 1), items.slice(count - 1).join(',')];
}

function readTag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function decodeName(view, start, length, platform) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
  if (platform === 0 || platform === 3) {
    let value = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      value += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return value.replace(/\u0000/g, '');
  }
  return new TextDecoder('latin1').decode(bytes);
}
