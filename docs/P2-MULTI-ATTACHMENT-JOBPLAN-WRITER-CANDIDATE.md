# P2-M — Generic multi-attachment-only Matroska JobPlan and experimental writer

Status: **implemented in feature branch, exact-head CI and independent tool JSON pending**.

## Decision alignment

Approved product scope: generic Matroska domain objects; Attachments / AttachedFile are first-class rather than font-only; users may request reasonable data/media/supporting documents, but the container is not an encrypted archive or safe executable package. Read/edit/execute/verify are distinct capabilities. This implementation advances the **create-new attachment-only** capability proven for one PNG by #93/#94; it does **not** touch old browser FFmpeg/Wasm or batch, existing Matroska file modification or #77 complex Chapter/Tag preservation.

## Boundaries of new experimental plan

`prepareMultiAttachmentOnlyPlan` accepts **2–8 separate source File/Blob objects**, each non-empty and at most **16 MiB**, total at most **32 MiB**. Every item explicitly states a syntactically valid declared MIME such as `image/png`, `text/plain`, `application/json`, or `application/octet-stream`. It is untrusted metadata, not evidence of the file's actual type, safety, preview permission or distributability.

The plan is recursively frozen plain data, with order, source-session identity, original vs written filename mapping, declared MIME, size, fresh per-Segment `FileUID` (1 through N), zero Tracks/Cluster, and explicit unknown guarantees. Source Blob references are held only in a private WeakMap keyed by the *real* plan object. A serialized, forged or cloned plan cannot borrow authorization. Same-content, same-name input does not gain source identity. Distinct File objects are required; duplicated refs are refused. No persistent-content identity or cryptographic authenticity claim.

Name normalization, device-name adjustment, dangerous path stripping and case/Unicode-collision resolution reuse the safe proposal policy. If any source name changes, `approveFilenameAdjustments: true` must be passed explicitly; otherwise refuse to compile. This acknowledges name/metadata changes, not the contents of data files nor a destination overwrite.

`executeMultiAttachmentOnlyCandidate` composes an EBML Header + new Segment(Info + N AttachedFiles), referencing original FileData Blobs without eagerly loading them. It writes no track, Cluster, Chapter, Tag or unknown EBML extension and cannot remux an existing file. It returns `CREATED_AWAITING_INDEPENDENT_AUDIT`, not “validated”. It has **no UI integration**, automatic save action or production writer capability switch.

## Independent real-file verification

`scripts/p2-multi-attachment-independent-audit.mjs` creates **two different** attachments, an actual PNG and a text-license fixture, via the new writer. Separately implemented `mkvmerge -J` must independently read zero tracks and exactly two attachments, each with correct filename/MIME/length. `mkvextract attachments` must recover both original payloads byte-for-byte and record SHA-256. The pre-existing independent raw-EBML reader inspects the **same generated MKV**, requires distinct `FileUID` values 1 and 2, no Tracks and Cluster, and verifies its independently extracted bytes match the external results.

The CI step is **non-gating research** and saves the produced MKV, both extracted payloads and JSON. The exact report verdict `MULTI_ATTACHMENT_WRITER_INDEPENDENT_UIDS_AND_BYTES_MATCH` is required before treating the experiment as independently verified. A green workflow is NOT enough. Previous R-02 (test-only one-PNG fixture), R-02-W (different one-PNG candidate writer) and real browser one-PNG acceptance continue unchanged and must pass.

## Preconditions for product enablement — NOT met here

- Browser workflow for arbitrary user-chosen attachments, visible inclusion list, filename changes, data size and privacy disclosure, confirm/create/verify/export, cancellation and source-switch revocation.
- Cross-source/reference identity proof across asynchronous user edits and content-hash evidence appropriate to an opted-in resource budget.
- Stress tests near limits, cross-browser/mobile memory/time budget, and save destination collision/overwrite behavior.
- Multiple-sample external-tool interoperability, unsupported formats/unknown EBML constraints, privacy/unsafe-executable warnings and specific proof of no accidental media tracks.
- General ChapterUID/Tag source preservation and attachment modification remain separate writer-class requirements, not solved by creating an empty Segment.
- The system must not imply that arbitrary Matroska attachments are malware-free or DRM/encryption-protected.

If exact-head CI passes and the independent JSON is green, merge as **candidate capability only**. The next PR may add explicit, bounded real-browser multi-attachment creation with the same outside-tool output oracle.
