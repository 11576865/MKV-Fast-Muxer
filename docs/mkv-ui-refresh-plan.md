# MKV workbench — UI-first refresh plan

Status: phased design / implementation, **not** a media feature expansion  
Scope: MKV-only output. MP4 is supported as an *input*, not a new output choice.  
Baseline: `main@d5669c6d9bb6ebdd6843ee8c7f651902c80c4d08`.

## Product job and constraints

The primary user job is **turn a prepared video plus subtitle/optional fonts/audio into an auditable MKV without re-encoding video/audio**, while optionally inspecting/editing existing MKV tracks. This is not a transcoder. The workbench should make that job unambiguous in its entry points, intermediate checks, output actions and success/failure feedback.

Do not expand codec/container support as part of a UI redesign. Preserve all existing functional IDs and source mappings for FFmpeg/libass preview, new subtitle/audio metadata, font mode/subsets, source track selection, batch output, report and post-mux audit.

## Baseline UI evidence

The current three-part surface is **01 素材 → 02 预览与调整 → 03 封装输出**, plus a secondary batch drawer. A desktop CSS refinement hides the preview header and the five-category object editor navigation. The primary mux command is a 48×48 green icon-only control, while Batch has a full `开始批量封装` text button. This creates an inconsistent action vocabulary: a user must infer that a small play symbol triggers the core irreversible work.

The surface already has valuable infrastructure that must not be thrown away: a 16:9 on-demand libass preview, live editing controls with DOM-preserving category filtering, MKV source-structure inventory and change summary, preflight plan, progress feedback, report/audit and batch directory handling. The redesign should re-organize their hierarchy rather than replace stable runtimes.

## UI contract

### 01 — Source ownership
- Video + subtitle are first-order input affordances, with fonts and external audio visibly optional.
- Actual-content diagnostics remain attached to the selected source; filenames are not the authority for container identity.
- Keep single-job and batch entry paths visibly separate. The batch drawer must not steal prominence from the primary flow.

### 02 — Inspect and edit
- Maintain a visible preview title on wide desktops; do not make the preview seem like an unlabeled media player.
- Make object focus categories discoverable on desktops: **全部 / 字幕 / 音频 / 字体 / 原轨道**. Switching focus must hide/show the *same* live editor DOM without losing user metadata.
- Keep the established two-category mobile model and tablet preview disclosure where needed; do not force all five desktop choices into a 390px phone.
- Preview remains a **sample frame**, not a playback guarantee or a secretly auto-rendered stream.

### 03 — Verify and execute
- The one primary action must say **开始封装** in visible text, not only `aria-label`, tooltip or a symbolic triangle.
- Cancellation stays distinct and disabled when not permitted.
- The context must say **MKV output** and **video/audio Stream Copy**, because the container and processing policy are product semantics rather than implicit knowledge.
- Finished MKV and JSON report download links need recognizable text labels while remaining the same underlying controls. Reports should be clearly secondary.
- Preflight plan and warning remain visible, and a completed mux with incomplete audit must not be presented as fully verified.

## Planned implementation stages and independent acceptance

**UI-1 (first PR): actionable hierarchy and object discoverability**
- Explicit visible mux/cancel/save controls.
- Restore the preview title and object-focus bar on expanded desktop.
- Explain the MKV-only Stream Copy action in the execution panel.
- Keep live IDs unchanged and add source assertions plus browser E2E across 1440px desktop and 390px phone.
- Preserve current tablet coarse-pointer disclosure and batch interface.

**UI-2 (next): workspace proportions / visual evidence**
- Test 1360/1440/1920 desktop, 1180 coarse tablet, 900 narrow and 390 phone at real browser viewport and real media.
- Reduce nested CSS overrides and establish one authoritative responsive grid. Assess card order, preview scale, output plan readability, sticky scroll and track edit density.
- Validate no horizontal overflow and no clipped operations at long filenames, mixed scripts and multiple tracks.
- Do not conflate CSS visibility with task readiness.

**UI-3 (subsequent): batch operational clarity**
- Present job pairing ambiguity, existing-directory conflicts, active job, successful artifacts, and recoverable failures as distinguishable states.
- A failure to persist one artifact must not erase the completed MKV download; an aborted batch must preserve partial successes.
- Preserve a single output decision for both source and report artifacts with independently explained errors.

**UI-4 (subsequent): accessibility / real use**
- Real keyboard, focus, touch and zoom paths; provide text alternatives for controls that carry the task.
- Exercise first-use workflow, source MKV keep/remove workflow, and large job recovery with artifact audits.
- Record UI failures separately from codec/mux failures. Automated green tests cannot substitute for user acceptance.

## Non-goals

No MP4 output; no codec auto-transcoding; no simultaneous rewrite of the FFmpeg orchestration; no replacement of ASS preview with a second renderer. A visual change is not complete until its browser E2E checks and accessible affordances are verified.
