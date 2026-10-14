# P3-B Batch Recipe v2 — Reviewed per-episode metadata into frozen JobPlan and delivered MKV

Date: 2026-10-14  
Parent branch: PR #133 source-neutral external metadata authority, commit `400ee90966e1ccc16a6a6dfc881bce17fb4c9184`, unmerged and pending repaired-head CI.  
Status: **feature implementation / targeted module checks passed; full combined Node/build/Chromium exact-head CI Pending**.

## Prior working executor vs missing product feature

The product already executes actual independent video-rooted `BatchJobPlan v1` objects through `createFrozenBatchMuxContext` and serial `runFrozenBatchQueue`. Its publication ledger independently distinguishes succeeded, missing directory save, audit warning, execution failure, cancel and interruption. Source Matroska structure (#77) and output-name collisions have independent preflight gates. A completed MKV artifact is audited and downloadable even if optional directory persistence fails.

The old `batch-recipe-v1` was a policy-only JSON: `preserveAttachments`, `subsetEnabled`, and `subsetScope`. No per-episode subtitle metadata could be authored or recovered. Exporting a rule document was **not** freezing task-level output composition.

## Implemented v2 behavior

1. `src/batch-recipe-v2.js`: strict 128 KiB `batch-recipe-v2` document. Every task stores one **display source identity hint** (`fileIdentity`) plus every paired subtitle's identity hint and typed `title,language,default,forced,original,commentary,hearingImpaired`. Limits 200 tasks/30 subtitles each, rejects duplicate source/track identities, unknown fields, control characters, oversized text, bad booleans, forged `executionAuthorized` or arbitrary untrusted properties. Does **not** serialize browser File objects, bytes, output directory handles, existing JobPlan, download blobs, prior audit or media execution state.
2. **Actual task inspector**: for each source in the current reviewed pairing, subtitle title, language, Default and Forced can now be independently authored. Values are stored by **exact in-memory File references** in a task-specific override map and projected onto freshly inferred job tracks. They never overwrite the source subtitle bytes or unrelated per-episode metadata.
3. **Freeze path**: `syncBatchPlan` derives a fresh real pairing (including manual ambiguity resolution) and applies only current bound overrides before `freezeBatchJobPlan`. Each frozen job receives the exact video, subtitle, optional sidecar and metadata, and `createFrozenBatchMuxContext` passes those into the original FFmpeg writer. Existing source preflight, output-name/directory collision check, per-artifact SHA and independent final audit remain in the original workflow. No copy from arbitrary JSON into a runnable context.
4. **Portable draft rebind**: Import of v2 immediately clears old manual pairings and per-File task overrides; global safe policy switches are loaded as in v1. Per-task metadata is kept as **pending suggestions**, invisible to the executor. The importer reconstructs fresh source-subtitle matching from user-reselected actual inputs. If any task or subtitle is absent, duplicated, mismatched, ambiguous or blocked, no approval is possible. The UI displays exact matched-task count and a warning that filename/path/size/mtime are **not proof of content identity**. User must explicitly click “审核并应用逐任务属性” for every matching current job. This creates a new File-object-bound in-memory override map; the pending recipe is then cleared and the plan recomputed. Users may discard pending suggestions. Unapproved pending task suggestions **block batch start**.
5. **Async race safety**: import preview and approval are bound to the last completed `batchPlanGeneration`, not an earlier pairing while input scanner or directory conflict checking is still running. Changes to the batch File selection discard previously approved override mappings. No background task or import auto-starts media write.
6. **Backward compatibility**: strict v1 JSON can still be imported with its policy-only semantics. The UI now exports v2 by default; v2 with zero selected jobs acts as a policy-only template and cannot grant task-level execution rights.

## Evidence and acceptance

- `tests/batch-recipe-v2.test.mjs` covers strict v2 schema, two episode tasks, per-job isolation, invalid type/foreign properties, duplicate identities, missing or changed selections, stale review-generation, no automatic metadata application, exact current-file approval and a real `freezeBatchJobPlan` → `createFrozenBatchMuxContext` chain proving authored title lands on both the frozen job and output execution report. No resource-only writer is added.
- Seven targeted v2 tests **PASS** in an isolated execution of the real production batch recipe / job plan / mux context JavaScript functions. Main source, E2E and new module syntax checks passed.
- Real Chromium E2E scenario selects two actual `Batch S01E01.mp4`/`E02.mp4` videos and paired ASS/SRT, edits different subtitle titles/languages/Forced in the inspectors, exports v2, removes/reselects actual files, imports inertly and confirms batch start remains blocked, explicitly rebinds and approves, executes real frozen two-job mux, downloads both MKVs and uses independent system `ffprobe` to verify delivered per-episode subtitle title/language/Forced. This regression is **submitted, not yet CI-proven**.
- Existing Five-step browser scenario is adjusted to inspect v2 exports without any sources and still verify foreign JSON rejection and **v1 importer compatibility through the unit suite**.

## Known limits; cannot be mislabeled

- A matching `fileIdentity` string **never** means SHA/content identity has been proven. Approval is an explicit user review of freshly inspected current media, not cryptographically verified source recovery. This differs from the #131–132 full-SHA source-track replay contract.
- v2 currently provides **subtitle track attribute overrides and global policy**, not arbitrary track/attachment composition operations, project-wide source-neutral video-less MKV output, signed JobPlan files, or automatic resumption after crash/reload. The existing batch runner is still sequential and keeps File grants in the current session.
- No guarantee of 20 actual muxes, multi-hour performance, or full multi-device stability is inferred from a 20-task **plan-only** test. Device work and sustained batch studies remain outstanding.
- The original P0 #77 loss of nested Chapters / targeted Tags and general AttachmentUID/EBML graph preservation is unchanged. No all-format lossless write capability is introduced.

## CI and merge discipline

This branch is stacked on the updated (but not yet merged) PR #133 and must remain separate until #133's repaired exact-head Chromium succeeds. Package the complete v2 feature, tests, real output oracle and notes in one PR; only a fresh combined exact-head Node/Vite/Chromium success supports merging. Do not conflate green syntax/isolated module checks with actual runtime acceptance.
