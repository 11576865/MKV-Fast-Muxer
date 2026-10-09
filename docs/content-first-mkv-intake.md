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
