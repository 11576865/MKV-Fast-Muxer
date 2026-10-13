import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createContainerProject, serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import {
  PROJECT_SOURCE_HASH_MAX_BYTES, hashBoundedProjectSource,
  attachContainerProjectSourceDigest, verifyContainerProjectSourceDigest,
} from '../src/container-project-source-proof.js';

const textBlob = text => new Blob([text], { type: 'application/octet-stream' });
const basic = () => createContainerProject({
  documentId: 'real:test',
  sources: [{ id:'source:1', name:'episode.mkv', size:5 }],
  objects:[{ id:'source:attachment:1', kind:'attachment', sourceId:'source:1',
    attributes:{name:'font.ttf'} }],
});
test('P1 full byte SHA-256 uses WebCrypto over entire bounded Blob, not filename or prefix', async () => {
  const file = textBlob('hello');
  const digest = await hashBoundedProjectSource(file);
  assert.equal(digest, createHash('sha256').update('hello').digest('hex'));
  assert.notEqual(digest, await hashBoundedProjectSource(textBlob('hellO')));
  assert.notEqual(digest, await hashBoundedProjectSource(textBlob('hello!')));
});
test('P1 exported detached project carries digest through strict import without granting authority', async () => {
  const source = textBlob('hello');
  const digest = await hashBoundedProjectSource(source);
  const project = attachContainerProjectSourceDigest(basic(), digest);
  const restored = parseContainerProjectDraft(serializeContainerProject(project));
  assert.equal(restored.sources[0].sha256, digest);
  assert.equal(project.authorization, 'requires-relink');
  assert.equal(restored.writerStatus, 'unresolved');
  const verdict = await verifyContainerProjectSourceDigest(restored, source);
  assert.equal(verdict.state, 'digest-matches-draft');
  assert.equal(verdict.sourceByteIdentityProven, true);
  assert.equal(verdict.executionAuthorized, false);
  assert.equal(verdict.changesApplied, false);
});
test('P1 renamed/replaced same-display File contents never pass a misleading digest', async () => {
  const original = textBlob('hello');
  const project = attachContainerProjectSourceDigest(basic(),
    await hashBoundedProjectSource(original));
  const altered = textBlob('hEllo');
  assert.equal(altered.size, original.size);
  const verdict = await verifyContainerProjectSourceDigest(project, altered);
  assert.equal(verdict.state, 'digest-mismatch');
  assert.equal(verdict.sourceByteIdentityProven, false);
  assert.equal(verdict.executionAuthorized, false);
});
test('P1 older projects without SHA remain importable but cannot report byte identity', async () => {
  const imported = parseContainerProjectDraft(serializeContainerProject(basic()));
  const verdict = await verifyContainerProjectSourceDigest(imported, textBlob('hello'));
  assert.equal(verdict.state, 'no-source-digest');
  assert.equal(verdict.sourceByteIdentityProven, false);
});
test('P1 rejects attacker-controlled digest formats and unsupported source authority', async () => {
  const project = basic();
  for(const value of ['foo', 'A'.repeat(64), '0'.repeat(63), null]) {
    assert.throws(() => attachContainerProjectSourceDigest(project, value),
      /PROJECT_SOURCE_DIGEST_INVALID/);
  }
  const json = JSON.parse(serializeContainerProject(project));
  json.sources[0].sha256 = 'bad';
  assert.throws(() => parseContainerProjectDraft(JSON.stringify(json)),
    /PROJECT_SOURCE_UNTRUSTED/);
  json.sources[0].sha256 = 'a'.repeat(64);
  json.sources[0].authorization = 'granted';
  assert.throws(() => parseContainerProjectDraft(JSON.stringify(json)),
    /PROJECT_SOURCE_UNTRUSTED/);
});
test('P1 bounds whole-file crypto allocation BEFORE calling arrayBuffer', async () => {
  let called = 0;
  const big = { size: PROJECT_SOURCE_HASH_MAX_BYTES+1,
    arrayBuffer:async()=>{called++; return new ArrayBuffer(1);} };
  await assert.rejects(() => hashBoundedProjectSource(big), /PROJECT_SOURCE_EXCEEDS_HASH_LIMIT/);
  assert.equal(called,0);
  const changed = { size:5, arrayBuffer:async()=>new ArrayBuffer(4) };
  await assert.rejects(()=>hashBoundedProjectSource(changed),/PROJECT_SOURCE_LENGTH_CHANGED/);
});
test('P1 single-source digest cannot misrepresent multi-source bindings', () => {
  const project = createContainerProject({
    documentId:'multi:1', sources:[{id:'s1'},{id:'s2'}],
  });
  assert.throws(() => attachContainerProjectSourceDigest(project,'a'.repeat(64)),
    /PROJECT_SINGLE_SOURCE_REQUIRED/);
});
