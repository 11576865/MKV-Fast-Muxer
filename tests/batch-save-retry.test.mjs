import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const api = await import('../src/batch-save-retry.js').catch(() => ({}));
const digest = async blob => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
const artifact = async () => {
  const blob = new Blob(['completed MKV']);
  return { blob, outputName: 'ep.mkv', reportBlob: new Blob(['finished report']),
    reportName: 'ep.mux-report.json', outputSha256: await digest(blob) };
};
function directory(initial = []) {
  const files = new Map(initial), writes = [];
  return { name: 'outputs', files, writes,
    async *entries() { for (const key of files.keys()) yield [key, {kind:'file'}]; },
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) {
        if (!create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        files.set(name, new Blob([]));
      }
      return { getFile: async () => files.get(name), createWritable: async () => ({
        write: async blob => { writes.push(name); files.set(name, blob); }, close: async () => {}, abort: async () => {},
      }) };
    } };
}
test('retained output can be saved with no execution callback or source access', async () => {
  assert.equal(typeof api.createBatchSaveRetryRegistry, 'function');
  const registry = api.createBatchSaveRetryRegistry();
  const a = await artifact(), dir = directory();
  registry.retain('job', a, {}, null);
  const saved = await registry.retry('job', dir);
  assert.equal(saved.savedToDirectory, true);
  assert.deepEqual(dir.writes, ['ep.mkv', 'ep.mux-report.json']);
  assert.equal(await dir.files.get('ep.mkv').text(), 'completed MKV');
});
test('same-directory partial retry verifies committed MKV and writes only missing report', async () => {
  const registry = api.createBatchSaveRetryRegistry(), a = await artifact();
  const dir = directory([['ep.mkv', a.blob]]);
  registry.retain('job', a, {mkvSavedToDirectory:true, reportSavedToDirectory:false}, dir);
  assert.equal((await registry.retry('job', dir)).savedToDirectory, true);
  assert.deepEqual(dir.writes, ['ep.mux-report.json']);
});
test('changed committed MKV, leftover report, case collision and permission loss do not overwrite', async () => {
  const a = await artifact();
  for (const dir of [directory([['ep.mkv',new Blob(['foreign'])]]),
    directory([['ep.mkv',a.blob],['ep.mux-report.json',new Blob([])]]),
    directory([['ep.mkv',a.blob],['ＥＰ.mux-report.json',new Blob(['foreign'])]])]) {
    const registry = api.createBatchSaveRetryRegistry();
    registry.retain('job', a, {mkvSavedToDirectory:true}, dir);
    await assert.rejects(registry.retry('job',dir));
    assert.deepEqual(dir.writes, []);
  }
  const registry = api.createBatchSaveRetryRegistry();
  registry.retain('job',a,{},null);
  await assert.rejects(registry.retry('job',{getFileHandle: async()=>{throw Error('permission denied');}}), /permission denied/);
});
test('new directory saves whole pair; previous successful MKV remains untouched', async () => {
  const registry = api.createBatchSaveRetryRegistry(), a = await artifact();
  const old = directory([['ep.mkv',a.blob]]), next = directory();
  registry.retain('job',a,{mkvSavedToDirectory:true},old);
  assert.equal((await registry.retry('job',next)).savedToDirectory,true);
  assert.deepEqual(old.writes,[]);
  assert.deepEqual(next.writes,['ep.mkv','ep.mux-report.json']);
});
test('released artifacts and concurrent retry cannot be reused or cleared during write', async () => {
  const registry = api.createBatchSaveRetryRegistry(), a = await artifact();
  registry.retain('job',a,{},null);
  let release;
  const dir=directory();
  const original=dir.entries;
  dir.entries=async function*(){await new Promise(resolve=>{release=resolve;}); yield* original.call(dir);};
  const pending=registry.retry('job',dir);
  await new Promise(resolve=>setTimeout(resolve,0));
  await assert.rejects(registry.retry('job',directory()), /进行/);
  assert.throws(()=>registry.releaseAll(), /进行/);
  // Only delay the first enumeration, not write-time rechecks.
  dir.entries=original;release();await pending;
  registry.releaseAll();
  assert.equal(registry.size,0);
  await assert.rejects(registry.retry('job',directory()), /失效/);
});

test('a second directory grant for the same entry preserves the report-only path', async () => {
  const registry = api.createBatchSaveRetryRegistry(), a = await artifact();
  const old = directory([['ep.mkv',a.blob]]);
  const alias = { ...old, isSameEntry: async handle => handle===old };
  registry.retain('job',a,{mkvSavedToDirectory:true},old);
  assert.equal((await registry.retry('job',alias)).savedToDirectory,true);
  assert.deepEqual(old.writes,['ep.mux-report.json']);
});

test('save-only retry never counts an unreadable or altered file as saved', async () => {
  const registry = api.createBatchSaveRetryRegistry(), a = await artifact();
  const dir = directory();
  const ordinaryHandle = dir.getFileHandle.bind(dir);
  dir.getFileHandle = async (name, options) => {
    const handle = await ordinaryHandle(name, options);
    return {
      ...handle,
      getFile: async () => name === a.outputName
        ? new Blob(['damaged MKV!!'])
        : handle.getFile(),
    };
  };
  registry.retain('job', a, {}, null);
  const result = await registry.retry('job', dir);
  assert.equal(result.mkvSavedToDirectory, false);
  assert.equal(result.reportSavedToDirectory, false);
  assert.equal(result.savedToDirectory, false);
  assert.match(result.directorySaveError, /回读未能证明完整文件字节一致/);
  assert.deepEqual(dir.writes, ['ep.mkv']);
  assert.equal(dir.files.has('ep.mux-report.json'), false);
  // A failed readback is not permission to replace/delete the suspect entry.
  await assert.rejects(registry.retry('job', dir), /已存在文件或失败残留/);
  assert.deepEqual(dir.writes, ['ep.mkv']);
});
