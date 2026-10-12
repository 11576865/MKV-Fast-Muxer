# P1 — External subtitle EditIntent draft and legacy command parity

Status: **feature-branch experiment; external Node/Build/Chromium CI pending.**

## Exact scope

This slice introduces `src/subtitle-edit-intent.js` and exposes its immutable draft from `ContainerDocument.subtitleEditIntents`. It captures the current **add external subtitle** requests (source, ordinal, asset metadata key, title, normalized language, Default/Forced and advanced disposition flags, optional subtitle codec override) without moving edit ownership away from the existing single-file editor.

- `revision` is a deterministic serialized **subtitle draft fingerprint**, not a cryptographic content hash, durable source identity, whole-document plan revision, synchronization lock, or authorization to execute.
- `isSubtitleEditIntentSnapshotCurrent` detects changes covered by the draft projection. It does **not** detect changes to source bytes with identical file metadata, other audio/font/track edits, staging, input disappearance or changes made during asynchronous preparation.
- `bindSubtitleIntentsToLegacyDescriptors` is a narrow read-only adapter for *equivalence tests*. Existing staging still chooses file paths/input indices and validates real files. The bridge refuses an unbound, stale or conflicting staging request but is **not connected to the running executor**.
- A repeated file can legitimately appear in multiple subtitle operations, so draft occurrence ID includes ordinal and the duplicate is diagnosed, not collapsed silently.
- Missing source or missing file remains non-executable; an output inspection may still show an incomplete draft.

## Evidence and exit criteria

`tests/subtitle-edit-intent.test.mjs` compares actual `buildMuxCommand` arguments from legacy editor data against the draft-bound projection for:

- Matroska append-all and selective-source workflows.
- Multiple subtitles and their order, title/language, Default/Forced/Hearing-impaired dispositions and WebVTT→SRT override.
- Source/draft changes invalidating snapshot fingerprint and invalid/mismatched staging bindings.
- Non-mutating, frozen `ContainerDocument` projection, not an alternative writer or mutable database.

The equivalence assertion deliberately uses the same existing command generator as the old execution path. It proves **descriptor mapping equivalence for tested inputs**, not real output identity or independent semantic preservation. Future work must add an instrumented, real-browser staging smoke with captured executor arguments and final independent artifact checks before adopting any new binding route.

## Non-goals and safety

There is no change to the FFmpeg/Wasm invocation, original MKV preservation preflight, legacy mux behavior, batch matching, source scan, UI layout or output claims. Issue #77 remains open; no green round-trip assertion may replace its independent red fixture.

Next: input+source revision ownership spanning *all* editable operations, exact execution-time freshness gate, and one controlled writer handoff only after old/new browser command+artifact equivalence.
