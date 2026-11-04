# V3 design → current production mapping

| Figma | Existing production DOM / logic | Approach |
| --- | --- | --- |
| 39:2 empty import | `#assetDropzone`, `#unifiedAssetInput`, `src/main.js` intake | Reuse original nodes/events, never clone File controls |
| 28:2 open source | `#videoInput`, exact-File source scan, `#compositionTracks`, `softmux:source-sections-updated` | Read-only projection of source facts; no fake OutputPlan |
| 30:2 source selection | `#assetInventory`, `#sf14SectionItems`, source/preview handlers | WU-02 real action routing |
| 31:2 target picker | existing selected source + output composition / source-identity owners | WU-02 explicit user intent, no silent first-file target |
| 32:2 output composition | `#outputCompositionPanel`, `#compositionTracks`, existing `#muxBtn` | Rehost one real instance into V3 target surface |
| 33:2, 35:2 portrait | `#sf14Inspector`, `#sf14PreviewDrawer`, source and real output dock | One inspector DOM, animate wrapper only |
| 36:2, 37:223 adaptive | `src/softmux-10.14.css`, `src/softmux-figma-tablet.css` | New V3-specific CSS rather than append ad hoc overrides to old skins |
| 38:2 help | existing dialog and contextual track metadata | V3 object-local help needs WU-04 design spec |
| Source/target audit | real execution panel, `#outputEvidencePanel`, save links | No invented successful File persistence |

V3 is opt-in on an implementation branch until the whole-contract cutover. `?ui=legacy` remains an existing diagnostic rollback; implementing a new `?ui=v3` pilot must not make the unaccepted interface the product default.

No separate editor store or second mutating container object may be created.

## WU-02 connected ownership (2026-11-04)

| Intent | Authoritative owner | V3 observable surface |
| --- | --- | --- |
| Which imported MKV files exist | `src/main.js` `importedAssetEntries` with exact `File` references | resource-registry event, multiple source tabs; no second File store |
| Which source to observe | native `[data-asset-source]` adapter and `trackState` source scan | `softmux:v3-open-source` validated without target approval |
| Which MKV is approved as prospective target | `createV3TargetAuthority` bound to active exact `File` + imported key | modal confirmation; no target tab before approval |
| Which secondary subtitles exist | actual source-bound `secondarySubtitleInventories` FFmpeg.wasm probe | non-primary source inspection, never guessed from names |
| Which A SubRip can enter B | existing `secondarySubripEligibility` and `data-secondary-subtitle-add` control | validated action dispatched through main; no new muxer |
| Actual executing writer | existing `executeCurrentMuxTask` and matching single-task buttons | guarded by `currentV3Target` for V3 (batch frozen contexts unaffected) |
| Source replacement or removal | `importedAssetEntries`, File-adapter update; bound intent invalidation | target tab revoked; previously selected File cannot impersonate replacement |

Known gap: this is an explicit writer-authorization gate around the legacy *internally eager* output composition, not yet an optional target model in the core domain. Never label it complete optional OutputPlan.


## WU-03 source/output model boundary (2026-11-04)

| Operation | Exact code authority | V3 behavior and evidence |
| --- | --- | --- |
| Open source with no target | `scannedSourceFile===entry.file`, `trackState.streams`, `publishV3ResourceRegistry` | `sourceRowsFromObservation` renders source facts; no output model constructed by primary `renderOutputComposition` |
| No confirmed `currentV3Target()` | `src/main.js:renderOutputComposition` short-circuit before `buildContainerDocument` | clears composition rows, count and current selection; disables writer even when legacy controls exist |
| Confirm B explicitly | `src/softmux-v3-intent.js` + `softmux:v3-confirm-target` identity gate | existing `buildContainerDocument` and `#compositionTracks` render the single actual draft |
| Inspect/edit output subtitle | original `#compositionTracks [data-composition-id]` handler and `#newSubtitleList` | one existing editor, same title/flags authority; WU-03 Chromium checks actual source-derived track selection |
| Completed output | unchanged original mux, audit, `#outputEvidencePanel`, download-link ownership | only real FFmpeg.wasm output and independent native file check count as proof |
| Remove B source target | imported-entry removal + `currentV3Target()` and V3 resource-registry | revokes target tab and composition, blocks mux and returns to source; tested via visible source drawer |

The main V3 output composition path is now conditional; this is **not** blanket deletion of every legacy prospective-plan helper or an assertion that all read-only source entry points have been audited. Target-source authorization remains separate from user-edited track fields, and only authorized user interactions may advance from observation to output.

## WU-03 source read-only and WU-04 asset ownership (2026-11-04)

| User-visible function | One authoritative implementation | Constraint |
| --- | --- | --- |
| Source-only control locking | `src/softmux-v3-surface.js` event capture + `src/main.js:v3MayEditOutput` checks at actual native edit event handlers | Current source observation may inspect and remove imported files, but cannot mutate track include/default/forced, attachments, external include, track order or run single-task mux |
| Explicit A→B addition after approval | Existing exact-File authority + target-bound native subtitle extraction | Transition to target surface before native Add-to execution; no duplicate output editor |
| Desktop chrome/rail/track icons | `src/v3-assets/*.svg` exact Figma exports; `ICON_URLS` and `svgIcon` in `src/softmux-v3-surface.js` | Root SVG intrinsic sizes and exported strokes retained, Vite-local URLs; actual displayed icon assets checked in Chromium |
| Static visual reference | `docs/ui-v3/reference/*.png` | Design screenshot with static Figma labels, not an execution screenshot or a pixel-level success claim |
| Review status | `docs/ui-v3/UI_ACCEPTANCE.md` | No merge to main until responsive screenshot diff, exact contextual controls, motion and real-media acceptance are all obtained |



## WU-04 target object grouping and responsive inspector (2026-11-04)

| V3 surface | Real authority and node | Implementation detail / acceptance |
| --- | --- | --- |
| Target track groups | `src/main.js:renderOutputComposition()` → `#compositionTracks` | Moves original `model.items` row DOM into per-kind sections, no cloned buttons or shadow project |
| Target selection | Original `#compositionTracks button[data-composition-id]` delegated handler and `activateCompositionTrack()` | Selects one actual target in the existing inspector; V3 only opens its presentation wrapper |
| Desktop/landscape inspector | `#sf14Inspector` and `.sf14-pane.sf14-inspector` | Existing editor gets a conditional right rail; no new field ownership |
| Portrait/compact inspector | Same `#sf14Inspector` | Bottom contextual overlay in 820/620 views; one close button + scrim, no remount on resize |
| Real completed artifact | Original `#downloadLink`, `#outputEvidencePanel`, `#sf14Output` | V3 `#sfv3InspectorOpen` reveals original evidence and download, no duplicated synthetic success |
| Object icons | Local `src/v3-assets/*.svg` exported from approved Figma | CSS maps actual video/audio/subtitle/attachment/other object kind to exact exported vector, not text glyph |
| Visual proof | `tests/e2e/v3-cross-source-subrip.e2e.mjs`, `v3-responsive-geometry.e2e.mjs` | Actual source→target→mux bytes plus 22-viewport states and selected-object mobile sheet checks; pixel-match not accepted |

The inspector's contents are still the real older editor and may not visually conform to the selected-ASS Figma example. Refactor must happen by rehosting/presenting the same controls, not inventing another editable store or copying media `File` permissions.


## WU-04 selected-object details and structure observation (2026-11-04)

| UI element / contract | Real authority | Scope and proof |
| --- | --- | --- |
| V3 selected-object heading `#sfv3ObjectContext` | Current real `#compositionTracks button[aria-pressed=true]` and existing `.composition-kind`, title, detail | Read-only presentation, no extra property store, no source identity inference |
| History disclosure `#sfv3HistoryDrawer` | Original `#workspaceHistoryPanel` with `#workspaceUndoBtn` / `#workspaceRedoBtn` | DOM rehost after primary editor and preview; default closed, still accessible |
| Finished-file disclosure `#sfv3DeliveryDrawer` | Original `#outputEvidencePanel`, `#downloadLink` and audit receipt | Default empty; only exposes original evidence when real output state exists, never duplicates successful output |
| Source chapters `#sfv3ObservedStructure [data-kind="chapters"]` | Exact `latestSections.sourceFile === current targetIntent.baseFile` and scanned ffprobe Chapter observations | Source fact only; NOT final output Chapter, nested EBML or safe write authorization |
| Source tags `#sfv3ObservedStructure [data-kind="tags"]` | Same exact File-bound source observation, global format tags only | No inferred TagTarget UID, EBML edit or preservation guarantee |
| Browser verification | `tests/e2e/v3-responsive-geometry.e2e.mjs` | Native FFmpeg ffmetadata fixture + independent ffprobe, true Chapter/Tag browser DOM, 22 responsive states, native inspector/history singleton and zero editable structure affordances; [V3 CI #41791074428](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41791074428) passed code SHA `79181a72d053075b2ab474b685af2323c59c9b91` |

Remaining issue: selected ASS, Default/Forced instructional context, motion and exact Figma visual parity require separate verified scenarios; never use this source-only Chapter/Tag view to assert output EBML fidelity.


## WU-04 contextual subtitle metadata and reduced-motion boundary (2026-11-04)

| Surface | Real ownership | Evidence requirement |
| --- | --- | --- |
| `#sfv3SubtitleFlagsHelp` | Selected real `#compositionTracks button[aria-pressed=true][data-sfv3-object-kind=subtitle]` **and** exact authorized target intent | Collapsed read-only Default/Forced distinction; no clone or direct write of the native flag fields; unavailable in source view |
| Responsive inspector entrance | Presentation-only `data-sfv3-inspector` and CSS `prefers-reduced-motion` | No movement of File/field owner, no permission change or waits for animation; 820 no-preference / 620 reduce E2E |
| Final V3-09 / V3-05 acceptance | Owner-approved Figma frames and a genuinely selected ASS+font fixture | Still **open**; a SubRip browser scenario is not a selected ASS rendering test or motion prototype sign-off |
