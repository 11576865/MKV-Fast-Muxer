import { projectMatroskaTarget } from './container-target-draft.js';
import { ATTACHMENT_INVENTORY_SCHEMA } from './matroska-attachment-reader.js';

/**
 * Explicit read-only selection bridge between independently inspected source
 * attachment facts and a proposed output composition. This does NOT copy
 * bytes or authorize writing; the legacy browser writer is still video-rooted.
 */
export function projectAttachmentCopyTarget(inventory, selectedIds = []) {
  if (inventory?.schema !== ATTACHMENT_INVENTORY_SCHEMA ||
      inventory.state !== 'inspected' || !inventory.source?.id) {
    throw new Error('VERIFIED_ATTACHMENT_INVENTORY_REQUIRED');
  }
  if (!Array.isArray(selectedIds)) throw new Error('ATTACHMENT_SELECTION_INVALID');
  const byId = new Map(inventory.attachments.map(item => [item.id, item]));
  const selected = new Set();
  const attachments = selectedIds.map(id => {
    if (selected.has(id)) throw new Error('ATTACHMENT_SELECTION_DUPLICATED');
    selected.add(id);
    const item = byId.get(id);
    if (!item) throw new Error('ATTACHMENT_SELECTION_STALE');
    return {
      sourceAssetId: 'asset:0',
      sourceKey: inventory.source.id + '/' + item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      declaredSize: item.byteLength,
    };
  });
  const draft = projectMatroskaTarget({
    sourceAssets: [{
      assetKey: inventory.source.id,
      name: inventory.source.name,
      kind: 'inspected-matroska',
    }],
    attachments,
  });
  // Proposed output objects deliberately have new UID slots rather than
  // assuming the observed source FileUID is preserved after any writer.
  return draft;
}
