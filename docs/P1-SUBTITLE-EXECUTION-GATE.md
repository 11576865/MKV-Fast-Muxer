# P1 — Single-job subtitle freshness witness and pre-exec command parity

Status: **implementation on feature branch, exact-head CI pending**.

## Execution boundary

The legacy single-file browser `muxBtn` continues to own all writes. This bounded slice adds a **subtitle-scoped execution witness** captured when the user starts a job. It is revalidated after the asynchronous Matroska EBML preservation preflight, before completed downloadable artifacts are cleared, and immediately before `ffmpeg.exec`.

The witness records exact browser `File` object references for the source, each external subtitle and VobSub sidecar, plus current subtitle count/order, source append-mode, observable subtitle format classification and the preexisting `EditIntent` draft revision. This catches stale/replaced input objects even if name, size and mtime happen to match. It **does not hash bytes** or account for unrelated audio, font, source-track and attachment changes; those still rely on the legacy running/UI lock and other preflights. Browser `File` identity is an operation-local observation, not a persistable asset ID.

The shadow mapper takes **already staged runtime subtitle paths and FFmpeg input indices**, rebuilds the candidate arguments through the same `buildMuxCommand`, and compares their entire string list against the legacy command that will actually be executed. If a subtitle field or mapping diverges, it refuses before writing. The shadow pass never invokes FFmpeg itself and does not replace the authoritative command.

## Boundaries deliberately unchanged

- No change to `src/mux-command.js` nor FFmpeg Wasm writers.
- No bypass of the existing `inspectMatroskaPreservation` fail-closed check.
- No change to legacy single-file normal subtitle/font/external audio workflows or batch executor.
- Success means `COMMAND_ARGUMENTS_MATCH` for a staged subtitle mapping, **not** that the output MKV bytes or chapter/UID/tag semantics are preserved.
- The independent nested-chapter/ChapterUID-targeted Tag loss evidenced in Issue #77 remains a writer limitation even if the issue tracker shows a closed status.

## Acceptance

- Exact-head Node suite + Vite + real Chromium all green.
- Tests demonstrate changed source File references, subtitle File references, sidecars, formats, field values, count, and source mode are refused.
- Both append-all and selective mux command parity; source-only remux remains accepted.
- Current P0 loss-preflight browser scenarios remain green and independent hard-source evidence is untouched.
- Browser real-output parity between any future *new writer route* and legacy artifacts is a later, separate phase. This does not claim such a route exists.
