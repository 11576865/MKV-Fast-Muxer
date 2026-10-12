# P2-M — Browser-reviewed generic attachment-only Matroska creation

Status: **implementation submitted, exact-head Node/Vite/Chromium and independent browser-output audit Pending**.

## Product boundary

This work uses only the **experimentally verified new-container** multi-attachment plan/writer from merged PR #95. It does not change the old FFmpeg/Wasm video muxer, batch controls, source/track authoring or P0 semantic preservation gates. It does not edit any source Matroska, add Chapters/Tags or claim universal compliant media playback.

The new independent `实验：创建包含多个通用附件的 Matroska` disclosure accepts **2–8** separate user files (max 16 MiB each / 32 MiB total). A review inventory shows every original source name, byte size, browser-provided or generic fallback *declared MIME* (editable text input), and safe proposed internal FileName including collision/unsafe name mapping. This visible review list is **not** an assertion that MIME matches FileData or that content is safe. Arbitrary files and author-provided resources can include secrets and executables; the UI explicitly warns that anyone with the output can ordinarily extract the attachments. Text is inserted by DOM `textContent` only.

Before output creation the user must **explicitly confirm the entire inclusion list, MIME declarations, name adjustments and possible sensitive material** via a checkbox. Changing source selection or any MIME field revokes confirmation and disables any earlier prepared output. Re-confirmation does not restore a stale generated Blob: user must generate and verify again. Invalid count and size budgets keep the creation action disabled. Candidate writer requires `approveFilenameAdjustments: true` only after the review action.

## Browser output evidence

On **生成并逐附件验证**, compile immutable, session-bound JobPlan with distinct FileUIDs 1…N, create new zero-Tracks/Cluster EBML Blob, independently inspect its structure through project raw-EBML reader and compare **every attachment's bytes** to its bound source with WebCrypto SHA-256 (per attachment, sequentially). Only then enable a second explicit user action, **下载实验性多附件 MKV**. A browser download request is not a confirmed general destination transaction, overwrite guarantee or portable source authorization.

New real Chromium E2E selects PNG and independent license text bytes, confirms review gating, generates and *downloads* a real multi-attached-file MKV, parses it with external `mkvmerge -J`, requires zero media tracks and two correctly named/MIME'd resources, independently extracts both using `mkvextract attachments`, verifies byte equality and persists JSON `BROWSER_MULTI_ATTACHMENT_INDEPENDENT_UIDS_AND_BYTES_MATCH` together with raw MKV and extracted files. It also checks changing MIME forces a new review+generation; case-colliding source names require explicit review; single-file input stays blocked. Existing P0, subtitle, batch and one-PNG R-02 E2E unchanged.

## Nonclaims and future gates

- This is an explicitly **experimental** no-media new-container operation, not general Attachment CRUD or an archive replacement.
- Any claimed MIME/file extension is untrusted. No automated preview, execution, complete format validation, malware scan, privacy check or copyright/license authorization.
- The browser reads full source/extracted FileData only on explicit prepare, with a 32 MiB source budget; device-specific peak memory and cancellation/aborted reads need separate stress tests.
- No arbitrary directory save/overwrite transaction, persistent plan recovery, multi-reader interoperability beyond scoped MKVToolNix and project reader, or all-player compatibility.
- Old #77 nested ChapterAtom/ChapterUID-targeted Tag preservation remains a writer-level problem not repaired by creating an empty Segment.
- Keep this capability experimental even if a single Chromium fixture passes. Before generalization, verify adversarial source names/metadata, differing size tiers, several UIDs, same source selected repeatedly, plan and artifact identity across source swaps, device memory and actual save conflicts.
