import { readFontDescriptors } from './ass-font-rewrite.js';

const SINGLE_EXTENSIONS = new Set(['.ttf', '.otf']);
const COLLECTION_EXTENSIONS = new Set(['.ttc', '.otc']);

function asciiTag(bytes, offset = 0) {
  if (offset < 0 || offset + 4 > bytes.length) return '';
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function fontExtension(name = '') {
  const match = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function classifyScaler(bytes, offset = 0) {
  if (offset + 4 > bytes.length) return 'unknown';
  const tag = asciiTag(bytes, offset);
  const scalar = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
  if (tag === 'OTTO') return 'opentype-cff';
  if (tag === 'true' || tag === 'typ1' || scalar === 0x00010000) return 'truetype';
  return 'unknown';
}

export function sniffFontBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (bytes.length < 4) {
    return { container: 'unknown', flavor: 'unknown', evidence: 'none' };
  }

  const tag = asciiTag(bytes);
  if (tag === 'ttcf') {
    if (bytes.length < 12) {
      return { container: 'collection', flavor: 'unknown', evidence: 'ttcf-header' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(8, false);
    const flavors = [];
    if (count > 0 && count <= 512 && 12 + count * 4 <= bytes.length) {
      for (let i = 0; i < count; i += 1) {
        const offset = view.getUint32(12 + i * 4, false);
        flavors.push(classifyScaler(bytes, offset));
      }
    }
    const known = flavors.filter((value) => value !== 'unknown');
    const flavor = known.length && known.every((value) => value === known[0])
      ? known[0]
      : known.length ? 'mixed' : 'unknown';
    return {
      container: 'collection',
      flavor,
      faceCountHint: count || 0,
      evidence: 'ttcf-header',
    };
  }

  const flavor = classifyScaler(bytes, 0);
  if (flavor !== 'unknown') {
    return { container: 'single', flavor, evidence: 'sfnt-scaler' };
  }
  return { container: 'unknown', flavor: 'unknown', evidence: 'none' };
}

export async function sniffFontFile(file, { maxBytes = 64 * 1024 } = {}) {
  if (!file?.slice) return { container: 'unknown', flavor: 'unknown', evidence: 'none' };
  const buffer = await file.slice(0, maxBytes).arrayBuffer();
  return sniffFontBytes(new Uint8Array(buffer));
}

function extensionMatch(extension, container) {
  if (!extension || container === 'unknown') return null;
  return container === 'collection'
    ? COLLECTION_EXTENSIONS.has(extension)
    : SINGLE_EXTENSIONS.has(extension);
}

export function fontIdentityLabel(identity) {
  if (!identity) return '未知字体';
  if (identity.container === 'collection') {
    return identity.flavor === 'opentype-cff'
      ? 'OpenType Collection'
      : identity.flavor === 'truetype'
        ? 'TrueType Collection'
        : 'Font Collection';
  }
  if (identity.flavor === 'opentype-cff') return 'OpenType / CFF';
  if (identity.flavor === 'truetype') return 'TrueType / OpenType TT';
  return '未知字体';
}

export async function identifyFontFile(
  file,
  {
    sniff = sniffFontFile,
    parseDescriptors = readFontDescriptors,
  } = {}
) {
  const extension = fontExtension(file?.name);
  let sniffed;
  try {
    sniffed = await sniff(file);
  } catch (error) {
    sniffed = { container: 'unknown', flavor: 'unknown', evidence: 'read-error' };
  }

  let descriptors = [];
  let parseError = '';
  try {
    descriptors = await parseDescriptors(file);
  } catch (error) {
    parseError = error?.message || String(error);
  }

  const valid = Boolean(
    !parseError &&
    descriptors.length &&
    ['single', 'collection'].includes(sniffed?.container)
  );
  const identity = {
    kind: 'font',
    fileName: file?.name || '',
    extension,
    mimeHint: file?.type || '',
    container: sniffed?.container || 'unknown',
    flavor: sniffed?.flavor || 'unknown',
    evidence: valid ? 'font-parser+header' : sniffed?.evidence || 'none',
    descriptors,
    faceCount: descriptors.length,
    valid,
    parseError,
  };
  identity.label = fontIdentityLabel(identity);
  identity.extensionMatches = valid ? extensionMatch(extension, identity.container) : null;
  return identity;
}

export function isSupportedFontIdentity(identity) {
  return Boolean(identity?.valid);
}

export function fontIdentityMismatchMessage(identity) {
  if (!identity || identity.extensionMatches !== false) return '';
  return `扩展名 ${identity.extension || '（无）'} 与实际检测到的 ${identity.label} 不一致`;
}

export function fontMimeType(identity) {
  if (identity?.container === 'collection') return 'font/collection';
  return identity?.flavor === 'opentype-cff' ? 'font/otf' : 'font/ttf';
}

export function fontVirtualSuffix(identity) {
  if (identity?.container === 'collection') {
    return identity?.flavor === 'opentype-cff' ? '.otc' : '.ttc';
  }
  return identity?.flavor === 'opentype-cff' ? '.otf' : '.ttf';
}
