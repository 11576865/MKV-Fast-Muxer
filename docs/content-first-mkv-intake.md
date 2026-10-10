# Content-first MKV intake — vertical slice and boundaries

Related issue: https://github.com/11576865/MKV-Fast-Muxer/issues/68  
Scope: unified single-job intake first; MKV remains the only output container.

## User-facing contract

The workbench offers **Add files**, **Add folder**, and **drag/drop files** in one entry surface. Import is not divided into Video / Audio / Subtitle / Font categories. Every imported file receives a row showing its own actual content classification or an explicit unknown/unverified state.

A recognized media **container** becomes a *source candidate*, not automatically a verified video stream. One container candidate is selected for convenience; two or more require an explicit main-source choice. The selected source may contain its own audio, subtitles, attachments, chapters and metadata. If Matroska scanning succeeds, the row displays a stream-count summary while the existing track/attachment editor shows complete configurable details.

Recognized standalone subtitle/font/audio resources are routed by their detected content to the existing mux adapters. Unsupported/unrecognized files remain visible in the inventory and block the mux action until removed, rather than disappearing. VobSub IDX/SUB components continue to flow together to the existing pairing validator, which determines whether the pair is valid.

The existing hidden `videoInput`, `subInput`, `audioInput` and `fontInput` elements remain as internal adapters; there are **no visible category-specific upload gates**. Changing the active source sends a real input-change event through the previous scanning logic, while changing only an unrelated role does not disturb the other file inputs or already-edited metadata.

A media container with no extra subtitle file can be remuxed into MKV, including an existing MKV with its internal tracks. The execution-path ffprobe still **rejects source candidates that contain no video stream**.

## Evidence and limitations

Detection is bounded, layered and conservative:
- Matroska/WebM EBML and ISO-BMFF `ftyp` header: recognized as **container, video unverified**.
- Subtitle signatures: ASS/SSA, SRT, WebVTT, PGS, VobSub IDX + MPEG-PS SUB where recognized by the existing subtitle signature scanner.
- Font scaler / TTC signatures: identified as **font candidate**; full font parsing remains the authority.
- A limited set of independent audio headers: FLAC, RIFF/WAVE, Ogg, ID3/MP3 or MPEG frame signatures. The latter must still pass ffprobe.
- Unrecognized bytes stay **unknown** even if the extension or file MIME claims a known type.
- MP4/MOV containers are **input candidates only**. An audio-only M4A, for example, can share ISO-BMFF headers; it is **not** labeled as a confirmed video asset merely because the header is recognized.

This first slice does **not** perform whole-file hashing, broad audio codec detection, independent ffprobe scans for every imported media file, generic standalone image/data attachment ingest, automatic muxing of non-source containers, or multi-job source pairing. Those remain separate work. A unified importer should not make unverified combinations look guaranteed.

## Verification

Unit: signature-vs-extension, source ambiguity, unknown visibility, imported role routing, folder-path identity. Browser E2E: real mixed-file mux, explicit unknown blocking/recovery, source ambiguity, source-only MKV remux, and preservation of existing file-ID based UI controls.

All full Node/build/Chromium checks are **pending CI** at initial PR submission. UI acceptance also requires desktop/tablet/phone viewport inspection and input-focus checks; do not treat passing source assertions as screenshot/geometry evidence.

## Next slices

- The complete source-container stream tree should become the **primary** editable object, not just a lower editor panel, while retaining chapter/metadata audit.
- Source content verification should be asynchronous but cancellable, with explicit `PENDING`/verified/error lifecycle and no FFmpeg contention across imports.
- Batch input should eventually reuse a common identity inventory without bypassing ambiguity and destination collision gates.
- Remove leftover CSS legacy selectors and align existing UI tests with the new hierarchy once actual viewport evidence is collected.


## Phase 2 — inline source-container tree (Draft PR #69 follow-up)

Once the **selected source MKV** has completed the existing automatic ffprobe scan, its entry now expands to a nested tree of actual video/audio/subtitle/data streams, original attachments, chapters and preserved global metadata. Stream names/codecs/tags come from the source probe, not extension guesses. Other imported media containers still remain **unverified**; no imaginary stream list is generated for them.

In this vertical slice, the tree allows users to toggle full-content-preservation vs selective editing, include/exclude original audio/subtitle tracks and attachments, change track language/title and Default/Forced status, and rename source attachment filename/MIME. These controls update the **same `trackState` objects** used by the established original-track editor and FFmpeg output planner; there is no independent tree copy to reconcile.

The established editor retains its wider functions (track ordering, advanced Original/Commentary/Hearing-impaired flags, bulk operations). The new tree is a first direct-edit surface, not a claim that all container editing now occurs in one location.

**Important post-export lifetime fix:** The legacy single-task success path previously cleared `videoInput`, `subInput`, `audioInput` and `trackState`. That was incompatible with the visible, persistent unified asset inventory; the UI would show an imported file even though its editable source and stream tree had disappeared. The unified import path now preserves input adapters, original track selections and modifications after a successful MKV export, enabling a second edit/export operation. Users explicitly remove inventory items when no longer needed. The legacy non-inventory path retains its previous clear-on-success behavior.

Regression requirements:
- An actual scanned multitrack MKV renders all relevant source stream categories.
- Changes in the tree are visible in the original editor **and** affect the downloaded MKV's ffprobe metadata/track count.
- Chapter and metadata items remain visible and unchanged; original attachment removal/renaming is reflected in the artifact.
- Successful export does not strand or clear the unified import and edit context.
- At 390px phone width, synchronize on nonzero tree geometry after viewport change before asserting overflow and visibility.

The source-projection model has **5/5 V8 source-derived assertions** passing. The first full Node/Chromium CI run caught the real post-export reset mismatch; it is being corrected with a targeted browser regression. Do not mark this phase accepted until the later **latest-head** CI is green.


## Phase 3 — track order, advanced flags and viewport evidence

The in-tree source MKV audio/subtitle controls now expose **reorder within included peers of the same type**, and the advanced `Original`, `Commentary`, and `Hearing impaired` dispositions. The tree calls the existing `moveTrack` operation on `trackState.tracks`; its display order is a projection of `track.order`. When a reorder differs from the source index it contributes to the modification indicator. Removed tracks remain visible for recovery but have no active reordering targets. `appendPreserveAll` mode disables all modifications.

The existing original-track editor and bulk editing actions now refresh the imported container tree on committed changes. Conversely, the tree updates the same `trackState` objects and refreshes the original editor/plan. Text input never rebuilds its own active container tree on each keystroke, to avoid losing caret position; the opposite view updates on committed change.

Advanced disclosure state is retained across inventory re-renders, including after setting a checkbox. Both original stream and attachment status use the same output mapping and post-mux audit as before.

**Verification contract:** browser E2E reorders two real original audio streams, confirms the downloaded MKV's audio order and titles, and checks the actual `original`, `comment` and `hearing_impaired` disposition bits by ffprobe. It also checks reverse synchronization from the legacy editor and preservation of the expanded advanced panel.

**Visual evidence:** E2E saves screenshot artifacts of the actual populated container tree at **1440×900 desktop** and **390×844 phone** from generated, non-user fixtures. The workflow uploads only `mkv-container-tree-*.png` files to the `mkv-ui-container-tree-viewports` GitHub Actions artifact for subsequent human/visual review. CI success alone is not proof of design acceptance.

**Remaining work:** validated screenshots should be reviewed for ergonomics, clipping, hierarchy and control density; consider moving all original-track editing into one canonical view once parity is established. Continue keeping PR #69 Draft and MKV-only until visual acceptance and more diverse input evaluation.


## Phase 5 — source / editor / output ownership of the complete workbench

The previous Master/Detail improvement made the MKV source-track list compact, but both the list and full metadata inspector still lived **inside the import card**, while unrelated external-resource controls and subtitle preview lived in an editor column and output controls lived in another panel. This left a task-level ownership split: the user had to switch context between three unrelated areas to edit one item.

The workbench now uses **three purpose-specific zones** at wide desktop widths (1440+ with fine pointer):
- **Sources**: one content-first import entry and a grouped, compact inventory/stream index; no stream metadata forms live here
- **Current edit context**: a single selected source-track inspector, additional subtitle/audio/font controls, on-demand subtitle preview and diagnostics
- **Output decision**: preflight, progress/cancel, visibly named MKV export and artifact/report download with final audit

The inspector is moved to a stable `#assetInspectorHost` inside the actual editor column; `#assetInventory` remains a navigation list. The renderer projects the same `trackState` into these surfaces without independently storing edited values. Moving the actual editable subtree means **existing delegated change/click/toggle listeners must be bound to the editor host**, not left on the old inventory parent. The source list keeps the user's current index selection using original stream identity and updates active track/attachment names during text editing without remounting the input (avoids losing caret position). Source inventory, editor and output remain one continuous DOM task when responsive layout stacks them.

At desktop width the CSS grid renders left source, central editor/preview and right output concurrently. At smaller viewports the sections stack; coarse-pointer tablet keeps its existing intentional two-column editor/output layout and preview disclosure. Original source editor remains reachable as a compatibility/bulk tool; it is not a duplicated default UI.

### Evidence gates

- Node source contract: inspector DOM ownership, visible text labels, responsive zone CSS
- Chromium actual geometry at 1600px: source < editor < output, inspector belongs to central edit column, no horizontal overflow
- Chromium phone at 390px: source → inspector → output document order; no clipped inspector or horizontal overflow
- Keyboard selection of an audio track must update the active original stream; text-label changes must update source navigation without input remounting
- Existing MKV output E2E must still validate real stream ordering, disposition flags, original attachment editing, source-only remux, reports and error behavior
- Visual evidence must show the **normal mode**; legacy source editor opened temporarily for reverse-sync test should be closed before screenshots

**CI and visual-review status for the final head must be verified independently**; prior PR #69 successes are not evidence for this latest structural refactor. Do not treat it as a completed product UI or merge based solely on screenshot geometry. MP4 output remains out of scope.
