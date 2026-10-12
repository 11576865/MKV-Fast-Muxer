# P2 — Bounded attachment signature evidence and R-02 real-browser acceptance

Status: submitted on a feature branch, exact-head CI **pending**.

## Scope

This is a read-only safety/evidence extension to the already merged generic Matroska attachment inspector (PR #91). **The purpose is not to certify payload safety**. The inspector reads raw EBML FileName/FileMediaType/FileData ranges without requiring a video stream. New `classifyAttachmentPrefix` identifies a deliberately limited set of known file **prefix signatures**: PNG, JPEG, GIF, PDF, ZIP, TrueType, OpenType, WOFF/WOFF2 and a preliminary MZ executable header. It compares the observed prefix against the source's declared MIME only when a known signature is detected.

- Match means `prefix-matches`, **not** a fully valid file or safe-to-preview file.
- A known signature with incompatible declared MIME means `prefix-mismatch` with a prominent warning; the raw metadata is not edited.
- Unknown or short bytes remain `unknown`; unknown does **not** imply mismatch, corruption or safety.
- A read failure returns `read-failed`, not success.
- No antivirus/malware scan, no font/image decoding, no content hash or full content verification. Declared MIME remains untrusted.
- Each source-attachment prefix check is **opt-in per row** and reads at most 64 bytes through the already authenticated reader's Blob range. Merely opening a container retains the no-FileData-read property of its inventory.
- The generation/File-reference check keeps asynchronous prefix results from populating a list after its source file changes.

## R-02 actual browser route

Previously R-02 was verified as a test-only encoder plus external MKVToolNix reader/extractor and a separate new model reader hash comparison, not as a user-interface operation. The deterministic research fixture encoder is now a side-effect-free helper `scripts/r02-attachment-only-fixture.mjs`, **used unchanged by** the independent `mkvmerge`/`mkvextract` research script and the real Chromium E2E.

New Chromium scenario:

1. Open the real source attachment inspector and supply a deterministic Matroska with **zero Tracks and zero Cluster**, exactly one `pixel.png` PNG attachment. No video `#videoInput` gets populated.
2. Confirm one attachment row, invoke the per-row bounded signature check, observe `PNG 文件头（仅文件头匹配，非完整内容验证）`.
3. Download `pixel.png` from the browser UI via an explicit click and compare saved bytes byte-for-byte to the original one-pixel PNG.
4. Supply the same PNG bytes but with a **false source MIME `application/pdf`**, inspect and click signature check. Require the warning to distinguish observed `image/png` from declared `application/pdf`.
5. The existing independent MKVToolNix research still validates the default fixture independently and checks source/extracted SHA-256; the existing P0/legacy/batch regression suite remains unmodified and gating.

This is **one known deterministic fixture**, not evidence every legal nonplaying Matroska or weird unknown-size EBML can be parsed. The old no-video-refusing FFmpeg/Wasm writer, ChapterUID/Tag loss issue #77, production attachment-only writing, and destination-directory transactions remain unchanged.

## Exit gate

Exact-head Node, Vite build and full Chromium Browser E2E, including R-02 no-video download and false-declared-MIME warning, must pass. The non-gating research JSON **must** still independently report `INDEPENDENT_READER_AND_BYTES_MATCH` and `MODEL_AND_INDEPENDENT_ATTACHMENT_BYTES_MATCH`; GitHub workflow green alone cannot establish these research results.

Future: deeper content decoding or full hashes should require separate user consent/resource limits. Do not silently turn prefix heuristics into content-safety badges or executable preview permissions.
