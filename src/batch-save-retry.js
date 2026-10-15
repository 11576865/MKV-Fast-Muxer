import { findExistingNamedOutputs, writeNewBatchOutput } from './batch-output.js';
import { hashBoundedProjectSource } from './container-project-source-proof.js';

/** Session-only artifact grants. No source File, recipe, mux or audit execution. */
export function createBatchSaveRetryRegistry() {
  const entries = new Map();
  let busy = false;
  const hash = blob => hashBoundedProjectSource(blob, { fastBytes: 0 });
  const savedFields = (receipt = {}) => ({
    mkvSavedToDirectory: receipt.mkvSavedToDirectory === true,
    reportSavedToDirectory: receipt.reportSavedToDirectory === true,
  });
  return Object.freeze({
    retain(jobId, artifact, publication, directory) {
      if (busy) throw Error('成品保存重试正在进行');
      if (!jobId || entries.has(jobId) || !(artifact?.blob instanceof Blob) ||
          !(artifact?.reportBlob instanceof Blob) || !artifact.outputName || !artifact.reportName ||
          !/^[a-f0-9]{64}$/.test(artifact.outputSha256 || '')) {
        throw Error('无法绑定已生成成品的保存身份');
      }
      entries.set(jobId, { artifact: Object.freeze({ blob: artifact.blob,
        outputName: artifact.outputName, reportBlob: artifact.reportBlob,
        reportName: artifact.reportName, outputSha256: artifact.outputSha256 }),
        directory, receipt: savedFields(publication) });
    },
    has(jobId) { return entries.has(jobId); },
    get size() { return entries.size; },
    releaseAll() {
      if (busy) throw Error('成品保存重试正在进行');
      entries.clear();
    },
    async retry(jobId, directory) {
      if (busy) throw Error('成品保存重试正在进行');
      const entry = entries.get(jobId);
      if (!entry) throw Error('成品保存身份已失效，请使用仍有效的下载链接');
      if (!directory) throw Error('请先选择成品保存目录');
      busy = true;
      try {
        let sameDirectory = entry.directory === directory;
        if (!sameDirectory && entry.directory && typeof directory.isSameEntry === 'function') {
          sameDirectory = await directory.isSameEntry(entry.directory);
        }
        const prior = sameDirectory ? entry.receipt : savedFields();
        const { artifact } = entry;
        // A save receipt is scoped to this exact directory and bytes, never
        // inferred from matching filenames or a caller's mutable result row.
        for (const [name, blob, saved, digest] of [
          [artifact.outputName, artifact.blob, prior.mkvSavedToDirectory, artifact.outputSha256],
          [artifact.reportName, artifact.reportBlob, prior.reportSavedToDirectory, null],
        ]) {
          if (!saved) continue;
          const file = await (await directory.getFileHandle(name, { create: false })).getFile();
          if (file.size !== blob.size || await hash(file) !== (digest || await hash(blob))) {
            throw Error('此前已保存的文件发生变化，拒绝沿用保存凭据：' + name);
          }
        }
        const names = [!prior.mkvSavedToDirectory && artifact.outputName,
          !prior.reportSavedToDirectory && artifact.reportName].filter(Boolean);
        const conflicts = await findExistingNamedOutputs(directory, names);
        if (conflicts.length) throw Error('保存目标已存在文件或失败残留，请检查或选择其他目录：' + conflicts.join('、'));
        const result = { ...prior, mkvSaveError: '', reportSaveError: '' };
        if (!result.mkvSavedToDirectory) {
          try {
            await writeNewBatchOutput(directory, artifact.outputName, artifact.blob);
            result.mkvSavedToDirectory = true;
          } catch (error) { result.mkvSaveError = error?.message || String(error); }
        }
        if (result.mkvSavedToDirectory && !result.reportSavedToDirectory) {
          try {
            await writeNewBatchOutput(directory, artifact.reportName, artifact.reportBlob);
            result.reportSavedToDirectory = true;
          } catch (error) { result.reportSaveError = error?.message || String(error); }
        }
        entry.directory = directory;
        entry.receipt = savedFields(result);
        return Object.freeze({ ...result,
          savedToDirectory: result.mkvSavedToDirectory && result.reportSavedToDirectory,
          directorySaveError: [result.mkvSaveError && 'MKV 写入失败：' + result.mkvSaveError,
            result.reportSaveError && '报告写入失败：' + result.reportSaveError].filter(Boolean).join('；'),
          destinationName: String(directory.name || '输出目录'), saveOnly: true,
        });
      } finally { busy = false; }
    },
  });
}
