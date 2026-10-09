/**
 * Owns only batch-result download URLs. Single-task and preview URLs have
 * separate lifetimes and must never be revoked by this registry.
 *
 * A completed batch keeps its links valid until the user starts the next
 * batch. Replacing the results then revokes the prior URLs exactly once.
 */
export function createBatchResultUrlRegistry({
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
} = {}) {
  const active = new Set();

  function create(blob) {
    if (!blob) return '';
    const url = createUrl(blob);
    active.add(url);
    return url;
  }

  return {
    create,
    releaseAll() {
      for (const url of active) revokeUrl(url);
      active.clear();
    },
    get size() {
      return active.size;
    },
  };
}
