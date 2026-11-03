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
