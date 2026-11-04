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
