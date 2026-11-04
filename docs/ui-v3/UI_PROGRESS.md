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
- [ ] WU-03: compositional output state and real mux/audit/save controls.
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
