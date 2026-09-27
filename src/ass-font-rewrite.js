// ASS font helpers: OpenType name/cmap parsing, font dependency analysis,
// forced-font rewriting, and glyph coverage checks.

export async function readFontDescriptor(file) {
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
  const best = new Map();
  const aliases = new Set();

  for (let i = 0; i < count; i++) {
    const p = offset + 6 + i * 12;
    if (p + 12 > view.byteLength) break;

    const platform = view.getUint16(p, false);
    const language = view.getUint16(p + 4, false);
    const nameId = view.getUint16(p + 6, false);
    const bytes = view.getUint16(p + 8, false);
    const relative = view.getUint16(p + 10, false);
    const start = strings + relative;

    if (start + bytes > view.byteLength || ![1, 2, 4, 6, 16, 17].includes(nameId)) continue;

    const text = decodeName(view, start, bytes, platform).trim();
    if (!text) continue;

    if ([1, 4, 6, 16].includes(nameId)) aliases.add(text);

    const score =
      (platform === 3 ? 10 : platform === 0 ? 8 : 0) +
      ([0x0409, 0x0804, 0x0404, 0x0411, 0x0412].includes(language) ? 2 : 0);

    const old = best.get(nameId);
    if (!old || score > old.score) best.set(nameId, { text, score });
  }

  const family = best.get(16)?.text || best.get(1)?.text || best.get(4)?.text || best.get(6)?.text;
  if (!family) throw new Error('字体缺少 Family Name / Full Name');

  aliases.add(family);

  return {
    family,
    subfamily: best.get(17)?.text || best.get(2)?.text || '',
    fullName: best.get(4)?.text || '',
    postScriptName: best.get(6)?.text || '',
    aliases: [...aliases],
  };
}

export async function readFontFamily(file) {
  return (await readFontDescriptor(file)).family;
}

export function fontNameMatches(requestedName, descriptor) {
  const wanted = normalizeFontName(requestedName);
  if (!wanted) return false;
  return descriptor.aliases.some((alias) => normalizeFontName(alias) === wanted);
}

// Analyze fonts actually used by rendered Dialogue events. It understands style
// Fontname, inline \fn, and \r style resets. The result is intentionally
// conservative: unusual transform-driven font changes may be reported as a
// dependency even if they are active only part of the time.
export function analyzeAssFontUsage(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const styles = new Map();
  const declaredFonts = new Map();
  let section = '';
  let styleFormat = [];

  for (const raw of lines) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }

    if (section !== 'v4+ styles' && section !== 'v4 styles') continue;

    if (/^\s*Format\s*:/i.test(raw)) {
      styleFormat = fieldsAfterColon(raw).split(',').map((x) => x.trim().toLowerCase());
      continue;
    }

    if (!/^\s*Style\s*:/i.test(raw)) continue;

    const format = styleFormat.length ? styleFormat : ['name', 'fontname'];
    const values = splitAssFields(fieldsAfterColon(raw), format.length);
    const nameIndex = format.indexOf('name');
    const fontIndex = format.indexOf('fontname');
    if (nameIndex < 0 || fontIndex < 0) continue;

    const styleName = (values[nameIndex] || '').trim();
    const fontName = (values[fontIndex] || '').trim();
    if (!styleName || !fontName) continue;

    styles.set(normalizeStyleName(styleName), { name: styleName, fontName });
    declaredFonts.set(normalizeFontName(fontName), fontName);
  }

  const usage = new Map();
  const allCharacters = new Set();
  section = '';
  let eventFormat = [];

  const ensureUsage = (fontName, source) => {
    const key = normalizeFontName(fontName);
    if (!key) return null;

    let item = usage.get(key);
    if (!item) {
      item = {
        name: fontName.trim(),
        characters: new Set(),
        sources: new Set(),
      };
      usage.set(key, item);
    }
    if (source) item.sources.add(source);
    return item;
  };

  const addVisibleText = (fontName, value, source) => {
    const item = ensureUsage(fontName, source);
    if (!item) return;

    for (const char of decodeAssVisibleText(value)) {
      if (!isMeaningfulCharacter(char)) continue;
      item.characters.add(char);
      allCharacters.add(char);
    }
  };

  for (const raw of lines) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }
    if (section !== 'events') continue;

    if (/^\s*Format\s*:/i.test(raw)) {
      eventFormat = fieldsAfterColon(raw).split(',').map((x) => x.trim().toLowerCase());
      continue;
    }

    if (!/^\s*Dialogue\s*:/i.test(raw)) continue;

    const format = eventFormat.length
      ? eventFormat
      : ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const values = splitAssFields(fieldsAfterColon(raw), format.length);
    const styleIndex = format.indexOf('style');
    const textIndex = format.indexOf('text');
    if (textIndex < 0 || textIndex >= values.length) continue;

    const eventStyleName = styleIndex >= 0 ? (values[styleIndex] || '').trim() : '';
    const baseStyle = styles.get(normalizeStyleName(eventStyleName));
    const baseFont = baseStyle?.fontName || '';
    let currentStyleFont = baseFont;
    let currentFont = baseFont;
    let drawingMode = 0;

    if (baseFont) ensureUsage(baseFont, `style:${eventStyleName || baseStyle?.name || 'Default'}`);

    const pieces = values[textIndex].split(/(\{[^}]*\})/g);
    for (const piece of pieces) {
      if (!piece) continue;

      if (piece.startsWith('{') && piece.endsWith('}')) {
        const tags = piece.slice(1, -1);
        const tagRegex = /\\(fn|r|p)([^\\}]*)/gi;
        let match;

        while ((match = tagRegex.exec(tags))) {
          const tag = match[1].toLowerCase();
          const value = match[2].trim();

          if (tag === 'p') {
            const parsed = Number.parseInt(value, 10);
            drawingMode = Number.isFinite(parsed) ? parsed : drawingMode;
            continue;
          }

          if (tag === 'r') {
            if (value) {
              const resetStyle = styles.get(normalizeStyleName(value));
              currentStyleFont = resetStyle?.fontName || baseFont;
            } else {
              currentStyleFont = baseFont;
            }
            currentFont = currentStyleFont;
            if (currentFont) ensureUsage(currentFont, value ? `reset:${value}` : 'reset:base');
            continue;
          }

          if (tag === 'fn') {
            currentFont = value || currentStyleFont || baseFont;
            if (currentFont) ensureUsage(currentFont, value ? 'inline:\\fn' : 'inline:\\fn(reset)');
          }
        }
        continue;
      }

      if (drawingMode === 0 && currentFont) {
        addVisibleText(currentFont, piece, eventStyleName ? `dialogue:${eventStyleName}` : 'dialogue');
      }
    }
  }

  return {
    declaredFonts: [...declaredFonts.values()],
    usedFonts: [...usage.values()].map((item) => ({
      name: item.name,
      characters: [...item.characters],
      sources: [...item.sources],
    })),
    allCharacters: [...allCharacters],
  };
}

export async function checkFontCharacters(file, characters) {
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

  const unique = [...new Set(characters)].filter(isMeaningfulCharacter);
  const missing = [];

  for (const char of unique) {
    const codePoint = char.codePointAt(0);
    if (!checkers.some((hasGlyph) => hasGlyph(codePoint))) missing.push(char);
  }

  return {
    checkedCount: unique.length,
    missing,
  };
}

export async function checkFontCoverage(file, assText) {
  const analysis = analyzeAssFontUsage(assText);
  return checkFontCharacters(file, analysis.allCharacters);
}

// Forced-font mode: preserve all non-font ASS formatting, but rewrite style
// Fontname values and inline \fn overrides to one uploaded family.
export function forceAssFontFamily(text, family) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '';
  let styleFormat = [];
  let eventFormat = [];

  return lines.map((raw) => {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].toLowerCase();
      return raw;
    }

    if (section === 'v4+ styles' || section === 'v4 styles') {
      if (/^\s*Format\s*:/i.test(raw)) {
        styleFormat = fieldsAfterColon(raw).split(',').map((x) => x.trim().toLowerCase());
      } else if (/^\s*Style\s*:/i.test(raw) && styleFormat.length) {
        const values = splitAssFields(fieldsAfterColon(raw), styleFormat.length);
        const index = styleFormat.indexOf('fontname');
        if (index >= 0) values[index] = family;
        return raw.slice(0, raw.indexOf(':') + 1) + ' ' + values.join(',');
      }
    } else if (section === 'events') {
      if (/^\s*Format\s*:/i.test(raw)) {
        eventFormat = fieldsAfterColon(raw).split(',').map((x) => x.trim().toLowerCase());
      } else if (/^\s*(Dialogue|Comment)\s*:/i.test(raw) && eventFormat.length) {
        const values = splitAssFields(fieldsAfterColon(raw), eventFormat.length);
        const index = eventFormat.indexOf('text');
        if (index >= 0) {
          values[index] = values[index].replace(/\\fn([^\\}]*)/gi, (match, requested) => (
            requested.trim() ? `\\fn${family}` : match
          ));
        }
        return raw.slice(0, raw.indexOf(':') + 1) + ' ' + values.join(',');
      }
    }

    return raw;
  }).join('\n');
}

function normalizeFontName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

function normalizeStyleName(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
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
    .filter((item) => item.checker)
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.checker);
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

      if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0;

      const glyphAddress = rangeWord + rangeOffset + 2 * (codePoint - start);
      if (glyphAddress + 2 > tableEnd) return false;

      const glyph = view.getUint16(glyphAddress, false);
      if (glyph === 0) return false;
      return ((glyph + delta) & 0xffff) !== 0;
    }

    return false;
  };
}

function decodeAssVisibleText(value) {
  return value
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ');
}

function isMeaningfulCharacter(char) {
  if (!char || /\s/u.test(char)) return false;
  const codePoint = char.codePointAt(0);
  return codePoint >= 0x20 && !(codePoint >= 0x7f && codePoint <= 0x9f);
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
