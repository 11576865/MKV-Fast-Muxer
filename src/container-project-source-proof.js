/**
 * P1 portable source-byte commitment.
 * <64 MiB: native WebCrypto (when available), larger files: incremental
 * FIPS SHA-256 over exact File slices. Both produce the SAME standard SHA-256.
 * A matching user-supplied digest is NOT a signature, author provenance,
 * browser File permission, proof of immutable source or writer authorization.
 */
import { CONTAINER_PROJECT_SCHEMA } from './container-project.js';
import { IncrementalSha256 } from './incremental-sha256.js';

// A bounded operation, not a claimed performance guarantee on huge media.
export const PROJECT_SOURCE_HASH_FAST_BYTES = 64 * 1024 * 1024;
export const PROJECT_SOURCE_HASH_MAX_BYTES = 16 * 1024 * 1024 * 1024;
export const PROJECT_SOURCE_HASH_CHUNK_BYTES = 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const assertDigest = digest => {
  if (typeof digest !== 'string' || !SHA256.test(digest))
    throw Error('PROJECT_SOURCE_DIGEST_INVALID');
  return digest;
};

export async function hashBoundedProjectSource(file, {
  maxBytes = PROJECT_SOURCE_HASH_MAX_BYTES,
  fastBytes = PROJECT_SOURCE_HASH_FAST_BYTES,
  chunkBytes = PROJECT_SOURCE_HASH_CHUNK_BYTES,
  subtle = globalThis.crypto?.subtle,
  signal = null,
  onProgress = null,
} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(file.size) || file.size < 0)
    throw Error('PROJECT_SOURCE_FILE_REQUIRED');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 ||
      !Number.isSafeInteger(fastBytes) || fastBytes < 0 ||
      !Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 ||
      chunkBytes > 4 * 1024 * 1024)
    throw Error('PROJECT_HASH_LIMIT_INVALID');
  if (file.size > maxBytes) throw Error('PROJECT_SOURCE_EXCEEDS_HASH_LIMIT');
  if (onProgress !== null && typeof onProgress !== 'function')
    throw Error('PROJECT_HASH_PROGRESS_INVALID');
  const checkAbort = () => {
    if (signal?.aborted) throw Error('PROJECT_SOURCE_HASH_ABORTED');
    if (file.size > maxBytes) throw Error('PROJECT_SOURCE_EXCEEDS_HASH_LIMIT');
  };
  const progress = bytesHashed => {
    checkAbort();
    onProgress?.({ bytesHashed, totalBytes: file.size });
    checkAbort();
  };
  checkAbort();

  // Keep existing native digest semantics for small files, but never pass a
  // multi-gigabyte ArrayBuffer into the non-streaming WebCrypto API.
  if (file.size <= fastBytes && subtle && typeof subtle.digest === 'function') {
    const buffer = await file.arrayBuffer();
    checkAbort();
    if (buffer.byteLength !== file.size || buffer.byteLength > maxBytes)
      throw Error('PROJECT_SOURCE_LENGTH_CHANGED');
    const result = new Uint8Array(await subtle.digest('SHA-256', buffer));
    if (result.length !== 32) throw Error('PROJECT_DIGEST_LENGTH_INVALID');
    progress(file.size);
    return [...result].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  if (typeof file.slice !== 'function')
    throw Error('PROJECT_SOURCE_STREAM_UNAVAILABLE');
  const sha = new IncrementalSha256();
  const size = file.size;
  let loaded = 0;
  // File.slice().arrayBuffer() caps peak allocation to ONE short chunk.
  // Each await also gives the browser an opportunity to paint progress or
  // dispatch a cancellation gesture between CPU-bound hash updates.
  while (loaded < size) {
    checkAbort();
    if (file.size !== size) throw Error('PROJECT_SOURCE_LENGTH_CHANGED');
    const end = Math.min(size, loaded + chunkBytes);
    const part = file.slice(loaded, end);
    if (!part || typeof part.arrayBuffer !== 'function' || part.size !== end - loaded)
      throw Error('PROJECT_SOURCE_LENGTH_CHANGED');
    const buffer = await part.arrayBuffer();
    checkAbort();
    if (buffer.byteLength !== end - loaded || file.size !== size)
      throw Error('PROJECT_SOURCE_LENGTH_CHANGED');
    sha.update(new Uint8Array(buffer));
    loaded = end;
    progress(loaded);
  }
  progress(size);
  return sha.digestHex();
}

export function attachContainerProjectSourceDigest(project, digest) {
  if (project?.schema !== CONTAINER_PROJECT_SCHEMA ||
      !Array.isArray(project.sources) || project.sources.length !== 1)
    throw Error('PROJECT_SINGLE_SOURCE_REQUIRED');
  const sha256 = assertDigest(digest);
  // Frozen derived snapshot only; no original object, media permission,
  // history, edit intents, validation records or writer state are promoted.
  return Object.freeze({
    ...project,
    sources: Object.freeze(project.sources.map(s =>
      Object.freeze({ ...s, sha256 }))),
  });
}

export async function verifyContainerProjectSourceDigest(draft, file, options = {}) {
  if (draft?.schema !== CONTAINER_PROJECT_SCHEMA)
    throw Error('PROJECT_DRAFT_REQUIRED');
  const asserted = draft.sources?.length === 1
    ? draft.sources[0]?.sha256 : null;
  if (!asserted) {
    return Object.freeze({
      state: 'no-source-digest', matched: false,
      message: '旧工程草稿没有完整来源 SHA-256；无法证明来源字节一致。',
      sourceByteIdentityProven: false, changesApplied: false,
      executionAuthorized: false,
    });
  }
  assertDigest(asserted);
  const actual = await hashBoundedProjectSource(file, options);
  const matched = actual === asserted;
  return Object.freeze({
    state: matched ? 'digest-matches-draft' : 'digest-mismatch',
    matched,
    message: matched
      ? '完整源文件 SHA-256 与导入草稿记录一致；但草稿可被修改，此结果不证明作者身份、轨道对象一致或写入权限。'
      : '来源 SHA-256 与导入草稿不一致；不得恢复原编辑意图。',
    sourceByteIdentityProven: matched,
    changesApplied: false,
    executionAuthorized: false,
  });
}
