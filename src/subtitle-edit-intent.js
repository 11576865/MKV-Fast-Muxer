import { outputCompositionFileKey } from './output-composition.js';
import { normalizeTrackLanguage } from './mux-command.js';

export const SUBTITLE_INTENT_SCHEMA = 'add-external-subtitle-intents-v0';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// This is a draft snapshot, NOT an authenticated asset ID, commit revision,
// executable plan or authority over legacy editor state.
export function buildSubtitleEditIntentSnapshot({ source = null, newSubtitles = [] } = {}) {
  const sourceKey = outputCompositionFileKey(source);
  const intents = [];
  const diagnostics = [];
  const seen = new Set();

  for (const [ordinal, track] of (newSubtitles || []).entries()) {
    if (!track?.file) {
      diagnostics.push({ code: 'MISSING_SUBTITLE_FILE', ordinal });
      continue;
    }
    const assetKey = outputCompositionFileKey(track.file);
    // The ordinal is part of this draft occurrence's identity; it is NOT a
    // persistent track UID. The same file may be intentionally added twice.
    const id = 'draft:' + encodeURIComponent(sourceKey || 'no-source') +
      '/subtitle:' + ordinal + ':' + encodeURIComponent(assetKey);
    if (seen.has(assetKey)) {
      diagnostics.push({ code: 'REPEATED_ASSET_IN_DRAFT', ordinal, assetKey });
    }
    seen.add(assetKey);
    intents.push({
      id,
      kind: 'add-external-subtitle',
      ordinal,
      sourceKey,
      asset: {
        key: assetKey,
        name: track.file.name || '',
        evidence: 'path-size-lastModified-only',
      },
      desired: {
        title: track.title || '',
        language: normalizeTrackLanguage(track.language),
        default: Boolean(track.default),
        forced: Boolean(track.forced),
        original: Boolean(track.original),
        commentary: Boolean(track.commentary),
        hearingImpaired: Boolean(track.hearingImpaired),
        codecOverride: track.codecOverride || null,
      },
    });
  }

  // Explicit textual draft revision, not a cryptographic proof and not a
  // revision of unrelated track, font or Matroska structure edits.
  const revision = JSON.stringify({
    schema: SUBTITLE_INTENT_SCHEMA,
    sourceKey,
    entries: intents.map(({ ordinal, asset, desired }) =>
      ({ ordinal, assetKey: asset.key, desired })),
    missingOrdinals: diagnostics.filter(x => x.code === 'MISSING_SUBTITLE_FILE')
      .map(x => x.ordinal),
  });

  return freeze({
    schema: SUBTITLE_INTENT_SCHEMA,
    sourceKey,
    intents,
    revision,
    diagnostics,
    state: source ? 'inspectable-not-executable' : 'requires-source',
    authority: 'legacy-subtitle-editor',
  });
}

// Only confirms the SAME draft inputs according to this weak metadata key.
// The legacy executor must still validate source, files, compatibility,
// preservation preflight, output identity and user changes at execution time.
export function isSubtitleEditIntentSnapshotCurrent(snapshot, currentInputs) {
  if (!snapshot || snapshot.schema !== SUBTITLE_INTENT_SCHEMA) return false;
  return buildSubtitleEditIntentSnapshot(currentInputs).revision === snapshot.revision;
}

/**
 * Narrow adapter for command-equivalence testing only. These paths/input
 * indices are assigned by existing FFmpeg staging; they are not invented by
 * the draft and cannot be used as proof that the target supports writing.
 */
export function bindSubtitleIntentsToLegacyDescriptors(snapshot, {
  bindings = [],
  expectedRevision,
} = {}) {
  if (!snapshot || snapshot.schema !== SUBTITLE_INTENT_SCHEMA ||
      !snapshot.sourceKey || snapshot.revision !== expectedRevision ||
      snapshot.diagnostics.some(x => x.code === 'MISSING_SUBTITLE_FILE')) {
    throw new Error('Subtitle intent draft lacks a valid source or current revision');
  }
  if (bindings.length !== snapshot.intents.length) {
    throw new Error('Subtitle staging binding count mismatch');
  }
  const rows = snapshot.intents.map((intent, index) => {
    const binding = bindings[index];
    if (!binding || binding.assetKey !== intent.asset.key ||
        typeof binding.path !== 'string' || !binding.path ||
        !Number.isInteger(binding.inputIndex) || binding.inputIndex < 1) {
      throw new Error('Subtitle staging identity or input index mismatch');
    }
    return {
      path: binding.path,
      inputIndex: binding.inputIndex,
      ...intent.desired,
    };
  });
  if (new Set(rows.map(x => x.inputIndex)).size !== rows.length) {
    throw new Error('Repeated FFmpeg subtitle input index');
  }
  return freeze(rows);
}
