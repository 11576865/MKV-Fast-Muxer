import { createSourceAssetSession } from './source-asset-session.js';
import { planAttachmentExportNames, sanitizeAttachmentFilename } from './attachment-export-policy.js';
import { projectMatroskaTarget } from './container-target-draft.js';

export const MULTI_ATTACHMENT_PLAN_SCHEMA = 'matroska-multi-attachment-only-jobplan-v0';
export const MAX_ATTACHED_FILES = 8;
export const MAX_SINGLE_ATTACHMENT_BYTES = 16 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 32 * 1024 * 1024;

const bindings = new WeakMap();
const mimePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const freezePlain = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezePlain);
    Object.freeze(value);
  }
  return value;
};

/**
 * Compile a NEW Matroska with only generic AttachedFile objects. This is an
 * experimental capability, NOT a production edit/remux or BatchRunner plan.
 * Every potentially surprising filename change needs caller acknowledgement.
 */
export function prepareMultiAttachmentOnlyPlan({
  attachments = [], outputName = 'attachments-only.mkv',
  approveFilenameAdjustments = false,
} = {}) {
  if (!Array.isArray(attachments) || attachments.length < 2 ||
      attachments.length > MAX_ATTACHED_FILES) {
    throw new Error('MULTI_ATTACHMENT_COUNT_OUTSIDE_EXPERIMENT_LIMIT');
  }
  const output = sanitizeAttachmentFilename(outputName);
  if (!output.saveName.toLowerCase().endsWith('.mkv') || output.transformed) {
    throw new Error('MULTI_ATTACHMENT_OUTPUT_NAME_NOT_APPROVED');
  }

  const files = [];
  const names = [];
  const declaredMimes = [];
  const uniqueObjects = new Set();
  let totalBytes = 0;
  for (const [ordinal, item] of attachments.entries()) {
    const file = item?.file;
    if (!file || typeof file.slice !== 'function' ||
        !Number.isSafeInteger(file.size) || file.size < 1 ||
        file.size > MAX_SINGLE_ATTACHMENT_BYTES) {
      throw new Error('MULTI_ATTACHMENT_INVALID_FILE_' + ordinal);
    }
    if (uniqueObjects.has(file)) throw new Error('MULTI_ATTACHMENT_DUPLICATE_SOURCE_REFERENCE');
    uniqueObjects.add(file);
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error('MULTI_ATTACHMENT_TOTAL_BUDGET_EXCEEDED');
    }
    const mime = String(item.mimeType || '').trim().toLowerCase();
    if (mime.length > 100 || !mimePattern.test(mime)) {
      throw new Error('MULTI_ATTACHMENT_MIME_SYNTAX_INVALID_' + ordinal);
    }
    files.push(file);
    names.push({ id: String(ordinal), filename: String(item.filename ?? file.name ?? '') ,
      mimeType: mime });
    declaredMimes.push(mime);
  }

  const proposals = planAttachmentExportNames(names);
  const renameRecords = proposals.entries.map((entry, i) => ({
    originalName: names[i].filename,
    writtenName: entry.proposedSaveName,
    reasons: entry.reasons,
  }));
  if (!approveFilenameAdjustments &&
      renameRecords.some(entry => entry.originalName !== entry.writtenName)) {
    throw new Error('MULTI_ATTACHMENT_FILENAME_REVIEW_REQUIRED');
  }
  // Validated source refs never become fields in the frozen/serializable plan.
  const session = createSourceAssetSession();
  const sources = files.map(file => session.register(file, { kind: 'attachment-only-source' }));
  const target = projectMatroskaTarget({
    sourceAssets: files.map(file => ({ file, kind: 'generic-attached-file' })),
    tracks: [],
    attachments: files.map((file, ordinal) => ({
      file, sourceAssetId: 'asset:' + ordinal,
      filename: renameRecords[ordinal].writtenName,
      mimeType: declaredMimes[ordinal],
    })),
  });
  if (target.kind !== 'attachments-only' || target.diagnostics.length ||
      target.output.tracks.length || target.output.attachments.length !== files.length) {
    throw new Error('MULTI_ATTACHMENT_COMPOSITION_INVALID');
  }

  const plan = freezePlain({
    schema: MULTI_ATTACHMENT_PLAN_SCHEMA,
    revision: 'session-plan:' + session.sessionId,
    executionMode: 'experimental-candidate-only',
    origin: 'new-empty-matroska',
    output: {
      filename: output.saveName, container: 'matroska',
      expectedTrackCount: 0, expectedClusterCount: 0,
      expectedAttachmentCount: files.length, playable: false,
    },
    sources: sources.map((source, ordinal) => ({
      sourceAssetId: source.id,
      metadataKey: source.metadataKey,
      byteLength: files[ordinal].size,
      identityEvidence: 'session-object-reference',
      contentIdentity: 'unverified',
    })),
    attachments: sources.map((source, ordinal) => ({
      id: 'target-attachment:' + ordinal,
      sourceAssetId: source.id,
      originalName: renameRecords[ordinal].originalName,
      filename: renameRecords[ordinal].writtenName,
      filenameAdjustments: renameRecords[ordinal].reasons,
      declaredMimeType: declaredMimes[ordinal],
      byteLength: files[ordinal].size,
      fileUid: String(ordinal + 1),
      payloadSafety: 'unverified',
    })),
    gates: {
      sourceBinding: 'strict-session-reference',
      filenameAdjustmentsReviewed: approveFilenameAdjustments,
      maxAttachments: MAX_ATTACHED_FILES,
      maxSingleBytes: MAX_SINGLE_ATTACHMENT_BYTES,
      maxTotalBytes: MAX_TOTAL_ATTACHMENT_BYTES,
      independentOutputAudit: 'required-before-production',
      sourcePreservation: 'not-applicable-new-container',
      legacyWriterReplaced: false,
    },
    claims: {
      matroskaConformance: 'not-validated',
      extractedByteEquality: 'not-validated',
      mimeContentMatch: 'not-validated',
      executableContentSafety: 'not-validated',
    },
  });
  bindings.set(plan, { files: Object.freeze(files), sources, session });
  return plan;
}

export function getBoundMultiAttachmentSources(plan) {
  if (!plan || plan.schema !== MULTI_ATTACHMENT_PLAN_SCHEMA ||
      !Object.isFrozen(plan)) throw new Error('MULTI_ATTACHMENT_PLAN_INVALID');
  const binding = bindings.get(plan);
  if (!binding || binding.files.length !== plan.attachments.length ||
      !plan.attachments.every((item, ordinal) =>
        item.sourceAssetId === binding.sources[ordinal].id &&
        item.byteLength === binding.files[ordinal].size &&
        binding.session.isCurrent(binding.sources[ordinal], binding.files[ordinal]))) {
    throw new Error('MULTI_ATTACHMENT_SOURCE_BINDING_STALE_OR_FORGED');
  }
  return binding.files;
}
