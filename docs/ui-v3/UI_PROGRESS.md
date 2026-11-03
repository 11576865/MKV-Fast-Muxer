# UI V3 implementation checkpoint

State: **IN_PROGRESS / NOT ACCEPTED**.
Source: `main@5ce85fc8d1657797809d25b51c8b51512f762406`.
Branch: `feat/softmux-v3-approved-ui-20261104`.
Design: [approved V3](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=28-2).
Gate: `docs/ui-v3/UI_DESIGN_CONTRACT.md`.

## Work sequence (only approved scope)

- [x] Record immutable Git baseline and owner-approved Figma frame identifiers.
- [ ] WU-01: source-first desktop/empty surface, real File and scanned-track binding, preserve old engine and legacy UI rollback.
- [ ] WU-02: source-object selection, preview/extract, explicit target picker (no hidden inferred target).
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
