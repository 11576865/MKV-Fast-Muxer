# Softmux UI V3 — approved design contract

**Owner approval:** 2026-11-04, explicit chat instruction “批准设计，开始做”.
**Design:** https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc
**Approved design page:** `V3 · Object-first / Adaptive` (Figma node `27:2`).
**Implementation baseline:** `main@5ce85fc8d1657797809d25b51c8b51512f762406` (Softmux `0.1047.0`).
**Previous draft PR #234:** not an approved V3 baseline; do not merge as a substitute.
**Design freeze limit:** Figma URLs and frame IDs are stable references, NOT immutable Figma snapshots. Changes to them after approval need explicit revision and re-review. This document captures reviewed semantic/visual parameters so sessions can recover without chat history.

## Screen authority and key flows

| ID | Figma node | Contract |
| --- | --- | --- |
| V3-01 | 28:2 | 1440×900: open real MKV, source-only, no fabricated target |
| V3-02 | 30:2 | select A.mkv ASS; show contextual Preview / Extract / Add-to |
| V3-03 | 31:2 | select B.mkv or blank as target **explicitly** |
| V3-04 | 32:2 | only then expose the prospective target and Mux |
| V3-05 | 33:2 | 820×1180 source focus; bottom context sheet |
| V3-06 | 35:2 | portrait target-plan state |
| V3-07 | 36:2 | 1180×820 landscape |
| V3-08 | 37:223 | 620×900 compact |
| V3-09 | 38:2 | technical help near Default |
| V3-10 | 39:2 | direct empty-area click / drag-drop import |
| V3-11 | 40:2 | source/target state and adaptive behavior contract |

## Approved behavior

- One workbench, no batch as a required 1.0 UI task. Preserve legacy batch functionality as a deferred legacy entry; don't drop its state.
- Initial MKV observation is part of opening a file, not an inspection page and not a target plan.
- Source selection must not implicitly include a target. Only explicit target choice and confirmation may create output intent. **This is a semantic implementation gate, not merely a hidden panel.**
- Real track/audio/subtitle/attachment content comes from exact input File scanning; source facts remain distinct from proposed output edits.
- For complex Chapters/Tags/unknown EBML: observation only in V3; no universal writer/unsupported edit affordance.
- Icon-first common actions with accessible names; preserve names, formats, identifiers, diagnostics and important primary-action labels.
- Contextual explanations are hidden until requested; Default and Forced retain their actual technical distinction.
- Single authoritative editor, no duplicated editable file controls; screen rotation must not dispose of File, draft or job ownership.
- Reduced-motion support, cancellable/interruption-safe animation, keyboard access and touch targets required.
- Include no invented performance/reliability promise for large browser input.

## Visual reference values (V3-01)

- Canvas `#0F1115`, chrome `#15181E`, base row `#1B2026`, selected/context surface `#222831`, soft accent `#C4D5C9` and accent backing `#314239`.
- Header height `58px`; desktop file/resource rail width `72px`; initial design content takes remaining width; source track rows about `59px`; icon controls about `40px`.
- Important text uses Noto Sans SC with fallback; source filename remains dominant. Avoid substituting Figma source illustrations for real data.
- Alternative widths: 1180×820, 820×1180 and 620×900 as reviewed; test intermediate window widths, height and keyboard, not just these screenshots.
- Motion **not approved as an exact Figma prototype**; no verified motion tracks were found for V3-05. New motion details need review before motion fidelity claims.

## Acceptance & change control

1. Exact design-frame screenshot versus exact Git HEAD browser render using the same fixture, viewport, font and device scale; no missing visible icon assets.
2. Existing DOM IDs and event handlers preserved unless replacement is covered by a real task test and rollback.
3. Test source scan → select object → explicit target → mux → output audit and download with real file; all earlier stable features remain accessible.
4. Test empty, loading, unsupported, failed, and read-only states; no false “saved” or “verified” labels.
5. Run keyboard, touch, reduced-motion, resize, rotation and screen reader semantics checks.
6. **Merge only after whole-workbench visual + functional acceptance.** Intermediate commits and draft PR are not accepted production UI.

## Scope guard

Authorized work must name the V3 frame/state, actual code owner, proof and exit criterion. New requirements discovered during implementation are Candidates until approved; never silently change the contract or prioritize unrelated media-engine features.
