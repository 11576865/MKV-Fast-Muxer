# General Matroska core alignment — decision baseline 2026-10-12

Status: architectural alignment and **P1 target-draft/R-02 research implementation submitted, CI pending**.
Decision source: user-approved `软封工程_未来规划总决议_2026-10-12` (D-01..D-10, sections 03/06/14–19), plus the earlier “询问软封现状” product conversation.
Repository baseline at branch creation: `main@331e8fba98c2aa12007a7d24d14f9b298bfcf7b4`.
This note does **not** amend the product resolution or assert a completed general writer.

## Product boundaries (approved)

- **B = container composition/domain core**: a Matroska project can originate from a video, audio-only content, individual attachments, or an empty composition. Video must not be a universal document root.
- **A = flagship subtitle delivery**, inherited rather than replaced. ASS project owns subtitle authorship, style/layout/effects; this project owns resource organization, mux, extraction, inspection and delivery verification.
- **C = evidence throughout**; observed input, approved plan, executable capability, actual artifacts, semantic preservation, self-contained rendering and playback compatibility are distinct statuses.
- **D = structural inspection and extraction**, without coercing the source into a writeable video project.
- **Batch** = recipe + output-target matrix + shared per-document inspector + independent executor and artifact ledger. Existing automatic episode matching, Group font subset, cancellation/output-retention behavior must survive.
- Desktop/tablet object-first UI is a later verified projection of *one* domain model, not an excuse to create four independent mutable workspaces or a long-scroll relabeling exercise.

## Implemented vs proposed

Already on main: working legacy video-rooted FFmpeg/Wasm single-file and batch subtitle/font flows; read-only `ContainerDocument` projection (#85); subtitle add draft `EditIntent` (#86); source/subtitle execution freshness witness & staged command parity (#87). These are narrowly scoped; they do not turn FFmpeg into an arbitrary Matroska writer, migrate all edits, or guarantee EBML Chapter/Tag preservation.

This branch implements a **separate, pure target projection** `src/container-target-draft.js`. It is not an alternative mutable editor or executor. It can describe attachment-only, audio-only, video-containing, metadata-only and empty targets, retaining resource/name/MIME intent and explicit unknown provenance. `resolveLegacyTargetCapability` correctly reports non-video targets as unsupported by the current video-rooted browser pipeline, **not invalid Matroska**. It does not attach File objects to frozen data or invent video tracks. It must not silently replace the live composition UI before domain ownership is migrated.

## Updated bounded execution order

1. **P0 + R-02**: keep the independently red #77 nested-chapter/target-tag oracle and current fail-closed safeguards; record normal workflows and the no-media attachment-only experiment as separate evidence tracks. A closed issue tracker state is not a repaired writer.
2. **P1 SourceAsset/ContainerDocument**: introduce formal source and output object identity, no-video target draft, chapter/Tag/attachment representation, revisions/undo and a single mutation owner; preserve old user-visible actions. Migrate one operation at a time with dual-path checks.
3. **P2 ContainerReader/CapabilityResolver**: inspect actual track/attachment/Chapter/Tag/unknown-EBML structures, implement safe extraction and assess backend-specific operations before attempting broader CRUD or an attachment-only production writer.
4. **P3 subtitle delivery**: preserve current ASS/SSA/SRT/WebVTT/PGS/VobSub and font workflows; add final-MKV ASS+font extraction, isolated rendering and scoped evidence. Not a subtitle authoring app.
5. **P3-B batch**: keep legacy pairing/Group/save semantics, move to independent immutable JobPlan and BatchRunner, then remove the UI-button simulation only after actual artifact parity.
6. **P4**: one actual-data-driven single output-composition inspector and a separate output-target batch matrix; desktop/tablet real visual, focus, draft and scroll acceptance precedes old UI retirement.
7. **P5/P6**: memory/file API/device policy, mature artifact identity, validated release claims and honest unverified-feature declarations.

These are dependencies/exit gates, **not invented time estimates or implementation-completion percentages**. R-02 is advanced early as a test requirement; production no-media writing remains conditional on independent format/backend evidence.

## R-02 test design / four distinct axes

Fixture: **one valid PNG as a FileData attachment, zero Tracks, zero Cluster, no video surrogate**. Test-only EBML construction uses EBML Header, Segment, Info and Attachments.

1. Normative hypothesis: RFC 9559 sections 4.5/6.1 require Info as the only required top-level Segment element; playable Matroska separately requires Tracks and Cluster. This does **not** certify the actual fixture.
2. Writer: current product legacy FFmpeg pipeline requires a video-bearing source; the test-only fixture generator is **not** a browser writer.
3. Independent parser/extractor: `mkvmerge -J` must report zero tracks and exactly one PNG attachment; `mkvextract attachments` must reproduce the PNG's SHA-256. Store the JSON verdict even if tooling rejects the fixture.
4. Playback: a non-playing container may be rejected or ignored by FFprobe/players; that is not alone proof that the EBML structure is non-conforming.

In CI, `scripts/r02-attachment-only-experiment.mjs` runs as an explicitly **non-gating research step** after regular Browser E2E. The report and fixture are uploaded as `r02-png-only-matroska-experiment`. A green CI job with a red/inconclusive R-02 JSON must never be advertised as a successful experiment.

## Next technical acceptance

- Prove R-02 actual reader/extracted-bytes result (report artifact; don't infer from workflow green).
- Add stable SourceAsset identity and no-video source inspection independent of filename extensions; byte signatures and permissions may remain unverified until inspected.
- Promote general attachments into the **single** future authoring model only after edit-owner/provenance semantics exist.
- Independently test actual audio-only and general-attachment target writers before enabling their execution actions.
- Carry #77 loss evidence as an open technical risk despite GitHub Issue #77 having been marked Closed, unless a matching repair-capable writer and independent hard-fixture audit are demonstrated.

Normative reference: https://www.rfc-editor.org/rfc/rfc9559.html
