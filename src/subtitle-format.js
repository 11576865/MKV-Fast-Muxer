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
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const language = TOKEN_LANGUAGE[tokens[index]];
    if (language) return language;
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
