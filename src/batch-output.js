import { reportFilename } from './mux-report.js';

export function plannedBatchFilenames(jobs = []) {
  return Array.from(jobs || []).flatMap((job) => {
    const mkvName = String(job.outputName || '');
    return [mkvName, reportFilename(mkvName)];
  });
}

export async function batchDestinationExists(directory, filename) {
  try {
    await directory.getFileHandle(filename, { create: false });
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    // A directory occupying the filename is still a destination collision.
    if (error?.name === 'TypeMismatchError') return true;
    throw error; // Permissions and I/O errors must never be treated as absent files.
  }
}

export function normalizedDestinationName(filename) {
  return String(filename || '').normalize('NFKC').toLocaleLowerCase('en-US');
}

export async function findExistingNamedOutputs(directory, filenames = []) {
  if (!directory) return [];
  const expected = new Map(
    Array.from(filenames || []).map((name) => [normalizedDestinationName(name), name])
  );
  const found = new Set();
  if (typeof directory.entries === 'function') {
    for await (const [existingName] of directory.entries()) {
      const collision = expected.get(normalizedDestinationName(existingName));
      if (collision) found.add(collision);
    }
  }
  // Exact lookup still works for handles whose directory iteration is unavailable,
  // and surfaces permissions/read errors rather than assuming an empty directory.
  for (const filename of expected.values()) {
    if (!found.has(filename) && await batchDestinationExists(directory, filename)) {
      found.add(filename);
    }
  }
  return [...found];
}

export async function findExistingBatchOutputs(directory, jobs = []) {
  return findExistingNamedOutputs(directory, plannedBatchFilenames(jobs));
}

export async function writeNewBatchOutput(directory, filename, blob) {
  if (!directory || !blob) throw new Error('缺少批量输出目录或成品。');
  if ((await findExistingNamedOutputs(directory, [filename])).length) {
    throw new Error(`输出目录已经存在与“${filename}”同名的文件；没有覆盖原文件，请手动处理该冲突。`);
  }
  // File System Access API has no atomic create-if-absent operation. This is
  // best-effort protection against pre-existing files, not a cross-process lock.
  const handle = await directory.getFileHandle(filename, { create: true });
  let writable;
  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try { await writable?.abort?.(); } catch {}
    // The File System Access API cannot prove whether { create: true } actually
    // created this entry: another process may have created it after preflight.
    // Therefore NEVER removeEntry here, even for an empty same-identity file.
    // Abort may roll back content, but cannot guarantee removal of the name.
    throw new Error(
      `${error?.message || error}；写入已中止，未删除任何目录文件。目标“${filename}”可能留有空文件或其他进程的数据，请检查后再重试。`,
      { cause: error }
    );
  }
  return true;
}


/**
 * Best-effort two-artifact publication with explicit per-file evidence.
 *
 * File System Access offers no atomic pair commit or create-if-absent lock.
 * All names are checked before writing, but each write is checked again.
 * If MKV commits and its report fails, leave that valid MKV untouched,
 * return partial-save evidence and keep browser download fallbacks alive.
 * NEVER delete either entry to simulate a rollback.
 */
export async function writeNewBatchArtifactPair(directory, {
  mkvName, mkvBlob, reportName, reportBlob,
} = {}) {
  if (!directory || !mkvName || !mkvBlob || !reportName || !reportBlob) {
    throw new Error('批量双文件保存需要 MKV 与审计报告的完整名称和字节对象。');
  }
  if (normalizedDestinationName(mkvName) === normalizedDestinationName(reportName)) {
    throw new Error('MKV 与审计报告目标名称冲突，拒绝写入。');
  }
  const conflicts = await findExistingNamedOutputs(directory, [mkvName, reportName]);
  if (conflicts.length) {
    throw new Error('输出目录已存在预期文件：' + conflicts.join('、') +
      '。为避免残留不完整的文件组合，本次没有开始写入。');
  }

  let mkvSavedToDirectory = false;
  let reportSavedToDirectory = false;
  let mkvSaveError = '';
  let reportSaveError = '';
  try {
    await writeNewBatchOutput(directory, mkvName, mkvBlob);
    mkvSavedToDirectory = true;
  } catch (error) {
    mkvSaveError = error?.message || String(error);
  }
  if (mkvSavedToDirectory) {
    try {
      await writeNewBatchOutput(directory, reportName, reportBlob);
      reportSavedToDirectory = true;
    } catch (error) {
      reportSaveError = error?.message || String(error);
    }
  }

  const errorParts = [
    mkvSaveError && 'MKV 写入失败：' + mkvSaveError,
    reportSaveError && '报告写入失败：' + reportSaveError,
  ].filter(Boolean);
  return Object.freeze({
    mkvSavedToDirectory,
    reportSavedToDirectory,
    savedToDirectory: mkvSavedToDirectory && reportSavedToDirectory,
    mkvSaveError, reportSaveError,
    directorySaveError: errorParts.join('；'),
  });
}
