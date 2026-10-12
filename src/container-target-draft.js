import { outputCompositionFileKey } from './output-composition.js';

export const TARGET_DRAFT_SCHEMA = 'matroska-target-draft-v0';
const TRACK_KINDS = new Set(['video', 'audio', 'subtitle', 'data', 'other']);
const label = value => String(value ?? '').trim();
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/**
 * Target composition without a compulsory video root. A pure metadata-only
 * projection: never freezes a browser File, owns edits, or claims writer support.
 */
export function projectMatroskaTarget({
  sourceAssets = [], tracks = [], attachments = [], chapters = [], tags = [],
} = {}) {
  const diagnostics = [];
  const assets = sourceAssets.map((source, ordinal) => {
    const key = source?.file ? outputCompositionFileKey(source.file) : label(source?.assetKey);
    if (!key) diagnostics.push({ code: 'SOURCE_IDENTITY_MISSING', ordinal });
    return {
      id: 'asset:' + ordinal, key, name: label(source?.name || source?.file?.name),
      declaredKind: label(source?.kind) || 'unknown',
      identityEvidence: 'caller-file-metadata-or-key-only',
      contentIdentity: 'unverified',
    };
  });
  const assetIds = new Set(assets.map(item => item.id));
  const checkRef = (sourceAssetId, kind, ordinal) => {
    if (sourceAssetId && !assetIds.has(sourceAssetId)) {
      diagnostics.push({ code: kind + '_SOURCE_UNRESOLVED', ordinal, sourceAssetId });
    }
  };
  const targetTracks = tracks.map((track, ordinal) => {
    const kind = label(track?.kind).toLowerCase() || 'unknown';
    const sourceAssetId = label(track?.sourceAssetId) || null;
    if (!TRACK_KINDS.has(kind)) {
      diagnostics.push({ code: 'TRACK_KIND_UNRECOGNIZED', ordinal, kind });
    }
    checkRef(sourceAssetId, 'TRACK', ordinal);
    return {
      id: 'target-track:' + ordinal, kind, sourceAssetId,
      title: label(track?.title), codec: label(track?.codec),
      inclusion: 'requested', verification: 'unverified',
    };
  });
  const targetAttachments = attachments.map((item, ordinal) => {
    const file = item?.file || null;
    const filename = label(item?.filename || file?.name);
    const mimeType = label(item?.mimeType);
    const sourceAssetId = label(item?.sourceAssetId) || null;
    if (!filename) diagnostics.push({ code: 'ATTACHMENT_FILENAME_MISSING', ordinal });
    if (!mimeType) diagnostics.push({ code: 'ATTACHMENT_MEDIA_TYPE_MISSING', ordinal });
    checkRef(sourceAssetId, 'ATTACHMENT', ordinal);
    return {
      id: 'target-attachment:' + ordinal, sourceAssetId,
      sourceKey: file ? outputCompositionFileKey(file) : label(item?.sourceKey),
      filename, mimeType,
      declaredSize: Number.isSafeInteger(file?.size) && file.size >= 0 ? file.size
        : Number.isSafeInteger(item?.declaredSize) && item.declaredSize >= 0
          ? item.declaredSize : null,
      inclusion: 'requested', bytesEvidence: 'not-inspected', fileUid: 'not-assigned',
    };
  });
  const targetChapters = chapters.map((item, ordinal) => ({
    id: 'target-chapter:' + ordinal, title: label(item?.title),
    uidRelations: 'unverified',
  }));
  const targetTags = tags.map((item, ordinal) => ({
    id: 'target-tag:' + ordinal, name: label(item?.name),
    targetRelations: 'unverified',
  }));

  const hasVideo = targetTracks.some(track => track.kind === 'video');
  const kind = !targetTracks.length && targetAttachments.length ? 'attachments-only'
    : hasVideo ? 'video-containing'
      : targetTracks.length ? 'non-video-tracks'
        : targetChapters.length || targetTags.length ? 'metadata-only' : 'empty';
  return freeze({
    schema: TARGET_DRAFT_SCHEMA, kind, assets,
    output: {
      tracks: targetTracks, attachments: targetAttachments,
      chapters: targetChapters, tags: targetTags,
    },
    diagnostics,
    claims: {
      matroskaConformance: 'not-validated',
      readableByIndependentTools: 'not-tested',
      sourcePreservation: 'not-validated',
      playerCompatibility: 'not-tested',
    },
  });
}

/** A capability report for the EXISTING video-rooted browser writer only. */
export function resolveLegacyTargetCapability(target) {
  if (!target || target.schema !== TARGET_DRAFT_SCHEMA) {
    return freeze({ state: 'cannot-execute', code: 'INVALID_TARGET_DRAFT' });
  }
  if (target.diagnostics.length) {
    return freeze({ state: 'cannot-execute', code: 'TARGET_DRAFT_INCOMPLETE' });
  }
  if (!target.output.tracks.some(track => track.kind === 'video')) {
    return freeze({
      state: 'cannot-execute',
      code: 'LEGACY_VIDEO_ROOT_REQUIRED',
      backend: 'browser-ffmpeg-legacy',
      matroskaConformance: 'not-validated',
    });
  }
  return freeze({
    state: 'requires-runtime-preflight',
    code: 'WRITER_NOT_PROVEN_BY_DRAFT',
    backend: 'browser-ffmpeg-legacy',
    matroskaConformance: 'not-validated',
  });
}
