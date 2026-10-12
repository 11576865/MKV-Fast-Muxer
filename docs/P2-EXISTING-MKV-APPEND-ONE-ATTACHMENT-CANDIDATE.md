# P2-A — Research-only append-one-attachment writer for an existing Matroska

Status: **submitted to feature branch; exact-head Node/Vite/Chromium and independent real-file audit Pending**.

## Why a distinct writer class

Merged PR #100 provides bounded raw source→candidate Segment byte commitments. It can detect chapter/tag/stream damage, but it **never** authorizes writing. Existing FFmpeg/Wasm no-edit remux Issue #77 is still a real loss of a nested ChapterUID and targeted custom tag.

This PR investigates a fundamentally different, *non-remuxing* existing-container strategy under severe preconditions: **append one new `Attachments` master at the end of the existing Segment, without changing any original Segment child's bytes or its relative offset**. Only the original Segment size VINT (using the **same encoded width**) changes, and one new AttachedFile is appended after the original final child. It does not decode/re-encode/copy FFmpeg streams or regenerate chapters/tags.

This is a test-only **candidate writer**, not a professional existing-MKV editing feature or production capability. No UI, download/export action, BatchRunner integration, FFmpeg branch replacement or automatic save.

## Deliberate eligibility restrictions

`prepareExistingMkvAppendAttachmentCandidate` rejects a source if any condition fails:

- Matroska EBML DocType and one bounded, exactly sized Segment **immediately after the EBML header**; no pre-Segment elements, trailing bytes or unknown-length Segment.
- Existing source is within 60 MiB, proposed FileData is nonempty and no more than 4 MiB, output stays within the research comparator's 64 MiB ceiling.
- Source already has `Tracks` and `Cluster`; source has **no Attachments master at all** (there is no attempt to add a second forbidden master or resize an existing `Attachments` element).
- No unexpected top-level EBML element and no top-level `CRC-32` which might cover newly appended bytes. No malformed or unknown source bytes within the bounded raw comparator.
- Original Tag reference graph must be complete and contain **zero nonzero `TagAttachmentUID` targets**, including *orphan* targets. Otherwise appending a new FileUID could unexpectedly make an old dangling target refer to the newly added file. ChapterUID and TrackUID targets are separately observed but original tags and referenced objects are not rewritten by the candidate.
- The existing Segment size VINT **must have enough capacity without changing its width**. A new size encoding that would widen the header is refused before output.
- Attached filename is normalized with existing proposal policy and requires explicit `approveFilenameAdjustments` if changed; MIME is only checked as **untrusted declared metadata**, not content authenticity or safety.

The immutable plan holds no serializable raw source/payload objects. Actual Blob references are retained only in a private session WeakMap bound to the genuine plan object; cloned/forged plans cannot claim authorization. Under the zero-attachment source precondition the new Segment-local FileUID is **1**. This is a deliberately narrow allocation policy, **not** a general UID allocator or target reference rewrite.

## Candidate and preservation proof

`executeExistingMkvAppendAttachmentCandidate(plan)` returns a new Blob and state `CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT`, never saves the source or enables output publication. It rewrites only the same-width numeric Segment size field, reuses the original bytes through Blob slices, and appends an EBML `Attachments / AttachedFile` with FileName, FileMimeType, FileData and FileUID.

The merged #100 comparator must independently inspect the candidate and verify that every existing protected top-level object (Info/SeekHead/Cues/Tracks/Cluster/Chapters/Tags/unknown) has identical raw byte commitments. The expected state is explicitly **`ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF`**, and `approvedToWrite=false` still. Header expansion, damaged protected bytes, invalid graph or new unexpected EBML are refused.

## Real independent oracle

`scripts/p2-existing-mkv-append-attachment-independent-audit.mjs` uses **MKVToolNix/mkvpropedit**, not the new writer, to author a fresh real MKV with an actual video track, nested ChapterAtom, ChapterUID-targeted `P0_NESTED_CHAPTER_KEEP` tag, and **zero original attachments**. Source chapters and Tag XML are self-checked first.

The experiment then invokes the candidate and uses a separate `mkvmerge -J` parser to check one actual appended text attachment and exact original track identities/codec. It calls `mkvextract` separately on **source and candidate** for chapters, tags and every original media track, requiring byte-identical XML and compressed track extraction. It calls `mkvextract attachments` for the new attached FileData and requires byte-for-byte content match. Original source SHA-256 must remain identical. CI retains real source, candidate, extracted attachment and JSON. The **non-gating** research verdict required before claiming this narrow experiment independently verified is:

`INDEPENDENT_APPEND_ONLY_EXISTING_MKV_TAG_CHAPTER_MEDIA_AND_ATTACHMENT_MATCH`

A green workflow alone cannot satisfy the oracle. Existing Node/Vite/Chromium, R-02/P2-M/P2-PC and #77 preflight gates remain unchanged.

## Not proven / next gates

- This source shape has *no existing Attachments*. It says nothing about replacing, deleting, renaming or adding a second attachment into existing `Attachments` master.
- There is no universal Segment/SeekHead/Cues/CRC validator, large-media reader or full player compatibility guarantee. Preserving original raw bytes and original offsets is a necessary raw-copy property, not a universal conformance proof.
- Unknown EBML and pre-Segment elements, malformed files, anonymous foreign UIDs, high-count media sources, source identity changes, actual destination overwrite, long-file performance and device memory all require separate evidence.
- The candidate remains experimental and intentionally **not executable from the user-facing existing-MKV inspector**, even after CI. Existing old FFmpeg/Wasm remux still has independently verified loss #77 and has **not** been fixed.
- Before a product writer, audit diverse real sources, seek/index validity, relation graph closure, external packet/timebase and output validation, cancellation/transactional save, and an independent standards conformance fixture matrix. A no-edit source may still contain structures not safely representable by this append-only class.
