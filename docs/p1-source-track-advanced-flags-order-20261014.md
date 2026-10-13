# P1 live domain extension: advanced dispositions and track order

Date: 2026-10-14  
Parent PR: [#128](https://github.com/11576865/MKV-Fast-Muxer/pull/128), itself the integration of merged large-source SHA #126 and earlier independently green source-domain PR #127.  
Status: **submitted to a stacked feature branch; exact-head Node/build/Chromium Pending**.

## Why

The live `ContainerProject` migration previously owned only `include,title,language,default,forced` for existing source audio/subtitle tracks. The actual source-object inspector and legacy editor still directly mutated `original`, `commentary`, `hearingImpaired` and `order`. That allowed unrelated legacy state to drift from the claimed domain owner and made edits through different UI surfaces architecturally inconsistent.

## Implemented scope

1. Source audio/subtitle `original`, `commentary`, `hearingImpaired` join the immutable live `ContainerProject` domain property set, with strict boolean values, scan-time baseline and explicit field-to-FFmpeg projection. The central inspector and old input share one atomic command, just like language/title/Default/Forced. Source exclusion clears all five disposition booleans in the same transaction.
2. Both source inspector arrows and the legacy track order arrows route through `moveLiveSourceTrack`. Two included adjacent source tracks **of the same kind** exchange immutable project order slots in one validated transaction, then exchange original legacy FFmpeg numeric `order` values. Excluded rows retain their original position, and source File instance, ffprobe scan, duplicate indices and cross-projection order are checked before the swap.
3. History remains bounded; one move records two consistent domain changes, without claiming media bytes were modified or permissions gained. Source file replacement, stale/malformed or duplicate legacy positions, preserve-all, and unsupported moves refuse editing.
4. Detached `ContainerProject v1` export now includes advanced disposition field changes in actual scan-to-current synthetic deltas; strict import, internal chain validation, old-value conflict preview and explicit verified-track apply/guarded undo understand these booleans without bypassing the original trust boundary. A previously imported older project without those fields is still syntactically supported. Advanced changes are part of the **final output intention**, not proof of historical edit actions.
5. **Critical portability distinction:** within-kind source **ordering is session-local**. Although order changes affect the actual current MKV writer's output, the detached edit-intent round-trip still does not include an independently verified reorder replay. Consequently the workbench explicitly warns on draft export when tracks have been moved. Draft `objects[].order` is not execution authority, and the source proof alone must not authorize order recovery. This prevents a technically valid draft from silently promising unsupported restoration.

## Regression scope

- The live-domain Node tests now exercise all advanced disposition flags, source exclusion clearing, track moves, excluded peers, stale File, invalid moves, externally corrupted order and atomic failed changes; old 'legacy-owned advanced fields' expectations were replaced.
- The source-restore Node test fixture is aligned with actual scanned disposition baseline and now validates advanced-field export/import and explicit verified replay.
- Existing real Chromium `scenarioUnifiedContainerOrderingAndAdvancedFlags` scans source-multitrack MKV, edits source title and order through the inspector, toggles advanced flags across old and new editor surfaces, muxes an MKV, then independently verifies delivered tracks and dispositions with ffprobe. The scenario additionally exports detached JSON and inspects the advanced intents and user-visible order-not-portable warning.
- A targeted execution of actual `ContainerDocument`, domain project, command, strict import/audit and FFmpeg-facing projection modules passed: three advanced changes, ordered audio swap and coherent persisted edit intents; exact-head **full CI Pending**. This does not prove general player support or EBML unknown-element preservation.

## Strict exclusions

No generic Chapter/Tag update, no UID-preserving attachment writer, no OPFS File permission recovery, no independent batch order or resource-only writer. Complex nested Chapter/targeted Tag remux safety remains blocked by P0 #77; a successful stream mux does **not** establish full Matroska round-trip preservation.

## CI discipline

Stacked branch is based on PR #128 head, not stale main. Preserve #128's independently running validation; only run the combined advanced-domain end-to-end gate once this change is ready for main, rather than invalidating #128 or triggering repeated CI for each changed source file.
