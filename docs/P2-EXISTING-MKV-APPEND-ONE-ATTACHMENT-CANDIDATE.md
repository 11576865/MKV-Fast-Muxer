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

## Revision after independently observed external-reader failure — 2026-10-13

Original tail-append-at-EOF candidate in PR #101 generated a formally recognizable `Attachments` element, but the **independent** `mkvmerge -J` audit rejected its attached-resource metadata (`INDEPENDENT_CANDIDATE_ATTACHMENT_METADATA_MISMATCH`). The saved source and candidate show an original `SeekHead` with no Attachments reference and the newly added master after Tags. This is evidence that a byte-correct EBML tail alone **does not establish external discoverability**, not proof of a specific MKVToolNix implementation mechanism.

The revised experimental writer **does not append at EOF**. It requires original element order `SeekHead → sufficiently large top-level Void → Info` and replaces only a portion of that existing `Void` with the `Attachments` master, re-encoding the leftover space as a second valid `Void`. Both the **total output length** and the **absolute offsets and raw bytes of every original non-Void top-level Segment child** remain exactly unchanged, including original SeekHead, Info, Tracks, Clusters, Cues, Chapters and Tags. No Segment size/header alteration is necessary. If the pre-Info Void is missing or too small, refuse writing. This is a still narrower eligibility class.

The strict #100 raw comparator correctly reports `BLOCKED_PROTECTED_BYTES_CHANGED`: the placeholder Void bytes have legitimately changed. **It is not overruled or weakened**. A second specific read-only comparison demands each original *non-Void* element's ID, absolute offset, byte length and digest match; original EBML and Segment header commitments must match. The output remains `CREATED_AWAITING_INDEPENDENT_SEMANTIC_AUDIT` with no publication authority. Fresh exact-head Node/Vite/Chromium and external mkvmerge/mkvextract source/candidate XML, packet, UID, filename and FileData proof are again Pending.

This revision supersedes the earlier physical *tail append* mechanism described above; the name `append-one-attachment` now describes the logical attachment-list change only, not the physical on-disk placement. The original failed external oracle remains a retained negative research observation.

## Independent media packet oracle correction — 2026-10-13

The first reserved-Void external run at head `de22f9a278b68db7eedfaa09478cd196167d45ac`, [workflow 38282519228](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38282519228), passed **336/336 Node**, Vite, Chromium and reached MKVToolNix's successful external recognition of the added attachment (`append-evidence.txt`, `text/plain`, 51 bytes, FileUID 1). Source/candidate original video/audio track IDs, codecs and exact uint64 TrackUIDs matched, and `mkvextract` chapter/tag XML succeeded. The non-gating audit was still red because `mkvextract tracks 0:...bin` failed on the independently authored MPEG-4 Part 2 source track; the research code reported `INCONCLUSIVE_OR_FAILED`.

Inspecting **those exact saved source and candidate artifacts** with independent FFprobe gave **143/143** equal ordered media packet records — 48 video and 95 audio — including SHA-256 compressed payload hash, PTS/DTS, duration and packet size. The next oracle switches *only the media-packet comparison* to FFprobe `-show_packets -show_data_hash sha256` and requires every packet record identical, while **retaining** `mkvmerge -J` for external track/UID/attachment metadata, `mkvextract` for original/candidate complete Chapters/Tags XML and actual new attached FileData, and original source SHA-256. This substitution strengthens packet-level timing coverage rather than silently dropping it. The revised exact-head CI result is **Pending**. Do not report independent append-writer success unless named JSON verdict is green.
