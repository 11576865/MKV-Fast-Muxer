# Batch Recipe v2: reviewed per-output subtitle metadata → frozen executable JobPlan

Date: 2026-10-14  
Parent work: PR #133 external audio/subtitle/font-domain integration, with explicit new-task rebound fix.  
Status: **implemented and submitted as a stacked feature, exact-head Node/build/real Chromium CI Pending**.

## User-visible gap

The existing `batch-recipe-v1` saved a strictly non-executable shared policy: preserve MKV originals, font subsetting enabled, and job/group subset scope. The real batch screen paired episode video/subtitle resources, but individual output subtitle titles, language codes, Default/Forced and accessibility dispositions were inferred from filenames and could not be saved as reviewed, portable rules for a later batch. A naive v2 document that persisted `File`, output directory or frozen JobPlan handles would silently turn untrusted JSON into an executable authorization.

## Implemented, bounded v2 contract

A new strict `batch-recipe-v2` schema (`src/batch-recipe-v2.js`, max 128 KiB) adds up to 100 reviewed output templates and 500 subtitle rows. Each template has `sourceName`, `outputName` and per-track `fileName`, optional `sidecarName`, `formatId`, `title`, `language`, `default`, `forced`, `original`, `commentary` and `hearingImpaired`. All keys are allowlisted, types and limits checked, duplicate jobs/subtitle identities rejected, and text control characters refused. The general policy remains a separate typed object, preserving v1's baseline behavior.

**Authority model:**
- `sourceName/outputName/fileName/sidecarName/formatId` in saved JSON are **declarative matching hints** only, not proof of file bytes or a permission to start mux. All saved metadata is reviewable text and booleans; JSON never includes File handles, source offsets, directory access, media bytes, old artifacts or resumable process tokens.
- Import initially only creates an inert pending candidate and full per-output UI review; no automatic application, no partial legacy task edits and no File grants. A separate “确认应用逐输出规则” action is mandatory.
- Preview requires the **whole current reselected batch pairing** to match source/output task count, unique job identities, subtitle track count, subtitle filename+sidecar+identified format identity and absence of pairing, invalid subtitle or output directory blockers. No partial matching: one missing member blocks the entire recipe.
- Explicit confirmation pins exact in-memory `File` object references for source video, subtitles and sidecars. Content-derived format ID is rechecked without falsely equating a probe wrapper object with a file permission.
- Any later selection replacing a File with another object of identical name/size/mtime invalidates approval. At approval and **every awaited step before JobPlan freezing**, current browser FileList entries must still be exact references present in the approved pairing. The original live generation, directory handle and conflict checks remain in force.
- Only the final `applyBatchRecipeV2ToPairing` creates **new derived pairing rows** carrying approved per-output subtitle metadata, without changing underlying media/track/sidecar files or original user pairing. These rows enter the **existing `freezeBatchJobPlan`**. The frozen job travels unchanged through `createFrozenBatchMuxContext`, original FFmpeg writer, result persistence and per-output final audit.
- Old v1 import/export controls remain intact and distinct. Importing v1 invalidates pending/approved v2 candidate. The original source-only single-mux workspace also remains unchanged.

## Code integration

- UI: separate v2 Export / Import / Confirm controls with a compact per-output read-only disclosure list; source/target/track metadata are escaped as untrusted text. Candidate status explains blocked or ready pairing.
- Single request for v2 export from the current validated pairing; import reads the bounded file and records a pending immutable recipe.
- Review and approval are separate; explicit approval applies only shared policy values to UI and records in-memory File refs, not a runnable plan.
- `prepareBatchStart` re-checks current exact File objects after it recomputes source pairing and again after async output collision, header and Matroska preservation preflight. Source replacement/review revocation rejects freeze.
- Frozen batch runner, ledger, save and independent MKV audits remain unchanged: `auditWarning`, `awaitingSave`, directory errors, cancelled and interrupted states retain their prior meaning.

## Tests and evidence

New `tests/batch-recipe-v2.test.mjs` covers strict JSON schema, no permissions, per-output typed fields and duplicate rejection; import inertness; matched explicit binding; same-metadata different File rejection; wrong output/format/sidecar and blocked pairing rejection; frozen JobPlan + actual mux execution context carrying different title, language and disposition rules for two episodes; headless frozen runner with separate output audit and pending download state.

New real Chromium `scenarioBatchRecipeV2PerOutputRealMux`:
1. Select two actual episode MP4 videos and ASS/SRT subtitles; export v2 JSON.
2. Edit episode 1 and episode 2 titles/languages/flags differently, import JSON (must not start mux).
3. Attempt start before explicit confirmation: must be blocked and no output link generated.
4. Explicitly confirm; run the existing two-job frozen batch queue.
5. Download both real MKV outputs; independent native `ffprobe` must verify *each output's* distinct title, language, Forced/Commentary flag, plus first output's frozen-job report provenance and two `awaitingSave` rows (never claim a persisted directory file when none was chosen).

Isolated production-module execution passed a two-job strict v2 export/import/preview → exact in-memory File binding → metadata projection to separate task objects, and confirmed a same-display replacement File invalidates approval without mutating original pairing. JavaScript syntax parsing passed for changed source/Node/browser tests. **Exact-head full Node/Vite/Chromium CI Pending.** No claim of real Chromium success before its actual result.

## Explicit non-goals / preserved risk

- No permanent File grants, OPFS file rebind, auto-recovery of missing subtitles, unattended re-execution or cross-session output directory permission.
- No hidden remux or resource-only writer; every output still passes original video-rooted and preservation preflight, independent final MKV output audit and directory collision checks.
- No general Matroska Chapter/targeted Tag/AttachmentUID/unknown EBML write guarantee; P0 #77 unchanged.
- `batch-recipe-v1` remains supported. Do not substitute the v2 document for `BATCH_JOB_PLAN_SCHEMA`; review text and executor authorization are distinct contracts.

## Follow-on

Merge parent PR #133 only when the exact repaired browser CI succeeds. After that retarget this stacked PR to `main`, observe **one** full exact-head Node/build/Chromium generation and address actual failures in a bounded batch. Continue global source/external domain composition, durable JobPlan history and cross-device acceptance separately.
