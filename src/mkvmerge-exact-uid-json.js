/**
 * MKVToolNix JSON may serialize 64-bit FileUID/TrackUID fields as JSON
 * numbers. JSON.parse would round values beyond Number.MAX_SAFE_INTEGER,
 * incorrectly reporting different resources as equal or changed.
 *
 * Preserve exact decimal UID integer literals as strings *before* parsing.
 * This is limited to raw object keys spelled "uid", not all number fields.
 * Invalid JSON still fails normally; this does not validate EBML semantics.
 */
export function parseMkvmergeJsonWithExactUids(raw) {
  if (typeof raw !== 'string') throw new TypeError('MKVMERGE_JSON_TEXT_REQUIRED');
  const lossless = raw.replace(
    /("uid"\s*:\s*)(\d+)(?=\s*[,}])/g,
    (_all, head, integer) => head + JSON.stringify(integer),
  );
  return JSON.parse(lossless);
}

export function exactPositiveUid(value) {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    throw new Error('MKVMERGE_UID_NOT_EXACT_DECIMAL');
  }
  const uid = BigInt(value);
  if (uid <= 0n || uid > 18446744073709551615n) {
    throw new Error('MKVMERGE_UID_OUT_OF_UINT64_RANGE');
  }
  return value;
}
