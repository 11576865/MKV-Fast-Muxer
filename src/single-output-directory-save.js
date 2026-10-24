import { createBatchSaveRetryRegistry } from './batch-save-retry.js';

/**
 * One immutable single-project output pair per completed mux.
 * Reuses the exact independently read-back directory writer already used by
 * batch jobs. No second mux, probe, report generation or project authority.
 */
export function createSingleOutputDirectorySaveSession() {
  const registry=createBatchSaveRetryRegistry();
  const jobId='single-completed-output';
  let owner=null;
  let receipt=null;
  let busy=false;

  return Object.freeze({
    get receipt() { return receipt; },
    get busy() { return busy; },
    has(candidate) { return owner!==null && owner===candidate && registry.has(jobId); },
    replace(candidate, artifact) {
      if (busy) throw Error('正在保存成品，不能替换其字节授权');
      if (!candidate || typeof candidate!=='object')
        throw Error('必须绑定当前已完成的成品身份');
      // Releasing and rebinding MUST precede the next successful user save;
      // only generated Blob objects, names and actual output digest are held.
      registry.releaseAll();
      owner=null;
      receipt=null;
      registry.retain(jobId,artifact,{},null);
      owner=candidate;
    },
    release() {
      if (busy) throw Error('正在保存成品，不能清除保存授权');
      registry.releaseAll();
      owner=null;
      receipt=null;
    },
    async save(candidate,directory) {
      if (busy) throw Error('目录保存正在进行');
      if (!owner || owner!==candidate || !registry.has(jobId))
        throw Error('此前的成品保存授权已失效，必须重新生成后再保存');
      if (!directory) throw Error('没有有效的输出目录授权');
      busy=true;
      try {
        // The batch save-only registry independently rechecks previously
        // saved exact files; different directory grants do not inherit them.
        // A failure never re-enters ffmpeg and never removes partial files.
        const next=await registry.retry(jobId,directory);
        if (owner!==candidate) throw Error('已生成成品身份发生变化');
        receipt=next;
        return next;
      } finally { busy=false; }
    },
  });
}
