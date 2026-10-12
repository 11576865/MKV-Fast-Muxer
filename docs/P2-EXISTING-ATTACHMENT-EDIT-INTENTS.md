# P2 — Existing Matroska attachment edit intents and capability denial

Status: implementation submitted to feature branch; exact-head CI and independently authored source audit **Pending**.

## Why this slice precedes existing-container editing

The verified #93–#96 attachment-only writers construct a **new** Matroska Segment with no Tracks/Cluster, Chapters or Tags. Their independent byte roundtrips do **not** establish the ability to rewrite an existing source containing media, nested Chapters, targeted Tags or unrecognized EBML elements. Existing #77 independent fixture has already shown nested ChapterUID-targeted metadata lost under a no-edit FFmpeg remux, and the existing preservation preflight explicitly warns about target-specific AttachmentUID/TrackUID relations.

This PR therefore implements a separately typed, **read-only EditIntent** for an existing Matroska source. It never builds an executable FFmpeg command, never overwrites source bytes, never creates a modified MKV and never treats `NO_KNOWN_HAZARD` as approval to write.

## Model and source freshness

`createMatroskaAttachmentReader` exposes `isCurrentInspection(snapshot)`, bound to the same File object and the *last successful inspection object*, and `inspectPreservation()`, which uses the established raw-EBML P0 structural preflight. It still does not hand a File reference out through its public inventory.

`createExistingAttachmentEditIntent({ reader, actions, approveFilenameAdjustments })` then performs two independent reads of the **actual, reader-owned source**: raw attachment inventory and P0 preservation preflight. It rejects malformed/uninspected input and detects repeated source FileUIDs, selectors that no longer identify a source attachment, multiple conflicting operations on one identity, repeated new File objects, malformed declared MIME and out-of-budget additions.

Actions are `retain`, `remove`, `replace` or `add`, with every unspecified existing attachment **implicitly retained**. The frozen snapshot keeps original ID, UID, name, MIME, byte length and proposed operation. New/replacement attachments have deliberately **unassigned** FileUIDs, to avoid reusing an old UID or claiming source Tag relationships will remain valid. The original source name and safe proposed addition/replacement name remain separate; collision adjustments require explicit approval. All new File objects are kept privately by WeakMap keyed to the genuine immutable EditIntent. Clone or reinspection cannot become a current draft, and no raw blobs or source edit authority are serialized into the plan.

## Capability resolver: three different refusals

Every proposed change has `state: DRAFT_ONLY_WRITE_BLOCKED`, `execution.writer: null`, `execution.approvedToWrite: false`. The diagnostic code distinguishes:

- `SOURCE_STRUCTURAL_PRESERVATION_BLOCKED`: known nested Chapter, targeted ChapterUID, unreadable or unsupported EBML structures or missing structural proof.
- `SOURCE_UID_RELATIONS_UNVERIFIED`: real P0 raw-EBML preflight observed target-specific UID relationships (including AttachmentUID) that may be broken by removing/replacing an attachment.
- `EXISTING_MATROSKA_WRITER_NOT_PROVEN`: no known blocking relation was observed, but no writer has demonstrated preservation of all other source segments, unknown elements, seek/index structures or attached Tag references.

A no-change intent reports `NO_WRITE_REQUESTED`, which is not an authorization to perform a no-op remux; there is no executable output path in this module.

## Test / independent evidence

Node tests cover one/multiple attached source objects, retain/remove/replace/add, stable source FileUID bookkeeping, byte-preserving read-only construction, explicit filename/metadata review, duplicate FileUID and selectors, rejected foreign/new File references and stale read-on-edit identity; artificial AttachmentUID Target and nested Chapters independently trigger the relevant capability denial.

The **real independent authoring fixture** `.e2e/fixtures/p0-independent-attachmenttag.mkv`, produced by MKVToolNix and tagged via mkvpropedit with one AttachmentUID Target and a decoy, is loaded by `scripts/p2-existing-attachment-edit-block-audit.mjs`. It compares `mkvmerge -J` source attachment UIDs with the new raw-EBML source inventory, attempts removal and replacement of only the tagged attachment, requires the resolver to refuse **both**, leaves the decoy selected for retention and checks source MKV SHA-256 unchanged. Audit produces JSON verdict `UID_TAGGED_EXISTING_ATTACHMENT_EDIT_BLOCKED_SOURCE_UNCHANGED`; CI uploads this as **non-gating research** and a green workflow alone does not certify the result. Existing Node/Vite/full Chromium/P0 regression gates remain authoritative.

## Explicit non-claims and next bounded work

- **No existing-MKV write capability**, even on an apparently simple video-free source; the new source snapshot is an editable *proposal* only. Writer approval requires independent same-source semantic preservation evidence including Tracks/UIDs, Attachments/UIDs, Tags, Chapters, unknown elements, SeekHead/Cues and actual extracted bytes.
- No automatic TagAttachmentUID rewriting; editing an attachment with targeted tags remains blocked until explicit reference action and independent roundtrip tests exist.
- No persistent object identity across sessions, authenticated content hashes on metadata reads, malicious attachment safety, real edit UI or broad source format conformance claim.
- The next slice should build a concrete *reference-aware* read-only relation graph / structural change-impact report and separate capability matrix before any user-facing existing-MKV mutate button.

Reference: previously accepted Matroska product resolution (2026-10-12), `src/preservation-preflight.js`, source writer-loss research #77, and independent fixture authoring script `tests/e2e/generate-independent-matroska-fixture.sh`.
