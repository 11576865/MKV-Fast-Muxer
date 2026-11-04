# Softmux V3 — visual and functional acceptance ledger

**Status: DRAFT / NOT ACCEPTED / NEVER AUTOMATIC MERGE.**

Design: [approved V3 in Figma](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=28-2).
Implementation: [Draft PR #239](https://github.com/11576865/MKV-Fast-Muxer/pull/239).
Latest evidence-bearing code SHA: `489be3f00b1ceec56ab895d93172395825bf779f`.
[Exact-head V3 CI #41767751720](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41767751720): PASS (unit/build + real browser WU-01 and A→B SubRip WU-02/03). Uploaded screenshot/evidence archive: artifact `13293213307`.

| Gate | Status | Evidence or explicit blocker |
| --- | --- | --- |
| Real source MKV observation without implicit output-document construction | PASS, bounded | E2E WU-01 checks 1440 desktop source and absence of `compositionTracks` output rows |
| Exact source/target File identity, explicit target, cancellation | PASS, bounded | V3 WU-02 unit and real Chromium |
| A-with-SubRip → B target output and native `ffprobe` | PASS, bounded | Real output stream codec/metadata audited; inputs' SHA-256 unchanged |
| Source view read-only even after target authorized | PASS, bounded | Native guard + disabled affordance + Chromium blocked include-field event |
| Target removal revokes output state and mux | PASS, bounded | Chromium source-drawer removal scenario |
| V3 exact Figma SVG asset downloads and browser image load | PASS, source-first slice | 20 exported icons, local `src/v3-assets`, nonzero visible icon slots |
| Static approved visual reference captured and pinned | AVAILABLE | Five PNGs in `docs/ui-v3/reference`; mock data, not browser results |
| **Paired browser/Figma screenshot geometry and pixel diff** | NOT RUN | Need exact viewport/device scale/fixture/font; static data differs |
| Desktop icon+type hierarchy, spacing, color, contrast review | PARTIAL | SVGs in source screen; font, row grouping, adaptive density not approved |
| 1180 landscape / 820 portrait / 620 compact real adaptive parity | NOT ACCEPTED | Width smoke screenshots exist; reflow/interaction and intermediate widths need review |
| WU-04 bottom sheet, source drawer, contextual per-object actions | PARTIAL | Real source drawer; approved sheet/drag/help states not yet reproduced |
| Approved animation prototype + browser motion validation | NOT RUN | Figma V3 motion tracks not yet approved; honor reduced-motion |
| Exact real ASS + font attachments cross-container closure | BLOCKED | Separate unmerged PR #233 must be tested and explicitly approved |
| Full legacy browser E2E / S12 on final implementation SHA | VERIFY EXACT HEAD | Previous passes are not inferred for later docs-only commits |
| Release / merge to `main` | BLOCKED | All of the above must be accepted, no silent design substitution |

Do not compute a synthetic global visual-match percentage with mismatched static/dynamic text. Instead compare anchored component geometry, extracted reference palette, icon slots, text/overflow, actual functionality and matched-state screenshots, then record reviewed differences and exact commit SHA. Use a separate visual report for each viewport. A passing V3 CI cannot be promoted to full product acceptance.
