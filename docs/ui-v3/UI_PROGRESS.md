# UI V3 implementation checkpoint

State: **IN_PROGRESS / NOT ACCEPTED**.
Source: `main@5ce85fc8d1657797809d25b51c8b51512f762406`.
Branch: `feat/softmux-v3-approved-ui-20261104`.
Design: [approved V3](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=28-2).
Gate: `docs/ui-v3/UI_DESIGN_CONTRACT.md`.

## Work sequence (only approved scope)

- [x] Record immutable Git baseline and owner-approved Figma frame identifiers.
- [~] WU-01: source-first desktop/empty surface, real File and scanned-track binding, preserve old engine and legacy UI rollback. **Browser pilot passed; Figma visual review and full V3 semantic acceptance remain open.**
- [~] WU-02: multi-MKV source tabs, exact-File target picker, real A→B SubRip transfer and mux tested. **ASS/font closure, complete object preview/selection and fully optional underlying OutputPlan remain open.**
- [~] WU-03: source-only/output model split, real mux and revocation E2E. Source-side mutators now blocked at both control and native event-handler boundaries; **not yet a whole-app permission proof**.
- [~] WU-04: preserve source drawer and responsive first cut; exact SVG source-screen icons and immutable Figma visual reference renders committed. Continuous resize/contrast/pixel-diff acceptance still open.
- [ ] WU-05: precise Figma visual comparison, motion design handoff, real-media functionality and rollback acceptance.

### WU-01 limitations

The legacy source-to-composition model currently renders an implicit output view. WU-01 must **not** misrepresent a read-only source projection as a new authoritative target model. Expose genuine source-scanned facts; keep any pre-existing output assembly behind an explicit UX transition as a temporary compatibility adapter. The true optional OutputPlan domain transition is part of WU-02 and is required before final acceptance.

## Resume procedure (no chat memory required)

1. Read `UI_DESIGN_CONTRACT.md` and this file, inspect precise `main` and branch SHAs.
2. Verify V3 Figma frame IDs and the current branch changes. Never recover from the prior draft PR #234.
3. Run tests on the exact branch HEAD. If any fail, note failure evidence rather than assume completion.
4. Check the current unit's contract, carry over one unit at a time, update this log with commit, verification and known blockers.
5. After at most 2 units, re-anchor against approved V3/functional inheritance, and do not let newly suggested tasks supersede root scope.

## Work evidence

No visual, interaction, real-media, tablet or release acceptance is claimed merely by this document.


## 2026-11-04 WU-01 implementation record (unaccepted)

- Draft PR: https://github.com/11576865/MKV-Fast-Muxer/pull/239
- Branch HEAD at CI retry: `7cb6fd62655494c57aa0789eb912616636d2586b`.
- Code: `src/softmux-v3-surface.js`, `src/softmux-v3.css`, opt-in `?ui=v3` wiring in `src/main.js`.
- Design authority: Figma V3 nodes `28:2` source-open, `39:2` empty, `36:2` landscape, `33:2` portrait; first slice is **not** a visually accepted reconstruction.
- Test code: `tests/softmux-v3-surface.test.mjs` and `tests/e2e/v3-source-first.e2e.mjs`; workflow `.github/workflows/ui-v3-pilot.yml`.
- CI evidence: first run `41707839232` failed at `npm ci` because repository has no package lock; next run `41707986570` passed unit tests and Vite build but failed before browser test because `ffmpeg` is absent from that runner. Workflow now provisions it conditionally; no browser result yet.
- First-slice implementation is deliberately read-only: `sourceRowsFromComposition` projects only `source:` entries, and chapter/tag/attachment information comes from exact-File-bound observation events. It never edits the source list.
- Current blocker: the existing domain still computes a prospective composition on import; WU-01 hides the edit surface until user chooses `编辑拟输出`, but it **does not** yet implement a real optional OutputPlan transaction. WU-02 must close this before acceptance.
- Current visual limitations: temporary icon glyphs, approximate CSS geometry, no paired Figma-vs-browser pixel diff, no actual timeline animations, no source track action buttons. These are known omissions, not accepted design changes.
- Main/default UI, original File inputs, media execution and old diagnostic rollback remain untouched.


### WU-01 CI result — 2026-11-04

- **PASS on implementation HEAD** `7cb6fd62655494c57aa0789eb912616636d2586b` — dedicated [GitHub Actions run #41708165401](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41708165401).
- Unit tests, Vite production build and actual Chromium V3 pilot passed; installed Chinese-capable system font and FFmpeg fixture runner. Browser exercised real `V3 Source 01.mkv`, observed source tracks, output hidden until explicit `编辑拟输出`, 1440×900 / 820×1180 / 620×900 screenshots, returning to source and exact original input/mux node identity.
- Uploaded `ui-v3-pilot-source-first-evidence` (artifact ID `13267111641`) with five PNG screenshots and JSON evidence.
- **Evidence limit:** Screenshot creation is not a reviewed Figma pixel diff. WU-01's initial icons are placeholder glyphs; real multi-source behavior, asset-level Figma fidelity, all motion and full object editing/actual output remain unaccepted.
- Project default remains the pre-V3 UI, `?ui=v3` is an opt-in branch pilot, no merge to `main`.

## 2026-11-04 — WU-02 exact-source target and cross-MKV SubRip pilot

**Real passing evidence:** [UI V3 pilot Actions #41761600859](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41761600859), on code HEAD `3741534f83c6228f5bf60a89cff2fcc52766d1bf`, completed unit tests/build, WU-01 browser flow and new WU-02 Chromium transfer. Evidence artifact `ui-v3-pilot-source-first-evidence`, ID `13291130846`.

The scenario builds a real A.mkv with embedded SubRip plus a separate B.mkv and drives only the V3 `?ui=v3` UI. It opens A for observation without confirming output; target picker cancellation leaves the writer disabled; confirmation selects exact B File; existing FFmpeg.wasm secondary SubRip extraction and round-trip validation create the external track; genuine output mux produces a new MKV. Independent native `ffprobe` verifies the output video plus one SubRip track and source subtitle language/title; SHA-256 confirms both A and B inputs unchanged. This is **bounded SubRip evidence only**, not ASS/fonts, complete EBML preservation, Figma fidelity or full release acceptance.

**Code changes:**
- `src/softmux-v3-intent.js`: exact File object identity and resource-key target authority, auto-revoked on replacement/removal/switch.
- `src/main.js`: real source-registry projections, explicit source-open / target-confirm events and guarded mux entry; adapter and File-grant authority remain legacy-owned.
- `src/softmux-v3-surface.js`: multi-file tabs and target dialog; source-object subtitles route to actual native inspection/extraction only after target confirmation.
- `src/softmux-v3.css`: target chooser + semantic source affordances; implementation still uses some placeholder glyphs.
- `tests/softmux-v3-intent.test.mjs`, `tests/e2e/v3-cross-source-subrip.e2e.mjs`: exact identity rejection, cancellation, real result and responsive/keyboard assertions.

**Design fidelity and domain boundary:** WU-02 adds a real explicit target *permission gate*. The existing legacy model still forms a candidate output composition internally on source selection, although V3 does not display or allow executing it without explicit confirmation. An actually optional OutputPlan with separate source/target domain state is not yet implemented. Never infer from a hidden panel or passing SubRip test that the full owner-approved V3 semantics are accepted.

**Outstanding integration:** The ASS+font dependency closure work remains a separate unmerged draft PR #233. Do not merge that draft or enable its UI in V3 until its exact-head real-source tests and user approval pass. A targeted tab-focus fix (`c56079f8`) and browser regression assertion (`7f8f0cfe`) followed the passing core WU-02 run; their exact-head CI results must be checked separately. PR #239 remains Draft.

## 2026-11-04 — WU-03 separation of source observation and output composition (partial)

**Verified code SHA:** `c6e0d49b55879a801486f56ac5fc31e5e71c4fd5`. [Exact-head Softmux V3 CI #41764507826](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41764507826) **PASS** (Node unit tests, Vite production build, source-first Chromium, A SubRip → explicit B Chromium with actual output, and final removal of B target). Artifact `ui-v3-pilot-source-first-evidence` ID `13291836990` contains visual screenshots, completed MKV and JSON receipt. [S12 scoped CI #41764507883](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41764507883) **PASS**. The existing full Browser E2E suite `#41764507836` was still running at the time of this note; do not claim it passed without later verification.

**What genuinely changed:**

- `src/main.js:renderOutputComposition` now publishes source observations separately, then **returns without calling `buildContainerDocument` when V3 has no exact-File target authority**. It clears the old composition DOM, selection/counts and disables output actions. The existing default/legacy workbench retains its prior path.
- `src/softmux-v3-surface.js:sourceRowsFromObservation` renders track names, codecs, languages and real stream indices from the exact source scan registry, not from rows created for hypothetical output.
- Only after explicit target confirmation does `buildContainerDocument` drive the same live target composition/editor; V3 displays a compact target heading with actual base file, existing composition count and changes, and real `muxBtn.disabled` readiness. It does not create any second editable track state, File reference, mux button or audit receipt.
- The actual Chromium A→B flow verifies source view before target, cancelled chooser, target creation, one source subtitle in the genuine output, existing subtitle editor selection, and post-export **removal of B** revoking target tab, composition rows and mux authority.
- The first added revocation test tried clicking the hidden legacy asset list without opening V3's source drawer. That test failure was a test-interaction mistake, not evidence that output bytes failed. The corrected scenario opens `#sf14SourceToggle` first, then removes B and verifies revocation; final exact-head CI passed.

**Meaningful limits:** This step removes eager output-document construction from the *primary V3 render path* but does not yet remove all legacy `buildMuxPlan()` helpers and special-case tools. Source-drawer mutating controls and output-editor scope need a complete read-only-vs-authorized audit before declaring full optional-domain coverage. The actual product interface is still the previous default; `?ui=v3` is an opt-in draft. Real ASS+font cross-source closure is separately pending PR #233. Figma screenshot diff, final responsive geometry, icons, motion and user acceptance remain pending.

**Next admissible scope:** before moving beyond WU-03, audit source-view mutating controls and eliminate any unauthorized output change path; then WU-04 visual reconstruction must compare exact-head screenshots with the approved Figma source and portrait/landscape boards, keeping the same state/data fixtures and never treating placeholder glyphs as final icons.

## 2026-11-04 — Source-view read-only enforcement and WU-04 SVG handoff

**Passing implementation commit:** `489be3f00b1ceec56ab895d93172395825bf779f`; [exact-head V3 browser/unit/build run #41767751720](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41767751720) **PASS**. Includes actual A→B SubRip mux and read-only-source regression. Uploaded browser screenshots/JSON: `ui-v3-pilot-source-first-evidence` (artifact `13293213307`). At this checkpoint the full Browser E2E and S12 workflows on the same code commit had not yet finished, so they are not silently marked passed.

**Read-only protection:** In V3 source mode, the original output-mutating inventory, track and attachment controls are marked disabled; captured DOM input/change/click events are rejected; corresponding native listeners also check actual target authorization AND the target editor surface. Source files can still be observed, inspected, opened, imported and removed. The authorized A→B transfer intentionally changes into target edit scope before invoking native extraction, so the source view remains read-only even if an OutputPlan exists. The browser scenario asserts a forged source-side checkbox change cannot modify canonical subtitle inclusion while target editing and output mux continue to work.

**Exact source assets:** `src/v3-assets/` holds 19 unmodified SVG exports from approved Figma V3 desktop node `28:2` plus the 34px empty/import SVG from node `39:228`. See `src/v3-assets/README.md` for icon-to-node references. V3 rendering now uses local Vite asset URLs, with no expiring `figma.com/api/mcp/asset` runtime dependency. The initial SVG CI failure on `8a836efc` resulted from measuring non-visible icon slots as if displayed; the final exact-head test distinguishes all-loaded assets from nonzero visible boxes and passed.

**Immutable design renders:** `docs/ui-v3/reference/` has exact Figma PNG renders for source desktop `28:2`, empty desktop `39:2`, portrait source `33:2`, landscape output `36:2` and compact output `37:223`, plus scope/limitations README. They are NOT runtime screen captures and cannot demonstrate real responsive motion.

**Next stop rule:** Before promoting the UI, compare exact branch-head browser screenshots against these five baseline screenshots with matching state/fixture, font and viewport; fix position, density, overflow, icon roles and missing contextual actions. Confirm 820, 1180, 620 and intermediate widths, keyboard/touch focus, motion/reduced-motion and the unresolved ASS+font dependency work. No Canonical specification changes.


## 2026-11-04 WU-04 — paired Figma visual review, viewport audit and actual source summary

**Verified implementation code SHA `87d0523fc99dea2cf1973f7e359b8de51d67523b`:** [V3-specific Actions #41770135392](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41770135392) **PASS**. Artifact `ui-v3-pilot-source-first-evidence` ID `13293668600` contains 5 equal-scale approved-Figma-vs-real-Chromium side-by-side PNGs, the JSON review index, and 22 measured responsive cases (11 widths × 2 genuine source/output states), screenshots, original source fixture and real SubRip output proof. Vite build/unit tests and prior real-media scenarios were exercised in that workflow. Full Browser E2E and S12 on this exact SHA remained in progress at the time of this note; do not mark them successful without a later verified completion.

**New visual observations (actual side-by-side review):**
1. At viewport widths 681–1365px, an older `softmux-figma-tablet.css` selector `.sf14-app .sf14` reserved a global `padding-left:72px` despite V3 collapsing its resource rail. This left a visible empty strip and shifted every primary region right. V3 now explicitly resets that inherited root offset under `.sf14-app .sf14.sfv3`. The responsive test checks root and header x=0 at every sampled viewport. Verified JSON at 1440, 1180, 820 and 620 has x=0 in both source and target modes.
2. Figma's source header has a compact observed track-count hierarchy; the browser source header previously lacked it. V3 now binds video/audio/subtitle and (when scanned) attachment counters to exact same-File source streams and observation sections; unknown scan categories are not displayed as observed zero. The Chromium fixture independently verifies one actual video, zero audio and zero subtitle tracks. This is layout and evidence binding, not a second read/write state.
3. The approved portrait Figma node `33:2` depicts a **selected ASS** with a bottom contextual inspector; the current browser fixture contains only a minimal mpeg4 track, so comparing those panels visually is misleading. The actual V3 selected-object inspector, rich preview and touch/gesture interactions are still NOT equivalent to Figma. The frozen designs have simulated media values, so no universal pixel score was issued.
4. The approved target Figma nodes `36:2` and `37:223` are compact container-composition surfaces, whereas the current browser target still reveals a dense legacy editor, diagnostics and evidence controls. This is a substantial hierarchy/interaction gap; passing functional mux and geometry checks do not mean visual acceptance. The target workspace rehosting/compact inspector remains pending.

**Artifacts and commands:**
- `tests/e2e/v3-responsive-geometry.e2e.mjs` — exact `File` retention, native editor singleton, target and source state retention, root/header geometry and no page-wide horizontal overflow, across 11 viewport widths (1440, 1320, 1319, 1180, 960, 959, 820, 720, 719, 620, 600) in both states. Stores `.e2e/ui-v3-responsive/v3-responsive-geometry.json`.
- `scripts/ui-v3-build-comparison.mjs` — pairs frozen Figma renders from `docs/ui-v3/reference/` with five exact-viewport live Chromium screenshots, preserving 1:1 pixel dimensions. Stores `.e2e/ui-v3-visual-comparison/\*-figma-vs-browser.png` and `review-index.json`; declares `visuallyAccepted:false` explicitly.
- CI publishes all three evidence directories. These files are reproducible only on the exact checked-out Git commit; artifacts expire based on the workflow retention period.

**Known test repair:** First root-origin assertion failed because the test helper searched for `#sf14Root` *inside itself*, yielding undefined. It was corrected to measure the root itself; verified 22-case test passed. Do not reinterpret this initial failure as a product defect.

**Next scope:** WU-04 target-editor rehosting/visual geometry and selected-object bottom inspector (landscape + portrait), followed by real interaction/prototype motion and screenshot comparisons with genuinely matching fixture states. No user approval of current V3 implementation yet. PR #239 remains Draft, default product unchanged.


## 2026-11-04 WU-04 — real Matroska object grouping and responsive context inspector

**Code HEAD verified:** `0d470a7beef01fc42ccdbdf8d1e4f027fbd20bf5`; [Softmux V3 isolated CI #41785292273](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41785292273) **PASS**, with actual Chromium A SubRip → explicit B extraction/mux/independent output verification, previous V3 source/target gates, 22 source/target responsive-geometry cases, and new portrait/compact inspector assertions. Evidence artifact `ui-v3-pilot-source-first-evidence` ID `13300862285` contains 5 equal-scale Figma-vs-browser reference pairs, genuine Chromium screenshots including `plan-820x1180-inspector.png` and `plan-620x900-inspector.png`, plus JSON with `passed:true`, `contextualInspectorTested:true`, `visuallyAccepted:false`. At evidence capture the same HEAD full Browser E2E and S12 workflows had not yet completed; do not infer a pass without follow-up.

**What changed (no second editor):**
- `src/main.js:renderOutputComposition()` now reorganizes the actual `#compositionTracks` row elements into V3 Matroska group sections (video, audio, subtitle, attachment, font, other) by their actual `model.items[].kind`. It moves the one real button DOM per item, preserving the original delegated selection/edit event handler, item identity, status and target authority. Count labels explicitly mean “number of objects”, not included target tracks.
- `src/softmux-v3-surface.js` now treats `data-sfv3-inspector` as presentation state, not a media edit store. Clicking an actual output object opens the existing `.sf14-pane.sf14-inspector`; its header gets a close button; the original output dock offers an `对象详情 / 成品` entry to reopen the very same pane for real finished-file links. Returning to read-only source closes it.
- `src/softmux-v3.css` gives desktop a bounded contextual right column only when opened and gives 820/620px widths an in-workbench bottom sheet and dismissible scrim without remounting original editor controls. It uses the exact checked-in Figma SVGs for track-kind affordances, and removes the duplicate legacy “返回拟输出” on compact screens.
- `tests/e2e/v3-cross-source-subrip.e2e.mjs` confirms real grouped target rows, actual subtitle title editor singleton, open/dismiss/reopen, available finished-file download after mux and real output validation. `tests/e2e/v3-responsive-geometry.e2e.mjs` verifies visible sheet bounds and native editor identity at 820×1180 and 620×900, visible local SVG icon background and no duplicated legacy back button.

**Observed failure and fix:** Initial [V3 CI #41784243780](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41784243780) found the new close button was invisible at desktop despite the inspector itself opening. The old `.sf14-pane-head > button {display:none}` still applied; a V3-specific visible override corrected it. Actual failure PNG showed real editor data correctly visible. The final full pilot passed at the code SHA above. The failure was not a mux byte/output regression.

**Unaccepted visual/interaction scope:** This round provides genuine object hierarchy and a working context panel but does not yet match the precise V3 target portrait/landscape Figma composition and selected-ASS sheet. The current inspector contains legacy dense editor/undo/log controls, and the output dock still remains visible outside the scrim; chapters/tags still lack final composed-target display. No owner-approved animation timeline, true UX motion acceptance, final pixel review with matched media fixtures, physical touch device or comprehensive screen reader accessibility audit. Keep PR #239 Draft and the default production UI unchanged.

**Next scope:** visually simplify the single existing inspector content based on selected object without adding a second mutating state; properly scope finished-file actions in narrow width; compose source-attested Chapters/Tags as read-only where writer support is absent; then motion/hit-target and matched-state visual acceptance. Re-anchor on approved Figma, not a new assistant-designed variant.


## 2026-11-04 WU-04 continued — object-first inspector and exact-source Chapters/Tags

**Verified code SHA:** `79181a72d053075b2ab474b685af2323c59c9b91` — [dedicated V3 real-browser CI #41791074428](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41791074428) **PASS**. Evidence artifact `ui-v3-pilot-source-first-evidence`, ID `13303013783`. Its `v3-responsive-geometry.json` records 22 viewport/state cases with `passed:true`, `readonlyStructureTested:true` and `contextualInspectorTested:true`. Real A.mkv SubRip → explicitly selected B.mkv browser mux/independent `ffprobe` output audit continued to pass. As of this checkpoint full Browser E2E and S12 on that code head were not yet confirmed; check separately before any production acceptance.

**Implemented:**

1. The one actual `#sf14Inspector` now includes `#sfv3ObjectContext`, a read-only projection of the currently selected `#compositionTracks button[aria-pressed=true]` (kind, title, detail), or a neutral unselected-plan label. It owns **zero** editable track fields.
2. The original `#workspaceHistoryPanel` was **moved** — not cloned — into the native `#sfv3HistoryDrawer`, initially collapsed and rehosted after primary edit/preview content so undo/redo stays accessible but no longer dominates the selected object's hierarchy. Original editor and event handler identities persist.
3. The original `#outputEvidencePanel` with its existing audit/download nodes was **moved** into `#sfv3DeliveryDrawer`; it remains absent when hidden and automatically opens only when actual output evidence exists. No fabricated success or duplicate File download/ownership path.
4. `#sfv3ObservedStructure` inside the actual prospective-output pane now displays **source-attested, exact-File-bound** flat Chapters and global format Tags only if `latestSections.scanned && latestSections.sourceFile===targetIntent.baseFile`. It is explicitly labeled `来源观察 · 只读` with a disclaimer that ffprobe observations are not proof of full EBML/TagTargets or final output preservation. It contains no editable controls. Source observation rows and true output track rows remain semantically distinct.
5. The responsive browser fixture is now a genuine MKV containing one named Chapter and one named global format Tag, created with ffmpeg/ffmetadata and independently preverified using native `ffprobe`. Browser asserts both labels are visible in target read-only structure with zero input/select/button controls, and exact original editor/history nodes remain singletons on 820px and 620px contextual sheets.
6. Screenshots were inspected. A first-pass history disclosure still appeared above the actual selected object even while closed, so the **same** disclosure was rehosted to the end of the existing editor column. Latest 820×1180 screenshot confirms the selected object heading now precedes the legacy inspector and history disclosure. The 620×900 sheet remains bounded within the viewport.

**Known limits / NOT accepted:** This is a progressive presentation change, not full editor replacement. Dense old `asset-tree-inspector`, preview/output dock and some technical controls remain; source-attested Chapter/Tag rows make no claim of actual output inclusion. No matched-media screenshot pixel diff, finalized interactive motion specification, real ASS+font closure, full screen reader/touch audit or final owner acceptance. V3 remains opt-in via `?ui=v3`, draft PR #239 is not merged. Do not silently reinterpret the Chapter/Tag structure as supported target writers.

**Next scoped step:** object-local property hierarchy and contextual Default/Forced help; bounded motion for the portrait inspector with reduced-motion/resize invariants; compare actual selected-ASS state to the approved `V3-05` Figma board. Release gate remains blocked until visual and functional acceptance.


## 2026-11-04 WU-04 — subtitle flag context and bounded sheet entrance (submitted, Pending CI)

- Scope: approved V3-09 Default help / V3-05 portrait contextual inspector; no change to output writer, source File ownership, native subtitle flags, default UI or approved Figma frames.
- `#sfv3SubtitleFlagsHelp` is a collapsed, accessible explanation shown only when the **actual selected output row** is a subtitle in an exact-File-authorized target; it is hidden and closed on source-only observation. Default and Forced remain separate container flags, with explicitly player-dependent behavior. Existing subtitle checkbox inputs remain the only flag writers.
- Narrow context sheet/scrim receives a 150ms presentation-only opacity entrance under `no-preference`. `prefers-reduced-motion: reduce` disables it. No edit, commit, save or validation uses animation completion as an authority.
- Regression additions: genuine A SubRip → B Chromium test checks scope, help and single native flag inputs; 820/620 selected-object test checks animation policy and stable layout after animations settle.
- **Evidence state:** branch-submission only, dedicated V3 workflow plus full Browser E2E/S12 are **Pending CI** for the new commit. No Figma motion approval, selected-ASS visual parity or full UI acceptance is claimed. PR #239 remains Draft and must not merge.


## 2026-11-04 WU-04 — source-object inspection follows approved V3-05 (new branch submission)

- Figma review identified a substantive interaction gap: V3-05 (node 33:2) shows **selecting a source ASS** as an object-local bottom sheet, but the earlier source UI only exposed direct Add-to buttons. Source selection itself must not silently authorize or create an output.
- `src/softmux-v3-surface.js` now offers a source-object inspection region with actual scanned title, file identity, kind and stream detail. The source list uses keyboard-accessible selection buttons with `aria-expanded` and restores focus on Escape/Close. It is a presentation of existing exact-File source observations, not a new editable media model.
- For verified SubRip, the sheet's Add-to action opens the **existing explicit target chooser**, and cancel leaves the output unauthorized. Unsupported ASS/font transfer offers a read-only explanation rather than promising an unvalidated conversion. Preview/Extract remain **not claimed**; no inactive or synthetic successful tool is shown.
- Source replacement, tab switching, changing to an authorized target and a stale imported File all revoke the selection. 820/620 responsive bounds, keyboard Escape, File continuity and real Chromium A SubRip → B flow have added regression assertions.
- Scope is V3-05 / V3-02 source interaction only. It does not implement Figma's full preview+extract for ASS, exact selected-ASS image fidelity, or final device acceptance. Draft PR #239 stays unmerged; new HEAD tests are **Pending CI** at branch submission, and no earlier green run proves this commit.


## 2026-11-04 WU-04 — native ASS source preview (submission, exact-head CI pending)

- Approved V3-05 source object selection now exposes a real preview action for exact primary-source ASS/SSA observations. Existing `embeddedPreviewTracks()`, `previewSubtitleSelect`, `previewRefreshBtn`, `refreshSubtitlePreview()` and FFmpeg/libass remain the single execution authority; no second renderer, editable File, output intent or mux grant was created.
- `softmux:v3-preview-source` validates the real imported resource key + exact File identity, current active/scanned source, stream index, and native embedded ASS/SSA candidate; forged same-name File and unsupported codec fail closed.
- Existing native `#sf14PreviewDrawer` is temporarily moved into the source inspector, preserving all actual preview controls and evidence; it returns to its original parent on dismissal, source invalidation or view change.
- New real Chromium `tests/e2e/v3-source-ass-preview.e2e.mjs` constructs an MKV containing ASS, verifies genuine libass PNG, no-target/no-mux state, singleton original preview and source SHA unchanged. Workflow now executes this scenario and uploads its screenshots and JSON. **Pending exact-head CI**, no success claim until the new commit passes.
- The new fixture has no embedded font. Complex internal-font preview remains a separate native product test, and ASS+font **cross-source addition** still belongs to unmerged Draft PR #233. Extraction UI, complete selected-ASS Figma parity, physical tablet/a11y and overall release gate remain unfinished; PR #239 stays Draft.


## 2026-11-04 WU-04 — source ASS original-track extraction from selected-object sheet (submitted, pending exact-head CI)

- The approved V3-05 source ASS inspector gains `#sfv3SourceInspectorExtract` alongside the real FFmpeg/libass preview. The action is limited to an exact imported, active, scanned ASS/SSA stream; it does not construct an output target or change inclusion.
- `softmux:v3-extract-source` is handled in the original `src/main.js` execution owner after strict resource-key, same `File` instance, active source, scan file key, stream index and native-codec validation. It calls the existing `extractOriginalTrack(streamIndex,'native')` pipeline using Stream Copy, re-probe, `auditExtractedOriginalTrack`, SHA-256 and production download/report links. It does **not** implement a second extractor.
- The original `#originalTrackExtractionPanel` and download links are rehosted into `#sfv3SourceExtractionHost`, restored when the selected source sheet closes or its identity changes. The button explicitly warns **提取 ASS（不含字体）**; extraction does not bundle font attachments, chapters or global tags, and native ASS cannot guarantee source container absolute timeline equivalence.
- Existing real Chromium `v3-source-ass-preview.e2e.mjs` is extended to extract/download an actual source ASS, independently run native `ffprobe`, compare report SHA-256 to the downloaded bytes, check report non-inclusion flags, reject a forged same-metadata File and assert zero target/plan authority and source SHA unchanged. `tests/softmux-v3-surface.test.mjs` checks the native hand-off and single-owner DOM strategy.
- **Evidence:** code submitted on Draft PR #239; exact new commit CI Pending. This is an ASS fixture without embedded fonts. Complete ASS+font cross-MKV inclusion PR #233, complex attachment closure, physical tablet/accessibility and Figma visual signoff remain open; default UI unaffected.


## 2026-11-04 WU-05 — staged cross-source ASS + font closed bundle (new branch submission; exact-head CI Pending)

**Approved UI:** V3-02/V3-05 source ASS selected → explicitly choose B.mkv → V3-04 target plan. **Product owner:** existing real source inventory, target authority, FFmpeg.wasm extract, subtitle/font editor and mux pipeline. **Reusable bounded implementation provenance:** independent Draft PR #233 exact head `e38c98a7`, which previously passed real Browser E2E/S12 for an ASS+isolated-font closure. This stage selectively ports its `secondary-ass-font-bundle.js`, negative unit tests, native E2E, main integration and source-removal revocation; PR #233 itself is not merged.

- V3 primary and secondary ASS/SSA source rows now offer “加入到…（校验 ASS 与字体）” as an **attempt**, not a guarantee. It still requires a user-confirmed target and re-probe of the actual source track. The native handler checks the exact imported source `File`, stream index, required ASS face/weight/italic and used glyph coverage against real Matroska embedded font payloads; missing face, glyph, font, unsafe/conflicting file name or stale source refuses **all** derived members.
- `renderSecondarySourceSubtitles`, the original async extraction code, `applyImportedAssetRoles` and `newSubtitleState`/`fontInspectPromise` remain sole owners of actual derived resources. V3 target `runPendingAddition` allows ASS/SSA only after the real native secondary inventory has passed its eligibility check; source-only selection never creates a plan. Moving back to read-only source during an in-flight add invalidates `current()` and triggers rollback.
- The actual product Browser E2E includes both existing default UI and **new V3** A ASS+isolated font → explicitly selected B → downloaded B MKV, independent native packet hash/PTS/DTS plus named-font libass rendering. It also runs a **V3 missing-font refusal** and checks no partial subtitle/font additions, independently of the default UI negative test. Evidence includes screenshots, final MKV and JSON; exact current V3 head is **Pending CI**, not claimed green yet.
- Boundaries remain: one source ASS bundle per A, limited size/counts, no universal ASS rendering or EBML UID/Tag preservation, no source mutation, no auto-merge, no font-subset/forced rewrite. Exact Figma pixel acceptance, physical tablet/keyboard/screen-reader acceptance, complex ASS font cases and full UI acceptance remain open. PR #239 stays Draft and default UX unchanged.
- **Branch integration debt:** PR #233 and #239 now share portions of the P3 code. Reconcile duplicate/conflicting changes before merging either into main; do not double-apply separate merge commits or infer PR #233 has been accepted solely because V3 reused code.


## 2026-11-04 WU-05 — real ASS/font member provenance in authorized V3 output (submitted; exact-head CI pending)

- On previous head `59ee3cea`, full Browser E2E and S12 passed, but V3 pilot [#41836813707](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/41836813707) failed in `v3-source-ass-preview.e2e.mjs:43`: the former source-only ASS test expected the Add-to button hidden. Under the newly imported font-closure executor an ASS Add-to **attempt** is visible, but cannot create target intent without explicit B and cannot publish a font bundle without native proof. The E2E test now checks the explicit chooser, disabled confirmation with only A, cancellation and no authorizations; source preview/extraction remain real and separate.
- The V3-04 target view now shows `#sfv3AssFontDependencies` only when a genuine authorized target exists and the existing imported resource list contains a source-linked ASS/font bundle. This panel projects exact source File identity, source stream index, real derived subtitle filename and font filenames, and whether those very same File objects are registered in the existing subtitle and font inputs. It has **no editable controls** and always distinguishes "in output editor; before mux/final audit" from an actual delivered MKV.
- Source-only view, stale/removed source, no bundles, and failed font closure show no fabricated dependency panel. Missing/partial bound members explicitly show a not-yet-bound status. CSS is V3-only with responsive wrapping; the legacy editor remains authoritative.
- Actual product real-browser ASS+font fixture now asserts the visible source/ASS/font provenance and sole editor before mux, and the missing-font negative case asserts no phantom provenance. The native ASS preview-only test is updated to expect a guarded Add-to attempt rather than the obsolete "hidden" state.
- Current code submission is **Pending exact-head CI**. This is not complete Figma pixel/touch/screen-reader signoff or generic ASS dependency solvability; PR #239 stays Draft.
