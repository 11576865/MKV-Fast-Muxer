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
  }

  async *entries() {
    for (const name of this.files.keys()) yield [name, { kind: 'file' }];
  }

  async getFileHandle(filename, { create = false } = {}) {
    if (!this.files.has(filename)) {
      if (!create) throw namedError('NotFoundError');
      this.files.set(filename, null);
    }
    return {
      createWritable: async () => {
        let pending = null;
        return {
          write: async (blob) => {
            if (this.writeFailures.has(filename)) throw new Error('disk write failed');
            pending = blob;
          },
          close: async () => { this.files.set(filename, pending); },
          abort: async () => { this.abortCount += 1; },
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

test('writing failure aborts a writable instead of closing and publishing partial content', async () => {
  const directory = new FakeDirectory();
  directory.writeFailures.add('failed.mkv');
  await assert.rejects(
    writeNewBatchOutput(directory, 'failed.mkv', new Blob(['incomplete'])),
    /disk write failed/,
  );
  assert.equal(directory.abortCount, 1);
  assert.equal(directory.files.get('failed.mkv'), null);
});
