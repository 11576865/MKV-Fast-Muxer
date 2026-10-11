# MKV content-first workspace redraw — 2026-10-11

## User-facing structure

`MKV Fast Muxer` now uses a single progression:

1. **Discover** — one unified file/folder/drop intake, real content-based identity,
   resource inventory and explicit primary-source selection if ambiguous.
2. **Inspect and edit** — one selected container-object inspector plus existing
   subtitle/audio/font controls and local preview. Advanced source-track tools
   remain accessible without being called a legacy alternate editor.
3. **Verify and export** — MKV-only Stream Copy execution, explicit cancellation,
   output links, JSON report and warnings from the independent ffprobe audit.
4. **Batch** — one content-first import and pairing workbench. No visible second
   categorized import form.

The introduction explicitly states local execution, no media upload, Stream
Copy and MKV-only output. Responsive workbench layout and native navigation
retain the same source/editor/output lifecycle.

## What was actually removed

- The old visible 4-category source upload form, card icons and badges.
- The visible batch "分类导入（兼容旧批量流程）" disclosure with its six categorized
  file/folder pickers.
- Associated obsolete batch presentation CSS and user-facing legacy hints.
- The "legacy" terminology of the advanced source-track affordance and its
  dynamic state attributes.
- Duplicate uploader instructions superseded by unified drop-target guidance.

## What remains intentionally

FFmpeg.js and the existing source/batch flow still use stable DOM IDs such as
`videoInput`, `subInput`, `fontInput`, `audioInput`, `batchVideoInput`
and their file/folder variants. These are now explicitly hidden, inert,
non-user-facing *execution adapters*. The UI intent and source identity live
in the unified inventory; adapters are only a controlled compatibility
boundary. This is not proof that the underlying adapter dependency was
completely refactored away.

The global `src/style.css` still owns shared legacy-era editor controls,
track flags, dialogs and much of the functional responsive behavior. Its
wholesale deletion would be unsafe without a selector-ownership matrix
and browser regression fixtures. Current `src/workbench.css` owns the new
workbench visuals; later CSS consolidation must preserve existing field
reachability and font/subtitle/mux execution controls.

## Verification gates

- Required exact runtime IDs must be unique and remain present.
- No visible legacy categorized import forms, including on phone layouts.
- All resource categories and unsupported-file gates remain correctly audited.
- Keyboard focus, active object/editor selection and mobile disclosure survive.
- Populated desktop and mobile screenshots must be inspected, not inferred
  from successful source-shape tests.
- Batch preparation-failure and cancellation paths retain previous output
  results and truthful status.
- Browser E2E must still produce actual MKV/JSON and verify stream/attachment/
  chapter semantics.

Implementation is a **PR**, not a claimed merged release until checks pass.
