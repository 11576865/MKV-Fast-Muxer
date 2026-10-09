import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findExistingBatchOutputs,
  findExistingNamedOutputs,
  normalizedDestinationName,
  plannedBatchFilenames,
  writeNewBatchOutput,
} from '../src/batch-output.js';

function namedError(name, message) {
  return Object.assign(new Error(message || name), { name });
}

class FakeDirectory {
  constructor(files = []) {
    this.name = 'fixture-output';
    this.files = new Map(files.map((name) => [name, 'ORIGINAL']));
    this.writeFailures = new Set();
    this.abortCount = 0;
    this.removals = [];
    this.injectBeforeCreate = null;
    this.preserveOnAbort = false;
    this.failCreateWritable = false;
  }

  async removeEntry(filename) {
    this.removals.push(filename);
    this.files.delete(filename);
  }

  async *entries() {
    for (const name of this.files.keys()) yield [name, { kind: 'file' }];
  }

  async getFileHandle(filename, { create = false } = {}) {
    if (create && this.injectBeforeCreate) {
      const injection = this.injectBeforeCreate;
      this.injectBeforeCreate = null;
      injection(filename, this.files);
    }
    if (!this.files.has(filename)) {
      if (!create) throw namedError('NotFoundError');
      this.files.set(filename, null);
    }
    const directory = this;
    return {
      createWritable: async () => {
        if (directory.failCreateWritable) throw new Error('create writable failed');
        let pending = null;
        return {
          write: async (blob) => {
            if (directory.writeFailures.has(filename)) throw new Error('disk write failed');
            pending = blob;
          },
          close: async () => { directory.files.set(filename, pending); },
          abort: async () => {
            directory.abortCount += 1;
            if (directory.preserveOnAbort) directory.files.set(filename, 'OTHER PROCESS');
          },
        };
      },
    };
  }
}

test('planned destinations include MKV and JSON report for every job', () => {
  assert.deepEqual(plannedBatchFilenames([{ outputName: 'a.mkv' }, { outputName: 'b.mkv' }]), [
    'a.mkv', 'a.mux-report.json', 'b.mkv', 'b.mux-report.json',
  ]);
});

test('preflight rejects existing MKV and existing report independently', async () => {
  const directory = new FakeDirectory(['a.mkv', 'b.mux-report.json']);
  assert.deepEqual(
    await findExistingBatchOutputs(directory, [{ outputName: 'a.mkv' }, { outputName: 'b.mkv' }]),
    ['a.mkv', 'b.mux-report.json'],
  );
  assert.deepEqual(await findExistingBatchOutputs(new FakeDirectory(), [{ outputName: 'a.mkv' }]), []);
});

test('destination checks include case and Unicode compatibility-equivalent names', async () => {
  assert.equal(normalizedDestinationName('ＦＩＬＭ.MKV'), 'film.mkv');
  const directory = new FakeDirectory(['Ｆｉｌｍ.MKV']);
  assert.deepEqual(await findExistingNamedOutputs(directory, ['Film.mkv']), ['Film.mkv']);
  await assert.rejects(
    writeNewBatchOutput(directory, 'Film.mkv', new Blob(['DO NOT WRITE'])),
    /已经存在/,
  );
  assert.equal(directory.files.get('Ｆｉｌｍ.MKV'), 'ORIGINAL');
  assert.equal(directory.files.size, 1);
});

test('existing file is not overwritten and fresh file can be written', async () => {
  const directory = new FakeDirectory(['existing.mkv']);
  await assert.rejects(
    writeNewBatchOutput(directory, 'existing.mkv', new Blob(['replacement'])),
    /已经存在/,
  );
  assert.equal(directory.files.get('existing.mkv'), 'ORIGINAL');
  const blob = new Blob(['new result']);
  assert.equal(await writeNewBatchOutput(directory, 'new.mkv', blob), true);
  assert.equal(directory.files.get('new.mkv'), blob);
});

test('non-NotFound filesystem errors block preflight rather than assuming absent output', async () => {
  const directory = {
    async getFileHandle() {
      throw namedError('NotAllowedError', 'permission denied');
    },
  };
  await assert.rejects(
    findExistingBatchOutputs(directory, [{ outputName: 'a.mkv' }]),
    /permission denied/,
  );
  await assert.rejects(
    writeNewBatchOutput(directory, 'a.mkv', new Blob(['x'])),
    /permission denied/,
  );
});

test('directory occupying an output filename counts as collision', async () => {
  const directory = {
    async getFileHandle() { throw namedError('TypeMismatchError'); },
  };
  assert.deepEqual(await findExistingNamedOutputs(directory, ['a.mkv']), ['a.mkv']);
});

test('aborted write never deletes a possible foreign directory entry', async () => {
  const directory = new FakeDirectory();
  directory.writeFailures.add('failed.mkv');
  await assert.rejects(
    writeNewBatchOutput(directory, 'failed.mkv', new Blob(['incomplete'])),
    /写入已中止，未删除任何目录文件/,
  );
  assert.equal(directory.abortCount, 1);
  assert.equal(directory.files.has('failed.mkv'), true);
  assert.deepEqual(directory.removals, []);
});

test('createWritable failure leaves a possibly new entry for manual inspection', async () => {
  const directory = new FakeDirectory();
  directory.failCreateWritable = true;
  await assert.rejects(
    writeNewBatchOutput(directory, 'uncreated.mkv', new Blob(['x'])),
    /请检查后再重试/,
  );
  assert.equal(directory.files.has('uncreated.mkv'), true);
  assert.deepEqual(directory.removals, []);
});

test('a foreign empty file created after preflight must not be removed', async () => {
  const directory = new FakeDirectory();
  directory.failCreateWritable = true;
  directory.injectBeforeCreate = (filename, files) => {
    files.set(filename, null); // a concurrent writer created the empty entry
  };
  await assert.rejects(
    writeNewBatchOutput(directory, 'foreign-empty.mkv', new Blob(['x'])),
    /未删除任何目录文件/,
  );
  assert.equal(directory.files.has('foreign-empty.mkv'), true);
  assert.deepEqual(directory.removals, []);
});

test('a foreign populated file modified during abort must not be removed', async () => {
  const directory = new FakeDirectory();
  directory.writeFailures.add('important.mkv');
  directory.preserveOnAbort = true;
  await assert.rejects(
    writeNewBatchOutput(directory, 'important.mkv', new Blob(['x'])),
    /写入已中止/,
  );
  assert.equal(directory.files.get('important.mkv'), 'OTHER PROCESS');
  assert.deepEqual(directory.removals, []);
});

test('absence of remove capability still yields clear manual inspection warning', async () => {
  const directory = new FakeDirectory();
  directory.removeEntry = undefined;
  directory.writeFailures.add('no-remove.mkv');
  await assert.rejects(
    writeNewBatchOutput(directory, 'no-remove.mkv', new Blob(['x'])),
    /请检查后再重试/,
  );
  assert.equal(directory.files.has('no-remove.mkv'), true);
});
