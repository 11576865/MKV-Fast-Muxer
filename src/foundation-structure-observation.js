/**
 * Read-only, operation-local adapter for the proven libMatroska2 C/WASM
 * structured tree. The caller supplies a dedicated Worker factory; this
 * module does NOT bundle a second EBML parser or start a new UI workflow.
 *
 * This is a source-inspection observation, NEVER writer admission or a
 * preservation certificate. The underlying Foundation binary is a separate
 * experimental CI artifact until explicitly packaged and licensed.
 */
export const FOUNDATION_STRUCTURE_OBSERVATION_SCHEMA =
  'foundation-structure-observation-v1';

const UINT64_MAX = (1n << 64n) - 1n;
const UID_TYPES = new Set([
  'TrackUID','FileUID','ChapterUID','EditionUID',
  'TagTrackUID','TagAttachmentUID','TagChapterUID','TagEditionUID',
]);
const MAX_NODES = 8192, MAX_DEPTH = 32;
const safeUid = value => typeof value === 'string' &&
  /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= UINT64_MAX;

function validateTree(structured, file, source) {
  if (structured?.schema !== 'foundation-matroska-structured-tree-v0' ||
      !Array.isArray(structured.nodes) ||
      structured.nodes.length < 3 || structured.nodes.length > MAX_NODES ||
      structured.nodeCount !== structured.nodes.length)
    throw Error('FOUNDATION_TREE_SCHEMA_INVALID');

  const ancestors = [];
  const observedUids = Object.create(null);
  const nodes = [];
  let lastOffset = -1n, maxDepth = 0;
  for (const original of structured.nodes) {
    if (!original || typeof original.name !== 'string' ||
        original.name.length > 120 ||
        !/^0x[0-9a-fA-F]{1,8}$/.test(original.id) ||
        !Number.isInteger(original.depth) || original.depth < 0 ||
        original.depth > MAX_DEPTH ||
        typeof original.master !== 'boolean' ||
        (original.finite !== undefined && typeof original.finite !== 'boolean') ||
        !/^(0|[1-9][0-9]*)$/.test(original.offset) ||
        !/^(0|[1-9][0-9]*)$/.test(original.endOffset) ||
        !/^(0|[1-9][0-9]*)$/.test(original.dataBytes))
      throw Error('FOUNDATION_TREE_NODE_INVALID');

    const start = BigInt(original.offset), end = BigInt(original.endOffset);
    if (start < lastOffset || end < start || end > BigInt(file.size) ||
        original.depth > ancestors.length)
      throw Error('FOUNDATION_TREE_RANGE_INVALID');
    while (ancestors.length > original.depth) ancestors.pop();
    if (original.depth !== ancestors.length)
      throw Error('FOUNDATION_TREE_PARENT_MISSING');
    if (ancestors.length) {
      const parent = ancestors[ancestors.length - 1];
      if (start < parent.start || end > parent.end)
        throw Error('FOUNDATION_TREE_CHILD_OUTSIDE_PARENT');
    }
    if (original.uintValue !== undefined) {
      if (!UID_TYPES.has(original.name) || !safeUid(original.uintValue))
        throw Error('FOUNDATION_TREE_UID_INVALID');
      (observedUids[original.name] ??= []).push(original.uintValue);
    }
    nodes.push(Object.freeze({
      id: original.id, name: original.name, depth: original.depth,
      offset: original.offset, endOffset: original.endOffset,
      dataBytes: original.dataBytes, master: original.master,
      ...(original.finite === undefined ? {} : {finite: original.finite}),
      ...(original.uintValue === undefined ? {} : {uintValue: original.uintValue}),
    }));
    lastOffset = start;
    maxDepth = Math.max(maxDepth, original.depth);
    if (original.master) ancestors.push({start,end});
  }

  if (!nodes.some(node => node.name === 'EBMLHead') ||
      !nodes.some(node => node.name === 'Segment'))
    throw Error('FOUNDATION_TREE_NOT_MATROSKA');
  return Object.freeze({
    schema: FOUNDATION_STRUCTURE_OBSERVATION_SCHEMA,
    state: 'inspected',
    source,
    nodeCount: nodes.length,
    maxDepth,
    nodes: Object.freeze(nodes),
    uids: Object.freeze(Object.fromEntries(
      Object.entries(observedUids).map(([key,values])=>
        [key,Object.freeze(values.slice())]))),
    claims: Object.freeze({
      inputOperation: 'read-only',
      sourceIdentity: 'live-file-object-reference',
      writerAuthorization: false,
      outputPreservation: 'not-tested',
      compatibility: 'single-runtime-observation-not-full-conformance',
    }),
  });
}

export function createFoundationStructureObserver({
  file, source, workerFactory, isCurrent = () => true,
  timeoutMs = 30000,
} = {}) {
  if (!file || typeof file.slice !== 'function' ||
      typeof file.name !== 'string' ||
      !Number.isSafeInteger(file.size) || file.size <= 0 ||
      !source || !source.id)
    throw Error('FOUNDATION_SOURCE_IDENTITY_REQUIRED');
  if (typeof workerFactory !== 'function')
    throw Error('FOUNDATION_WORKER_RUNTIME_NOT_CONFIGURED');
  if (typeof isCurrent !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
      timeoutMs > 120000)
    throw Error('FOUNDATION_OBSERVER_OPTIONS_INVALID');

  let active = null, disposed = false;
  function cancel(reason='FOUNDATION_INSPECTION_CANCELLED') {
    if (active) active.fail(Error(reason));
  }
  function dispose() {
    disposed = true;
    cancel('FOUNDATION_INSPECTION_DISPOSED');
  }
  async function inspect({signal}={}) {
    if (disposed) throw Error('FOUNDATION_OBSERVER_DISPOSED');
    if (active) throw Error('FOUNDATION_OBSERVER_BUSY');
    if (signal?.aborted) throw Error('FOUNDATION_INSPECTION_ABORTED');
    if (!isCurrent()) throw Error('FOUNDATION_SOURCE_STALE');

    return new Promise((resolve,reject)=>{
      let worker, timer, done = false;
      const onAbort = () => fail(Error('FOUNDATION_INSPECTION_ABORTED'));
      const clean = () => {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort',onAbort);
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          try { worker.terminate(); } catch { /* best-effort cleanup */ }
        }
        active = null;
      };
      const fail = error => {
        if (done) return;
        done = true;
        clean();
        reject(error);
      };
      const succeed = value => {
        if (done) return;
        done = true;
        clean();
        resolve(value);
      };
      active = {fail};
      try {
        worker = workerFactory();
        if (!worker || typeof worker.postMessage !== 'function' ||
            typeof worker.terminate !== 'function')
          throw Error('FOUNDATION_WORKER_INVALID');
        worker.onmessage = event => {
          try {
            if (!isCurrent()) throw Error('FOUNDATION_SOURCE_STALE');
            if (signal?.aborted) throw Error('FOUNDATION_INSPECTION_ABORTED');
            if (event?.data?.ok !== true)
              throw Error('FOUNDATION_WORKER_REJECTED_INPUT');
            const observed = validateTree(event.data.structured,file,source);
            const stats = event.data.workerStats;
            if (!stats || stats.usedWorkerFS !== true ||
                stats.stagedEntireFileInMemfs !== false ||
                stats.fileBytes !== file.size ||
                !Number.isSafeInteger(stats.fileReaderSyncCalls) ||
                stats.fileReaderSyncCalls < 1 ||
                !Number.isSafeInteger(stats.bytesRequested) ||
                stats.bytesRequested < 1 ||
                !Number.isSafeInteger(stats.largestSliceBytes) ||
                stats.largestSliceBytes < 1 ||
                stats.largestSliceBytes > stats.bytesRequested)
              throw Error('FOUNDATION_WORKERFS_EVIDENCE_INVALID');
            succeed(Object.freeze({
              ...observed,
              workerFS: Object.freeze({
                fileReaderSyncCalls:stats.fileReaderSyncCalls,
                bytesRequested:stats.bytesRequested,
                largestSliceBytes:stats.largestSliceBytes,
                sourceBytes:file.size,
              }),
            }));
          } catch(error) { fail(error); }
        };
        worker.onerror = () => fail(Error('FOUNDATION_WORKER_RUNTIME_FAILED'));
        signal?.addEventListener?.('abort',onAbort,{once:true});
        timer = setTimeout(()=>fail(Error('FOUNDATION_INSPECTION_TIMEOUT')),timeoutMs);
        worker.postMessage({type:'probe',file});
      } catch(error) { fail(error); }
    });
  }
  return Object.freeze({inspect,cancel,dispose});
}
