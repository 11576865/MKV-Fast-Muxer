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
- [~] WU-03: source-side output composition gated by confirmed target; real target heading, selected-object reuse, mux and revocation E2E passed. **Full optional-output domain, source-side edit isolation and final V3 design fidelity still open.**
- [ ] WU-04: source drawer, portrait/landscape/compact responsive reflow with state continuity.
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
