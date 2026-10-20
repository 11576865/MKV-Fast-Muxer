# Theory 1.0 / R1: observed Chapter/Tag → independently inspected bounded tool

Status: **0.1021 integration candidate**; original PR #159 exact-head Node/build/Chromium/native workflow passed [run #39295712227](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39295712227), but this rebased new-mainline branch must separately pass its OWN exact-head CI before merge.  
Current integration branch is based on `main@85c0871b027dfb1306ede7cc862db58d5beaad69` (development version 0.1020). It preserves 0.1020's 1 GB non-blocking warning work and integrates only the semantic Chapter/Tag route and browser coverage from stale draft #159. Old PR #158 was superseded by #159; #159 is likewise superseded by this fresh-mainline delta due to merge conflicts. This document describes intended integrated behavior, not universal structure editing.

## Actual product behavior

In the current default object-centred single-project UI, selecting a real scanned Chapter or global format Tag observation now offers **使用当前来源打开受限章节/标签工具**. This is not a direct edit button.

On click:
1. The observer carries only the exact current `File` object, observed section and observation ID in a cancelable local event.
2. The production domain handler proves `sourceFile === videoInput.files[0] === scannedSourceFile`, `trackState.fileKey === fileKey(source)`, a matching exact File object in the authoritative unified asset inventory, correct section and a currently observed ID. Busy execution and missing file/unsupported DataTransfer refuse.
3. Accepted navigation binds that *same browser File instance* to the existing `p2MetadataSource` and fires its normal `change` handler. No data clone, synthetic Matroska object, duplicated mutation authority or new writer.
4. The original existing P2 tool invalidates any previous generated result, review, field choice and save affordance, then **re-inspects raw Matroska EBML**. User must separately review, accept equivalent UTF-8 byte length and request a fresh independent verified-copy write.
5. Only after an accepted source rebind does the current UI navigate to the visible **容器工具 / 实际章节标题与标签文本编辑** panel. Refused navigation leaves the active page unchanged and reports a concrete refusal.

An ffprobe flat Chapter observation does **not** prove an editable `ChapString`; a global format Tag observation does **not** imply a particular EBML `TagString`, TargetUID, TagTargets hierarchy or a stable mapping between flat/source fields and writer elements. This link expressly **does not preselect** a writer field, grant mutation authority or promise edit support. The bounded writer's independent EBML evidence remains the only supported editing authority; source overwrite, general EBML rewrite, unknown-size structural mutation and unsafe CRC paths remain unavailable.

## New real E2E acceptance slice

`scenarioObservedMetadataSafeToolNavigation` in `tests/e2e/browser-mux.e2e.mjs`:

- Opens current public UI and verifies no metadata tool action is offered without an actual scanned source.
- Uses the real public unified importer and a real MKV with known chapters and format tags.
- Verifies two observed chapters, selects one and inspects the explicit recheck-and-consent disclosure.
- Dispatches a forged same-name/different-instance `File` event: expected result is refusal with no tool input mutation.
- Clicks the actual source item action, checks transition to the existing bounded tool and exact in-memory source File reference, waits for independent tool inspection to reach ready/blocked.
- Verifies **review remains unchecked**, prepare and save stay disabled.
- Returns to current project, selects a format Tag, repeats entry to the same tool and checks source identity, fresh review, no automatic output and no main importer resource loss.

The existing independent `scenarioTracklessMkaRealChapterTagTextEdit` still exercises the actual P2 writer and native Matroska oracle. The new scenario adds **cross-workflow navigation**, not another full writer test.

## Test and stop conditions

- Exact-head `npm test`, Vite build, complete Chromium E2E and retained native `mkvmerge/mkvextract/ffprobe` scenarios must pass before merging.
- No review reset, source identity bypass or writable field fabricated from ffprobe may be accepted.
- This is an R1/R2 integration step; it is **not** a claim that full `ContainerProject` now owns Chapters/Tags, nor any promotion of R1/R2 or the 57 original theoretical cases to verified.
- If branch merges after PR #157, inspect main's changed browser E2E for semantic overlap. Prefer review/rebase or recreate a small delta on updated main when actual merge conflicts exist. Do not overwrite any previously green E2E assertions.

## Next work

Integrate authoring of actual bounded Chapter/Tag edit intents into the prospective output container through one reviewed `ContainerProject` transaction, but only once a formal capability contract distinguishes read-only object, no-video writer, byte-equal replacement, unsupported UID/target graphs and independently audited saved output. Never infer general Matroska support from this navigation.
