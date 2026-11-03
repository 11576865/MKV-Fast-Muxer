# P3 — A.mkv ASS + verified embedded font closure → B.mkv

Date: 2026-11-04. Status: **implementation on feature PR, exact-head live CI required**. The previous #232 SubRip direct reuse is already in main; this extends actual user behavior, not the release contract.

## Actual user task

Import A.mkv and B.mkv into the existing single resource list. Open B as the target. Inspect A's *actual* subtitle tracks. A stream observed as ASS/SSA offers **加入字幕与字体** instead of requesting manual extraction. The existing browser-only Stream Copy extraction (FFmpeg.wasm) reads the source's ASS/SSA bytes. A separate seek-based EBML attachment reader extracts source font FileData without writing an intermediate user file.

The operation checks the actual ASS styles, Dialogue and inline font overrides against font name, face weight/italic and Unicode glyph coverage of the attached font payloads. The complete source-bound bundle is published **atomically** into the existing ordinary subtitle+font editor and output path only if all checks pass. It is not a second mux writer. Source A/B File references remain unchanged; no A audio or video joins B. Track language and title travel through existing external domain authority.

The font attachment's original safe filename and its source FileUID are recorded as provenance, but the new B.mkv will assign its own Matroska UID: the old UID/Tag relationship is **not copied**. Unsupported/malformed font claims, missing faces, missing characters, ambiguous exact faces, unsafe filename, duplicate name, missing attachment inventory or stale/cancelled source **refuse the entire bundle**. Removing A, the ASS member or a dependency font revokes the entire group, so a previously claimed complete ASS cannot remain bound to missing font files.

## Current bounded authority

- Input: a single A ASS/SSA source stream with actual scanned codec, one B source, a valid source attachment inventory. Only the **first** source ASS bundle from a given A is supported at a time; selecting multiple separate A files can still use the ordinary file-list semantics.
- ASS extraction limited to 8 MiB; each font at most 8 MiB, total 32 MiB, at most 32 fonts inspected; only matching source attached font Files participate in B output.
- No forced-font rewrite or subsetting in this operation (user must select preserve and disable subsetting).
- Source ASS font closure checks name/face/cmap in the browser. This is **necessary evidence**, not proof of all shaping/variations/cross-player rendering. It does not promise all ASS features, all SSA conversions or every external font fallback.
- Existing source B structural-preservation fail-closed rules, composition identity, original video/audio stream copy and final output checks remain in force.
- The bundle is operation-local. Browser refresh/rebinding still needs source File reauthorization and does not magically restore durable source attachments. No change to batch contract or 1.0 release authority.

## Independent E2E evidence required

The new `tests/e2e/cross-source-ass-font-bundle-scenario.mjs` creates actual real:
- A.mkv containing video, audio, one ASS and one isolated, *not globally installed* `P3EmbeddedProof.ttf`;
- B.mkv with original video/audio and no subtitle/attachment;
- a negative A.mkv with the same ASS but **without** embedded font.

Chromium imports A/B, inspects A, adds source ASS+font through the UI, verifies editor language/title and normal mux readiness; generates real downloaded B.mkv. Native ffprobe checks B compressed original video/audio packet payloads and time facts. Existing independent `verifyFinishedMkvAssRender` confirms the actual delivered MKV attachment bytes, demuxed ASS rendering identical to isolated source font reference, direct-final-MKV SSIM threshold and positive/negative render controls.

Negative input attempts the same operation with no source font and must leave **zero** derived subtitle/font members. Removing A after a positive output removes the entire group and revokes old output evidence. CI retains real source/target/output MKVs, independent PNG/JSON, and a direct result receipt.

**Do not claim verified delivery or merge until all exact-head Node/build/real Chromium/S12/Pages checks pass.**

## Next

Extend to multiple source ASS tracks and unions of font dependencies; independently test bold/italic collections, source Tag/UID-target reference effects and deliberate time-axis mismatch. These require their own real media proofs, not just renaming "closed" to "universal".
