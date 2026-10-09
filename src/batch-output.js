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
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try { await writable.abort?.(); } catch {}
    throw error;
  }
  return true;
}
