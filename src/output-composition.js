import { buildContainerTreeModel } from './container-tree.js';

// The sole authority is still the existing FFprobe scan / source-track edits,
// externalAudioState, newSubtitleState and selected fonts. This is an immutable
// display projection, NOT a second editable track collection or a mux plan.
export const outputCompositionFileKey = (file) => {
  if (!file) return '';
  return `${file.webkitRelativePath || file.name || ''}|${file.size ?? 0}|${file.lastModified ?? 0}`;
};
const label = (value, fallback) => String(value || '').trim() || fallback;
const flagSummary = (track) => [
  track?.language && track.language !== 'und' ? track.language : '',
  track?.default ? 'Default' : '',
  track?.forced ? 'Forced' : '',
].filter(Boolean).join(' · ');

/**
 * Project visible output composition from domain-owned state.
 *
 * 'pending' is deliberately NOT called a video or audio track: classifying a
 * container header does not establish its internal stream structure.
 * 'remove' rows are retained to allow review/recovery but never counted as
 * included output. Append-all ignores stale selective-edit fields.
 */
export function buildOutputComposition({
  video = null,
  trackState = null,
  appendMode = false,
  externalAudio = [],
  newSubtitles = [],
  fonts = [],
  fontMode = 'preserve',
  unsupportedAssets = [],
} = {}) {
  const items = [];
  const sourceScanned = Boolean(video && trackState &&
    (!trackState.fileKey || trackState.fileKey === `${video.name}|${video.size}|${video.lastModified}`));
  if (video && !sourceScanned) {
    items.push({
      id: `source-pending:${outputCompositionFileKey(video)}`,
      kind: 'source', title: video.name,
      detail: '源轨道待核验', status: 'pending', included: true,
      target: null,
    });
  }

  if (sourceScanned) {
    const tree = buildContainerTreeModel(trackState, { appendMode });
    for (const group of tree?.groups || []) {
      for (const item of group.items) {
        if (['chapter', 'metadata', 'data', 'other'].includes(item.kind)) continue;
        const track = item.track;
        const attachment = item.attachment;
        const stream = item.stream || {};
        const kind = item.kind;
        const title = attachment
          ? label(attachment.filename, `附件 #${item.index}`)
          : label(track?.title || stream.tags?.title,
            `${label(stream.codec_name, kind)} #${item.index}`);
        items.push({
          id: `source:${kind}:${item.index}`,
          kind,
          title,
          detail: [
            label(stream.codec_name, kind),
            flagSummary(appendMode ? {
              language: stream.tags?.language,
              default: stream.disposition?.default,
              forced: stream.disposition?.forced,
            } : track),
          ].filter(Boolean).join(' · '),
          status: item.status,
          included: appendMode || item.status !== 'remove',
          // Selection resolves against the existing source inspector's index.
          target: { type: 'source', key: `${kind}:${item.index}` },
        });
      }
    }
  }

  for (const [kind, rows] of [['audio', externalAudio], ['subtitle', newSubtitles]]) {
    for (const item of rows || []) {
      if (!item.file) continue;
      items.push({
        id: `external:${kind}:${outputCompositionFileKey(item.file)}`,
        kind, title: label(item.title, item.displayName || item.file.name),
        detail: [
          kind === 'subtitle' ? label(item.format?.label, '字幕') : '外部音频',
          flagSummary(item),
        ].filter(Boolean).join(' · '),
        status: 'add', included: true,
        target: { type: 'external', kind, fileKey: outputCompositionFileKey(item.file) },
      });
    }
  }

  const subtitleNeedsFonts = (newSubtitles || []).some(track => track.format?.assLike);
  const attachedFonts = fontMode === 'force' && subtitleNeedsFonts ? (fonts || []).slice(0, 1) : (fonts || []);
  for (const font of attachedFonts) {
    items.push({
      id: `font:${outputCompositionFileKey(font)}`, kind: 'font',
      title: font.name, detail: '字体附件',
      status: 'add', included: true,
      target: { type: 'font', fileKey: outputCompositionFileKey(font) },
    });
  }

  const counts = { video: 0, audio: 0, subtitle: 0, font: 0, attachment: 0, source: 0 };
  for (const item of items) {
    if (item.included) counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  const diagnostics = (unsupportedAssets || []).map(asset => ({
    id: `unusable:${asset.key || outputCompositionFileKey(asset.file)}`,
    title: asset.file?.name || '未识别文件',
    reason: asset.detail || '此文件无法参与封装',
  }));
  const changes = items.filter(item => item.status === 'add' || item.status === 'modify' || item.status === 'remove')
    .map(item => ({ id: item.id, title: item.title, status: item.status }));
  return {
    source: video ? { name: video.name, id: outputCompositionFileKey(video), scanned: sourceScanned } : null,
    items, counts, changes, diagnostics,
    // True only when actual stream data are known; never claim unscanned
    // container-specific track counts as verified.
    verifiedTrackStructure: sourceScanned,
  };
}
