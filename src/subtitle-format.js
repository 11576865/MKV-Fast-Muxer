const FORMAT_BY_EXT = Object.freeze({
  '.ass': {
    id: 'ass',
    label: 'ASS',
    inputExtension: '.ass',
    ffmpegOutputCodec: null,
    expectedCodec: 'ass',
    assLike: true,
    previewable: true,
  },
  '.ssa': {
    id: 'ssa',
    label: 'SSA',
    inputExtension: '.ssa',
    ffmpegOutputCodec: null,
    expectedCodec: 'ass',
    assLike: true,
    previewable: true,
  },
  '.srt': {
    id: 'srt',
    label: 'SRT',
    inputExtension: '.srt',
    ffmpegOutputCodec: null,
    expectedCodec: 'subrip',
    assLike: false,
    previewable: false,
  },
  '.vtt': {
    id: 'webvtt',
    label: 'WebVTT',
    inputExtension: '.vtt',
    // @ffmpeg/core 0.12.x is based on FFmpeg 5.1.x. Matroska WebVTT
    // writing support is inconsistent there, so normalize only the text
    // subtitle stream to SubRip while keeping video/audio on stream copy.
    ffmpegOutputCodec: 'srt',
    expectedCodec: 'subrip',
    assLike: false,
    previewable: false,
  },
  '.webvtt': {
    id: 'webvtt',
    label: 'WebVTT',
    inputExtension: '.vtt',
    ffmpegOutputCodec: 'srt',
    expectedCodec: 'subrip',
    assLike: false,
    previewable: false,
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
      // Cue identifiers are commonly a single token immediately before a
      // timestamp. Keeping them is safe but wastes glyphs; a conservative
      // identifier filter handles the common case without parsing full VTT.
      if (/^\s*[A-Za-z0-9_.:-]+\s*$/.test(line)) continue;
      kept.push(line);
    }
    return stripInlineMarkup(kept.join('\n'));
  }

  return stripInlineMarkup(lines.join('\n'));
}
