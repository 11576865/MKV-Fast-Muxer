export const COMPATIBILITY_EVIDENCE_STATUS = Object.freeze({
  VERIFIED_E2E: 'verified-e2e',
  EXPECTED: 'expected',
});

const entries = [
  {
    id: 'mkv-copy-video-mpeg4',
    dimension: 'video',
    codec: 'mpeg4',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-mpeg4.mp4',
    expectedCodec: 'mpeg4',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  {
    id: 'mkv-copy-video-h264',
    dimension: 'video',
    codec: 'h264',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-h264.mp4',
    expectedCodec: 'h264',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  {
    id: 'mkv-copy-video-hevc',
    dimension: 'video',
    codec: 'hevc',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-hevc.mp4',
    expectedCodec: 'hevc',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  {
    id: 'mkv-copy-video-av1',
    dimension: 'video',
    codec: 'av1',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-av1.mp4',
    expectedCodec: 'av1',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  {
    id: 'mkv-copy-video-vp8',
    dimension: 'video',
    codec: 'vp8',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-vp8.webm',
    expectedCodec: 'vp8',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  {
    id: 'mkv-copy-video-vp9',
    dimension: 'video',
    codec: 'vp9',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture: 'compat-video-vp9.webm',
    expectedCodec: 'vp9',
    e2eScenario: 'compatibility-evidence-matrix',
  },
  ...[
    ['aac', 'compat-audio-aac.mkv'],
    ['flac', 'compat-audio-flac.mkv'],
    ['mp3', 'compat-audio-mp3.mkv'],
    ['opus', 'compat-audio-opus.mkv'],
    ['vorbis', 'compat-audio-vorbis.mkv'],
    ['ac3', 'compat-audio-ac3.mkv'],
    ['eac3', 'compat-audio-eac3.mkv'],
    ['alac', 'compat-audio-alac.mkv'],
    ['pcm_s16le', 'compat-audio-pcm_s16le.mkv'],
    ['pcm_s24le', 'compat-audio-pcm_s24le.mkv'],
    ['pcm_s32le', 'compat-audio-pcm_s32le.mkv'],
    ['pcm_f32le', 'compat-audio-pcm_f32le.mkv'],
  ].map(([codec, fixture]) => ({
    id: `mkv-copy-audio-${codec}`,
    dimension: 'audio',
    codec,
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E,
    fixture,
    expectedCodec: codec,
    e2eScenario: 'compatibility-evidence-matrix',
  })),
  {
    id: 'mkv-copy-audio-dts',
    dimension: 'audio',
    codec: 'dts',
    targetContainer: 'matroska',
    policy: 'stream-copy',
    status: COMPATIBILITY_EVIDENCE_STATUS.EXPECTED,
    expectedCodec: 'dts',
    note: 'Matroska/FFmpeg support is expected, but this repository does not yet have a reproducible browser E2E fixture for DTS.',
  },
];

export const MATROSKA_STREAM_COPY_EVIDENCE = Object.freeze(
  entries.map((entry) => Object.freeze({ ...entry }))
);

const evidenceByKey = new Map(
  MATROSKA_STREAM_COPY_EVIDENCE.map((entry) => [
    `${entry.dimension}:${entry.codec}`,
    entry,
  ])
);

export function compatibilityEvidenceFor(dimension, codec) {
  const key = `${String(dimension || '').toLowerCase()}:${String(codec || '').trim().toLowerCase()}`;
  return evidenceByKey.get(key) || null;
}

export function verifiedCompatibilityEvidence(dimension = null) {
  return MATROSKA_STREAM_COPY_EVIDENCE.filter((entry) => (
    entry.status === COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E &&
    (!dimension || entry.dimension === dimension)
  ));
}
