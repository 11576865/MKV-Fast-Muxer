import { planAttachmentExportNames } from './attachment-export-policy.js';
import { ATTACHMENT_INVENTORY_SCHEMA } from './matroska-attachment-reader.js';

export const EXISTING_ATTACHMENT_EDIT_SCHEMA = 'existing-matroska-attachment-edit-intent-v0';
const MAX_ADDED_FILES = 8;
const MAX_ADDED_BYTES = 32 * 1024 * 1024;
const MAX_SINGLE_BYTES = 16 * 1024 * 1024;
const mimePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const boundDrafts = new WeakMap();

function freezePlain(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezePlain);
    Object.freeze(value);
  }
  return value;
}
function assertAttachmentInput(item, ordinal) {
  const file = item?.file;
  if (!file || typeof file.slice !== 'function' ||
      !Number.isSafeInteger(file.size) || file.size < 1 ||
      file.size > MAX_SINGLE_BYTES) {
    throw new Error('EXISTING_ATTACHMENT_NEW_FILE_INVALID_' + ordinal);
  }
  const mimeType = String(item.mimeType || '').trim().toLowerCase();
  if (mimeType.length > 100 || !mimePattern.test(mimeType)) {
    throw new Error('EXISTING_ATTACHMENT_MIME_INVALID_' + ordinal);
  }
  return { file, mimeType, filename: String(item.filename ?? file.name ?? '') };
}
function block(code, details = []) {
  return { state: 'BLOCKED', code, reasons: details };
}

/**
 * Preview additions/removals/replacements to an existing MKV, but NEVER
 * convert this intent into executable JobPlan. Any source UID references,
 * unparsed EBML relations and unknown writer preservation are distinct risks.
 *
 * Actions: retain/remove/replace by observed attachmentId; add with a fresh
 * File-like source. Retain is implicit for every unmentioned source item.
 *
 * This method runs both inspection and structural preflight over the real
 * bound source reader, not a caller-forged "clean" risk report.
 */
export async function createExistingAttachmentEditIntent({
  reader, actions = [], approveFilenameAdjustments = false,
} = {}) {
  if (!reader?.inspect || !reader?.inspectPreservation ||
      !reader?.isCurrentInspection || !Array.isArray(actions)) {
    throw new Error('EXISTING_ATTACHMENT_SOURCE_OR_ACTIONS_INVALID');
  }
  const inventory = await reader.inspect();
  if (inventory?.schema !== ATTACHMENT_INVENTORY_SCHEMA ||
      inventory.state !== 'inspected') {
    throw new Error('EXISTING_ATTACHMENT_SOURCE_UNVERIFIED');
  }
  const preservation = await reader.inspectPreservation();
  if (!reader.isCurrentInspection(inventory)) {
    throw new Error('EXISTING_ATTACHMENT_SOURCE_REINSPECTED_DURING_PLAN');
  }

  const sourceById = new Map();
  const seenUids = new Set();
  for (const item of inventory.attachments) {
    if (sourceById.has(item.id) || seenUids.has(item.fileUid)) {
      throw new Error('EXISTING_ATTACHMENT_SOURCE_DUPLICATE_ID_OR_UID');
    }
    sourceById.set(item.id, item);
    seenUids.add(item.fileUid);
  }
  const perId = new Map();
  const newItems = [];
  const newFiles = new Set();
  let newBytes = 0;
  let index = 0;
  for (const action of actions) {
    const kind = String(action?.type || '');
    if (!['retain', 'remove', 'replace', 'add'].includes(kind)) {
      throw new Error('EXISTING_ATTACHMENT_OPERATION_UNRECOGNIZED_' + index);
    }
    if (kind !== 'add') {
      const id = String(action.attachmentId || '');
      if (!sourceById.has(id)) throw new Error('EXISTING_ATTACHMENT_SELECTION_STALE_' + index);
      if (perId.has(id)) throw new Error('EXISTING_ATTACHMENT_CONFLICTING_EDIT_' + index);
      perId.set(id, { kind, id });
    }
    if (kind === 'replace' || kind === 'add') {
      if (newItems.length >= MAX_ADDED_FILES) {
        throw new Error('EXISTING_ATTACHMENT_NEW_FILE_COUNT_LIMIT');
      }
      const normalized = assertAttachmentInput(action, index);
      if (newFiles.has(normalized.file)) {
        throw new Error('EXISTING_ATTACHMENT_NEW_SOURCE_DUPLICATED');
      }
      newFiles.add(normalized.file);
      newBytes += normalized.file.size;
      if (newBytes > MAX_ADDED_BYTES) throw new Error('EXISTING_ATTACHMENT_NEW_TOTAL_LIMIT');
      newItems.push({ ...normalized, kind, id: kind === 'replace'
        ? String(action.attachmentId) : null, ordinal: index });
    }
    index++;
  }

  const retained = inventory.attachments
    .filter(item => !['remove', 'replace'].includes(perId.get(item.id)?.kind));
  const proposals = planAttachmentExportNames(
    newItems.map(item => ({
      id: String(item.ordinal), filename: item.filename, mimeType: item.mimeType,
    })),
    { existingNames: retained.map(item => item.filename) },
  );
  const reviewedNames = proposals.entries.map((entry, i) => ({
    name: entry.proposedSaveName,
    adjusted: entry.proposedSaveName !== newItems[i].filename,
    reasons: [...entry.reasons],
  }));
  if (!approveFilenameAdjustments && reviewedNames.some(item => item.adjusted)) {
    throw new Error('EXISTING_ATTACHMENT_FILENAME_REVIEW_REQUIRED');
  }
  const newByOldId = new Map();
  const additions = [];
  const fileBindings = [];
  newItems.forEach((item, i) => {
    const original = {
      proposedId: 'proposed:new:' + i,
      origin: item.kind === 'replace' ? 'replacement' : 'addition',
      replacesAttachmentId: item.id,
      filename: reviewedNames[i].name,
      originalRequestedFilename: item.filename,
      renamed: reviewedNames[i].adjusted,
      renameReasons: reviewedNames[i].reasons,
      mimeType: item.mimeType,
      byteLength: item.file.size,
      proposedFileUid: 'requires-writer-allocation',
      sourceContentIdentity: 'unverified',
      relationSafety: 'unverified',
    };
    if (item.kind === 'replace') newByOldId.set(item.id, original);
    else additions.push(original);
    fileBindings.push(item.file);
  });

  const sourceEffects = inventory.attachments.map(item => {
    const action = perId.get(item.id)?.kind || 'retain';
    return {
      sourceAttachmentId: item.id,
      sourceFileUid: item.fileUid,
      originalFilename: item.filename,
      originalMimeType: item.mimeType,
      sourceByteLength: item.byteLength,
      action,
      result: action === 'replace' ? newByOldId.get(item.id) : null,
      uidRelations: 'unverified',
      preservation: action === 'retain'
        ? 'requires-whole-container-writer-proof'
        : 'requires-reference-impact-and-writer-proof',
    };
  });
  const changed = sourceEffects.some(x => x.action !== 'retain') ||
    additions.length > 0;
  const preservationReport = {
    state: preservation.state,
    reasons: [...(preservation.reasons || [])],
    warnings: [...(preservation.warnings || [])],
    evidence: preservation.evidence || 'unknown',
  };
  const relationRisk = preservation.state === 'UNVERIFIED_REFERENCES' ||
    preservationReport.warnings.some(text => /UID|关联|附件|轨道/.test(text));
  let capability;
  if (!changed) capability = block('NO_WRITE_REQUESTED', [
    'This is a read-only source plan; no output transaction is authorized.',
  ]);
  else if (preservation.state === 'BLOCKED_RISK' ||
      preservation.state === 'BLOCKED_UNKNOWN' ||
      preservation.state === 'NOT_MATROSKA') {
    capability = block('SOURCE_STRUCTURAL_PRESERVATION_BLOCKED', preservationReport.reasons);
  } else if (relationRisk) {
    capability = block('SOURCE_UID_RELATIONS_UNVERIFIED', preservationReport.warnings);
  } else {
    capability = block('EXISTING_MATROSKA_WRITER_NOT_PROVEN', [
      'No backend independently proves preservation of unknown EBML, Chapters, Tags and source stream data.',
    ]);
  }
  const draft = freezePlain({
    schema: EXISTING_ATTACHMENT_EDIT_SCHEMA,
    state: 'DRAFT_ONLY_WRITE_BLOCKED',
    source: {
      assetId: inventory.source.id,
      name: inventory.source.name,
      metadataKey: inventory.source.metadataKey,
      identityEvidence: inventory.source.identityEvidence,
      contentIdentity: 'unverified',
    },
    sourceObservation: {
      sourceAttachmentCount: inventory.attachments.length,
      hasTracksElement: inventory.structure.hasTracksElement,
      hasClusterElement: inventory.structure.hasClusterElement,
      wholeEbmlPreservation: 'unverified',
      uidTagRelations: relationRisk ? 'observed-unverified' : 'not-proven',
    },
    preservationPreflight: preservationReport,
    proposedChanges: {
      effects: sourceEffects,
      additions,
      changed,
      nameChangesApproved: approveFilenameAdjustments,
    },
    capability,
    execution: {
      writer: null, output: null, approvedToWrite: false,
      wouldModifyExistingMatroska: changed,
      independentSemanticPreservationAudit: 'required-before-any-future-writer',
    },
  });
  boundDrafts.set(draft, { reader, inventory, files: fileBindings });
  return draft;
}

export function isExistingAttachmentEditIntentCurrent(draft) {
  const bound = boundDrafts.get(draft);
  return Boolean(bound && bound.reader.isCurrentInspection(bound.inventory) &&
    bound.files.every(file => file && typeof file.slice === 'function'));
}
