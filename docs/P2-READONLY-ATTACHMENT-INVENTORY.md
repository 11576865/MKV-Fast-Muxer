# P2 — SourceAsset session identity and read-only generic attachment inventory

Status: implementation submitted; exact-head Node/Vite/Chromium CI and R-02 crosscheck pending.

## Domain boundary

PR #88 verified a **test-only** PNG-only Matroska document via MKVToolNix and established a video-free *target draft*. This slice is the **source-side counterpart**, not a general editor or production attachment-only writer.

`createSourceAssetSession()` distinguishes objects by the exact live browser `File` / `Blob` reference, even if filename, size and mtime are equal. Returned descriptors are immutable plain data with session-local IDs, weak metadata-key evidence and **unverified bytes**. The session registry deliberately cannot claim content-authenticated durable IDs or persist File references. Reopening the browser or reselecting a file produces a new identity.

`createMatroskaAttachmentReader(file)` independently inspects the source **without ffprobe**, so it can read a Matroska containing no Tracks/Cluster, and also inspect attachments in conventional video-bearing Matroska files. It:

- Parses the Matroska EBML header/DocType and Segment by bounded Blob.slice reads.
- Traverses top-level element headers and FileData **ranges**, not the entire media data payload.
- Reports raw-attested attachment FileName, FileMediaType, FileUID, optional FileDescription, range, declared byte length, top-level Tracks/Cluster presence.
- Opens a selected attachment only after the **full bounded inventory** succeeds and the originating File reference remains live in its SourceAsset session.
- Returns a Blob view rather than eagerly allocating a new full in-memory byte array or writing a downloaded file.
- Fails closed if the document cannot be traversed safely (unknown-sized child, truncated/oversized element, malformed required attachment fields, duplicate FileData, huge text or excessive element count). No partially inspected attachment is exposed as safe to extract.

This inspector is **not** a general EBML schema validator, complete Chapter/Tag relationship parser, codec decoder, content hasher, or automatic source preservation verifier. FileData is intentionally not hashed at inspection time; actual extraction/integrity checks must opt into reading it. Unknown-sized Clusters and uncommon legal constructs may exceed its current supported envelope and must report unverified rather than incorrectly report zero attachments.

`projectAttachmentCopyTarget(inventory, selectedIds)` creates explicit generic attachment *copy intent* from validated observed names, MIME and lengths. It uses a source-namespace key and requires an explicit current selection. It does not claim writer support, numeric FileUID preservation, or transformed bytes; `resolveLegacyTargetCapability` still refuses video-free output.

## Exact-head proof gates

- Node tests for R-02 no-media source, multiple generic attachments, large FileData skip, exact-byte opened view, replace-file-same-metadata, no-attachment source, malformed/duplicate header refusal, output target copy selection + stale IDs.
- Vite build and all existing real Chromium Browser E2E including old single-file/batch mux and preservation preflight remain unchanged.
- R-02 previously independently validated source document is now passed through `scripts/r02-container-reader-crosscheck.mjs`; its FileData Blob view is checked against the **independent MKVToolNix SHA-256**. Both R-02 JSON reports must be inspected. CI marks this isolated research experiment non-gating; a green workflow never by itself proves reader coverage or production writing.
- Scope excludes a UI control until real user interaction and File lifetime behavior are tested. No switch of existing writer/executor, batch, error handling, or Matroska P0 guard.

## Next work

Extend source inspection to complete attachment UID/tag relationships and multi-file identity; add safe attachment export UI with browser E2E; bind plan-approval and writer capability to a stronger, explicitly versioned `JobPlan` before enabling general attachment mutations or PNG-only production output. Keep independently observed #77 chapter/target-tag loss distinct from tracked Issue status.

## Existing architectural decision references

`docs/GENERAL-CONTAINER-CORE-ALIGNMENT-2026-10-12.md`, approved `软封工程_未来规划总决议_2026-10-12`, and R-02 independent artifact evidence in PR #88 / run `38237809185`.
