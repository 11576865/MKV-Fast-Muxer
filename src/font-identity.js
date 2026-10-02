import { readFontDescriptors } from './ass-font-rewrite.js';

const ASCII = new TextDecoder('ascii');

function extension(name = '') {
  const match = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function tag(bytes) {
  return bytes.length >= 4 ? ASCII.decode(bytes.subarray(0, 4)) : '';
}

export function sniffFontBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (bytes.length < 4) {
    return { kind: 'unknown', supported: false, evidence: 'too-small' };
  }

  const signature = tag(bytes);
  const numeric = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);

  if (signature === 'ttcf') {
    return {
      kind: 'sfnt-collection',
      supported: true,
      collection: true,
      mimeType: 'font/collection',
      virtualExtension: '.ttc',
      evidence: 'sfnt-signature',
    };
  }

  if (signature === 'OTTO') {
    return {
      kind: 'opentype-cff',
      supported: true,
      collection: false,
      mimeType: 'font/otf',
      virtualExtension: '.otf',
      evidence: 'sfnt-signature',
    };
  }

  if (numeric === 0x00010000 || signature === 'true' || signature === 'typ1') {
    return {
      kind: 'truetype-sfnt',
      supported: true,
      collection: false,
      mimeType: 'font/ttf',
      virtualExtension: '.ttf',
      evidence: 'sfnt-signature',
    };
  }

  return {
    kind: 'unknown',
    supported: false,
    collection: false,
    mimeType: '',
    virtualExtension: '.font',
    evidence: 'unknown-signature',
  };
}

export async function sniffFontFile(file, { maxBytes = 64 } = {}) {
  if (!file?.slice) return sniffFontBytes(new Uint8Array());
  const buffer = await file.slice(0, maxBytes).arrayBuffer();
  const identity = sniffFontBytes(new Uint8Array(buffer));
  const suffix = extension(file.name);

  const expectedExtensions =
    identity.kind === 'sfnt-collection' ? new Set(['.ttc', '.otc']) :
    identity.kind === 'opentype-cff' ? new Set(['.otf']) :
    identity.kind === 'truetype-sfnt' ? new Set(['.ttf']) :
    null;

  return {
    ...identity,
    fileName: file.name || '',
    extension: suffix,
    extensionMatches: suffix && expectedExtensions
      ? expectedExtensions.has(suffix)
      : expectedExtensions ? false : null,
  };
}

export async function inspectFontFile(file, options = {}) {
  const sniffed = await sniffFontFile(file, options);
  if (!sniffed.supported) return { ...sniffed, descriptors: [] };

  try {
    const descriptors = await readFontDescriptors(file);
    if (!descriptors.length) {
      return {
        ...sniffed,
        supported: false,
        descriptors: [],
        evidence: 'sfnt-parse-empty',
        inspectionError: '字体没有可用 face',
      };
    }
    return {
      ...sniffed,
      supported: true,
      descriptors,
      evidence: 'sfnt-parse',
    };
  } catch (error) {
    return {
      ...sniffed,
      supported: false,
      descriptors: [],
      evidence: 'sfnt-parse-failed',
      inspectionError: error?.message || String(error),
    };
  }
}

export function fontIdentityMismatchMessage(identity) {
  if (!identity || identity.extensionMatches !== false || !identity.supported) return '';
  const actual =
    identity.collection ? 'OpenType/TrueType 字体集合' :
    identity.kind === 'opentype-cff' ? 'OpenType CFF 字体' :
    'TrueType SFNT 字体';
  return `扩展名 ${identity.extension || '（无）'} 与实际检测到的 ${actual} 不一致`;
}

export function isSupportedFontIdentity(identity) {
  return Boolean(identity?.supported);
}

export function canSubsetFontIdentity(identity) {
  return Boolean(identity?.supported && !identity?.collection);
}

export function fontMimeType(identity) {
  return identity?.mimeType || 'application/octet-stream';
}

export function fontVirtualExtension(identity) {
  return identity?.virtualExtension || '.font';
}
