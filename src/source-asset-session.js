import { outputCompositionFileKey } from './output-composition.js';

// Per-inventory identity, deliberately not durable content-authentication.
// Re-selecting an equivalent File object must create a different live identity.
let nextSessionId = 1;
export function createSourceAssetSession() {
  const sessionId = 'source-session:' + nextSessionId++;
  const refs = new WeakMap();
  let nextId = 1;
  function register(file, { kind = 'unknown' } = {}) {
    if (!file || typeof file !== 'object' ||
        typeof file.slice !== 'function' ||
        !Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error('SourceAsset requires a readable Blob/File-like object');
    }
    const existing = refs.get(file);
    if (existing) return existing;
    const info = Object.freeze({
      id: sessionId + '/asset:' + nextId++,
      name: String(file.name || ''),
      kind: String(kind || 'unknown'),
      metadataKey: outputCompositionFileKey(file),
      size: file.size,
      identityEvidence: 'session-object-reference',
      contentIdentity: 'unverified',
      persistent: false,
    });
    refs.set(file, info);
    return info;
  }
  return Object.freeze({
    sessionId,
    register,
    isCurrent(asset, file) {
      return Boolean(asset && file && refs.get(file) === asset);
    },
  });
}
