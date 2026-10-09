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

export async function findExistingBatchOutputs(directory, jobs = []) {
  if (!directory) return [];
  const collisions = [];
  const names = [...new Set(plannedBatchFilenames(jobs))];
  for (const filename of names) {
    if (await batchDestinationExists(directory, filename)) collisions.push(filename);
  }
  return collisions;
}

export async function writeNewBatchOutput(directory, filename, blob) {
  if (!directory || !blob) throw new Error('缺少批量输出目录或成品。');
  if (await batchDestinationExists(directory, filename)) {
    throw new Error(`输出目录已经存在“${filename}”；没有覆盖原文件，请手动处理该冲突。`);
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
