// P2-RG: independent MKVToolNix-authored AttachmentUID Tag with a decoy.
// Assert exact read-only Tag->Attachment graph and per-edit impact. No writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { createExistingAttachmentEditIntent } from '../src/existing-attachment-edit-intent.js';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../src/mkvmerge-exact-uid-json.js';

const fixtureDir = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const outputDir = path.resolve(process.env.E2E_OUTPUT_DIR || '.e2e/output');
const fixturePath = path.join(fixtureDir, 'p0-independent-attachmenttag.mkv');
const reportPath = path.join(outputDir, 'p2-attachment-relation-graph-report.json');
const sha = buf => createHash('sha256').update(buf).digest('hex');
const report = {
  schema: 'p2-matroska-attachment-relation-independent-audit-v0',
  result: 'INCONCLUSIVE',
  independentAuthor: 'mkvmerge+mkvpropedit',
  outputWritten: false,
  sourceModified: false,
  referenceWriterAuthorized: false,
};
await fs.mkdir(outputDir, { recursive: true });
try {
  const originalBytes = await fs.readFile(fixturePath);
  report.sourceSha256 = sha(originalBytes);
  const info = parseMkvmergeJsonWithExactUids(execFileSync(
    'mkvmerge', ['-J', fixturePath], { encoding: 'utf8', timeout: 30000 },
  ));
  const external = (info.attachments || []).map(item => ({
    filename: item.file_name, uid: exactPositiveUid(item.properties?.uid),
  }));
  if (external.length !== 2) throw Error('INDEPENDENT_SOURCE_NOT_TWO_ATTACHMENTS');
  const selected = external.find(item => item.filename === 'p0-attachment-evidence.bin');
  const decoy = external.find(item => item.filename === 'p0-attachment-decoy.txt');
  if (!selected || !decoy || selected.uid === decoy.uid) {
    throw Error('INDEPENDENT_UID_TARGET_AND_DECOY_MISSING');
  }
  const file = new Blob([originalBytes]);
  file.name = 'p0-independent-attachmenttag.mkv';
  file.lastModified = 123;
  const reader = createMatroskaAttachmentReader(file);
  const inventory = await reader.inspect();
  if (inventory.state !== 'inspected') throw Error('MODEL_INVENTORY_NOT_INSPECTED');
  const graph = await reader.inspectRelations(inventory);
  if (graph.state !== 'inspected' ||
      graph.coverage.tagTargets !== 'known-targets-enumerated') {
    throw Error('GRAPH_NOT_COMPLETE: ' + (graph.diagnostic?.code || graph.coverage.tagTargets));
  }
  const edge = graph.edges.filter(item =>
    item.targetKind === 'attachment' && item.targetUid === selected.uid);
  const decoyEdges = graph.edges.filter(item =>
    item.targetKind === 'attachment' && item.targetUid === decoy.uid);
  const sourceNode = graph.nodes.find(node => node.fileUid === selected.uid);
  const decoyNode = graph.nodes.find(node => node.fileUid === decoy.uid);
  if (edge.length !== 1 || decoyEdges.length !== 0 ||
      !sourceNode || !decoyNode ||
      edge[0].targetAttachmentId !== sourceNode.attachmentId ||
      edge[0].resolution !== 'matched') {
    throw Error('INDEPENDENT_TARGET_EDGE_OR_DECOY_INCORRECT');
  }
  report.independentAttachments = external;
  report.graph = {
    sourceUid: sourceNode.fileUid,
    targetTagId: edge[0].sourceTagId,
    targetUid: edge[0].targetUid,
    matchedAttachmentId: edge[0].targetAttachmentId,
    decoyUid: decoyNode.fileUid,
    decoyEdges: decoyEdges.length,
    observedTags: graph.tags.length,
    observedEdges: graph.edges.length,
    coverage: graph.coverage.tagTargets,
  };
  const remove = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: sourceNode.attachmentId }],
  });
  const replacement = new Blob([Buffer.from('not written')]);
  replacement.name = 'replacement.txt';
  const replace = await createExistingAttachmentEditIntent({
    reader, actions: [{
      type: 'replace', attachmentId: sourceNode.attachmentId,
      file: replacement, mimeType: 'text/plain',
    }],
  });
  const removeDecoy = await createExistingAttachmentEditIntent({
    reader, actions: [{ type: 'remove', attachmentId: decoyNode.attachmentId }],
  });
  report.impacts = {
    removeTarget: remove.proposedChanges.effects.find(x =>
      x.sourceAttachmentId === sourceNode.attachmentId)?.tagImpact,
    replaceTarget: replace.proposedChanges.effects.find(x =>
      x.sourceAttachmentId === sourceNode.attachmentId)?.tagImpact,
    removeDecoy: removeDecoy.proposedChanges.effects.find(x =>
      x.sourceAttachmentId === decoyNode.attachmentId)?.tagImpact,
    removeTagOrphans: remove.impactSummary.orphanedTagTargetCountIfApplied,
    replaceTagOrphans: replace.impactSummary.orphanedTagTargetCountIfApplied,
    decoyTagOrphans: removeDecoy.impactSummary.orphanedTagTargetCountIfApplied,
  };
  for (const draft of [remove, replace, removeDecoy]) {
    if (draft.execution.approvedToWrite || draft.execution.writer !== null ||
        draft.capability.code !== 'SOURCE_UID_RELATIONS_UNVERIFIED') {
      throw Error('SOURCE_EDIT_WRITER_INCORRECTLY_AUTHORIZED');
    }
  }
  if (report.impacts.removeTarget !== 'would-orphan-tag-attachment-uid' ||
      report.impacts.replaceTarget !== 'would-orphan-tag-attachment-uid' ||
      report.impacts.removeTagOrphans !== 1 ||
      report.impacts.replaceTagOrphans !== 1 ||
      report.impacts.decoyTagOrphans !== 0 ||
      report.impacts.removeDecoy !== 'no-targeted-tag-observed-not-proof-of-safety') {
    throw Error('IMPACT_NOT_MATCHING_INDEPENDENT_UID');
  }
  report.afterSha256 = sha(await fs.readFile(fixturePath));
  if (report.afterSha256 !== report.sourceSha256) {
    throw Error('INDEPENDENT_SOURCE_MODIFIED');
  }
  report.result = 'INDEPENDENT_ATTACHMENT_UID_TAG_GRAPH_AND_CHANGE_IMPACT_MATCH';
} catch (err) {
  report.result = 'INCONCLUSIVE_OR_FAILED';
  report.error = err?.message || String(err);
} finally {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result,
    error: report.error || null,
    reportPath,
  }));
}
if (report.result !== 'INDEPENDENT_ATTACHMENT_UID_TAG_GRAPH_AND_CHANGE_IMPACT_MATCH') {
  process.exitCode = 1;
}
