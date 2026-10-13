# P1 verified source-track restoration: one integrated feature batch

Date: 2026-10-14. Baseline: main@6d3f88a4ae7c0c67c7c058c3422ac4e32213b235.
Decision: 2026-10-12 D-01..D-10 / P0..P6. Status: implemented on a feature branch; exact-head CI and browser acceptance are asynchronous, not assumed.

## Actual end-to-end workflow

1. Open an existing MKV. Scan its real streams. Turn OFF “复制原轨并追加（保留全部）” to enter selective source-track editing.
2. Edit source audio/subtitle inclusion, title, language, Default or Forced. The immutable live ContainerDocument now exposes both **effective editable values** and the **scan-time baseline** for those specific rows. The source object identity and scanned source key are explicit; external additions cannot inherit the source identity.
3. Export ContainerProject v1. The exporter produces **bounded synthetic scan-to-current deltas**, with a strictly ordered, internally consistent edit-intent chain. This is not an audit of the user's chronological actions. Large files exceeding 64 MiB cannot claim whole-file SHA-256 proof with the current WebCrypto policy.
4. Reopen the original source after a fresh scan, import the JSON, and explicitly verify current File contents against the draft's claimed SHA-256. Compare every touched old field to the **current editable source value**; collisions and unsupported operations fail closed. A digest does NOT establish JSON authorship or execution permission.
5. After individually reviewing the changes, check explicit consent. A single synchronous transaction validates *all* affected tracks before touching any. The existing live trackState remains the write owner; no File, FFmpeg or browser permission is modified. The normal mux action and independent output audit still own delivery.
6. One-session “撤销本次恢复” is a guarded inverse of exactly that transaction; it refuses to overwrite any track subsequently modified by the user.

## Supported / refused

- Supports exactly source-bound scanned **audio and subtitle** tracks: inclusion, title, language, Default and Forced. Exclusion implicitly clears all source-track disposition flags exactly as the existing editor does; explicit clearing Default/Forced on excluded tracks is allowed.
- Refuses source file absent, unscanned, byte evidence absent/mismatched, display-key drift, changed fields, source model ambiguity, append-all mode, >100 proposals, stale or mutated editor state, unsupported field constraints, foreign/external objects, chapter/tag or attachment mutation, reorder, and mixed supported/unsupported draft proposals.
- Does not apply imported edits automatically. Does not restore media File handles or directory permissions, persist arbitrary Undo, add a new Matroska writer, guarantee complete EBML semantics, or migrate every editor into ContainerProject as the single authority.
- Does not certify actor identity. Editable JSON remains untrusted even if its digest matches the selected file.
- Existing preserve-all source scanning and actual mux preflight keep their independent safety contracts. Historical source values are a *scan observation*, not full semantic preservation proof.

## Tests and evidence rules

Focused test: `node --test tests/container-project-restore.test.mjs`.

Tests cover source-derived editable field identity, ordinary user-edit export/import/replay, multiple-track atomicity, exclusion and disposition clearing, title/language bounds, all-or-nothing mixed rejection, stale source/file baseline, unresolved source track, conflict during undo, and the absence of source mutation.

Chromium E2E executes the **real UI flow**: select a fixture MKV → scan → edit source audio title → export actual JSON (with bounded SHA) → restore live editor to baseline → import → SHA verify → confirm → apply → detect stale replay → undo → reapply → mux → download final MKV → independently ffprobe the delivered audio title → assert the input MKV bytes did not change.

This extends, rather than relaxes, the existing P0/Batch/P2/P3 regression suite. No assertion is considered CI-passing until the PR's *exact head* workflow finishes. Linux Chromium E2E is not user-device or cross-player evidence.

## Execution-time budget

This work is implemented as one coherent branch without opening a PR after every small change. The existing GitHub Browser E2E trigger is `pull_request` targeting main and `push` to main; intermediate branch commits therefore do not launch the full suite. Open **one PR** after all code, tests, and documentation are staged, then leave CI asynchronous (Pending). Do not poll/await it unless asked; repair any material CI failure in a subsequent evidence-driven round, not by repeatedly re-running the entire suite after each minor source edit.

## Next P1/P2 boundary

This restores a real subset of user edits into the *legacy* editor, not a total P1 domain authority migration. The next broad integration should move track and attachment intents into one writable ContainerProject adapter while retaining exact FFmpeg command parity and a single writer. General Matroska structure preservation (#77) and legitimate chapters/tags/attachment write authority remain separate high-risk P2 work.

## 2026-10-14 P1 source digest extension (post-#125)

The earlier 64 MiB bound described **whole-buffer WebCrypto**, not a Matroska format limit. A later standalone work package provides the same standard SHA-256 via `src/incremental-sha256.js`, reading one 1 MiB `File.slice()` at a time when the selected file exceeds 64 MiB. The UI now exposes progress, explicit cancellation, source-switch and draft-switch invalidation, and one active digest per workbench. It permits bounded verification up to 16 GiB on suitable browsers; operation completion time is not guaranteed. No partial hash may be exported as proof.

Regression plan: standard SHA-256 vectors, forced irregular chunking, a logical 65 MiB source with no full-file allocation, abort after two progress events, source-length drift, strict re-import after a digest match/mismatch, and genuine Chromium 65 MiB streaming. The JS implementation must be compared with an *independently computed* whole-file digest; merely comparing two calls through the same new implementation is insufficient. The original FFmpeg writer and source identity boundary are unchanged. The pre-existing 64 MiB limit in the historical paragraphs above is superseded for this P1 digest operation only; P2 raw-EBML research remains separately bounded to its own stated 64 MiB corpus and is not expanded by this change.
