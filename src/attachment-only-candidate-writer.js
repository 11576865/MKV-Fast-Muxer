import {
  getBoundPngSourceForCandidate, PNG_ONLY_PLAN_SCHEMA,
} from './attachment-only-job-plan.js';
import { classifyAttachmentPrefix } from './attachment-signature.js';

export const PNG_ONLY_CANDIDATE_WRITER_ID = 'ebml-attachment-only-candidate-v0';

const encoder = new TextEncoder();
const asBytes = value => encoder.encode(value);
function hexId(id) {
  if (!/^(?:[0-9a-f]{2}){1,4}$/i.test(id)) throw new Error('EBML_ID_INVALID');
  return Uint8Array.from(id.match(/.{2}/g).map(hex => parseInt(hex, 16)));
}
function encodeSize(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('EBML_SIZE_INVALID');
  }
  const n = BigInt(value);
  for (let width = 1; width <= 8; width++) {
    if (n < ((1n << BigInt(width * 7)) - 1n)) {
      const bytes = new Uint8Array(width);
      let encoded = (1n << BigInt(width * 7)) | n;
      for (let i = width - 1; i >= 0; i--) {
        bytes[i] = Number(encoded & 255n);
        encoded >>= 8n;
      }
      return bytes;
    }
  }
  throw new Error('EBML_SIZE_TOO_LARGE');
}
function encodeUint(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('EBML_UINT_INVALID');
  }
  const bytes = [];
  let n = BigInt(value);
  do {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  } while (n > 0n);
  return Uint8Array.from(bytes);
}
function element(id, payload) {
  if (!(payload instanceof Blob)) throw new Error('EBML_PAYLOAD_MUST_BE_BLOB');
  // Blob composition can reference FileData without reading the whole File.
  return new Blob([hexId(id), encodeSize(payload.size), payload]);
}
const binary = (id, value) => element(id, new Blob([value]));
const str = (id, value) => binary(id, asBytes(value));
const number = (id, value) => binary(id, encodeUint(value));
const master = (id, children) => element(id, new Blob(children));

/**
 * Narrow *create-new* Matroska candidate writer. It NEVER remuxes an existing
 * Segment or claims to preserve unknown EBML, ChapterUID or Tags.
 *
 * FileData is referenced as a Blob part. Only its 8-byte PNG signature is
 * inspected before composing output, not full PNG validity or digest.
 */
export async function executePngAttachmentOnlyCandidate(plan) {
  if (plan?.schema !== PNG_ONLY_PLAN_SCHEMA ||
      plan.output?.expectedTrackCount !== 0 ||
      plan.output?.expectedClusterCount !== 0 ||
      plan.output?.expectedAttachmentCount !== 1 ||
      plan.attachments?.length !== 1 ||
      plan.attachments[0].declaredMimeType !== 'image/png' ||
      plan.attachments[0].fileUid !== '1') {
    throw new Error('PNG_ONLY_WRITER_PLAN_NOT_SUPPORTED');
  }
  const file = getBoundPngSourceForCandidate(plan);
  const rawPrefix = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const evidence = classifyAttachmentPrefix(rawPrefix, 'image/png');
  if (evidence.signatureId !== 'png' || evidence.state !== 'prefix-matches') {
    throw new Error('PNG_ONLY_SOURCE_SIGNATURE_MISMATCH');
  }
  // Check the binding AGAIN after the async prefix read.
  if (getBoundPngSourceForCandidate(plan) !== file) {
    throw new Error('PNG_ONLY_SOURCE_CHANGED_DURING_PREPARE');
  }

  const ebmlHeader = master('1A45DFA3', [
    number('4286', 1), number('42F7', 1),
    number('42F2', 4), number('42F3', 8),
    str('4282', 'matroska'), number('4287', 4), number('4285', 2),
  ]);
  const segmentInfo = master('1549A966', [
    number('2AD7B1', 1000000),
    str('4D80', 'MKV-Fast-Muxer research candidate'),
    str('5741', 'MKV-Fast-Muxer research candidate'),
  ]);
  const attachment = plan.attachments[0];
  const attachedFile = master('61A7', [
    str('466E', attachment.filename),
    str('4660', attachment.declaredMimeType),
    element('465C', file),
    number('46AE', 1),
  ]);
  const output = new Blob([
    ebmlHeader,
    master('18538067', [
      segmentInfo,
      master('1941A469', [attachedFile]),
    ]),
  ], { type: 'application/octet-stream' });
  return Object.freeze({
    schema: 'png-only-candidate-output-v0',
    state: 'CREATED_AWAITING_INDEPENDENT_AUDIT',
    writer: PNG_ONLY_CANDIDATE_WRITER_ID,
    filename: plan.output.filename,
    mediaTracksWritten: 0,
    clustersWritten: 0,
    attachmentCountWritten: 1,
    inputBytes: file.size,
    outputBytes: output.size,
    output,
    evidence: {
      pngPrefix: 'observed',
      completePngValidity: 'unverified',
      fullByteEquivalence: 'unverified',
      independentMatroskaParsing: 'not-yet-tested',
    },
  });
}
