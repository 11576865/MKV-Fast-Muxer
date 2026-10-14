# Round 3 / P1 — external metadata persistence, byte rebind and guarded undo

Status: **submitted branch, exact-head Node/Vite/Chromium CI Pending**. Parent PR #142 completed exact-head Browser E2E/Pages SUCCESS but remains unmerged; parent PR #143 is still a Draft with no confirmed exact-head workflow result at this checkpoint. Do not merge ahead of parent acceptance.

## Existing source restoration (reused, not reimplemented)

`container-project-import.js`, `container-project-source-proof.js`, `container-project-restore.js` already support an inert single-source MKV draft, reselected File whole SHA-256, explicit reviewed source audio/subtitle/attachment/order transaction and guarded inverse. Digest equality does not grant writer permission. This remains the only actual source-MKV replay mechanism. A `ContainerProject` shared live session in #143 does not make detached files authorize themselves.

## New working slice: portable external track metadata

New `src/portable-external-project-recovery.js` and actual `index.html` / `src/main.js` controls:
1. Export a separate allowlisted JSON **external audio/subtitle metadata checkpoint**, hashing each exact current audio/subtitle `File` and optional subtitle sidecar `File` over its complete bytes using the existing bounded/incremental SHA-256 implementation. No source File, raw bytes, handles, permissions, signed provenance, URLs or prior result URLs are serialized. Font bytes, current font policy and filename grants are **not** restored by this schema. The existing source-MKV draft remains separate.
2. Import is inert: enforce 1 MiB JSON cap, exact schema keys, resource count/order/kind, metadata field/value allowlist, valid digest format and sidecar structural consistency. Unknown grant/writer keys are rejected.
3. Explicit separate **Prepare** action checks currently reselected file name/size + full SHA-256 (including sidecar), with exact live `File` reference, format/identity and current immutable shared `ContainerProject` revision rechecked after awaits. A differently named file or matching-name but changed bytes is not accepted. A browser task edit during hash invalidates the prepared result.
4. Imported checkpoint records have no write authority. **Confirm checkbox and separate Apply action** are required. The replay is one domain transaction for all edited external audio/subtitle fields, rejecting any stale owner projection before a commit. Newly edited field values from the existing editor are captured as an inverse.
5. **Undo** only accepts the exact immutable Project version produced by that apply and the exact current external File references. If any later domain edit or selection happened, old undo fails closed. It does not revert produced files and is not a durable multi-session undo journal.
6. Existing source Chapter/Tag issue #77, attachment writer limits, legacy batch frozen tasks, and independent FFmpeg output verification remain unchanged.

## Tests / acceptance

- New `tests/portable-external-project-recovery.test.mjs`: SHA and optional sidecar case, malicious import key, cross-session new-File rebind, explicit consent, current metadata preservation until apply, snapshot stale, deterministic inverse, same-display wrong bytes, after-hash mutation.
- New `scenarioExternalCheckpointRecoveryRealMux` Chromium: select source MP4 and external FLAC, author title, download checkpoint JSON, edit current title, inert import, explicit full SHA prepare, explicit confirm/replay, guarded undo, prepare/confirm/replay again, actual FFmpeg MKV and **independent ffprobe completed audio title**. Prior Round 2 source/external combined actual-MKV case remains in full suite.
- No locally executed full Node/Chromium proof in this connector-only session; exact PR-head full Actions evidence must be read after submission.
- A passing test would prove only the scoped metadata checkpoint and actual FLAC title delivery, **not** unified portable source-plus-external atomic restore, font File regrant, offline permission persistence, chapters/tags edit, or generic Matroska writer.

## Remaining P1 / target B

- General project persistence should use one durable envelope for native source-MKV + external metadata with **multiple source identities and File/sidecar rebind**, but this needs a cross-domain atomic transaction (source replay and external replay must not half-commit).
- Durable UI session-specific undo/redo across restarts and full transaction journal is still not shipped.
- Batch Recipe v2 still owns independent frozen per-job plans. Migration to a common `ContainerProject` and actual BatchRunner is separate.
- Only qualifying individual requirements with full exact-head successful output evidence may move to ledger `verified`. Round 3 is not presumed accepted from code submission.

## UIGS knowledge

Potential reusable Test/Case: SHA matching is a **necessary content check**, but does not grant permission or ensure state freshness; complete cross-rebind proof needs hash + exact File refs after awaits + bound domain revision + user approval + CAS inverse. Search Foundry before adding a scoped Case or Test; do not amend Canonical.
