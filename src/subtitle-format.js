const FORMAT_BY_EXT = Object.freeze({
  '.ass': {
    id: 'ass',
    label: 'ASS',
    inputExtension: '.ass',
    ffmpegOutputCodec: null,
    expectedCodec: 'ass',
    assLike: true,
    text: true,
    bitmap: false,
    previewable: true,
  },
  '.ssa': {
    id: 'ssa',
    label: 'SSA',
    inputExtension: '.ssa',
    ffmpegOutputCodec: null,
    expectedCodec: 'ass',
    assLike: true,
    text: true,
    bitmap: false,
    previewable: true,
  },
  '.srt': {
    id: 'srt',
    label: 'SRT',
    inputExtension: '.srt',
    ffmpegOutputCodec: null,
    expectedCodec: 'subrip',
    assLike: false,
    text: true,
    bitmap: false,
    previewable: false,
  },
  '.vtt': {
    id: 'webvtt',
    label: 'WebVTT',
    inputExtension: '.vtt',
    ffmpegOutputCodec: 'srt',
    expectedCodec: 'subrip',
    assLike: false,
    text: true,
    bitmap: false,
    previewable: false,
  },
  '.webvtt': {
    id: 'webvtt',
    label: 'WebVTT',
    inputExtension: '.vtt',
    ffmpegOutputCodec: 'srt',
    expectedCodec: 'subrip',
    assLike: false,
    text: true,
    bitmap: false,
    previewable: false,
  },
  '.sup': {
    id: 'pgs',
    label: 'PGS / SUP',
    inputExtension: '.sup',
    ffmpegOutputCodec: null,
    expectedCodec: 'hdmv_pgs_subtitle',
    assLike: false,
    text: false,
    bitmap: true,
    previewable: false,
  },
  '.idx': {
    id: 'vobsub',
    label: 'VobSub',
    inputExtension: '.idx',
    ffmpegOutputCodec: null,
    expectedCodec: 'dvd_subtitle',
    assLike: false,
    text: false,
    bitmap: true,
    previewable: false,
    requiresSidecar: '.sub',
  },
  '.sub': {
    id: 'vobsub-sidecar',
    label: 'VobSub data',
    inputExtension: '.sub',
    ffmpegOutputCodec: null,
    expectedCodec: '',
    assLike: false,
    text: false,
    bitmap: true,
    previewable: false,
    sidecarOnly: true,
  },
});

export const SUPPORTED_SUBTITLE_EXTENSIONS = Object.freeze(Object.keys(FORMAT_BY_EXT));


const FORMAT_BY_ID = Object.freeze(
  Object.values(FORMAT_BY_EXT).reduce((acc, info) => {
    if (!acc[info.id]) acc[info.id] = info;
    return acc;
  }, {})
);

export function subtitleFormatById(id = '') {
  const info = FORMAT_BY_ID[String(id || '').toLowerCase()];
  return info ? { ...info } : null;
}

export function subtitleExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function subtitleFormatInfo(name = '') {
  const info = FORMAT_BY_EXT[subtitleExtension(name)];
  return info ? { ...info } : null;
}

export function isSupportedSubtitleFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return Boolean(subtitleFormatInfo(name));
}

export function isAssLikeSubtitle(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return Boolean(subtitleFormatInfo(name)?.assLike);
}

export function isPreviewableSubtitle(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return Boolean(subtitleFormatInfo(name)?.previewable);
}

export function isTextSubtitle(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return Boolean(subtitleFormatInfo(name)?.text);
}

function sourcePath(file) {
  return String(file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/');
}

function pairKey(file) {
  return sourcePath(file)
    .replace(/\.[^.\/]+$/, '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US');
}

export function subtitleTrackKey(track) {
  if (!track) return '';
  const primary = track.file
    ? `${sourcePath(track.file)}|${track.file.size || 0}|${track.file.lastModified || 0}`
    : '';
  const sidecar = track.sidecarFile
    ? `|${sourcePath(track.sidecarFile)}|${track.sidecarFile.size || 0}|${track.sidecarFile.lastModified || 0}`
    : '';
  return primary + sidecar;
}

export function collectSubtitleInputs(files = []) {
  const sourceFiles = Array.from(files || []);
  const supported = sourceFiles.filter(isSupportedSubtitleFile);
  const byPairKey = new Map();

  for (const file of supported) {
    const key = pairKey(file);
    let group = byPairKey.get(key);
    if (!group) {
      group = new Map();
      byPairKey.set(key, group);
    }
    group.set(subtitleExtension(file.name), file);
  }

  const tracks = [];
  const orphanSidecars = [];
  const invalid = sourceFiles.filter((file) => !isSupportedSubtitleFile(file));

  for (const file of supported) {
    const format = subtitleFormatInfo(file.name);
    const suffix = subtitleExtension(file.name);
    if (format?.sidecarOnly) {
      const group = byPairKey.get(pairKey(file));
      if (!group?.has('.idx')) orphanSidecars.push(file);
      continue;
    }

    if (format?.requiresSidecar) {
      const group = byPairKey.get(pairKey(file));
      const sidecarFile = group?.get(format.requiresSidecar);
      if (!sidecarFile) {
        invalid.push(file);
        continue;
      }
      tracks.push({
        file,
        sidecarFile,
        format,
        displayName: `${file.name} + ${sidecarFile.name}`,
      });
      continue;
    }

    tracks.push({
      file,
      sidecarFile: null,
      format,
      displayName: file.name,
    });
  }

  return { tracks, orphanSidecars, invalid };
}


function decodeSubtitleSample(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (source.length >= 2 && source[0] === 0xff && source[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(source.subarray(2)),
      encoding: 'utf-16le',
    };
  }
  if (source.length >= 2 && source[0] === 0xfe && source[1] === 0xff) {
    return {
      text: new TextDecoder('utf-16be').decode(source.subarray(2)),
      encoding: 'utf-16be',
    };
  }
  const start = source.length >= 3 &&
    source[0] === 0xef &&
    source[1] === 0xbb &&
    source[2] === 0xbf ? 3 : 0;
  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(source.subarray(start)),
    encoding: start ? 'utf-8-bom' : 'utf-8',
  };
}

function looksLikeMpegProgramStream(bytes) {
  if (bytes.length < 4) return false;
  for (let index = 0; index <= Math.min(bytes.length - 4, 64); index += 1) {
    if (
      bytes[index] === 0x00 &&
      bytes[index + 1] === 0x00 &&
      bytes[index + 2] === 0x01 &&
      (bytes[index + 3] === 0xba || bytes[index + 3] === 0xbd)
    ) {
      return true;
    }
  }
  return false;
}

export function sniffSubtitleBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);

  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x47) {
    return {
      id: 'pgs',
      evidence: 'pgs-pg-segment',
      confidence: 'high',
      encoding: 'binary',
    };
  }

  if (looksLikeMpegProgramStream(bytes)) {
    return {
      id: 'vobsub-sidecar',
      evidence: 'mpeg-program-stream',
      confidence: 'medium',
      encoding: 'binary',
    };
  }

  const decoded = decodeSubtitleSample(bytes);
  const text = decoded.text.replace(/^\uFEFF/, '');
  const normalized = text.replace(/\r\n?/g, '\n');
  const trimmed = normalized.trimStart();

  if (/^#\s*VobSub\s+index\s+file\b/im.test(normalized) ||
      (/^\s*size\s*:\s*\d+\s*x\s*\d+/im.test(normalized) &&
       /^\s*timestamp\s*:\s*\d{1,2}:\d{2}:\d{2}[.:]\d+/im.test(normalized))) {
    return {
      id: 'vobsub',
      evidence: 'vobsub-idx-text',
      confidence: 'high',
      encoding: decoded.encoding,
    };
  }

  if (/^WEBVTT(?:\s|$)/i.test(trimmed)) {
    return {
      id: 'webvtt',
      evidence: 'webvtt-header',
      confidence: 'high',
      encoding: decoded.encoding,
    };
  }

  const hasScriptInfo = /^\s*\[Script Info\]\s*$/im.test(normalized);
  const hasEvents = /^\s*\[Events\]\s*$/im.test(normalized);
  const hasDialogue = /^\s*Dialogue\s*:/im.test(normalized);
  if (hasScriptInfo && (hasEvents || hasDialogue)) {
    const assV4Plus =
      /^\s*ScriptType\s*:\s*v4\.00\+\s*$/im.test(normalized) ||
      /^\s*\[V4\+ Styles\]\s*$/im.test(normalized);
    const ssaV4 =
      /^\s*ScriptType\s*:\s*v4\.00\s*$/im.test(normalized) ||
      /^\s*\[V4 Styles\]\s*$/im.test(normalized);
    return {
      id: assV4Plus ? 'ass' : (ssaV4 ? 'ssa' : 'ass'),
      evidence: assV4Plus ? 'ass-script-structure' : (ssaV4 ? 'ssa-script-structure' : 'ass-like-structure'),
      confidence: assV4Plus || ssaV4 ? 'high' : 'medium',
      encoding: decoded.encoding,
    };
  }

  if (hasScriptInfo) {
    return {
      id: 'ass',
      evidence: 'ass-script-info-partial',
      confidence: 'low',
      encoding: decoded.encoding,
    };
  }

  const srtTiming = /(?:^|\n)\s*(?:\d+\s*\n)?\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}(?:\s|$)/m;
  if (srtTiming.test(normalized)) {
    return {
      id: 'srt',
      evidence: 'subrip-timing',
      confidence: 'high',
      encoding: decoded.encoding,
    };
  }

  return {
    id: 'unknown',
    evidence: bytes.length ? 'no-known-signature' : 'empty-file',
    confidence: 'none',
    encoding: decoded.encoding,
  };
}

function subtitleIdentityExtensionMatch(file, format) {
  const extensionFormat = subtitleFormatInfo(file?.name || '');
  if (!extensionFormat) return false;
  if (!format) return null;
  return extensionFormat.id === format.id;
}

export async function inspectSubtitleFile(file, { maxBytes = 256 * 1024 } = {}) {
  if (!file?.slice) {
    return {
      file,
      format: null,
      detectedId: 'unknown',
      evidence: 'unreadable-file-object',
      confidence: 'none',
      extensionMatches: null,
      supported: false,
    };
  }

  const buffer = await file.slice(0, maxBytes).arrayBuffer();
  const sniffed = sniffSubtitleBytes(new Uint8Array(buffer));
  const format = subtitleFormatById(sniffed.id);
  return {
    file,
    format,
    detectedId: sniffed.id,
    evidence: sniffed.evidence,
    confidence: sniffed.confidence,
    encoding: sniffed.encoding,
    extensionMatches: subtitleIdentityExtensionMatch(file, format),
    supported: Boolean(format),
  };
}

export function subtitleIdentityMismatchMessage(identity) {
  if (!identity?.format || identity.extensionMatches !== false) return '';
  const suffix = subtitleExtension(identity.file?.name || '');
  return `扩展名 ${suffix || '（无）'} 与实际检测到的 ${identity.format.label} 不一致`;
}

async function subtitleMapWithConcurrency(items, limit, worker) {
  const source = Array.from(items || []);
  const result = new Array(source.length);
  let cursor = 0;

  async function consume() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await worker(source[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, limit), Math.max(1, source.length)) },
      () => consume()
    )
  );
  return result;
}

export async function identifySubtitleInputs(
  files = [],
  {
    inspect = inspectSubtitleFile,
    concurrency = 8,
    cache = null,
  } = {}
) {
  const sourceFiles = Array.from(files || []);
  const identities = await subtitleMapWithConcurrency(sourceFiles, concurrency, async (file) => {
    const key = subtitleTrackKey({ file });
    let pending = cache?.get(key);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => inspect(file))
        .catch((error) => ({
          file,
          format: null,
          detectedId: 'unknown',
          evidence: 'inspection-error',
          confidence: 'none',
          extensionMatches: null,
          supported: false,
          inspectionError: error?.message || String(error),
        }));
      cache?.set(key, pending);
    }
    return pending;
  });

  const byFile = new Map(identities.map((identity) => [identity.file, identity]));
  const byPairKey = new Map();
  for (const identity of identities) {
    if (!identity.supported) continue;
    const key = pairKey(identity.file);
    if (!byPairKey.has(key)) byPairKey.set(key, []);
    byPairKey.get(key).push(identity);
  }

  const tracks = [];
  const orphanSidecars = [];
  const invalid = identities.filter((identity) => !identity.supported).map((identity) => identity.file);
  const mismatches = [];

  for (const identity of identities) {
    if (!identity.supported) continue;
    const format = identity.format;
    const mismatch = subtitleIdentityMismatchMessage(identity);
    if (mismatch) mismatches.push({ file: identity.file, identity, message: mismatch });

    if (format.sidecarOnly) {
      const peers = byPairKey.get(pairKey(identity.file)) || [];
      const primary = peers.find((peer) => peer.format?.id === 'vobsub');
      if (!primary) orphanSidecars.push(identity.file);
      continue;
    }

    if (format.requiresSidecar) {
      const peers = byPairKey.get(pairKey(identity.file)) || [];
      const sidecarIdentity = peers.find((peer) => peer.format?.id === 'vobsub-sidecar');
      if (!sidecarIdentity) {
        invalid.push(identity.file);
        continue;
      }
      tracks.push({
        file: identity.file,
        sidecarFile: sidecarIdentity.file,
        format,
        identity,
        sidecarIdentity,
        identityMismatch: mismatch,
        displayName: `${identity.file.name} + ${sidecarIdentity.file.name}`,
      });
      continue;
    }

    tracks.push({
      file: identity.file,
      sidecarFile: null,
      format,
      identity,
      sidecarIdentity: null,
      identityMismatch: mismatch,
      displayName: identity.file.name,
    });
  }

  return {
    tracks,
    orphanSidecars,
    invalid,
    identities,
    mismatches,
    byFile,
  };
}

const LANGUAGE_TITLE = Object.freeze({
  und: '',
  zho: '中文',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  eng: 'English',
  jpn: '日本語',
  kor: '한국어',
  rus: 'Русский',
  deu: 'Deutsch',
  fra: 'Français',
  spa: 'Español',
  por: 'Português',
  ita: 'Italiano',
  ara: 'العربية',
  hin: 'हिन्दी',
  mul: '多语言',
});

const TOKEN_LANGUAGE = Object.freeze({
  zh: 'zho',
  zho: 'zho',
  chi: 'zho',
  cn: 'zho',
  chs: 'zh-Hans',
  sc: 'zh-Hans',
  zhs: 'zh-Hans',
  gb: 'zh-Hans',
  cht: 'zh-Hant',
  tc: 'zh-Hant',
  zht: 'zh-Hant',
  hk: 'zh-Hant',
  tw: 'zh-Hant',
  en: 'eng',
  eng: 'eng',
  english: 'eng',
  ja: 'jpn',
  jp: 'jpn',
  jpn: 'jpn',
  japanese: 'jpn',
  ko: 'kor',
  kr: 'kor',
  kor: 'kor',
  korean: 'kor',
  ru: 'rus',
  rus: 'rus',
  de: 'deu',
  deu: 'deu',
  ger: 'deu',
  fr: 'fra',
  fra: 'fra',
  fre: 'fra',
  es: 'spa',
  spa: 'spa',
  pt: 'por',
  por: 'por',
  it: 'ita',
  ita: 'ita',
  ar: 'ara',
  ara: 'ara',
  hi: 'hin',
  hin: 'hin',
  mul: 'mul',
  multi: 'mul',
});

export function inferLanguageFromFilename(name = '') {
  const basename = String(name || '').replace(/\.[^.]+$/, '').normalize('NFKC');
  const lower = basename.toLocaleLowerCase('en-US');

  if (/(?:^|[. _\-\[\](){}])zh[-_]?hans(?:$|[. _\-\[\](){}])/i.test(lower)) return 'zh-Hans';
  if (/(?:^|[. _\-\[\](){}])zh[-_]?hant(?:$|[. _\-\[\](){}])/i.test(lower)) return 'zh-Hant';
  if (/(?:^|[. _\-\[\](){}])zh[-_]?cn(?:$|[. _\-\[\](){}])/i.test(lower)) return 'zh-Hans';
  if (/(?:^|[. _\-\[\](){}])zh[-_]?(tw|hk)(?:$|[. _\-\[\](){}])/i.test(lower)) return 'zh-Hant';

  const tokens = lower.split(/[. _\-\[\](){}]+/).filter(Boolean);
  // Language tags are suffix metadata. Walk from the filename tail, but stop
  // when we hit a likely title/episode boundary. This prevents titles such as
  // "It.2017.srt" from becoming Italian while still accepting
  // "Show.S01E01.en.forced.ass".
  let inspected = 0;
  for (let index = tokens.length - 1; index >= 0 && inspected < 4; index -= 1, inspected += 1) {
    const token = tokens[index];
    const language = TOKEN_LANGUAGE[token];
    if (language) return language;
    if (
      /^\d{2,4}$/.test(token) ||
      /^s\d{1,2}e\d{1,3}$/i.test(token) ||
      /^(?:ep?|episode)\d{1,4}$/i.test(token)
    ) {
      break;
    }
  }
  return 'und';
}

export function inferredSubtitleMetadata(fileOrName, format = null) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name || '';
  const language = inferLanguageFromFilename(name);
  const info = format || subtitleFormatInfo(name);
  const label = LANGUAGE_TITLE[language] || '';
  const title = label
    ? `${label}${info?.label ? ` · ${info.label}` : ''}`
    : String(name).replace(/\.[^.]+$/, '');
  return { language, title };
}

function stripInlineMarkup(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function visibleTextForPlainSubtitle(text, formatId) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  if (formatId === 'srt') {
    return stripInlineMarkup(
      lines
        .filter((line) => !/^\s*\d+\s*$/.test(line))
        .filter((line) => !/-->/.test(line))
        .join('\n')
    );
  }

  if (formatId === 'webvtt') {
    const kept = [];
    let skipBlock = false;
    for (const line of lines) {
      if (/^\s*WEBVTT(?:\s|$)/i.test(line)) continue;
      if (/^\s*(NOTE|STYLE|REGION)(?:\s|$)/i.test(line)) {
        skipBlock = true;
        continue;
      }
      if (skipBlock) {
        if (!line.trim()) skipBlock = false;
        continue;
      }
      if (/-->/.test(line)) continue;
      if (/^\s*[A-Za-z0-9_.:-]+\s*$/.test(line)) continue;
      kept.push(line);
    }
    return stripInlineMarkup(kept.join('\n'));
  }

  return stripInlineMarkup(lines.join('\n'));
}
