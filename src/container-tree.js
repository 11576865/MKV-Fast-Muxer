/**
 * One read-only projection of the live MKV scan/edit state. This module never
 * owns edits; the asset-tree controls mutate the existing trackState and the
 * legacy editor reads exactly the same objects.
 */
export function buildContainerTreeModel(trackState, {
  appendMode = false,
  metadataTags = {},
} = {}) {
  if (!trackState) return null;

  const tracked = new Map((trackState.tracks || []).map((track) => [track.index, track]));
  const attachmentByIndex = new Map((trackState.attachments || []).map((item) => [item.index, item]));
  const kinds = [
    ['video', '视频'], ['audio', '音频'], ['subtitle', '字幕'],
    ['data', '数据'], ['other', '其他'], ['attachment', '附件'],
    ['chapter', '章节'], ['metadata', '全局元数据'],
  ];
  const groups = new Map(kinds.map(([key, label]) => [key, { key, label, items: [] }]));

  for (const stream of trackState.streams || []) {
    const kind = groups.has(stream.codec_type) ? stream.codec_type : 'other';
    const track = tracked.get(stream.index) || null;
    const attachment = attachmentByIndex.get(stream.index) || null;
    const status = appendMode ? 'keep'
      : track ? (!track.include ? 'remove' : (
        ['language','title','default','forced','original','commentary','hearingImpaired']
          .some((field) => track[field] !== track['original' + field[0].toUpperCase() + field.slice(1)])
          ? 'modify' : 'keep'
      ))
        : attachment ? (!attachment.include ? 'remove'
          : attachment.filename !== attachment.originalFilename ||
            attachment.mimetype !== attachment.originalMimetype ? 'modify' : 'keep')
          : ['video','data'].includes(kind) ? 'keep' : 'remove';
    groups.get(kind).items.push({ kind, index: stream.index, stream, track, attachment, status });
  }

  for (const [index, chapter] of (trackState.chapters || []).entries()) {
    groups.get('chapter').items.push({ kind: 'chapter', index, chapter, status: 'keep' });
  }
  groups.get('metadata').items.push({
    kind: 'metadata',
    index: 0,
    tags: Object.entries(metadataTags),
    status: 'keep',
  });

  return {
    groups: [...groups.values()].filter((group) => group.items.length > 0),
    streamCount: (trackState.streams || []).length,
    attachmentCount: (trackState.attachments || []).length,
    chapterCount: (trackState.chapters || []).length,
    appendMode,
  };
}
