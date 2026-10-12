import {
  getBoundMultiAttachmentSources, MULTI_ATTACHMENT_PLAN_SCHEMA,
} from './multi-attachment-only-job-plan.js';

export const MULTI_ATTACHMENT_CANDIDATE_WRITER_ID =
  'ebml-generic-attachments-only-candidate-v0';

const encoder = new TextEncoder();
const idBytes = id => Uint8Array.from(id.match(/.{2}/g).map(x => parseInt(x, 16)));
const blob = value => value instanceof Blob ? value : new Blob([value]);
function sizeVint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('EBML_SIZE_INVALID');
  const size = BigInt(value);
  for (let width = 1; width <= 8; width++) {
    if (size < (1n << BigInt(width * 7)) - 1n) {
      let encoded = size | (1n << BigInt(width * 7));
      const bytes = new Uint8Array(width);
      for (let i = width - 1; i >= 0; i--) {
        bytes[i] = Number(encoded & 255n);
        encoded >>= 8n;
      }
      return bytes;
    }
  }
  throw new Error('EBML_SIZE_TOO_LARGE');
}
function unsigned(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('EBML_UINT_INVALID');
  let encoded = BigInt(value);
  const bytes = [];
  do {
    bytes.unshift(Number(encoded & 255n));
    encoded >>= 8n;
  } while (encoded > 0n);
  return Uint8Array.from(bytes);
}
const element = (id, payload) => {
  const data = blob(payload);
  return new Blob([idBytes(id), sizeVint(data.size), data]);
};
const uint = (id, value) => element(id, unsigned(value));
const str = (id, value) => element(id, encoder.encode(value));
const master = (id, elements) => element(id, new Blob(elements));

/**
 * New-container, zero-media experimental writer only. Never reinterpret
 * FileMediaType as a trusted content type, preview or execute attached bytes.
 * No FFmpeg call, no input Matroska modification, no automatic download.
 */
export async function executeMultiAttachmentOnlyCandidate(plan) {
  if (!plan || plan.schema !== MULTI_ATTACHMENT_PLAN_SCHEMA ||
      !Object.isFrozen(plan) ||
      plan.output?.expectedTrackCount !== 0 ||
      plan.output?.expectedClusterCount !== 0 ||
      plan.output?.expectedAttachmentCount !== plan.attachments?.length ||
      plan.attachments.length < 2 ||
      plan.attachments.length > 8 ||
      plan.attachments.some((a, i) =>
        a.fileUid !== String(i + 1) || !a.filename || !a.declaredMimeType)) {
    throw new Error('MULTI_ATTACHMENT_WRITER_PLAN_NOT_SUPPORTED');
  }
  const files = getBoundMultiAttachmentSources(plan);
  const attached = plan.attachments.map((item, ordinal) => master('61A7', [
    str('466E', item.filename),
    str('4660', item.declaredMimeType),
    element('465C', files[ordinal]),
    uint('46AE', ordinal + 1),
  ]));
  // No Tracks, Cluster, Chapters or Tags; this is not an EBML remux.
  const output = new Blob([
    master('1A45DFA3', [
      uint('4286', 1), uint('42F7', 1),
      uint('42F2', 4), uint('42F3', 8),
      str('4282', 'matroska'), uint('4287', 4), uint('4285', 2),
    ]),
    master('18538067', [
      master('1549A966', [
        uint('2AD7B1', 1000000),
        str('4D80', 'MKV-Fast-Muxer generic attachment experiment'),
        str('5741', 'MKV-Fast-Muxer generic attachment experiment'),
      ]),
      master('1941A469', attached),
    ]),
  ], { type: 'application/octet-stream' });

  return Object.freeze({
    schema: 'multi-attachment-candidate-output-v0',
    writer: MULTI_ATTACHMENT_CANDIDATE_WRITER_ID,
    state: 'CREATED_AWAITING_INDEPENDENT_AUDIT',
    filename: plan.output.filename,
    output,
    outputBytes: output.size,
    attachmentCountWritten: attached.length,
    trackCountWritten: 0,
    clusterCountWritten: 0,
    declaredFileUids: Object.freeze(plan.attachments.map(a => a.fileUid)),
    evidence: Object.freeze({
      attachmentsPresumedSafe: false,
      mimeMatch: 'not-tested',
      independentMatroskaParsing: 'not-tested',
      extractedBytesEqualSource: 'not-tested',
      generalWriterSupport: false,
    }),
  });
}
