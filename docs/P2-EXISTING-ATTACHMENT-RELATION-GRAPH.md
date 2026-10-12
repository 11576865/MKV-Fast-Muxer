# P2-RG — Existing Matroska attachment UID reference graph and change-impact report

Status: **feature implementation submitted; exact-head CI and independent MKVToolNix-authored source evidence Pending**.

## Scope / historical boundary

Merged #97 built immutable **read-only** attachment `retain/remove/replace/add` drafts and a fail-closed existing-MKV writer capability resolver. Independent MKVToolNix/mkvpropedit `p0-independent-attachmenttag.mkv` proved that a Tag targeting one attachment's real 64-bit `AttachmentUID` requires blocking removal and replacement. Existing FFmpeg/Wasm remux and P0 #77 nested chapter/target-tag loss remain separate; no existing-MKV authoring is enabled.

This slice adds a **specific reference graph** explaining *which* Tag points to *which* source attachment UID and which proposed mutation would break it. The graph does **not** represent arbitrary Matroska relations, nor does lack of a known edge prove source safety.

## Reader and evidence semantics

`src/matroska-attachment-relation-graph.js` reads the actual browser Blob via seek-based EBML headers. It identifies `Tags / Tag / Targets` and four UID target element kinds:
- `TagAttachmentUID (0x63c6)`
- `TagTrackUID (0x63c5)`
- `TagChapterUID (0x63c4)`
- `TagEditionUID (0x63c9)`

UIDs are parsed with `BigInt` and returned as exact decimal strings, preserving the regression lesson from #97's red `JSON.parse` 64-bit UID oracle. A Tag can have multiple Targets. An AttachmentUID is resolved to an observed current-inventory `AttachedFile.FileUID` or remains an **orphan**, never guessed by ordinal/name. Track/Chapter/Edition targets are reported as **outside-attachment-graph**, not fabricated corresponding nodes. A UID 0 is interpreted as no target for this graph. `SimpleTag` values, `FileData`, `Cluster` payloads and unknown EBML structures are never ingested as content.

The graph is bound through `reader.inspectRelations(inventory)` to the **latest identical reader-owned inspection object** and source File reference. Calling it with an old snapshot is refused. All results are recursively frozen plain data (no File reference, executable writer or mutable aliases).

Budgeted scanning: at most 50,000 EBML headers, 4096 Tag nodes, 8192 UID target edges, 8 KiB maximum individual targeted field, 64 KiB EBML Header. Unknown Target element types are listed and `coverage.tagTargets='incomplete-unknown-target-elements'`, which **blocks** subsequent write capability. Malformed/unknown-length elements return `state:'unverified'`, never a false empty relationship list. The only asserted graph coverage is enumerating **recognized** Tag Targets in the **inspected Segment**; `unknownEbmlPreservation:'not-proven'` and `semanticWriteSafety:'not-proven'` remain explicit. Other top-level unknown element IDs are reported but not rewritten or certified.

## Immutable read-only impact

`createExistingAttachmentEditIntent()` obtains both the known P0 Chapters/Tags preservation preflight and this new graph **from the real source reader**. It adds to every existing source effect:

- `observedTargetedTags`: exact matched source Tag IDs and UIDs (zero if not observed, not an assurance of absence outside scope);
- `tagImpact:'observed-target-is-retained'` for surviving referenced attachments;
- `tagImpact:'would-orphan-tag-attachment-uid'` if removal or replacement would leave an observed Tag pointing at the previous UID;
- `tagImpact:'no-targeted-tag-observed-not-proof-of-safety'` if no known edge was matched.

The aggregate `impactSummary` reports the number of affected target edges, orphaned original Tag references and unknown Target types, without committing to any retargeting semantics. For every operation `execution.approvedToWrite=false`, `writer:null`, and no output container is produced.

Capability resolution adds `SOURCE_REFERENCE_GRAPH_UNVERIFIED` for incomplete or corrupt known Tag Target scans. It preserves `SOURCE_STRUCTURAL_PRESERVATION_BLOCKED` for known P0 chapter hazards and `SOURCE_UID_RELATIONS_UNVERIFIED` for known Tag UID refs. Even a complete graph with zero attachment references yields **`EXISTING_MATROSKA_WRITER_NOT_PROVEN`**, because this graph does not prove whole EBML/track data preservation.

## Tests and independent acceptance

Node suite tests:
- Exact TagAttachmentUID matches only intended attachment, not similarly named/ordered decoys.
- Removal / replacement create observable dangling Tag UID impact; decoy removal creates zero matching observed dangling edges and is **still blocked** from writing.
- Exact uint64 UIDs larger than JS safe integer are not rounded.
- Orphan UID targets remain explicit and unresolved.
- Unknown Target elements downgrade the graph and cause `SOURCE_REFERENCE_GRAPH_UNVERIFIED`.
- Malformed/duplicate Tag Targets fail closed rather than returning empty-clean.
- Last-inspection freshness and bounded reads skip a large Cluster and FileData.

`scripts/p2-attachment-relation-graph-independent-audit.mjs` inspects the *separately authored* MKVToolNix+mkvpropedit fixture with an actual 64-bit tagged attachment and decoy. It crosschecks exact `mkvmerge -J` UIDs, the source FileUID graph and three intents (remove linked, replace linked, remove decoy). Two linked operations must each forecast **one dangling original Tag target**, while decoy removal forecasts zero; all remain blocked and source MKV SHA-256 unchanged. JSON verdict must be `INDEPENDENT_ATTACHMENT_UID_TAG_GRAPH_AND_CHANGE_IMPACT_MATCH`, included in an always-uploaded research artifact. The research step is non-gating; a green overall CI is not proof unless this JSON explicitly succeeds. Existing Node/Vite/Chromium, R-02 and P0 oracles remain unchanged.

## Next bounded slice

Do not add a mutation button based on this graph. Before any existing-MKV writer approval: inventory arbitrary EBML families, nested Chapter/Edition UID graphs, non-Tag references, SeekHead/Cues/CRC viability, unknown payload preservation, unchanged media stream packet evidence, separate output bytes vs source integrity, and a backend-specific write plan verified on independent adversarial fixtures. User-visible relation *inspection* may be added independently, but it must not imply create/update is available.
