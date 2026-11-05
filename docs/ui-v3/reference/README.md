# Softmux Figma V3 — 11 approved frame snapshots

These are exact PNG exports from approved Figma design file `5iZSy48FV1sJnGdmUf1uQc`, page `27:2`. The first five were frozen on 2026-11-04. The additional six were exported **unchanged** on 2026-11-06 using Figma Plugin API `exportAsync({format:'PNG'})` from the named existing artboards. All have original canvas dimensions. Design references, not application assets.

| State | Figma node | Exact frozen image | Size |
| --- | --- | --- | --- |
| V3-01 desktop observed source | `28:2` | `v3-desktop-source-1440x900.png` | 1440×900 |
| V3-02 selected source ASS | `30:2` | `v3-desktop-source-ass-selected-1440x900.png` | 1440×900 |
| V3-03 explicit destination | `31:2` | `v3-desktop-target-picker-1440x900.png` | 1440×900 |
| V3-04 desktop target | `32:2` | `v3-desktop-target-1440x900.png` | 1440×900 |
| V3-05 portrait source ASS | `33:2` | `v3-portrait-source-820x1180.png` | 820×1180 |
| V3-06 portrait target | `35:2` | `v3-portrait-target-820x1180.png` | 820×1180 |
| V3-07 landscape target | `36:2` | `v3-landscape-target-1180x820.png` | 1180×820 |
| V3-08 compact target | `37:223` | `v3-compact-target-620x900.png` | 620×900 |
| V3-09 Default/Forced context help | `38:2` | `v3-portrait-help-820x1180.png` | 820×1180 |
| V3-10 empty-canvas import | `39:2` | `v3-desktop-empty-1440x900.png` | 1440×900 |
| V3-11 adaptive/state *rules* | `40:2` | `v3-adaptive-rules-1300x650.png` | 1300×650 |

**Important distinction:** V3-11 is a *state/rule board*, not an app page. It must be validated using the authentic 11 viewport-width × 2 source/target Chromium measured-state record, never a fake 1300×650 browser screen.

The `scripts/ui-v3-build-comparison.mjs` script pairs the first ten exact-size Figma snapshots with CI-produced Chromium screen captures, and references `v3-responsive-geometry.json` for V3-11. Its output is `review-index.json` plus ten side-by-side PNGs (with visible fixture caveats), **not** final visual approval. Figma screen files depict static A.mkv/B.mkv/stream metadata; Chromium actual tests have different real media names/codecs/font inventory. Therefore no global pixel-match score is valid until fixture states, font rendering, screen masks and layout semantics are aligned. No screen-reader, physical device or motion-timeline sign-off can be inferred from screenshots.
