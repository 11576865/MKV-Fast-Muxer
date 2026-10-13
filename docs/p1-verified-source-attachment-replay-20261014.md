# P1: verified source attachment draft export, explicit atomic replay, guarded undo

Date: 2026-10-14  
Base: `main@13968cd141be2790713ae347c364e48e60e6a797` (merged PR #130, after successful Node/build/Chromium validation).  
Status: **feature branch submitted; exact-head Node/build/real Chromium Pending**.

## Why

PR #130 delivered real `ContainerProject` live editing for source attachment `include`, `filename` and `mimetype` in actual FFmpeg-facing workbench state. However detached v1 draft exported modified attachment `objects` **without any source-baseline edit intents**, and imported JSON could not safely restore them. The UI accurately warned the user. The next coherent P1 increment must implement real recoverability rather than a third read-only projection.

## Actual behavioral change

1. The read-only scanned `ContainerDocument` now captures `originalAttributes:{name,mime}` and `originalIncluded:true` for each real source-bound attachment, separately from current state. No external font input is mislabeled as a scanned source attachment.
2. `createEditedContainerProjectFromProjection` emits synthetic **scan-to-current** `set-attribute(name|mime)` and `include` intents for source attachments, using the same bounded immutable project revisions and strict parser already used by source tracks. These are effective differences, **not an authenticated timeline of user actions**. Unsupported `reorder` and UID changes remain non-executable.
3. Existing strict `parseContainerProjectDraft` + chain consistency audit and three-way conflict preview now feed a bounded source attachment branch in `prepareVerifiedTrackReplay`. It requires:
   - Complete-file matching SHA-256 comparison (with the existing explicit external File rebind, subject to current 16 GiB digest operation cap).
   - Same source/document identity, actual successful ffprobe scan, exact source object-to-stream index and exact inspected stream object.
   - Whitelisted `include`, `name→filename`, `mime→mimetype` only, strict lengths and path/control-character exclusion; **no attachment UID edit**, no arbitrary EBML mutation.
   - Current old field values matching the draft's earliest claimed baseline (independent preview and *again* at the final synchronous commit). Metadata edits on an attachment that ends excluded are blocked rather than silently hidden.
   - Ordinary workbench selective mode, existing source-lock/busy gates and user's explicit confirmation.
4. A single prepared operation may contain both source audio/subtitle track edits **and** source attachment edits. `applyPreparedTrackReplay` validates **all** targets of both kinds before mutating any legacy executor projection. A stale/changed attachment cancels the entire track+attachment transaction, not only the attachment portion.
5. Guarded `revertPreparedTrackReplay` refuses undo if any restored track **or attachment** no longer has the value produced by the transaction. It then reverses both groups synchronously. The existing workbench now displays accurate restored/undone attachment counts alongside tracks.
6. Real workbench export warns about missing source hash, rather than categorically calling verified attachment intents nonportable; a matching SHA is not proof of authorship or a writer grant.

## Execution boundary and preservation

**This is an edit-plan recovery, not a Matroska writer.** The source `File` is never modified, the import is inert until independently verified and confirmed, and no mux is initiated by replay. Existing FFmpeg execution, Matroska preservation/readiness preflight, AttachmentUID/targeted Tag/Chapter #77 safety restrictions and final artifact audit still decide whether the requested output may be created. A SHA commitment in user-modifiable JSON does not establish signed provenance. No claim of arbitrary nested EBML preservation.

The stream-object reference in a prepared plan is an ephemeral **in-memory identity sentinel**, not a serializable capability or a persisted File grant.

## Evidence / validation plan

- Focused Node tests: real scanned attachment edit export → strict v1 JSON parse → full source-origin/proof preview → prepare/apply; mixed track+attachment atomicity and conflict-protected inverse; drift of ffprobe stream reference, stale/missing hash, preserve-all, excluded metadata, disallowed traversal/control names and unsupported attachment reorder.
- Existing real Chromium scenario extended to exercise actual source MKV, select/rename/MIME/exclude, export SHA-bearing JSON, reset real UI edits, import inertly, verify the same actual File SHA, explicitly apply, undo, reapply, then **real FFmpeg MKV output** with independent native ffprobe name/MIME/attachment count and original source byte comparison.
- Actual in-isolate cross-module transaction passed with one track+two attachment changes, strict import, prepared replay, guarded undo and stale attachment refusing the whole transaction; it reported `fileWritten=false` throughout.
- **Exact-head Node/build/real Chromium result Pending**. Do not label the feature green, merged, portable across devices or writer lossless until source CI and independent format evidence exist.

## Still open

- Safe **portable track-order** recovery has a separate identity/permutation contract; #130 still warns that ordering is session-local. Do not misrepresent moved source order as restored by this PR.
- Complex AttachmentUID, target Tags, nested Chapters and unknown EBML preservation have a separate structural writer problem (#77).
- External attachment/font material, arbitrary source neutral resource-only output, batch recipe v2 independent job plans, OPFS recovery, and real tablet/browser matrix remain outside this slice.

## Execution policy

One coherent PR after the full implementation, tests and documentation. Run the existing full Node/build/Chromium CI **asynchronously once per PR head**, not after every file modification. Record any concrete failing test only in a later bounded fix generation.
