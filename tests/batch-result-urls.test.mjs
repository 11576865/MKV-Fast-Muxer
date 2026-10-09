import assert from 'node:assert/strict';
import test from 'node:test';
import { createBatchResultUrlRegistry } from '../src/batch-result-urls.js';

function fakeUrls() {
  let next = 0;
  const issued = [];
  const revoked = [];
  const registry = createBatchResultUrlRegistry({
    createUrl(blob) {
      const url = `blob:fixture-${++next}`;
      issued.push({ url, blob });
      return url;
    },
    revokeUrl(url) {
      revoked.push(url);
    },
  });
  return { issued, revoked, registry };
}

test('result URLs stay alive throughout a completed batch and release together on replacement', () => {
  const { registry, revoked } = fakeUrls();
  const mkvOne = registry.create(new Blob(['first MKV']));
  const jsonOne = registry.create(new Blob(['first JSON']));
  const mkvTwo = registry.create(new Blob(['second MKV']));

  assert.deepEqual(revoked, [], 'do not invalidate visible download links during a batch');
  assert.equal(registry.size, 3);
  registry.releaseAll();
  assert.deepEqual(revoked, [mkvOne, jsonOne, mkvTwo]);
  assert.equal(registry.size, 0);
});

test('release is idempotent and does not revoke URLs owned by the single-task workflow', () => {
  const { registry, revoked } = fakeUrls();
  registry.create(new Blob(['batch only']));
  registry.releaseAll();
  registry.releaseAll();
  assert.equal(revoked.length, 1);
  assert.ok(!revoked.includes('blob:single-task'), 'untracked URL must never be revoked');
});

test('a new batch tracks only its own URLs after the old ones have been released', () => {
  const { registry, revoked } = fakeUrls();
  const oldResult = registry.create(new Blob(['old']));
  registry.releaseAll();
  const newResult = registry.create(new Blob(['new']));
  assert.deepEqual(revoked, [oldResult]);
  assert.notEqual(newResult, oldResult);
  assert.equal(registry.size, 1);
  registry.releaseAll();
  assert.deepEqual(revoked, [oldResult, newResult]);
});

test('absent optional report does not create or retain an URL', () => {
  const { registry, issued } = fakeUrls();
  assert.equal(registry.create(null), '');
  assert.equal(registry.create(undefined), '');
  assert.equal(registry.size, 0);
  assert.equal(issued.length, 0);
});
