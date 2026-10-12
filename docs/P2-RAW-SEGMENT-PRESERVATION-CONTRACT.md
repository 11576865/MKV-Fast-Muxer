# P2-PC — Bounded raw EBML preservation contract (necessary evidence, NOT a writer)

Status: **submitted as Draft; exact-head CI, P0 original-source oracle pending**.

## Why this step

Merged #97–#99 support real existing Matroska attachment inventories, TagAttachmentUID relationship/impact graphs and safe read-only browser UI. However, no existing-MKV writer has demonstrated preserving non-attachment structures and packet data. P0 [issue #77](https://github.com/11576865/MKV-Fast-Muxer/issues/77) establishes a real loss of a nested ChapterAtom / ChapterUID-tag under an ordinary no-edit FFmpeg/Wasm remux. Successful source inspection cannot be mistaken for output preservation.

This bounded, deliberately conservative **candidate-output comparator** is the first actual `Source → CandidateArtifact` preservation evidence slice. It never writes or exports an MKV, opens a filesystem destination, grants backend capability, or replaces the old muxer.

## Raw contract

`src/matroska-raw-preservation-contract.js` offers:

- `inspectRawSegmentPreservation(fileOrBlob)` — bounded seek-based EBML parser that reads the entire (small) file in **256 KiB chunks** and commits to each **complete top-level Segment element's raw bytes**, including Tracks, Cluster, Chapters, Tags, SeekHead, Cues, Info, Void/CRC, unknown elements and Attachments. The EBML Header and Segment Header are committed separately.
- Each element carries original numeric ordinal, EBML ID, range, length and a deterministic `sha256-of-fixed-256k-chunk-sha256-with-length-v0` *tree commitment*. **This is not a standard SHA-256 digest of the full input nor semantic equivalence**. The actual content, privacy-sensitive attachment payloads and Blob references are never exported in the immutable report.
- `compareRawSegmentPreservation(sourceScan,candidateScan,{attachmentChangesRequested})` — reports which **protected** non-attachment objects changed, even if the candidate still parses, and explicitly distinguishes an unrequested Attachment edit from a user-requested-but-unproven one.

Both APIs are read-only. All comparisons have `approvedToWrite: false`, even if the source and candidate are byte-identical. Changing a Track, Cluster, Chapter, Tag, unknown element or EBML header blocks protected object equivalence. Changing only the AttachedFiles element yields `BLOCKED_UNREQUESTED_ATTACHMENT_DELTA` without explicit declaration, or `ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF` with it. In **neither case** is writer permission granted.

The strict equivalence criterion is intentionally stronger than Matroska semantic compatibility: a legitimate remux can reorder or reserialize EBML and be rejected; absence of a raw diff cannot certify valid SeekHead/Cues offsets, CRCs, targeted UID relationships, decoded media, actual file durability, or the correctness of a real attachment change. Raw byte commitments are a **necessary guard for the proposed restricted byte-copy writer class**, not a universal correctness standard for all Matroska writers.

## Resource / conformance limitations

The first evidence scope is a **64 MiB research budget per file**, 256 KiB maximum read slice, 20,000 element headers, known EBML DocType `matroska`, one bounded Segment and no unsupported unknown-length children. Sources over budget, malformed inputs **and otherwise valid pre-Segment elements that are not yet fingerprinted** report `state:'unverified'`; no optimistic empty/equal report is created. The budget does not imply the product generally rejects video files over 64 MiB — it applies only to this research comparator.

Any future writer must separately prove source session ownership, authorized changes, TagUID/TrackUID/ChapterUID/EditionUID relations, seek/index/offset and CRC validity, stream packet semantics, decoded media if promised, FileData hashes, destination transaction, rollback, and independent exact-output validation. The #77 risk remains technically unresolved.

## Test oracle and failure cases

New Node cases commit to known/unknown top-level objects, check immutable report boundaries, identical no-edit bytes matching but **still denied**, and modify just one of nested Chapters, Tags, Tracks or Cluster payload to require `BLOCKED_PROTECTED_BYTES_CHANGED`. Another test changes only FileData bytes: implicit change is blocked; explicit change is labeled as requiring UID/offset/writer validation. Malformed oversized input and bounded large-Cluster chunk reads fail closed.

`scripts/p2-raw-preservation-contract-independent-audit.mjs` loads the **independently MKVToolNix/mkvpropedit-authored** source used for P0 #77, checks `mkvextract` genuinely exposes the nested chapter and ChapterUID-targeted Tag marker, hashes original source and compares a byte-identical copy plus three separately byte-mutated *in-memory* copies. It requires detecting distinct raw Chapter loss, targeted Tag loss, and unauthorized/explicit-but-unproven Attachment FileData change. Source MKV SHA-256 must be unchanged. Named independent JSON result must be:

`INDEPENDENT_COMPLEX_MKV_RAW_PROTECTION_DIFFERENCES_DETECTED`

The GitHub Actions step is non-gating research (artifact `p2-complex-mkv-raw-protection-contract`), so a green workflow **alone is not sufficient**. Prior P0, R-02, P2-M, #98 relation graph, Chromium and browser legacy/batch tests must also pass.

## Follow-up

Use the new pairwise report only as a **first-stage comparison** on actual candidate MKVs. Build a second, separately authored **semantic preservation verifier** that can accept valid serialization differences while independently comparing Chapters/Tags/AttachmentUID associations and unaltered track packet/timing facts. Do not introduce a real existing-container edit button until a writer has passed both independent semantic and byte/identity gates on adversarial output corpora.
