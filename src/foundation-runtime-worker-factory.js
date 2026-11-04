/**
 * Explicit opt-in launch boundary for a staged, BSD-licensed Foundation
 * structure-reader bundle. Does not make the browser fetch/run the module on
 * page load, and does not allow write admission or create a second source
 * asset authority. The existing reader still owns File + inventory identity.
 *
 * The runtime must first be staged by the pinned-source packaging script.
 * Vite BASE_URL is honored for GitHub Pages subpath deployments.
 */
export const FOUNDATION_RUNTIME_DIRECTORY = 'vendor/matroska-foundation/';
export function createPackagedFoundationWorkerFactory({
  baseUrl = import.meta.env?.BASE_URL || '/',
  origin = globalThis.location?.origin,
  WorkerCtor = globalThis.Worker,
} = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl ||
      typeof origin !== 'string' || !/^https?:\/\//.test(origin) ||
      typeof WorkerCtor !== 'function')
    throw Error('FOUNDATION_RUNTIME_FACTORY_UNAVAILABLE');
  const site = new URL(origin);
  const appRoot = new URL(baseUrl,site);
  if (appRoot.origin !== site.origin ||
      !appRoot.pathname.endsWith('/') ||
      /(?:^|\/)\.\.(?:\/|$)/.test(baseUrl))
    throw Error('FOUNDATION_RUNTIME_BASE_URL_INVALID');
  const workerUrl = new URL(
    FOUNDATION_RUNTIME_DIRECTORY + 'foundation-worker.js',appRoot);
  if (workerUrl.origin !== site.origin)
    throw Error('FOUNDATION_RUNTIME_CROSS_ORIGIN_DENIED');
  return () => new WorkerCtor(workerUrl.href,{
    type:'classic',name:'foundation-matroska-read-only',
  });
}
