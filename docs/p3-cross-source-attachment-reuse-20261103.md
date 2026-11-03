# P3 — Reuse A.mkv AttachedFile in B.mkv without manual extraction

Date: 2026-11-03. Status: feature branch, **exact-head full browser and native evidence required**.

## User-visible task

Import **A.mkv + B.mkv** through the already-existing resource import. Select B as the currently opened target source. A remains in the resource list, but not automatically combined into B.

Click **查看内封附件** on the secondary A source. A's existing Matroska `AttachedFile` entries appear with original filename, MIME, bytes and exact FileUID. Click **加入拟输出** next to a supported entry. The referenced A content now appears as a normal selected ordinary attachment in B's already-existing output plan, with its source A provenance shown; the current video source stays B.

Click the existing mux operation. The normal browser FFmpeg.wasm output path includes A's attachment FileData in B's new MKV, using the existing complete payload hash readback. No separate resource library, pre-extraction download or forced confirmation of draft inclusion. Neither source MKV is modified.

**Source A removal** prunes any A-derived candidates from the current output draft, invalidating old selection-dependent output evidence; B remains selected. Removing only the derived candidate leaves A alone and allows it to be selected again.

## Implementation / supported boundaries

- `src/embedded-attachment-composition.js` uses the already deployed seek-based `createMatroskaAttachmentReader`, independent source File identity and current immutable read-only inventory to extract the original `FileData` as a `Blob.slice` and wrap it in a normal `File` for the existing output route. The new File is just an operation-local File view, not a saved intermediate artifact or replacement source.
- The selected item preserves `embeddedOrigin` with the exact live source File and FileUID. Re-selecting the same FileUID from A cannot create duplicate members.
- The existing ordinary attachment route supplies final byte-level SHA-256 comparison and normal attachment name collision handling.
- Normal one-source mux flows are unchanged; secondary source controls appear only when a separate MKV is in the resource list. No new write scope is given to the source A.
- Currently only nonempty attachments at most **16 MiB each** and a maximum combined **8 attachments/32 MiB**, already enforced by the actual normal ordinary attachment writer, are eligible; unsafe filenames or incompatible MIME are visibly refused. Complex B Matroska preservation constraints still apply; this addition does NOT override preflight fail-closed denial.
- Existing TrackUID/AttachmentUID/ChapterUID/EditionUID and Tag references from source A are **not copied** into B. The selected `AttachedFile` is new content in B with its own output UID. This is not transferring a targeted Tag, moving a Chapter, or a cross-container media track merge. Full source provenance is operation-local, not durable across browser reload.

## Full actual browser + native end-to-end acceptance

`tests/e2e/cross-source-attachment-reuse-scenario.mjs` uses independently created **A.mkv** (with real text AttachedFile) and **B.mkv** (the media source). It imports both into the Chromium product, explicitly selects B, inspects A and clicks to add only the A attachment. It checks that the selected main source remains B, duplicate adds are refused, and the genuine downloaded browser-generated output contains the exact native-extracted `guide.txt` bytes.

The test independently checks:
- the resulting output has B's original media track type/codec, not A's media tracks;
- complete attachment FileData hashes match original A input bytes;
- B compressed media packet data hashes match and PTS differs by at most one Matroska timebase tick;
- A and B full original SHA-256 hashes are unchanged;
- removing A prunes any A-derived output members and invalidates previous output state;
- no JavaScript runtime errors.

The CI job uploads real A/B/output MKVs, extracted attachment, and a JSON receipt. Node tests cover bad source identity, obsolete inspection, duplicate FileUID, unsafe name/MIME, size limits and wrong FileData ranges.

**Acceptance is not claimed until exact-head green Node/build/Chromium/independent native test.**

This is the first actual user-driven P3 cross-container object inclusion. General track reuse, multiple targets, complex target Tag transfer, large unbounded sources, automatic reattachment on restored projects, and 1.0 product-scope expansion are outside this PR.
