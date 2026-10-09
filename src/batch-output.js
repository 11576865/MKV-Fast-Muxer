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

// A failed writable can leave a newly created zero-byte entry behind even
// after abort(). Remove it only when identity and emptiness can be verified.
// Never delete an entry with contents, a changed identity, or missing metadata.
async function removeAbortedEmptyBatchOutput(directory, filename, createdHandle) {
  if (typeof directory.removeEntry !== 'function' ||
      typeof createdHandle.isSameEntry !== 'function') return false;
  try {
    const existingHandle = await directory.getFileHandle(filename, { create: false });
    if (!(await createdHandle.isSameEntry(existingHandle))) return false;
    const existingFile = await existingHandle.getFile();
    if (existingFile.size !== 0) return false;
    await directory.removeEntry(filename);
    return true;
  } catch {
    // Cleanup cannot safely be guaranteed. Preserve the original I/O error.
    return false;
  }
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
    const cleaned = await removeAbortedEmptyBatchOutput(directory, filename, handle);
    if (!cleaned) {
      throw new Error(`${error?.message || error}；自动清理未完成，请检查输出目录内的“${filename}”后再重试。`, { cause: error });
    }
    throw error;
  }
  return true;
}
