# P2-V — Existing-MKV reserved Void: external layout matrix and source/payload freshness

**State:** Submitted as research-only, exact-head CI and named independent corpus JSON pending.

## Inherited baseline

Merged PR #101 (`main@35de55eae204b19e3e931d03033fa93373f86cef`) independently verified **one** MKVToolNix-created existing MKV with video/audio, nested ChapterUID and a targeted Tag, no existing Attachments, and a pre-Info `SeekHead → Void → Info` slot. The experimental candidate replaces part of that Void span with one `Attachments / AttachedFile`, keeps valid leftover Void, preserves original total source length and every preexisting non-Void element's byte commitment and absolute offset, and passed external chapter/tag, exact TrackUID, FFprobe per-packet content/timing and new FileData tests. The original raw protected-byte contract correctly remains **BLOCKED** because the reserved Void is deliberately consumed. **This is not** a general existing-MKV writer, no UI/save, not a repair for old FFmpeg #77 loss.

## Two distinct enhancements

1. **Temporal byte identity.** A genuine frozen per-session plan does not prove that byte sources are still the same at execution. Before candidate creation, re-scan the actual source File/Blob with the merged raw EBML comparator, including original Void, and require `identicalScannedBytes: true`. The added Blob is SHA-256-read at plan compilation and re-read at execution; size and digest must agree. Same-size changed source Void or payload is refused with `APPEND_SOURCE_CHANGED_AFTER_PLAN` or `APPEND_ATTACHMENT_CHANGED_AFTER_PLAN`. This does not prove malware freedom or authenticate the submitter. In particular, this only closes the plan→execute race interval for the bounded experiment, not an asynchronous user-facing write/save transaction.
2. **Real external layout/refusal corpus.** `scripts/p2-existing-void-layout-matrix.mjs` independently authors three MKVToolNix files using normal/default Cues, `--no-cues`, and `--disable-lacing` modes. Each is enriched by MKVToolNix/mkvpropedit with the same nested ChapterUID-targeted tag and Chapter hierarchy and has no old Attachments. For each candidate, verify independently via `mkvmerge -J` exact original TrackUID/codec plus the new named/MIME/UID/length attachment; `mkvextract` source/candidate entire chapter and tag XML, and new attached byte content; `ffprobe -show_packets -show_data_hash sha256` exact ordered video/audio packet SHA-256, PTS, DTS, duration and size. Original source SHA-256 unchanged, output length unchanged, original non-Void offsets/hashes unchanged. Source with `--no-cues` must genuinely omit `Cues`.

Two negative layouts explicitly have **no candidate output**: an independently authored MKV already containing one attachment must return `APPEND_EXISTING_ATTACHMENTS_NOT_SUPPORTED`; a *derived, externally verified readable* source with one reserved Void split into two valid Voids of exactly the same combined length must return `APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED`. This second case deliberately tests an unsupported but readable layout rather than implying the source is invalid.

## Evidence and rejection criteria

Research JSON `.e2e/output/p2-void-existing-mkv-layout-matrix-report.json` must contain 3 independent successful candidate cases, 2 correct refusals and verdict

`P2_VOID_LAYOUT_CORPUS_INDEPENDENT_ROUNDTRIP_AND_REJECTIONS_MATCH`

CI retains source/candidate MKVs and machine JSON. This step is **non-gating**, so green full Node/Vite/Chromium CI alone is insufficient for claiming independent corpus verification. No variant may silently be reclassified as a successful compatibility test if it instead fails the narrowly defined source preconditions. A variant rejection requires a precisely scoped documented follow-up or a correction of fixture assumptions, not automatic writer-generalization.

## Remaining unknowns

Cases remain only short media files from one independent writer family. Not all SeekHead/Cues variations, MKV writer brands, malformed/unknown EBML, CRC nesting, offset-relative Tag references, hardware decoders, >64MiB sources, browser memory/device constraints, attachment replacement/deletion, existing Attachments master extension, output storage transactions or source authorization. A direct codec/seek/playback user acceptance test remains a separate gate. ChapterUID-targeted metadata retention in **old FFmpeg/Wasm remux** (Issue #77) remains technically unresolved. No Canonical changes from one corpus.
