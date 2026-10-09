# Content-first MKV intake — vertical slice and boundaries

Related issue: https://github.com/11576865/MKV-Fast-Muxer/issues/68  
Scope: unified single-job intake first; MKV remains the only output container.

## User-facing contract

The workbench offers **Add files**, **Add folder**, and **drag/drop files** in one entry surface. Import is not divided into Video / Audio / Subtitle / Font categories. Every imported file receives a row showing its own actual content classification or an explicit unknown/unverified state.

A recognized media **container** becomes a *source candidate*, not automatically a verified video stream. One container candidate is selected for convenience; two or more require an explicit main-source choice. The selected source may contain its own audio, subtitles, attachments, chapters and metadata. If Matroska scanning succeeds, the row displays a stream-count summary while the existing track/attachment editor shows complete configurable details.

Recognized standalone subtitle/font/audio resources are routed by their detected content to the existing mux adapters. Unsupported/unrecognized files remain visible in the inventory and block the mux action until removed, rather than disappearing. VobSub IDX/SUB components continue to flow together to the existing pairing validator, which determines whether the pair is valid.

The existing hidden `videoInput`, `subInput`, `audioInput` and `fontInput` elements remain as internal adapters; there are **no visible category-specific upload gates**. Changing the active source sends a real input-change event through the previous scanning logic, while changing only an unrelated role does not disturb the other file inputs or already-edited metadata.

A media container with no extra subtitle file can be remuxed into MKV, including an existing MKV with its internal tracks. The execution-path ffprobe still **rejects source candidates that contain no video stream**.

## Evidence and limitations

Detection is bounded, layered and conservative:
- Matroska/WebM EBML and ISO-BMFF `ftyp` header: recognized as **container, video unverified**.
- Subtitle signatures: ASS/SSA, SRT, WebVTT, PGS, VobSub IDX + MPEG-PS SUB where recognized by the existing subtitle signature scanner.
- Font scaler / TTC signatures: identified as **font candidate**; full font parsing remains the authority.
- A limited set of independent audio headers: FLAC, RIFF/WAVE, Ogg, ID3/MP3 or MPEG frame signatures. The latter must still pass ffprobe.
- Unrecognized bytes stay **unknown** even if the extension or file MIME claims a known type.
- MP4/MOV containers are **input candidates only**. An audio-only M4A, for example, can share ISO-BMFF headers; it is **not** labeled as a confirmed video asset merely because the header is recognized.

This first slice does **not** perform whole-file hashing, broad audio codec detection, independent ffprobe scans for every imported media file, generic standalone image/data attachment ingest, automatic muxing of non-source containers, or multi-job source pairing. Those remain separate work. A unified importer should not make unverified combinations look guaranteed.

## Verification

Unit: signature-vs-extension, source ambiguity, unknown visibility, imported role routing, folder-path identity. Browser E2E: real mixed-file mux, explicit unknown blocking/recovery, source ambiguity, source-only MKV remux, and preservation of existing file-ID based UI controls.

All full Node/build/Chromium checks are **pending CI** at initial PR submission. UI acceptance also requires desktop/tablet/phone viewport inspection and input-focus checks; do not treat passing source assertions as screenshot/geometry evidence.

## Next slices

- The complete source-container stream tree should become the **primary** editable object, not just a lower editor panel, while retaining chapter/metadata audit.
- Source content verification should be asynchronous but cancellable, with explicit `PENDING`/verified/error lifecycle and no FFmpeg contention across imports.
- Batch input should eventually reuse a common identity inventory without bypassing ambiguity and destination collision gates.
- Remove leftover CSS legacy selectors and align existing UI tests with the new hierarchy once actual viewport evidence is collected.


## Phase 2 — inline source-container tree (Draft PR #69 follow-up)

Once the **selected source MKV** has completed the existing automatic ffprobe scan, its entry now expands to a nested tree of actual video/audio/subtitle/data streams, original attachments, chapters and preserved global metadata. Stream names/codecs/tags come from the source probe, not extension guesses. Other imported media containers still remain **unverified**; no imaginary stream list is generated for them.

In this vertical slice, the tree allows users to toggle full-content-preservation vs selective editing, include/exclude original audio/subtitle tracks and attachments, change track language/title and Default/Forced status, and rename source attachment filename/MIME. These controls update the **same `trackState` objects** used by the established original-track editor and FFmpeg output planner; there is no independent tree copy to reconcile.

The established editor retains its wider functions (track ordering, advanced Original/Commentary/Hearing-impaired flags, bulk operations). The new tree is a first direct-edit surface, not a claim that all container editing now occurs in one location.

**Important post-export lifetime fix:** The legacy single-task success path previously cleared `videoInput`, `subInput`, `audioInput` and `trackState`. That was incompatible with the visible, persistent unified asset inventory; the UI would show an imported file even though its editable source and stream tree had disappeared. The unified import path now preserves input adapters, original track selections and modifications after a successful MKV export, enabling a second edit/export operation. Users explicitly remove inventory items when no longer needed. The legacy non-inventory path retains its previous clear-on-success behavior.

Regression requirements:
- An actual scanned multitrack MKV renders all relevant source stream categories.
- Changes in the tree are visible in the original editor **and** affect the downloaded MKV's ffprobe metadata/track count.
- Chapter and metadata items remain visible and unchanged; original attachment removal/renaming is reflected in the artifact.
- Successful export does not strand or clear the unified import and edit context.
- At 390px phone width, synchronize on nonzero tree geometry after viewport change before asserting overflow and visibility.

The source-projection model has **5/5 V8 source-derived assertions** passing. The first full Node/Chromium CI run caught the real post-export reset mismatch; it is being corrected with a targeted browser regression. Do not mark this phase accepted until the later **latest-head** CI is green.
