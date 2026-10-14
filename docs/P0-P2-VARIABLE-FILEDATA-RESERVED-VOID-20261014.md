# P0/P2-V — Existing Matroska variable-length FileData within reserved AttachedFile Void

**Status: submitted, awaiting exact-head unit/build/real Chromium acceptance and independent native MKVToolNix audit.** This is a complete but strictly constrained user operation, **not** a general EBML writer or blanket remedy for [#77](https://github.com/11576865/MKV-Fast-Muxer/issues/77).

## Why this is distinct from the merged equal-length writer

The existing [#136](https://github.com/11576865/MKV-Fast-Muxer/pull/136) can replace one existing, *unreferenced* attachment FileData while keeping its byte length exact. Changing the length would normally shift other EBML structures, invalidate seek/cue offsets, alter nested Master element lengths and possibly break CRCs or targeted UID semantics. Conventional FFmpeg remux already demonstrably lost nested chapters and ChapterUID-targeted tags on an independently authored MKV.

This block supports a **different source layout**: within the original `AttachedFile`, an `AttachedFile/FileData` is immediately followed by an **actual original EBML `Void` child**. The writer consumes some of that Void to grow the payload, or expands the Void to shrink it. It replaces the exact adjacent **FileData + Void interval** with a new `FileData` and new valid `Void` of the **same total number of bytes**. The FileData element **retains its original size-VINT width** (otherwise source is blocked); the remainder must fit a valid, at-least-two-byte Void.

As a result the enclosing `AttachedFile`, `Attachments`, Segment and EBML header sizes, every preexisting child outside the two-element interval, original SeekHead/Cues/Clusters/Chapters/Tags, other FileUID/metadata and all byte offsets remain unchanged. No parent size rewrite is required or attempted. This is **not** support for arbitrary variable-length modification when there is no capacity.

## Production gates

The source must be a real bound File or Blob of **1–60 MiB**, containing a well-formed Matroska with one existing Attachments master and Tracks/Cluster; the new FileData must be **1 byte–4 MiB**. The current, source-bound attachment inventory must have unique FileUIDs, the chosen target must have exactly one observed match, and the bounded target Tags graph must be fully understood. Any existing TagAttachmentUID pointing at the selected UID blocks replacement. Other targeted objects remain byte-preserved.

A bounded nested EBML walk must locate **exactly** that FileData's real byte offset, confirm a directly adjacent original Void inside the same AttachedFile, and reject CRC-32 inside its parent Attachments or AttachedFile, unknown structural children, unsupported unknown sizes, ambiguous data range, unknown top-level Segment elements and top-level Segment CRC. The FileData **old and new lengths must differ**; equal-length jobs retain the separately reviewed existing writer. The replacement must fit the original FileData VINT capacity and leave a valid trailing Void. Failure is fail-closed, never FFmpeg fallback.

Explicit user review and current File source + target UID + replacement choice are mandatory. The frozen real plan retains the File references only in a private session `WeakMap`; JSON copies and cloned plan objects have no authority. Source and payload SHA-256 are checked at both prepare/execute and after output. Download is manual and source is never modified.

Candidate output is compared by whole-source/target hashes, exact unchanged bytes outside the single replacement interval, original and produced raw Segment element/EBML and Segment header commitments, total byte length, original other attachment UID/name/MIME/description/data ranges/FileData SHA-256 and current target FileData length/hash. The generic raw comparator **still reports `ATTACHMENT_DELTA_NEEDS_REFERENCES_OFFSETS_AND_WRITER_PROOF`, `approvedToWrite=false`**; that global research contract is not altered or misused as generic permission.

## Evidence and authentic-media criteria

Node adversarial tests author synthetic EBML with nested ChapterAtom and an AttachmentUID-targeted original, exercising grow, shrink, tagged UID refusal, missing adjacent Void, CRC, unknown top-level element, equal-length refusal, no review, over-budget VINT and forged plan.

The real Chromium scenario takes the MKVToolNix/`mkvpropedit` **independently authored** existing two-attachment original (one tagged, one untagged) and adds nested Chapters using native MKVToolNix. A **test-only fixture transform** shortens the original free attachment's FileData by a known amount and uses the liberated *original FileData byte interval* for a valid EBML Void immediately after it; all file offsets and preexisting outer structures stay unchanged. Native `mkvmerge -J` must recognize this fixture before the browser edits it. The actual browser then chooses the unreferenced UID, grows its FileData into part of the Void, manually downloads the produced MKV. Separate native `mkvmerge -J`, `mkvextract` and `ffprobe -show_packets -show_data_hash sha256` compare original source UID and track details, source/output XML for all Chapters/Tags, tagged and replaced FileData bytes, compressed packet hashes and timestamps. The source SHA-256 must remain unchanged. Tablet layout screenshot is retained in browser evidence.

**Until full exact-head CI is green and the named browser log verdict is present, this is not a verified delivered feature.**

## Non-claims and next block

This does not support an ordinary existing MKV without an adjacent Void, resize above the preexisting capacity, removal, reordering, targeted AttachmentUID replacement, addition to an existing Attachments master, arbitrary CRC rewriting, unknown EBML, a general SeekHead/Cues offset repair engine, >60 MiB streaming, filesystem transaction/rollback, or broad third-party player certification. Source production is not widened based on a synthetic EBML mock. Future P0/P2 needs a separately verified **reference-aware parent-element resize + offset repair** writer class, real multiple-MKV corpora and independent conformance, then professional unified UI rather than treating this research path as universal editing.
