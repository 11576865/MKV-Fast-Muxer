# Remux chapter semantic audit

The post-mux audit now checks chapter **time boundaries and source-provided
`title`/`language` metadata**, in addition to chapter count. A result with the
same number of chapters is not automatically a faithful remux.

- Expected values come from the real source `ffprobe` chapter inventory, not UI
  labels or fabricated defaults.
- Chapters are matched in output order. This supports the current
  `-map_chapters 0` copy contract; it does not attempt to infer chapter identity
  from renderer-assigned chapter IDs, which may be renumbered.
- Start/end time fields are compared in seconds, with an absolute tolerance
  of **2 milliseconds** to accommodate Matroska/FFmpeg time-base quantization.
  A larger shift or a missing timestamp is an audit deviation.
- Metadata comparison uses case-insensitive tag keys (`TITLE` and `title`
  are the same tag); source-provided tag values must survive unchanged.
  Missing source tags are not invented for the expectation.
- The legacy `chapterCount`-only expectation remains supported for callers
  that do not supply `chapters`.

The audit status remains **warning** on a mismatch, consistent with the
existing policy of retaining the generated MKV and presenting verification
uncertainty explicitly. It does not prove packet-level equality, playback
compatibility, complete metadata equivalence, or user-device acceptance.

Regressions: `tests/mux-audit.test.mjs` covers equal-count time drift,
title/language drift, case-insensitive tag lookup, quantization allowance,
missing boundaries, and unexpected chapters.
