import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findExistingBatchOutputs,
  findExistingNamedOutputs,
  normalizedDestinationName,
  plannedBatchFilenames,
  writeNewBatchOutput,
  writeNewBatchArtifactPair,
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
    this.readbackFailures = new Set();
    this.readbackReplacements = new Map();
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
      getFile: async () => {
        if (directory.readbackFailures.has(filename)) throw new Error('readback denied');
        return directory.files.get(filename);
      },
      createWritable: async () => {
        if (directory.failCreateWritable) throw new Error('create writable failed');
        let pending = null;
        return {
          write: async (blob) => {
            if (directory.writeFailures.has(filename)) throw new Error('disk write failed');
            pending = blob;
          },
          close: async () => {
            directory.files.set(filename, directory.readbackReplacements.has(filename)
              ? directory.readbackReplacements.get(filename) : pending);
          },
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


test('MKV and audit report save as one declared pair when both succeed', async () => {
  const dir = new FakeDirectory();
  const mkv = new Blob(['real-mkv']);
  const report = new Blob(['{"audit":"pass"}']);
  const result = await writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: mkv,
    reportName: 'ep.mux-report.json', reportBlob: report,
  });
  assert.equal(result.mkvSavedToDirectory, true);
  assert.equal(result.reportSavedToDirectory, true);
  assert.equal(result.savedToDirectory, true);
  assert.equal(result.directorySaveError, '');
  assert.equal(dir.files.get('ep.mkv'), mkv);
  assert.equal(dir.files.get('ep.mux-report.json'), report);
});

test('report-only failure preserves valid MKV and exposes distinct partial save evidence', async () => {
  const dir = new FakeDirectory();
  dir.writeFailures.add('ep.mux-report.json');
  const mkv = new Blob(['valid-mkv']);
  const result = await writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: mkv,
    reportName: 'ep.mux-report.json', reportBlob: new Blob(['report']),
  });
  assert.equal(result.mkvSavedToDirectory, true);
  assert.equal(result.reportSavedToDirectory, false);
  assert.equal(result.savedToDirectory, false);
  assert.equal(result.mkvSaveError, '');
  assert.match(result.reportSaveError, /disk write failed/);
  assert.match(result.directorySaveError, /报告写入失败/);
  assert.equal(dir.files.get('ep.mkv'), mkv);
  assert.deepEqual(dir.removals, [], 'partial-save recovery must not delete a valid MKV');
});

test('existing report collision prevents starting MKV write, even after bulk preflight', async () => {
  const dir = new FakeDirectory(['ＥＰ.mux-report.json']);
  await assert.rejects(writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: new Blob(['mkv']),
    reportName: 'ep.mux-report.json', reportBlob: new Blob(['report']),
  }), /本次没有开始写入/);
  assert.equal(dir.files.has('ep.mkv'), false);
  assert.equal(dir.files.get('ＥＰ.mux-report.json'), 'ORIGINAL');
  assert.deepEqual(dir.removals, []);
});

test('MKV write failure never writes its detached report or deletes any foreign file', async () => {
  const dir = new FakeDirectory();
  dir.writeFailures.add('ep.mkv');
  const result = await writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: new Blob(['mkv']),
    reportName: 'ep.mux-report.json', reportBlob: new Blob(['report']),
  });
  assert.equal(result.mkvSavedToDirectory, false);
  assert.equal(result.reportSavedToDirectory, false);
  assert.equal(result.savedToDirectory, false);
  assert.match(result.mkvSaveError, /disk write failed/);
  assert.equal(dir.files.has('ep.mux-report.json'), false);
  assert.deepEqual(dir.removals, []);
});

test('same output and report filename is refused without any filesystem writes', async () => {
  const dir = new FakeDirectory();
  await assert.rejects(writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: new Blob(['mkv']),
    reportName: 'ＥＰ.MKV', reportBlob: new Blob(['report']),
  }), /目标名称冲突/);
  assert.equal(dir.files.size, 0);
});

test('directory receipt requires complete readback across the 1 MiB slice boundary', async () => {
  const dir = new FakeDirectory();
  const bytes = new Uint8Array(1024 * 1024 + 19);
  bytes.fill(0xa5);
  bytes[1024 * 1024 + 18] = 0x63;
  const artifact = new Blob([bytes]);
  assert.equal(await writeNewBatchOutput(dir, 'large.mkv', artifact), true);
  assert.equal(dir.files.get('large.mkv'), artifact);
  assert.deepEqual(dir.removals, []);
});

test('same-length corruption after close is never recorded as successful save', async () => {
  const dir = new FakeDirectory();
  dir.readbackReplacements.set('changed.mkv', new Blob(['bit-X']));
  await assert.rejects(
    writeNewBatchOutput(dir, 'changed.mkv', new Blob(['bit-A'])),
    /回读未能证明完整文件字节一致.*字节内容与待保存成品不一致/,
  );
  assert.equal(await dir.files.get('changed.mkv').text(), 'bit-X');
  assert.deepEqual(dir.removals, [], 'finished but mismatched file must not be deleted');
});

test('truncated MKV blocks report publication and retains the suspicious file', async () => {
  const dir = new FakeDirectory();
  dir.readbackReplacements.set('truncated.mkv', new Blob(['short']));
  const result = await writeNewBatchArtifactPair(dir, {
    mkvName: 'truncated.mkv', mkvBlob: new Blob(['long valid bytes']),
    reportName: 'truncated.mux-report.json', reportBlob: new Blob(['report']),
  });
  assert.equal(result.mkvSavedToDirectory, false);
  assert.equal(result.reportSavedToDirectory, false);
  assert.equal(result.savedToDirectory, false);
  assert.match(result.mkvSaveError, /文件长度与待保存成品不一致/);
  assert.equal(dir.files.has('truncated.mux-report.json'), false);
  assert.equal(await dir.files.get('truncated.mkv').text(), 'short');
  assert.deepEqual(dir.removals, []);
});

test('unreadable directory file after close cannot create a success receipt', async () => {
  const dir = new FakeDirectory();
  dir.readbackFailures.add('cannot-read.mkv');
  await assert.rejects(
    writeNewBatchOutput(dir, 'cannot-read.mkv', new Blob(['valid bytes'])),
    /回读未能证明完整文件字节一致.*readback denied/,
  );
  assert.equal(dir.files.has('cannot-read.mkv'), true);
  assert.deepEqual(dir.removals, []);
});

test('report readback corruption preserves verified MKV with a partial-save state', async () => {
  const dir = new FakeDirectory();
  const mkv = new Blob(['verified MKV']);
  dir.readbackReplacements.set('ep.mux-report.json', new Blob(['bad report']));
  const result = await writeNewBatchArtifactPair(dir, {
    mkvName: 'ep.mkv', mkvBlob: mkv,
    reportName: 'ep.mux-report.json', reportBlob: new Blob(['correct report']),
  });
  assert.equal(result.mkvSavedToDirectory, true);
  assert.equal(result.reportSavedToDirectory, false);
  assert.equal(result.savedToDirectory, false);
  assert.match(result.reportSaveError, /回读未能证明完整文件字节一致/);
  assert.equal(dir.files.get('ep.mkv'), mkv);
  assert.deepEqual(dir.removals, []);
});

