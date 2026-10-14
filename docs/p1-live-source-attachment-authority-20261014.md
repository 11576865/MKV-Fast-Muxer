# P1: source attachment editor uses one live ContainerProject authority

Date: 2026-10-14  
Parent provenance: [#128](https://github.com/11576865/MKV-Fast-Muxer/pull/128) integrated; [#129](https://github.com/11576865/MKV-Fast-Muxer/pull/129) advanced flag/order implementation included in this feature branch.  
Status: **code/test submitted; new combined exact-head Node/Vite/Chromium validation Pending**.

## Actual functional change

Previously the source attachment editor had three separate mutable write routes: (1) current-object inspector, (2) legacy attachment list, and (3) preserve all / bulk include + metadata reset. They changed `trackState.attachments` directly, while an immutable `ContainerProject` could merely project their resulting state.

Now `src/live-source-track-authority.js` constructs an immutable, source-bound attachment owner alongside the existing audio/subtitle owner using the actual ffprobe scan projection. The owned fields are **`include`**, **`filename`** (project `attributes.name`) and **`mimetype`** (project `attributes.mime`). The source attachment object is mapped by actual ffprobe stream index and type, bound to the same browser `File` object reference that finished scanning. The command:

1. Validates current exact source reference, scan fingerprint, track+attachment inventory and all existing domain vs FFmpeg-facing attachment fields.
2. Validates *every* requested field and source attachment index, enforces basic filename safety (no path separators/control characters, bounded text length), and rejects hidden metadata mutations on excluded attachments or preserve-all mode.
3. Computes the entire next immutable `ContainerProject` object set first, then synchronously materializes the new attachment fields into existing `trackState.attachments` only after full validation succeeds.
4. Returns a bounded receipt explicitly marking `fileWritten=false`, `muxStarted=false` and `sourceUidRelationsPreserved='not-proven-by-domain-command'`. There is **no second media writer**.

The normal object inspector, legacy attachment row, bulk keep/drop, preserve checkbox and reset metadata controls now use that same command path. Long user typing is supported by existing bounded history compaction, preserving actual effective values.

## Writer and provenance safety are distinct

This change **does not widen** the P0 Matroska writer capability. Matroska AttachmentUID, targeted Tags, unknown EBML elements and nested Chapters can require independent preservation checks. The original FFmpeg/existing-MKV writer controls still decide whether a particular output can be safely delivered. Re-labeling an attachment object inside an immutable domain is not proof that its source UID graph survives re-mux; it must not bypass issue #77, create a false capability, or promise cross-player font delivery.

`ContainerProject v1` detached draft **does not provide verified replay of attachment edits**. Its snapshot may display modified attachment names, MIME and inclusion, but the exporter deliberately does not invent approved `editIntents` for them, and the UI explicitly warns that those session-local changes are not recoverable from re-imported JSON. Recoverability requires a later independently verified attachment baseline/UID conflict+writer design.

No assumption is made that every legal Matroska input can be remuxed losslessly.

## Verification

- Focused domain Node tests verify actual source projection and immutable attribute values; multi-field transaction, exclusion, no-op, 150 consecutive text inputs with bounded history, bad MIME or path injection refusal, stale source File, preserve-all, legacy bypass drift, unchanged chapters and untouched original source stream descriptions.
- Real browser E2E extends the prior existing attachment coverage: scan a real two-attachment source MKV, modify one attachment filename and MIME, exclude another, export and inspect detached project plus warning, **run actual FFmpeg mux**, download output and verify one retained attachment with correct name/MIME using an independent native system `ffprobe`. Assert source bytes unchanged.
- A targeted in-isolate invocation of the real modules passed a two-property attachment edit, rejection of control-character MIME and 110 sequential names while keeping a bounded immutable history. **Full exact-head Node/build/Chromium E2E Pending.**

## Roadmap

Next: authenticated baseline snapshots and conflict-checked portable attachment replay, actual AttachmentUID and Tag relation graph gating for any write capability expansion, batch recipe v2 durable tasks, and wider device/browser acceptance. Do not label P1 complete or P2 fully safe based on this source-state migration.

## Subsequent P1 recovery implementation (2026-10-14)

The earlier statement that source attachment edits are nonportable describes the first source attachment **live editing** milestone (#130), not the later recovery work. Follow-on [verified attachment replay report](p1-verified-source-attachment-replay-20261014.md) adds real scan-based source attachment edit intents, SHA-bound import, old-value and exact ffprobe stream-identity comparison, explicit all-or-nothing mixed track/attachment apply, and guarded undo. Its full PR CI is pending until independently verified. The source-order/AttachmentUID/Chapter/Tag writer restrictions above **remain unchanged**. Read the later report for current scope and acceptance status.
