import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createContainerProject, serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import {
  PROJECT_SOURCE_HASH_MAX_BYTES, PROJECT_SOURCE_HASH_FAST_BYTES,
  hashBoundedProjectSource,
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

test('P1 streamed SHA-256 matches native full-file SHA-256 across irregular slice boundaries', async () => {
  const data = Buffer.alloc(111_177);
  for (let i = 0; i < data.length; i++) data[i] = (i * 13 + (i >>> 8)) & 255;
  const file = new Blob([data]);
  const progress = [];
  const digest = await hashBoundedProjectSource(file, {
    fastBytes: 0, chunkBytes: 997,
    onProgress: value => progress.push(value.bytesHashed),
  });
  assert.equal(digest, createHash('sha256').update(data).digest('hex'));
  assert.equal(progress.at(-1), data.length);
  assert.ok(progress.length > 20);
  assert.ok(progress.every((p, index) => index === 0 || p >= progress[index - 1]));
  assert.equal(await hashBoundedProjectSource(new Blob([]), { fastBytes: 0 }),
    createHash('sha256').digest('hex'));
});
test('P1 a real >64 MiB logical File is streamed without a whole-file arrayBuffer', async () => {
  const size = PROJECT_SOURCE_HASH_FAST_BYTES + 13;
  const chunk = Buffer.alloc(1024 * 1024, 0x61);
  const expected = createHash('sha256');
  for (let offset = 0; offset < size; offset += chunk.length)
    expected.update(chunk.subarray(0, Math.min(chunk.length, size - offset)));
  const calls = [];
  const source = {
    size,
    async arrayBuffer() { throw Error('WHOLE_FILE_ALLOCATION_FORBIDDEN'); },
    slice(start, end) {
      calls.push([start, end]);
      const bytes = Buffer.alloc(end - start, 0x61);
      return new Blob([bytes]);
    },
  };
  const progress = [];
  const digest = await hashBoundedProjectSource(source, {
    onProgress: value => progress.push(value),
  });
  assert.equal(digest, expected.digest('hex'));
  assert.ok(calls.length > 64);
  assert.ok(calls.every(([start,end]) => end - start <= 1024 * 1024));
  assert.equal(progress.at(-1).bytesHashed, size);
  assert.equal(progress.at(-1).totalBytes, size);
});
test('P1 abort prevents publishing partial SHA digests and stops additional File reads', async () => {
  const file = new Blob([Buffer.alloc(2309, 0xf1)]);
  const abort = new AbortController();
  let count = 0;
  await assert.rejects(
    () => hashBoundedProjectSource(file, {
      fastBytes: 0, chunkBytes: 101, signal: abort.signal,
      onProgress: () => { if (++count === 2) abort.abort(); },
    }), /PROJECT_SOURCE_HASH_ABORTED/,
  );
  assert.equal(count, 2);
  await assert.rejects(
    () => hashBoundedProjectSource(file, { signal: abort.signal }),
    /PROJECT_SOURCE_HASH_ABORTED/,
  );
});
test('P1 changed, truncated, or unsupported chunk providers fail closed', async () => {
  let size = 20;
  const changed = {
    get size() { return size; },
    arrayBuffer: async () => new ArrayBuffer(20),
    slice: (start, end) => {
      size = 21;
      return new Blob([new Uint8Array(end - start)]);
    },
  };
  await assert.rejects(() => hashBoundedProjectSource(changed, {
    fastBytes: 0, chunkBytes: 8,
  }), /PROJECT_SOURCE_LENGTH_CHANGED/);
  const truncated = {
    size: 20, arrayBuffer: async () => new ArrayBuffer(20),
    slice: (start,end) => ({ size: end-start, arrayBuffer: async () =>
      new ArrayBuffer(end-start-1) }),
  };
  await assert.rejects(() => hashBoundedProjectSource(truncated, {
    fastBytes: 0, chunkBytes: 8,
  }), /PROJECT_SOURCE_LENGTH_CHANGED/);
  await assert.rejects(() => hashBoundedProjectSource({
    size: 20, arrayBuffer: async () => new ArrayBuffer(20),
  }, { fastBytes: 0 }), /PROJECT_SOURCE_STREAM_UNAVAILABLE/);
});
test('P1 large-source proof re-import still refuses forged or altered source bytes', async () => {
  const source = new Blob([Buffer.alloc(4097, 0xaa)]);
  const digest = await hashBoundedProjectSource(source, { fastBytes: 0 });
  const imported = parseContainerProjectDraft(serializeContainerProject(
    attachContainerProjectSourceDigest(basic(), digest)));
  const verdict = await verifyContainerProjectSourceDigest(imported, source, {
    fastBytes: 0, chunkBytes: 33,
  });
  assert.equal(verdict.state, 'digest-matches-draft');
  assert.equal(verdict.executionAuthorized, false);
  const mismatch = await verifyContainerProjectSourceDigest(imported,
    new Blob([Buffer.alloc(4097, 0xab)]), { fastBytes: 0, chunkBytes: 37 });
  assert.equal(mismatch.state, 'digest-mismatch');
  assert.equal(mismatch.executionAuthorized, false);
});
