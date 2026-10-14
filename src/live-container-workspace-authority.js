/**
 * P1 live single-document transaction owner for the CURRENT browser task.
 *
 * The existing source and external sessions remain bounded execution adapters.
 * Both reference the SAME immutable ContainerProject after every accepted
 * mutation. No File permission, writer eligibility, saved JSON grant or
 * unknown EBML preservation is inferred from this composition.
 *
 * Rebinding a different source/File inventory creates a NEW task document;
 * history is session-local and not advertised as durable undo.
 */
import { createContainerProject } from './container-project.js';
import {
  inspectLiveSourceTrackSession, commitLiveSourceTrackChanges,
  commitLiveSourceAttachmentChanges, moveLiveSourceTrack,
} from './live-source-track-authority.js';
import {
  inspectLiveExternalAssets, commitLiveExternalAssetChanges,
  commitExternalFontMode,
} from './live-external-asset-authority.js';

export const LIVE_WORKSPACE_SCHEMA = 'live-container-workspace-v1';
const isExternalSourceId = id => id.startsWith('external-input:') ||
  id.startsWith('external-font-input:');
const externalObject = id => id.startsWith('external-audio:') ||
  id.startsWith('external-subtitle:') || id.startsWith('external-font:') ||
  id === 'external-policy:font';
const sourcesOf = project => project?.sources || [];
const objectsOf = project => project?.objects || [];
const sourceOnly = project => ({
  sources: sourcesOf(project).filter(s => !isExternalSourceId(s.id)),
  objects: objectsOf(project).filter(o => !externalObject(o.id)),
});
const externalOnly = project => ({
  sources: sourcesOf(project).filter(s => isExternalSourceId(s.id)),
  objects: objectsOf(project).filter(o => externalObject(o.id)),
});
const normalized = sources => sources.map(({size,...source}) =>
  size === null ? source : {...source,size});

/**
 * Reconcile after a scanner/source/asset inventory has been explicitly
 * rebound. Preserve the current actual metadata in the two domain subsets,
 * then give BOTH adapters the same ONE immutable project reference.
 *
 * Do not call this to recover a failed edit: a direct writer-facing row drift
 * is an error, not a reason to silently promote legacy data to authority.
 */
export function createLiveWorkspaceAuthority({
  sourceSession = null, externalSession = null,
} = {}) {
  if (!sourceSession && !externalSession) return null;
  const a = sourceOnly(sourceSession?.project);
  const b = externalOnly(externalSession?.project);
  if (sourceSession && !sourceSession.targets?.size &&
      !sourceSession.attachmentTargets?.size) {
    // A scanned source with only a video track/chapters is legal. Keep
    // its immutable observed objects, do not demand editable streams.
    if (!sourceSession.project?.schema) throw Error('LIVE_WORKSPACE_SOURCE_INVALID');
  }
  if (externalSession && !b.objects.some(o => o.id === 'external-policy:font'))
    throw Error('LIVE_WORKSPACE_EXTERNAL_POLICY_MISSING');
  const project = createContainerProject({
    documentId: 'current-live-container-task',
    sources: normalized([...a.sources,...b.sources]),
    objects: [...a.objects,...b.objects],
  });
  if (sourceSession) sourceSession.project = project;
  if (externalSession) externalSession.project = project;
  return {
    schema: LIVE_WORKSPACE_SCHEMA, sourceSession, externalSession,
    project, generation: 0,
    sourceBound: Boolean(sourceSession),
    externalBound: Boolean(externalSession),
  };
}

/** Verify BOTH adapter projections before a field edit or final mux. */
export function inspectLiveWorkspaceAuthority(workspace, {
  source = null, trackState = null, audioRows = [],
  subtitleRows = [], fonts = [], mode = 'preserve',
} = {}) {
  if (!workspace || workspace.schema !== LIVE_WORKSPACE_SCHEMA ||
      !workspace.project || (workspace.sourceSession &&
      workspace.sourceSession.project !== workspace.project) ||
      (workspace.externalSession &&
      workspace.externalSession.project !== workspace.project))
    throw Error('LIVE_WORKSPACE_DOCUMENT_DRIFT');
  const src = workspace.sourceSession ?
    inspectLiveSourceTrackSession(workspace.sourceSession,{source,trackState}) : null;
  const ext = workspace.externalSession ?
    inspectLiveExternalAssets(workspace.externalSession,{
      audioRows,subtitleRows,fonts,mode,
    }) : null;
  return Object.freeze({
    documentId: workspace.project.documentId,
    revision: workspace.project.revision,
    generation: workspace.generation,
    sourceTrackCount: src?.sourceTrackCount ?? 0,
    sourceAttachmentCount: src?.sourceAttachmentCount ?? 0,
    externalAudioCount: ext?.sourceAudioCount ?? 0,
    externalSubtitleCount: ext?.sourceSubtitleCount ?? 0,
    fontCount: ext?.fontInventoryCount ?? 0,
    allOwnedObjects: workspace.project.objects.length,
    sameImmutableDocument: true, sourceByteVerified: false,
    writerAuthorized: false, wholeEbmlPreservation: 'unverified',
  });
}

/**
 * One authoring dispatcher. A command edits only ONE bounded surface, but
 * unrelated surface identity/executor drift blocks BEFORE any side effect.
 * The existing domain transaction validates all proposed changes before
 * publishing its legacy executor projection; then both adapters adopt the
 * resulting immutable revision synchronously.
 */
export function commitLiveWorkspaceChange(workspace, {
  kind, source = null, trackState = null,
  audioRows = [], subtitleRows = [], fonts = [], mode = 'preserve',
  changes, appendMode = false, index, delta, previousMode, nextMode,
} = {}) {
  const verifyingMode = kind === 'font-mode' ? previousMode : mode;
  inspectLiveWorkspaceAuthority(workspace,{
    source,trackState,audioRows,subtitleRows,fonts,mode:verifyingMode,
  });
  const s = workspace.sourceSession, e = workspace.externalSession;
  let owner, receipt;
  if (kind === 'source-tracks') {
    if (!s) throw Error('LIVE_WORKSPACE_SOURCE_REQUIRED');
    owner = s;
    receipt = commitLiveSourceTrackChanges(s,{
      source,trackState,changes,appendMode,
    });
  } else if (kind === 'source-attachments') {
    if (!s) throw Error('LIVE_WORKSPACE_SOURCE_REQUIRED');
    owner = s;
    receipt = commitLiveSourceAttachmentChanges(s,{
      source,trackState,changes,appendMode,
    });
  } else if (kind === 'source-order') {
    if (!s) throw Error('LIVE_WORKSPACE_SOURCE_REQUIRED');
    owner = s;
    receipt = moveLiveSourceTrack(s,{
      source,trackState,index,delta,appendMode,
    });
  } else if (kind === 'external-tracks') {
    if (!e) throw Error('LIVE_WORKSPACE_EXTERNAL_REQUIRED');
    owner = e;
    receipt = commitLiveExternalAssetChanges(e,{
      audioRows,subtitleRows,fonts,mode,changes,
    });
  } else if (kind === 'font-mode') {
    if (!e) throw Error('LIVE_WORKSPACE_EXTERNAL_REQUIRED');
    owner = e;
    receipt = commitExternalFontMode(e,{
      audioRows,subtitleRows,fonts,previousMode,nextMode,
    });
  } else {
    throw Error('LIVE_WORKSPACE_ACTION_UNSUPPORTED');
  }
  const before = workspace.project, next = owner.project;
  if (next !== before) {
    if (s) s.project = next;
    if (e) e.project = next;
    workspace.project = next;
    workspace.generation++;
  }
  return Object.freeze({
    ...receipt, workspaceRevision: workspace.project.revision,
    workspaceGeneration: workspace.generation,
    singleDomainDocument: true,
    writerAuthorized: false,
  });
}
