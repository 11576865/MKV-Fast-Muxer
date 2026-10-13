import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContainerProject, createContainerProjectFromProjection,
  applyContainerProjectEdit, serializeContainerProject,
} from '../src/container-project.js';
import {
  PROJECT_IMPORT_MAX_BYTES, parseContainerProjectDraft,
  compareContainerProjectDraft,
} from '../src/container-project-import.js';

const snapshot = (sourceKey='episode.mkv|2048|7', objects=[
  { id:'source:subtitle:0', kind:'subtitle', title:'Chinese', evidence:'ffprobe-stream' },
  { id:'font:01', kind:'font', title:'Font.ttf', evidence:'user-import' },
]) => ({
  schema:'container-document-projection-v0', sourceKey,
  source:{name:'episode.mkv',identityEvidence:'file-path-size-lastModified'},
  objects,
});
const payload = () => serializeContainerProject(createContainerProjectFromProjection(snapshot()));
const alter = (fn) => {
  const json = JSON.parse(payload()); fn(json); return JSON.stringify(json);
};

test('P1 project export actually re-imports a detached immutable draft without media authority', () => {
  const restored = parseContainerProjectDraft(payload());
  assert.equal(restored.schema, 'container-project-v1');
  assert.equal(restored.authorization, 'requires-relink');
  assert.equal(restored.writerStatus, 'unresolved');
  assert.deepEqual(restored.validationRecords, []);
  assert.deepEqual(restored.artifacts, []);
  assert.equal(Object.isFrozen(restored.objects[0].attributes), true);
  assert.equal(restored.sources[0].size, null);
  const review = compareContainerProjectDraft(restored, snapshot());
  assert.equal(review.state, 'display-identity-only');
  assert.equal(review.missingCount, 0);
  assert.equal(review.addedCount, 0);
  assert.equal(review.reviewRequired, true);
  assert.equal(review.executionAuthorized, false);
  assert.equal(review.sourceByteIdentityProven, false);
  assert.equal(review.changesApplied, false);
});
test('P1 drift and source replacement never silently apply old track intents', () => {
  const draft = parseContainerProjectDraft(payload());
  const modified = compareContainerProjectDraft(draft, snapshot('other.mkv|2048|7', [
    { id: 'source:audio:0', kind: 'audio', title:'audio' },
  ]));
  assert.equal(modified.state, 'source-relink-required');
  assert.equal(modified.missingCount, 2);
  assert.equal(modified.addedCount, 1);
  assert.equal(modified.executionAuthorized, false);
  const absent = compareContainerProjectDraft(draft, null);
  assert.equal(absent.state, 'source-relink-required');
  assert.equal(absent.currentCount, 0);
});
test('P1 exported semantic edits and integer reordering are importable, but cannot execute', () => {
  const a = createContainerProject({
    documentId:'test:edits', sources: [{id:'s1',name:'episode.mkv'}],
    objects:[
      {id:'track:0',kind:'subtitle',sourceId:'s1',attributes:{title:'Chinese'}},
      {id:'track:1',kind:'audio',sourceId:'s1',attributes:{title:'Main'}},
    ],
  });
  const b=applyContainerProjectEdit(a,{type:'set-attribute',objectId:'track:0',field:'title',value:'Renamed'});
  const c=applyContainerProjectEdit(b,{type:'reorder',objectId:'track:0',value:1});
  const restored=parseContainerProjectDraft(serializeContainerProject(c));
  assert.equal(restored.revision,2);
  assert.equal(restored.editIntents[1].to,1);
  assert.equal(restored.objects[0].attributes.title,'Renamed');
  assert.equal(restored.writerStatus,'unresolved');
  assert.equal(compareContainerProjectDraft(restored,null).executionAuthorized,false);
});
test('P1 import rejects schema abuse, forged permissions and unverified writer state', () => {
  assert.throws(()=>parseContainerProjectDraft('x'),/PROJECT_JSON_INVALID/);
  assert.throws(()=>parseContainerProjectDraft(' '.repeat(PROJECT_IMPORT_MAX_BYTES+1)),/PROJECT_IMPORT_TOO_LARGE/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.schema='container-project-v999')),/PROJECT_IMPORT_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.execution='authorized')),/PROJECT_IMPORT_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.writerStatus='verified')),/PROJECT_IMPORT_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.sources[0].authorization='granted')),/PROJECT_SOURCE_UNTRUSTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.sources[0].handle='private')),/PROJECT_SOURCE_UNTRUSTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.objects[0].file='movie.mkv')),/PROJECT_OBJECT_UNTRUSTED/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.objects[0].sourceId='missing')),/DANGLING_SOURCE/);
  assert.throws(()=>parseContainerProjectDraft(alter(x=>x.objects[0].attributes.fileBytes='injected')),/UNKNOWN_ATTRIBUTE/);
});
test('P1 edited-intent values must be bounded, scalar and attached to known project objects', () => {
  const raw=JSON.parse(serializeContainerProject(applyContainerProjectEdit(
    createContainerProject({documentId:'doc:1',objects:[{id:'x1',kind:'subtitle'}]}),
    {type:'include',objectId:'x1',value:false},
  )));
  assert.equal(parseContainerProjectDraft(JSON.stringify(raw)).editIntents.length,1);
  raw.editIntents[0].objectId='other';
  assert.throws(()=>parseContainerProjectDraft(JSON.stringify(raw)),/PROJECT_EDIT_INTENT_UNTRUSTED/);
  raw.editIntents[0].objectId='x1';
  raw.editIntents[0].from={malicious:true};
  assert.throws(()=>parseContainerProjectDraft(JSON.stringify(raw)),/PROJECT_EDIT_INTENT_UNTRUSTED/);
});
