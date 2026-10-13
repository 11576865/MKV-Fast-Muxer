import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContainerProjectFromProjection, applyContainerProjectEdit,
  serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import { previewDetachedProjectIntentConflicts as preview } from '../src/container-project-conflict-preview.js';

const source = (options = {}) => ({
  schema: 'container-document-projection-v0',
  sourceKey: options.sourceKey || 'episode.mkv|190|7',
  source: {
    name: 'episode.mkv', identityEvidence: 'file-path-size-lastModified',
    inspection: options.unscanned ? 'pending' : 'ffprobe-projected',
  },
  objects: [
    {
      id: 'source:subtitle:2', kind: 'subtitle',
      title: options.title || 'Chinese', evidence: 'ffprobe-stream',
      included: true,
    },
    {
      id: 'source:chapter:0', kind: 'chapter',
      title: 'Intro', evidence: 'ffprobe-flat-chapter',
    },
    {
      id: 'external:subtitle:extra', kind: 'subtitle',
      title: 'Imported', evidence: 'current-editor',
    },
  ],
});
const verified = Object.freeze({
  state: 'digest-matches-draft', matched: true,
  sourceByteIdentityProven: true, executionAuthorized: false,
});
const detached = () => {
  const base = createContainerProjectFromProjection(source());
  const first = applyContainerProjectEdit(base, {
    type: 'set-attribute', objectId: base.objects[0].id,
    field: 'title', value: 'Chinese revised',
  });
  const second = applyContainerProjectEdit(first, {
    type: 'set-attribute', objectId: base.objects[0].id,
    field: 'title', value: 'Chinese final',
  });
  const third = applyContainerProjectEdit(second, {
    type: 'include', objectId: base.objects[0].id, value: false,
  });
  return parseContainerProjectDraft(serializeContainerProject(third));
};

test('P1 SHA match, inspected source and unchanged baseline permit READ-ONLY preview only', () => {
  const result = preview({ draft: detached(), liveProjection: source(), sourceProof: verified });
  assert.equal(result.status, 'READ_ONLY_PREVIEW_MATCHES');
  assert.equal(result.previewable, true);
  assert.equal(result.proposedCount, 2, 'repeated title edits must be coalesced');
  assert.equal(result.comparedCount, 2);
  assert.equal(result.conflictCount, 0);
  assert.equal(result.changes[0].from, 'Chinese');
  assert.equal(result.changes[0].to, 'Chinese final');
  assert.equal(result.changes[0].current, 'Chinese');
  assert.equal(result.changes[1].from, true);
  assert.equal(result.changes[1].to, false);
  assert.equal(result.changesApplied, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(Object.isFrozen(result.changes[0]), true);
});

test('P1 same display metadata without SHA proof cannot preview edits', () => {
  const draft = detached();
  for (const proof of [
    null,
    { state: 'no-source-digest', matched: false },
    { state: 'digest-mismatch', matched: false, sourceByteIdentityProven: false },
    { state: 'digest-matches-draft', matched: true, sourceByteIdentityProven: false },
  ]) {
    const r = preview({ draft, liveProjection: source(), sourceProof: proof });
    assert.equal(r.status, 'PREVIEW_BLOCKED');
    assert.equal(r.prereq, 'SOURCE_BYTES_UNVERIFIED');
    assert.equal(r.executionAuthorized, false);
  }
});

test('P1 exact source hash claim is insufficient without inspected track projection', () => {
  const r = preview({ draft: detached(), liveProjection: source({ unscanned: true }), sourceProof: verified });
  assert.equal(r.prereq, 'TRACKS_NOT_INSPECTED');
  assert.equal(r.sourceByteIdentityProven, true);
  assert.equal(r.currentTracksInspected, false);
  assert.equal(r.previewable, false);
});

test('P1 title field drift blocks that proposal even with matching source commitment', () => {
  const r = preview({
    draft: detached(), liveProjection: source({ title: 'live editor changed title' }),
    sourceProof: verified,
  });
  assert.equal(r.status, 'PREVIEW_BLOCKED');
  assert.equal(r.conflictCount, 1);
  assert.equal(r.comparedCount, 1);
  assert.equal(r.changes[0].reason, 'BASELINE_FIELD_CONFLICT');
  assert.equal(r.changes[1].verdict, 'baseline-matches');
  assert.equal(r.executionAuthorized, false);
});

test('P1 replacing the live source refuses preview even if a caller presents old matching proof', () => {
  const r = preview({
    draft: detached(), liveProjection: source({ sourceKey: 'replacement.mkv|190|7' }),
    sourceProof: verified,
  });
  assert.equal(r.prereq, 'SOURCE_IDENTITY_DRIFT');
  assert.equal(r.previewable, false);
  assert.equal(r.changesApplied, false);
});

test('P1 unbound external edits cannot be mistaken for source track replay', () => {
  const base = createContainerProjectFromProjection(source());
  const external = base.objects.find(o => o.sourceId === null);
  const changed = applyContainerProjectEdit(base, {
    type: 'set-attribute', objectId: external.id, field: 'title', value: 'Edited',
  });
  const r = preview({
    draft: parseContainerProjectDraft(serializeContainerProject(changed)),
    liveProjection: source(), sourceProof: verified,
  });
  assert.equal(r.status, 'PREVIEW_BLOCKED');
  assert.equal(r.changes[0].reason, 'UNBOUND_OR_EXTERNAL_OBJECT');
});

test('P1 forged internally contradictory final object rejected regardless of alleged SHA proof', () => {
  const original = detached();
  const forged = {
    ...original,
    objects: original.objects.map((o,i) => i === 0
      ? { ...o, attributes: { ...o.attributes, title: 'forged final' } } : o),
  };
  assert.throws(
    () => preview({ draft: forged, liveProjection: source(), sourceProof: verified }),
    /PROJECT_INTENT_CHAIN_INVALID/,
  );
});

test('P1 an unmodified draft has no implied previous edits even after source match', () => {
  const unedited = createContainerProjectFromProjection(source());
  const r = preview({ draft: unedited, liveProjection: source(), sourceProof: verified });
  assert.equal(r.status, 'NO_RECORDED_EDITS');
  assert.equal(r.proposedCount, 0);
  assert.equal(r.previewable, false);
  assert.equal(r.changesApplied, false);
});
