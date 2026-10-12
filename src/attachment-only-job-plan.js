import { createSourceAssetSession } from './source-asset-session.js';
import { sanitizeAttachmentFilename } from './attachment-export-policy.js';
import { projectMatroskaTarget } from './container-target-draft.js';

export const PNG_ONLY_PLAN_SCHEMA = 'matroska-png-attachment-only-jobplan-v0';
export const MAX_PNG_ATTACHMENT_BYTES = 16 * 1024 * 1024;

// The binding is deliberately private to this module's process/session.
// A JSON-cloned plan is *not* allowed to borrow its originating File.
const sourceBindings = new WeakMap();

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

function requireSafeName(value) {
  const result = sanitizeAttachmentFilename(value);
  if (!result.saveName || result.byteLength > 180) {
    throw new Error('ATTACHMENT_OUTPUT_NAME_UNSAFE');
  }
  return result;
}

/**
 * Prepare ONE image/png AttachedFile with zero Tracks.
 * This is an experimental creation plan, not a general ContainerDocument
 * executor, remux plan, or positive production capability assertion.
 */
export function preparePngAttachmentOnlyPlan({
  file, filename = file?.name, outputName = 'attachments-only.mkv',
} = {}) {
  if (!file || typeof file.slice !== 'function' ||
      !Number.isSafeInteger(file.size) || file.size <= 0 ||
      file.size > MAX_PNG_ATTACHMENT_BYTES) {
    throw new Error('PNG_SOURCE_MISSING_OR_EXCEEDS_EXPERIMENT_LIMIT');
  }
  const name = requireSafeName(filename);
  const output = requireSafeName(outputName);
  if (!output.saveName.toLowerCase().endsWith('.mkv')) {
    throw new Error('PNG_OUTPUT_MUST_BE_MKV');
  }

  const session = createSourceAssetSession();
  const source = session.register(file, { kind: 'image/png-candidate' });
  const target = projectMatroskaTarget({
    sourceAssets: [{ file, kind: 'attachment-source' }],
    tracks: [],
    attachments: [{
      file, sourceAssetId: 'asset:0', filename: name.saveName,
      mimeType: 'image/png',
    }],
  });
  if (target.kind !== 'attachments-only' || target.diagnostics.length ||
      target.output.tracks.length || target.output.attachments.length !== 1) {
    throw new Error('PNG_ONLY_TARGET_DRAFT_INVALID');
  }
  const plan = freeze({
    schema: PNG_ONLY_PLAN_SCHEMA,
    revision: 'session-plan:' + source.id,
    origin: 'new-empty-matroska',
    executionMode: 'experimental-candidate-only',
    output: {
      filename: output.saveName, container: 'matroska',
      expectedTrackCount: 0, expectedClusterCount: 0,
      expectedAttachmentCount: 1, playable: false,
    },
    sources: [{
      sourceAssetId: source.id,
      metadataKey: source.metadataKey,
      byteLength: file.size,
      identityEvidence: 'session-object-reference',
      contentIdentity: 'unverified',
    }],
    attachments: [{
      id: 'target-attachment:0',
      sourceAssetId: source.id,
      filename: name.saveName,
      declaredMimeType: 'image/png',
      byteLength: file.size,
      fileUid: '1', // unique within this single-attachment Segment
      requiredSignature: 'png',
      originalName: String(filename ?? ''),
      filenameAdjusted: name.transformed,
    }],
    gates: {
      sourceFileReference: 'bound-to-this-process',
      preWritePrefix: 'required',
      maxFileBytes: MAX_PNG_ATTACHMENT_BYTES,
      independentOutputAudit: 'required-before-product-use',
      chapterTagPreservation: 'not-applicable-new-container',
      legacyWriterReplaced: false,
    },
    claims: {
      finalMatroskaConformance: 'unverified',
      extractedBytesEqualInput: 'unverified',
      externalPlayerCompatibility: 'not-tested',
    },
  });
  sourceBindings.set(plan, { file, source, session });
  return plan;
}

export function getBoundPngSourceForCandidate(plan) {
  if (!plan || plan.schema !== PNG_ONLY_PLAN_SCHEMA ||
      !Object.isFrozen(plan)) throw new Error('PNG_ONLY_PLAN_INVALID');
  const binding = sourceBindings.get(plan);
  if (!binding || !binding.session.isCurrent(binding.source, binding.file) ||
      binding.file.size !== plan.attachments[0].byteLength ||
      binding.source.id !== plan.attachments[0].sourceAssetId) {
    throw new Error('PNG_ONLY_SOURCE_BINDING_STALE_OR_FOREIGN');
  }
  return binding.file;
}
