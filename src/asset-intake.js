import { sniffContainerBytes, containerLabel } from './media-identity.js';
import { sniffSubtitleBytes, subtitleFormatById } from './subtitle-format.js';
import { sniffFontBytes, fontIdentityLabel } from './font-identity.js';

// These states describe what the lightweight content scan knows; a container
// header does NOT establish that the container actually has a video stream.
// Existing ffprobe and output-audit paths remain authoritative.
export const ASSET_STATUS = Object.freeze({
  RECOGNIZED: 'recognized',
  UNVERIFIED: 'unverified',
  UNSUPPORTED: 'unsupported',
});

export function assetIntakeKey(file) {
  const path = String(file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/');
  return `${path}|${file?.size ?? 0}|${file?.lastModified ?? 0}`;
}

function audioHeader(bytes) {
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'FLAC';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'WAV';
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'Ogg (codec 未验证)';
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'MP3 (ID3)';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'MPEG Audio / ADTS (待验证)';
  }
  return '';
}

export function classifyAssetBytes(file, input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const media = sniffContainerBytes(bytes);
  if (media.container !== 'unknown') {
    return {
      file,
      key: assetIntakeKey(file),
      kind: 'container',
      status: ASSET_STATUS.UNVERIFIED,
      label: containerLabel(media.container),
      evidence: media.evidence,
      detail: '已识别容器头；内部视频、音频、字幕及附件须由 ffprobe 进一步验证。',
    };
  }

  const font = sniffFontBytes(bytes);
  if (font.container !== 'unknown') {
    return {
      file,
      key: assetIntakeKey(file),
      kind: 'font',
      status: ASSET_STATUS.UNVERIFIED,
      label: fontIdentityLabel(font),
      evidence: font.evidence,
      detail: '已识别字体结构；内部 face 与可用性由字体解析器进一步验证。',
    };
  }

  const subtitle = sniffSubtitleBytes(bytes);
  const format = subtitleFormatById(subtitle.id);
  if (format) {
    return {
      file,
      key: assetIntakeKey(file),
      kind: 'subtitle',
      status: ASSET_STATUS.RECOGNIZED,
      label: format.label,
      evidence: subtitle.evidence,
      sidecarOnly: Boolean(format.sidecarOnly),
      detail: format.sidecarOnly
        ? 'VobSub 数据侧车；需要匹配的 IDX 文件。'
        : format.requiresSidecar
          ? 'VobSub 索引；需要匹配的 SUB 文件。'
          : '内容签名已识别；由字幕配对与封装检查进一步验证。',
    };
  }

  const audio = audioHeader(bytes);
  if (audio) {
    return {
      file,
      key: assetIntakeKey(file),
      kind: 'audio',
      status: ASSET_STATUS.UNVERIFIED,
      label: audio,
      evidence: 'audio-header',
      detail: '已识别音频文件头；编码、轨道结构和 Stream Copy 仍待 ffprobe 验证。',
    };
  }

  return {
    file,
    key: assetIntakeKey(file),
    kind: 'unknown',
    status: ASSET_STATUS.UNSUPPORTED,
    label: '未识别',
    evidence: 'no-known-content-signature',
    detail: '没有足够的实际内容证据，文件未分配给任何轨道；请移除或使用后续支持的格式。',
  };
}

export async function identifyImportedAsset(file, { maxBytes = 256 * 1024 } = {}) {
  try {
    const data = new Uint8Array(await file.slice(0, maxBytes).arrayBuffer());
    return classifyAssetBytes(file, data);
  } catch (error) {
    return {
      file,
      key: assetIntakeKey(file),
      kind: 'unknown',
      status: ASSET_STATUS.UNSUPPORTED,
      label: '读取失败',
      evidence: 'file-read-error',
      detail: error?.message || String(error),
    };
  }
}

// Do not silently pick the first container if more than one is present.
export function resolveImportedRoles(entries, selectedSourceKey = '') {
  const containers = entries.filter((entry) => entry.kind === 'container');
  const unique = containers.length === 1 ? containers[0].key : '';
  const sourceKey = containers.some((entry) => entry.key === selectedSourceKey)
    ? selectedSourceKey
    : unique;
  return {
    sourceKey,
    needsSourceChoice: containers.length > 1 && !sourceKey,
    unknown: entries.filter((entry) => entry.status === ASSET_STATUS.UNSUPPORTED),
    video: containers.find((entry) => entry.key === sourceKey)?.file || null,
    subtitles: entries.filter((entry) => entry.kind === 'subtitle').map((entry) => entry.file),
    fonts: entries.filter((entry) => entry.kind === 'font').map((entry) => entry.file),
    audio: entries.filter((entry) => entry.kind === 'audio').map((entry) => entry.file),
    unassignedContainers: containers.filter((entry) => entry.key !== sourceKey),
  };
}

/**
 * Batch roles are not single-job roles: every video-bearing container is a
 * candidate for its own job. Never silently append a standalone audio file
 * that the batch mux engine cannot currently map.
 * Classification is a header-level claim; identifyBatchVideos supplies the
 * authoritative stream scan and pairing safety checks afterward.
 */
export function resolveBatchImportedAssets(entries) {
  const containers = [];
  const subtitles = [];
  const fonts = [];
  const unsupported = [];
  for (const entry of entries) {
    if (entry.kind === 'container') containers.push(entry.file);
    else if (entry.kind === 'subtitle') subtitles.push(entry.file);
    else if (entry.kind === 'font') fonts.push(entry.file);
    else unsupported.push(entry);
  }
  return { containers, subtitles, fonts, unsupported };
}
