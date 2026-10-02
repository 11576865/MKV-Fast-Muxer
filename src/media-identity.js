const ASCII = new TextDecoder('ascii');

const SUPPORTED_VIDEO_CONTAINERS = new Set([
  'matroska',
  'webm',
  'matroska-webm',
  'iso-bmff',
  'mov',
]);

const VIDEO_EXTENSION_MAP = {
  matroska: new Set(['.mkv']),
  webm: new Set(['.webm']),
  'matroska-webm': new Set(['.mkv', '.webm']),
  'iso-bmff': new Set(['.mp4', '.m4v', '.mov']),
  mov: new Set(['.mov']),
};

function ascii(bytes, start, end) {
  return ASCII.decode(bytes.subarray(start, end));
}

export function mediaExtension(name = '') {
  const match = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function sniffContainerBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const headerText = ascii(bytes, 0, Math.min(bytes.length, 64 * 1024)).toLowerCase();
    if (headerText.includes('matroska')) {
      return { container: 'matroska', evidence: 'ebml-doctype' };
    }
    if (headerText.includes('webm')) {
      return { container: 'webm', evidence: 'ebml-doctype' };
    }
    return { container: 'matroska-webm', evidence: 'ebml-header' };
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const majorBrand = ascii(bytes, 8, 12);
    return {
      container: majorBrand === 'qt  ' ? 'mov' : 'iso-bmff',
      evidence: 'iso-bmff-ftyp',
      majorBrand,
    };
  }

  return { container: 'unknown', evidence: 'none' };
}

export async function sniffFileContainer(file, { maxBytes = 64 * 1024 } = {}) {
  if (!file?.slice) return { container: 'unknown', evidence: 'none' };
  const buffer = await file.slice(0, maxBytes).arrayBuffer();
  return sniffContainerBytes(new Uint8Array(buffer));
}

export function containerFromProbe(formatName = '', sniffedContainer = 'unknown') {
  const sniffed = String(sniffedContainer || 'unknown');
  if (['matroska', 'webm', 'iso-bmff', 'mov'].includes(sniffed)) return sniffed;

  const tokens = String(formatName || '')
    .toLowerCase()
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.includes('matroska') || tokens.includes('webm')) return 'matroska-webm';
  if (tokens.some((token) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(token))) {
    return 'iso-bmff';
  }

  return tokens[0] || 'unknown';
}

export function containerLabel(container) {
  switch (container) {
    case 'matroska': return 'Matroska / MKV';
    case 'webm': return 'WebM';
    case 'matroska-webm': return 'Matroska / WebM';
    case 'iso-bmff': return 'ISO BMFF / MP4';
    case 'mov': return 'QuickTime / MOV';
    default: return container && container !== 'unknown' ? container : '未知容器';
  }
}

function extensionMatchForContainer(extension, container) {
  if (!extension || !container || container === 'unknown') return null;
  const expected = VIDEO_EXTENSION_MAP[container];
  return expected ? expected.has(extension) : null;
}

export function sniffedVideoIdentity(file, sniffed = {}) {
  const extension = mediaExtension(file?.name);
  const container = String(sniffed?.container || 'unknown');
  return {
    kind: 'video',
    fileName: file?.name || '',
    extension,
    mimeHint: file?.type || '',
    container,
    containerLabel: containerLabel(container),
    formatName: '',
    videoStreams: [],
    audioStreams: [],
    hasVideo: null,
    supported: SUPPORTED_VIDEO_CONTAINERS.has(container),
    extensionMatches: extensionMatchForContainer(extension, container),
    evidence: sniffed?.evidence || 'none',
    sniffEvidence: sniffed?.evidence || 'none',
  };
}

export function videoIdentityFromProbe(file, probe, sniffed = {}) {
  const extension = mediaExtension(file?.name);
  const formatName = String(probe?.format?.format_name || '');
  const container = containerFromProbe(formatName, sniffed?.container);
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');

  return {
    kind: 'video',
    fileName: file?.name || '',
    extension,
    mimeHint: file?.type || '',
    container,
    containerLabel: containerLabel(container),
    formatName,
    videoStreams,
    audioStreams,
    hasVideo: videoStreams.length > 0,
    supported: SUPPORTED_VIDEO_CONTAINERS.has(container) && videoStreams.length > 0,
    extensionMatches: extensionMatchForContainer(extension, container),
    evidence: 'ffprobe',
    sniffEvidence: sniffed?.evidence || 'none',
  };
}

export function isMatroskaIdentity(identity) {
  return identity?.container === 'matroska';
}

export function isSupportedVideoIdentity(identity) {
  return Boolean(identity?.supported);
}

export function sourceVirtualSuffix(identity) {
  switch (identity?.container) {
    case 'matroska': return '.mkv';
    case 'webm': return '.webm';
    case 'iso-bmff': return '.mp4';
    case 'mov': return '.mov';
    default: return '.source';
  }
}

function audioExpectedExtensions(formatName = '', codec = '') {
  const tokens = String(formatName || '')
    .toLowerCase()
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const codecName = String(codec || '').toLowerCase();

  if (tokens.includes('flac') || codecName === 'flac') return new Set(['.flac']);
  if (tokens.includes('aac')) return new Set(['.aac']);
  if (tokens.includes('mp3') || codecName === 'mp3') return new Set(['.mp3']);
  if (tokens.includes('wav')) return new Set(['.wav']);
  if (tokens.includes('ac3') || codecName === 'ac3') return new Set(['.ac3']);
  if (tokens.includes('eac3') || codecName === 'eac3') return new Set(['.eac3']);
  if (tokens.includes('dts') || codecName === 'dts') return new Set(['.dts']);
  if (tokens.includes('ogg')) {
    return codecName === 'opus' ? new Set(['.opus', '.ogg']) : new Set(['.ogg', '.opus']);
  }
  if (tokens.some((token) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(token))) {
    return new Set(['.m4a', '.mp4', '.mov']);
  }
  if (tokens.includes('matroska') || tokens.includes('webm')) {
    return new Set(['.mka', '.mkv', '.webm']);
  }
  return null;
}

export function audioIdentityFromProbe(file, probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const audioStream = streams.find((stream) => stream.codec_type === 'audio') || null;
  const formatName = String(probe?.format?.format_name || '');
  const extension = mediaExtension(file?.name);
  const expectedExtensions = audioExpectedExtensions(formatName, audioStream?.codec_name);
  const extensionMatches = extension && expectedExtensions
    ? expectedExtensions.has(extension)
    : null;

  return {
    kind: 'audio',
    fileName: file?.name || '',
    extension,
    mimeHint: file?.type || '',
    formatName,
    codec: audioStream?.codec_name || '',
    audioStream,
    hasAudio: Boolean(audioStream),
    extensionMatches,
    evidence: 'ffprobe',
  };
}

export function identityMismatchMessage(identity) {
  if (!identity || identity.extensionMatches !== false) return '';
  if (identity.kind === 'audio') {
    const detected = identity.codec || identity.formatName || '未知音频';
    return `扩展名 ${identity.extension || '（无）'} 与实际检测到的 ${detected} 不一致`;
  }
  return `扩展名 ${identity.extension || '（无）'} 与实际检测到的 ${identity.containerLabel || '媒体容器'} 不一致`;
}
