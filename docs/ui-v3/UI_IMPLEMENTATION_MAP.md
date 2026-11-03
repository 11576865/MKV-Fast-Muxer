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
