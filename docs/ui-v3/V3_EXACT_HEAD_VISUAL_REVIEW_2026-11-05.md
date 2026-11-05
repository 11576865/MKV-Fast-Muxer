# Softmux V3 · exact-head CI and visual evidence review — 2026-11-05

**Review type:** Independent evidence inspection of the completed CI archive; *not* owner visual sign-off, not a production release acceptance and not a new design authority.

- **PR / exact tested commit:** [Draft #239](https://github.com/11576865/MKV-Fast-Muxer/pull/239) at `b8ef01b372cf2299cbc56f30e6b1b10ee457ac2f`.
- **Design authority:** `UI_DESIGN_CONTRACT.md`, approved Figma V3 nodes 28:2 to 40:2 (11 states).
- **V3 browser/screenshots:** [workflow #41966549198](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41966549198), `ui-v3-pilot-source-first-evidence` [artifact 13387079096](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41966549198/artifacts/13387079096).
- **Other exact-head results:** [full Browser E2E #41966549260](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41966549260), [S12 #41966549101](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41966549101), and [Pages #41966549032](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41966549032) completed SUCCESS. Pages deployment job on PR was SKIPPED; building is not a public release or deployment sign-off.
- **Evidence review method:** Opened all five committed paired screenshots at exact corresponding viewport sizes and the actual 820px ASS source preview; read each paired index/behavior receipt. Distinct Figma mock data and Chromium real MKV fixture mean **no pixel score, no global equivalent-state acceptance**.

## Pair-by-pair review

| Figma state, viewport | File inside evidence artifact | What was actually inspected | Disposition |
| --- | --- | --- | --- |
| V3-01 / 28:2, 1440×900 | `ui-v3-visual-comparison/desktop-source-figma-vs-browser.png` | Native source File represented with one real video track and observed Chapter/Tags rather than mock's HEVC/FLAC/AAC/ASS/SubRip inventory. Source facts, filename emphasis, icon header, read-only observation and single source-to-target entry are visible. Mock row density/object actions **cannot be compared using this fixture**. | **PARTIAL** — actual source works; matched representative multi-track screenshot still required |
| V3-05 / 33:2, 820×1180 | `portrait-source-figma-vs-browser.png` plus `ui-v3-ass-source/v3-native-ass-preview-820.png` | Paired main image has one video/Chapter/Tags, whereas approved Figma includes a selected ASS with bottom context. The separate actual ASS screenshot proves native inspector/preview controls are present at 820px, but does not give a same-state paired render. | **PARTIAL / NOT VISUALLY ACCEPTED** — need one matched selected-ASS reference comparison |
| V3-07 / 36:2, 1180×820 | `landscape-target-figma-vs-browser.png` | Browser target shows one real video composition row, observed source structures, unverified UID association warning, and real mux dock; Figma depicts several media types and compact resource groups. The warning and audit status occupy more visual height than approved multi-track composition. One-row fixture cannot prove 5-row target hierarchy. | **REVIEW REQUIRED** — representative multi-track target / safety-warning layout against exact frame |
| V3-08 / 37:223, 620×900 | `compact-target-figma-vs-browser.png` | Mux is visible and original editor stays in the compact surface, but the target's large warning/review blocks dominate compared with Figma's five track rows and resources. A genuine one-video fixture is not an acceptable basis for claiming the approved density and multi-track layout are matched. | **REVIEW REQUIRED** — matched-content compact composition and adaptive inspection |
| V3-10 / 39:2, 1440×900 | `desktop-empty-figma-vs-browser.png` and `ui-v3-evidence/v3-wu01-browser.json` | Both show dominant centered import affordance. Actual Chromium pointer click opens the sole native input and DataTransfer drop imports a real MKV without implicit target; full-width hit geometry is covered by passed E2E. Header/sidebar placement differs somewhat; no owner pixel-signoff. | **BOUNDED FUNCTIONAL PASS / VISUAL PENDING** |

Other V3 states 02/03/04/06/09/11 have task-level CI/browser evidence but **were not all included in the five matched Figma/Chromium contact sheets**. Do not infer 11/11 visual completion from five pair files.

## Concrete preview-content discrepancy (new observation, exact screenshot)

The real 820px screenshot `ui-v3-ass-source/v3-native-ass-preview-820.png` displays an **entirely black video image area** even though the app labels the preview as created with FFmpeg/libass at 0.75 s. The user-visible context still exposes preview controls, native extraction and source-only authorization correctly.

Direct artifact inspection sampled the central visible image rectangle (~390×218) and found **zero pixels with channel intensity >150**. The bundled real fixture `ui-v3-ass-source/proof.ass` contains a white, expected dialogue `V3 ASS Native Preview` from 0.10 to 1.40 s. A separate, local native FFmpeg/libass check on that supplied ASS, using the same video/ASS and seeking to 0.75 s, produced nonblack subtitle glyph pixels. The current browser test only checks that the `blob:` PNG exists, has nonzero dimensions and is within viewport; it **does not verify that the subtitle actually appeared**. This constitutes an **observed blank-preview / test-oracle gap**, not yet a confirmed root cause. The source carries no embedded font, so missing font availability inside FFmpeg.wasm is a plausible but unproven explanation; timestamp shift, libass configuration or preview renderer behavior remain alternatives.

**Required before V3-09 visual acceptance:** In a controlled known-font, active-cue fixture, assert actual rendered subtitle pixels (not just PNG existence), capture FFmpeg/libass font-selection diagnostics, and verify whether a no-font source must display an explicit unavailable/fallback warning rather than a visually blank nominal success. Do not silently supply a font or invent renderer success; do not change the production font-closure/writer authorization.

## Remaining gates and decision

1. **Visual state matching:** Capture source selected-ASS, target 5-track/attached-font, warning and no-warning variants with semantically comparable fixture data at 1440/1180/820/620; review structure, hierarchy, icon actions, selected-object sheet, truncation and foreground dock. Never derive an artificial pixel-match score from mismatched fixtures.
2. **Preview observation:** Close the black-image root cause or formally constrain the preview promise and test a known-good rendering path.
3. **Physical device/accessibility:** Browser-simulated touch and reduced-motion evidence does **not** replace an actual tablet, orientation/keyboard/assistive-technology test.
4. **Owner sign-off:** Review approved 11 states and record the explicit decision on this or a subsequent exact implementation SHA.

**Conclusion:** CI on `b8ef01b3` GREEN; source/target and real mux test scope established. **V3 WHOLE-UI VISUAL ACCEPTANCE: NOT YET APPROVED.** #239 remains Draft and does not switch the default UI or declare Softmux 1.0. This review introduces no Canonical requirements and does not rewrite the approved design.
