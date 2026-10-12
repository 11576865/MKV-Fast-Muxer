# P2-X — Independent FFmpeg writer boundaries and candidate decode/seek acceptance

**Status:** Submitted as research; exact-head Node, Vite, Chromium and separate external-oracle JSON pending.

## Proven baseline and new question

Merged [PR #102](https://github.com/11576865/MKV-Fast-Muxer/pull/102) at `main@ec65c26f6affd265aeb693b5c066166132b12c91` verified three distinct Matroska configurations authored by **MKVToolNix**, while rejecting two unsafe layouts, using exact original TrackUIDs, chapter/tag XML, full compressed packets and attached file bytes. That is **not** cross-writer compatibility or an actual decode+seek test. This slice makes two different propositions independently observable without widening production write access:

- Existing source MKVs made by FFmpeg's **native Matroska muxer** are valid, externally recognizable and decodable, but may be **ineligible** for the strict experimental `SeekHead → sufficiently large Void → Info` candidate.
- Eligible MKVToolNix source/candidate pairs previously verified at compressed-packet level should also decode into the same image/audio frames and return the same packets when seeking to specific times. This is **tested-behavior parity**, not universal player/device support.

## Real authors and oracles

`scripts/p2-cross-writer-decode-seek-matrix.mjs` consumes the previously generated P2-V source/candidate corpus **only if** the named upstream machine verdict `P2_VOID_LAYOUT_CORPUS_INDEPENDENT_ROUNDTRIP_AND_REJECTIONS_MATCH` is verified. It uses FFmpeg independently of the MKVToolNix source writer to decode video/audio. Default-Cues and disable-lacing candidates are each compared to their unchanged source at 0.35 s and 1.25 s, for both video and audio, using `ffmpeg -ss … -t 0.42 -f framemd5` to compare all decoded frame hashes and counts. It also compares actual indexed `ffprobe -read_intervals 0.55%+0.60` packet hashes and timestamp records. The no-Cues case tests **full video/audio decoding only** and is explicitly not counted as a successful seek test. All three cases also require full original/candidate compressed media-packet record equality.

A separate source cohort is independently **authored by FFmpeg**, not remuxed by the experimental writer: a default Matroska from `base.mp4` and another made with `-reserve_index_space 4096`. Both must be independently readable by `mkvmerge -J` and decodable by FFmpeg video/audio. The reporter inventories the exact top-level element order and available **pre-Info** Void capacity. A deliberately larger 1024-byte generic resource then attempts the same source-bound `prepareExistingMkvAppendAttachmentCandidate` eligibility gate. Its accepted result is **an explicit layout-specific refusal** such as `APPEND_VOID_SLOT_CAPACITY_EXCEEDED` or `APPEND_PRE_INFO_VOID_RESERVATION_REQUIRED`; it cannot be misreported as format invalidity. If a future FFmpeg version yields a source eligible for writing, this matrix must **fail pending a new complete external positive source/candidate oracle**, not automatically expand the allowed writer class.

## Required verdict and scope

Named machine verdict:

`CROSS_WRITER_FFMPEG_LAYOUT_REFUSALS_AND_MKVTOOLNIX_DECODER_SEEK_MATCH`

Evidence includes two actual independently FFmpeg-authored sources and JSON with observed pre-Info Void spans, denial codes, MKVToolNix candidate source-vs-output decode frame checksums, Cues/seek packet checks and the no-Cues distinction. CI research remains **non-gating**: green Node/Vite/Chromium alone does not establish the external verdict.

Do not infer full multimedia playback certification from FFmpeg decode+seek checks. Do not infer no-Cues seek functionality from full decode. Do not infer that FFmpeg is globally unsupported or that its Matroska files are malformed; these are source-layout-specific, attachment-size-specific eligibility decisions. Neither FFmpeg nor MKVToolNix is a user-facing existing-container attachment editing backend yet. The old FFmpeg/Wasm ChapterUID-targeted Tag loss [#77](https://github.com/11576865/MKV-Fast-Muxer/issues/77) remains a separate unresolved defect.
