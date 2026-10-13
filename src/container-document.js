import { buildOutputComposition, outputCompositionFileKey } from './output-composition.js';
import { buildSubtitleEditIntentSnapshot } from './subtitle-edit-intent.js';

// P1 vertical slice: this is a read-only snapshot, not an independent store of
// editable tracks. The existing trackState and external-resource editors remain
// the sole write owners; the existing FFmpeg executor remains authoritative.
export const CONTAINER_DOCUMENT_SCHEMA = 'container-document-projection-v0';

const nameOf = (value, fallback) => String(value || '').trim() || fallback;
const kindOf = stream => ['video', 'audio', 'subtitle', 'attachment', 'data']
  .includes(stream?.codec_type) ? stream.codec_type : 'other';
const scopedId = (scope, suffix) => scope + '/' + suffix;

function freezeSnapshot(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value;
}

/**
 * Build an inspection/plan projection from the SAME live data that powers the
 * legacy single-file editor. No commands, writes, mutable aliases or fabricated
 * track lists are created here.
 *
 * ffprobe's flat Chapters and Tags are observations, not evidence that a
 * writer can preserve nested EBML, UID relationships or unknown elements.
 */
export function buildContainerDocument({
  video = null,
  trackState = null,
  appendMode = false,
  externalAudio = [],
  newSubtitles = [],
  fonts = [],
  fontMode = 'preserve',
  unsupportedAssets = [],
} = {}) {
  const composition = buildOutputComposition({
    video, trackState, appendMode, externalAudio, newSubtitles, fonts,
    fontMode, unsupportedAssets,
  });
  const subtitleEditIntents = buildSubtitleEditIntentSnapshot({ source: video, newSubtitles });
  const sourceKey = outputCompositionFileKey(video);
  const scope = 'container:' + encodeURIComponent(sourceKey || 'empty');
  const observed = composition.verifiedTrackStructure;
  const objects = composition.items.map(item => {
    const key = item.target?.type === 'source' ? item.target.key : '';
    const track = (trackState?.tracks || []).find(row =>
      key === row.type + ':' + row.index);
    const attachment = (trackState?.attachments || []).find(row =>
      key === 'attachment:' + row.index);
    const stream = track?.stream || attachment?.stream;
    // Attributes must reflect the effective editing surface. Append-all
    // ignores selective edits, so export the ORIGINAL scanned values there.
    const attributes = track && ['audio', 'subtitle'].includes(track.type)
      ? {
        title: appendMode ? (stream?.tags?.title || '') : track.title,
        language: appendMode ? (stream?.tags?.language || 'und') : track.language,
        default: appendMode ? Boolean(stream?.disposition?.default) : Boolean(track.default),
        forced: appendMode ? Boolean(stream?.disposition?.forced) : Boolean(track.forced),
      } : attachment ? {
        name: appendMode ? attachment.originalFilename : attachment.filename,
        mime: appendMode ? attachment.originalMimetype : attachment.mimetype,
      } : undefined;
    // Store a separate read-only baseline from the SOURCE scan. This allows
    // export to encode a scan-to-current delta rather than a context-free
    // final snapshot; it does not assert trusted historical user actions.
    const originalAttributes = track && ['audio', 'subtitle'].includes(track.type)
      ? {
        title: track.originalTitle ?? (stream?.tags?.title || ''),
        language: track.originalLanguage ?? (stream?.tags?.language || 'und'),
        default: Boolean(track.originalDefault ?? stream?.disposition?.default),
        forced: Boolean(track.originalForced ?? stream?.disposition?.forced),
      } : undefined;
    return {
      id: scopedId(scope, item.id),
      kind: item.kind,
      title: item.title,
      status: item.status,
      included: item.included,
      ...(attributes ? { attributes } : {}),
      ...(originalAttributes ? { originalAttributes, originalIncluded: true } : {}),
      // Source-scanned rows can be bound to the actual source, but an
      // external asset remains detached even when it has a similar name.
      target: item.target ? { ...item.target } : null,
      evidence: item.status === 'pending' ? 'header-only' :
        item.target?.type === 'source' ? 'ffprobe-stream' : 'current-editor-projection',
    };
  });

  if (observed) {
    const representedStreams = new Set(
      composition.items.filter(item => item.id.startsWith('source:'))
        .map(item => item.id)
    );
    for (const stream of trackState.streams || []) {
      const kind = kindOf(stream);
      const key = 'source:' + kind + ':' + stream.index;
      if (representedStreams.has(key)) continue;
      objects.push({
        id: scopedId(scope, 'observed-stream:' + stream.index),
        kind,
        title: nameOf(stream.tags?.title, nameOf(stream.codec_name, kind) + ' #' + stream.index),
        status: 'observed-only',
        included: null,
        target: null,
        evidence: 'ffprobe-stream',
      });
    }

    // Not all legal Matroska Chapter/Tag structures are visible to ffprobe.
    for (const [index, chapter] of (trackState.chapters || []).entries()) {
      objects.push({
        id: scopedId(scope, 'observed-chapter:' + index),
        kind: 'chapter',
        title: nameOf(chapter.tags?.title, 'Chapter #' + index),
        status: 'observed-only',
        included: null,
        target: null,
        evidence: 'ffprobe-flat-chapter',
      });
    }
    const tags = Object.keys(trackState.format?.tags || {}).sort();
    if (tags.length) {
      objects.push({
        id: scopedId(scope, 'observed-global-metadata'),
        kind: 'metadata',
        title: 'Global metadata',
        keys: tags,
        status: 'observed-only',
        included: null,
        target: null,
        evidence: 'ffprobe-global-tags',
      });
    }
  }

  const ids = new Set();
  const identityDiagnostics = [];
  for (const object of objects) {
    if (ids.has(object.id)) {
      identityDiagnostics.push({
        code: 'DUPLICATE_PROJECTION_ID',
        objectId: object.id,
      });
    }
    ids.add(object.id);
  }

  return freezeSnapshot({
    schema: CONTAINER_DOCUMENT_SCHEMA,
    sourceKey,
    sourceScanKey: observed ? trackState.fileKey : null,
    source: video ? {
      id: scope,
      name: video.name || '',
      identityEvidence: 'file-path-size-lastModified',
      inspection: observed ? 'ffprobe-projected' : 'pending',
    } : null,
    objects,
    composition,
    identityDiagnostics,
    subtitleEditIntents,
    execution: {
      authority: 'legacy-single-file-executor',
      state: video ? 'not-validated-by-this-projection' : 'requires-video-source',
      // The current authoring flow is video-rooted. A resource-only plan can
      // be inspected but must not be presented as executable.
      supportsResourceOnlyOutput: false,
      wholeEbmlPreservation: 'unverified',
    },
  });
}

/**
 * Display IDs are legacy editor routes and can repeat between source files.
 * Only retain a selection in the same source namespace and current snapshot.
 */
export function reconcileContainerSelection(document, previousSourceKey, selectedId) {
  if (!selectedId || previousSourceKey !== document.sourceKey) return '';
  return document.composition.items.some(item => item.id === selectedId)
    ? selectedId : '';
}
