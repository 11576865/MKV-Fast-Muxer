# Softmux external candidate delivery — 2026-11-01

Status: implemented and locally verified; full exact-head CI pending. This is a bounded integration unit toward 1.0, not a 1.0 release.

## User-visible result

Imported external subtitles/audio can be excluded from output without removing their File grants, authored metadata or candidate preview. Existing quick mux defaults remain included. The inventory and existing editor controls dispatch the same immutable ContainerProject include operation. Execution, counts, defaults, compatibility descriptions and completed-output evidence use the selected output members. Batch frozen contexts stay independent.

Portable v1 checkpoints now export optional `included` per row, with boolean validation, SHA rebind, explicit consent and reversible recovery. Old v1 rows without this field remain readable and do not overwrite membership on restore. Atomic dual-domain recovery uses the semantic include field, not an invented metadata attribute.

## Verification actually performed

- Baseline: 747 Node tests passed before changes.
- Final local `npm test`: 757 tests passed, zero failures/skips.
- `npm run build`: passed; existing bundle-size advisory remains.
- New real Chromium 153.0.8010.0 scenario on the built application: imported actual base MP4, two ASS, TTF and external FLAC. Excluded one ASS and FLAC; independently previewed excluded ASS; generated/downloaded MKV; native FFprobe 6.1.1 confirmed one subtitle and no added external audio. Reincluded subtitle, generated/downloaded a second MKV and confirmed two subtitles plus retained authored title.
- Swapped two identically authored subtitle candidates: historical output audit became stale and its current-source/output index check was disabled despite an identical display plan.
- 1440×900 desktop plus 1024×800 and 768×800 viewport checks: Start remained genuinely clickable after output; screenshots captured locally. Viewports are not physical-tablet acceptance.
- E2E is part of the existing complete browser suite; its JSON, MKVs, preview and viewport images are uploaded by CI.

## Review findings fixed

1. Inventory include changes could be captured back from a stale editor checkbox: render the committed editor projection before global live-field capture.
2. Same-label candidate switches could reuse old output authority: bind outputs and final execution handoff to exact included File/sidecar/font references and metadata. Preview focus does not invalidate the output witness.
3. Real repeated-output regression exposed a centered overflowing dock: generated directory/save status made Start sit above the dock's scroll origin. Top-align the bounded dock child; verify ordinary clicks without forcing.

Independent review covered the initial semantic/recovery/integration delta. Fixes were verified with focused tests and real browser regressions; no second review pass was requested.

## Remaining project work, explicitly not completed

- Attachment-only writer in the normal product path.
- Multiple MKV inspection and switching with independent preserved source drafts.
- Full 1.0 contract/legacy capability reconciliation and complete exact-candidate CI.
- Real target tablet, large-file/permissions and deployment/rollback acceptance.

Previously generated artifacts remain saveable as artifacts after editing a draft; their audit no longer claims currency for the changed output selection. No new Matroska structural writer, no unsafe preservation fallback, no native runtime requirement and no 1.0 version declaration were introduced.
