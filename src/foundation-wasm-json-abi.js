/**
 * Narrow consumer contract for the product-authored libMatroska2 C/WASM ABI.
 *
 * A result is operation-local: copy/validate the string, then release its
 * native buffer on success AND every failure. This module does not create a
 * file source, authorize mutations, or promise upstream ABI stability.
 */
export const FOUNDATION_WASM_ABI_VERSION = 1;
export const FOUNDATION_JSON_MAX_BYTES = 16 * 1024 * 1024;

export function readFoundationWasmStructure(module, sourcePath) {
  if (!module || typeof module.ccall !== 'function' ||
      typeof sourcePath !== 'string' || sourcePath[0] !== '/' ||
      sourcePath.includes('\u0000'))
    throw Error('FOUNDATION_ABI_CALL_INVALID');

  const abiVersion = module.ccall('foundation_abi_version', 'number', [], []);
  if (abiVersion !== FOUNDATION_WASM_ABI_VERSION)
    throw Error('FOUNDATION_ABI_VERSION_MISMATCH');

  try {
    const result = module.ccall('foundation_probe', 'number', ['string'], [sourcePath]);
    if (!Number.isInteger(result) || result !== 0)
      throw Error('FOUNDATION_ABI_PROBE_FAILED_' + result);
    const length = module.ccall('foundation_json_length', 'number', [], []);
    if (!Number.isSafeInteger(length) || length < 20 ||
        length > FOUNDATION_JSON_MAX_BYTES)
      throw Error('FOUNDATION_ABI_RESULT_LENGTH_INVALID');
    const json = module.ccall('foundation_json', 'string', [], []);
    if (typeof json !== 'string' ||
        new TextEncoder().encode(json).length !== length)
      throw Error('FOUNDATION_ABI_RESULT_TRUNCATED');
    const structured = JSON.parse(json);
    if (!structured || structured.schema !==
        'foundation-matroska-structured-tree-v0' ||
        !Array.isArray(structured.nodes))
      throw Error('FOUNDATION_ABI_RESULT_SCHEMA_INVALID');
    return structured;
  } finally {
    // A malformed input must leave no previous successful JSON visible.
    module.ccall('foundation_release', null, [], []);
  }
}
