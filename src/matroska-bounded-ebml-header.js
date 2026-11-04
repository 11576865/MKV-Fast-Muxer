/**
 * Single read-only EBML ID + data-size VINT decoder for existing-MKV writers.
 *
 * Contract: finite, addressable child elements only; never reads payload
 * bytes or follows unknown-length masters. This deliberately does NOT claim
 * to be a complete Matroska reader. A specific writer must still validate
 * element identities, parent geometry, UID references, CRC and output bytes.
 *
 * No third-party/GPL source is embedded: this is a consolidation of the
 * product's four existing duplicated parsers, following EBML VINT semantics.
 */
const fail = reason => {
  const error = Error('EBML_BOUNDED_HEADER_' + reason);
  error.reason = reason;
  throw error;
};

export async function readBoundedEbmlHeader(file, offset, bound) {
  if (!file || typeof file.slice !== 'function' ||
      !Number.isSafeInteger(file.size) ||
      !Number.isSafeInteger(offset) || !Number.isSafeInteger(bound) ||
      offset < 0 || offset >= bound || bound > file.size)
    fail('RANGE');

  // EBML element IDs occupy at most four bytes and sizes at most eight.
  const bytes = new Uint8Array(await file.slice(
    offset, Math.min(bound, offset + 12),
  ).arrayBuffer());

  const first = bytes[0];
  if (!first) fail('ID_INVALID');
  let idWidth = 1;
  while (idWidth <= 4 && !(first & (0x80 >> (idWidth - 1))))
    idWidth++;
  if (idWidth > 4 || idWidth >= bytes.length)
    fail('ID_TRUNCATED');

  let id = 0;
  for (let index = 0; index < idWidth; index++)
    id = id * 256 + bytes[index];

  const sizeFirst = bytes[idWidth];
  if (!sizeFirst) fail('SIZE_INVALID');
  let sizeWidth = 1;
  while (sizeWidth <= 8 && !(sizeFirst & (0x80 >> (sizeWidth - 1))))
    sizeWidth++;
  if (sizeWidth > 8 || idWidth + sizeWidth > bytes.length)
    fail('SIZE_TRUNCATED');

  let value = BigInt(sizeFirst & ((1 << (8 - sizeWidth)) - 1));
  for (let index = 1; index < sizeWidth; index++)
    value = (value << 8n) | BigInt(bytes[idWidth + index]);

  if (value === (1n << BigInt(sizeWidth * 7)) - 1n ||
      value > BigInt(Number.MAX_SAFE_INTEGER))
    fail('UNKNOWN_OR_UNADDRESSABLE_SIZE');

  const size = Number(value);
  const sizeStart = offset + idWidth;
  const dataStart = sizeStart + sizeWidth;
  const end = dataStart + size;
  if (!Number.isSafeInteger(end) || end > bound)
    fail('ELEMENT_OUT_OF_BOUNDS');

  return Object.freeze({
    id, offset, idWidth, sizeWidth, sizeStart, dataStart, size, end,
  });
}

/**
 * Translate canonical decoding failures back into each writer's established
 * error namespace. Unknown errors are never transformed into eligibility.
 */
export function rethrowBoundedHeaderError(error, prefix, translations) {
  const reason = error?.reason;
  if (typeof reason !== 'string' ||
      !Object.hasOwn(translations, reason))
    throw error;
  throw Error(prefix + translations[reason], { cause: error });
}
