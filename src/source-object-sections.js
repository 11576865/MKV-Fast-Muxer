import { buildContainerTreeModel } from './container-tree.js';

/**
 * Observed source objects for the 1.0 composition workbench.
 *
 * Input MUST be a trackState already tied to the current exact source File
 * by the caller. This is a read-only projection of ffprobe data; it never
 * creates writer permission, TagUID coverage, or arbitrary EBML editing.
 */
export function buildSourceObjectSections(scannedTrackState, { appendMode = false } = {}) {
  const empty = { scanned: false, attachments: [], chapters: [], tags: [] };
  if (!scannedTrackState) return Object.freeze(empty);

  const tree = buildContainerTreeModel(scannedTrackState, {
    appendMode,
    metadataTags: scannedTrackState.format?.tags || {},
  });
  const ofKind = kind => tree?.groups.find(group => group.key === kind)?.items || [];
  const safe = value => String(value ?? '').slice(0, 1024);
  const attachments = ofKind('attachment').map(row => ({
    id: 'source-attachment:' + row.index,
    sourceIndex: row.index,
    kind: 'attachment',
    title: safe(row.attachment?.filename || row.stream?.tags?.filename ||
      '附件 #' + (row.index + 1)),
    detail: safe(row.attachment?.mimetype || row.stream?.tags?.mimetype ||
      '来源未报告 MIME') + ' · 来源轨道 #' + row.index,
    status: row.status,
    // These are source observations, not independent output edit states.
    evidence: 'ffprobe-stream',
  }));
  const chapters = ofKind('chapter').map(row => {
    const chapter = row.chapter || {};
    const start = chapter.start_time;
    const end = chapter.end_time;
    return {
      id: 'source-chapter:' + row.index,
      kind: 'chapter',
      title: safe(chapter.tags?.title || '章节 #' + (row.index + 1)),
      detail: start == null || end == null
        ? '来源未提供完整时间范围'
        : '时间 ' + safe(start) + ' → ' + safe(end),
      status: 'observed',
      evidence: 'ffprobe-flat-chapter',
    };
  });
  const tags = ofKind('metadata').flatMap(row =>
    (row.tags || []).slice(0, 200).map(([key, value], i) => ({
      id: 'source-format-tag:' + i,
      kind: 'tag',
      title: safe(key),
      detail: safe(value),
      status: 'observed',
      // Container format.tags is not an EBML TagTargets / UID graph.
      evidence: 'ffprobe-format-tags',
    }))
  );
  return Object.freeze({
    scanned: true,
    attachments: Object.freeze(attachments.map(Object.freeze)),
    chapters: Object.freeze(chapters.map(Object.freeze)),
    tags: Object.freeze(tags.map(Object.freeze)),
  });
}
