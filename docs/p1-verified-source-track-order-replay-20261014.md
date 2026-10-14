# P1: verified portable source audio/subtitle track-order replay

Date: 2026-10-14  
Base: main `d1499ed3bb6eb59d05ded614587b3e0df3f0cdf0` (merged PR #131, independently green exact-head full Chromium).  
Status: **submitted implementation; exact-head integrated Node/build/Chromium Pending**.

## Gap and identity problem

The source workbench already had real domain-owned up/down arrows. An unchanged source MKV can have sparse ffprobe stream indices, e.g. audio tracks #1 and #6, yet `ContainerProject.objects[].order` uses contiguous global presentation slots, e.g. #1 and #2 (with a video at #0). Directly writing a project order into the FFmpeg trackState would silently choose incorrect values. PR #131 already added safe portable source audio/subtitle property and attachment edit-intent recovery; order remained session-local because an arbitrary untrusted scalar `reorder` operation is not a verified permutation.

## Implemented production behavior

1. **Source-scanned baseline.** The detached exporter groups actual source audio and source subtitle tracks by kind, derives their original order from the **ffprobe source stream index** (not mutable display order), and maps that order onto exactly the same kind's set of current project order slots. All other kinds, observed-only streams and external tracks are untouched. The resulting immutable `ContainerProject` emits actual scan-to-current `reorder` intents for every changed kind-local slot, alongside already-supported source field/attachment edits.
2. **Strict untrusted draft gates.** Existing `ContainerProject v1` parser, reverse revision-chain audit, exact source/document/stream identity, full-source SHA-256 and old-value three-way conflict review still run. A correct digest from editable JSON is **not a signature or execution permission**.
3. **Complete permutation validation.** The restore planner requires every track of the reordered source kind to be present, scanned, included and bound to the exact original ffprobe stream object, with unique safe numeric executor orders. It refuses an excluded cohort, duplicate/missing/cross-kind slot, incomplete permutation, inconsistent current presentation relative order, missing or conflicting old-value proof, and preserve-all mode.
4. **Sparse-order safe mapping.** The planner derives current within-kind project slot order and the actual legacy FFmpeg numeric order values independently. It maps the complete desired project permutation back onto the existing numeric order-value set, preserving **the exact numeric multiset**. No direct assignment of an arbitrary untrusted JSON slot to FFmpeg state.
5. **Atomic application / inverse.** Reorder changes are merged into the existing prepared source track patches, so a single explicit user confirmation can atomically restore track properties, source attachment metadata/inclusion, and the whole audio/subtitle permutation. Final synchronous apply validates all touched tracks and attachment targets and stream sentinels before any mutation. Guarded inverse rejects changed orders, track/attachment metadata or stream identities and only then reverts everything together.
6. **Honest limitations in UI.** When a source track moved and full file hash is available, export describes conditional, conflict-checked portability. With missing hash it reports that restoration is blocked. If an excluded track is present in the moved kind, export warns that this permutation class is currently unsupported, even though current-session direct mux remains possible.

## Bounded implementation safety

- No new EBML writer, File grant, signed document, raw file mutation or mux on import/replay. The original FFmpeg execution plan and independent output oracle remain authoritative.
- No support for cross-kind swaps, reorder of source video/attachments, partially imported stream inventory, within-kind reorder with any excluded source peer, unknown/duplicate ffprobe index, or arbitrary order beyond the same source kind's scanned slots. These must fail closed, not be guessed.
- Preserves the existing P0 #77 structural Chapter/targeted Tag/AttachmentUID/unknown EBML writer gate. Audio ordering parity is **not proof** of general Matroska element preservation.

## Tests and acceptance

- Focused Node regressions cover a two-audio sparse source index (1 and 6) mixed with subtitles and two real attachments (including distinct attachment index 4): source swap export → strict JSON import → complete intent preview → mixed track-title + source-attachment rename + reorder apply → safe inverse → original numeric order restoration. Malicious duplicated/cross-kind slot targets, excluded peer, duplicate legacy numeric order, stale scan stream reference, prepare/apply conflicts, and inverse conflicts all fail closed.
- Existing full Chromium inspector ordering/advanced-disposition scenario now asserts explicit complete `reorder` intents and conditional export feedback.
- A **new real Chromium** scenario edits actual `source-multitrack.mkv` names and order, exports complete source-SHA project, resets UI to scanned values, imports inertly, verifies full SHA, explicitly restores, undoes, reapplies, **actually muxes MKV**, and independently verifies output audio title order with native `ffprobe`, including an unchanged original source byte comparison.
- Initial real cross-module isolated execution passed strict JSON parsing, exact permutation preview, mixed track+attachment commit, guarded inverse and sparse executor mapping. Full exact-head Node/Vite/Chromium CI remains **Pending**.

## Execution cadence

This feature is packaged into one branch/PR with durable `.uigs/tasks/2026-10-14-mkv-theory-integrated-delivery.json` state. Run full Node/Vite/real Chromium asynchronously once after the complete feature is staged; do not repoll or re-run infrastructure for each small source edit.
