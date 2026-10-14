# P1: Live external audio/subtitle metadata and font policy domain authority

Date: 2026-10-14  
Base: main `bf75e797700a2f0e14a90a63898e096a94c2ffe8` (merged PR #132, exact-head Node/build/Chromium green).  
Status: **one feature branch; full exact-head Node/Vite/real Chromium CI Pending**.

## Prior split-owner problem

PRs #125–#132 moved source MKV audio/subtitle and existing attachment fields, ordering, detached source recovery and guarded inverse into bounded immutable `ContainerProject` transactions. Yet separate **external audio and newly selected subtitle** form fields continued to mutate `externalAudioState` and `newSubtitleState` directly. `captureNewTrackEditorState` even copied currently mounted input DOM values straight into these executor arrays on *every* asynchronous readiness-driven UI refresh.

This is not only a theoretical split-owner concern: selecting a replacement `File` with an unchanged `name|size|lastModified` could reuse old metadata by that display key, or a stale DOM form could copy its old user-entered title onto a newly selected File after an asynchronous selection update.

## Implemented bounded domain

`src/live-external-asset-authority.js` now constructs a live **immutable `ContainerProject v1`** from actual source-neutral external resources:

- External audio: `title`, `language`, `default`, `original`, `commentary`, `hearingImpaired`.
- External subtitle: those fields plus `forced`; actual subtitle format/content identity and optional sidecar File reference stay in the verified existing execution state.
- Selected fonts: each selected File is bound as an immutable **source inventory `attachment`** object (name only); one separate immutable `metadata` object captures the `preserve|force` font handling policy. Font bytes, glyph editing, automatic font inclusion edits or UID mapping are **not** claimed as new domain capabilities.
- Browser File objects and sidecars are never put into serializable `ContainerProject` objects; they stay in exact-identity in-memory session bindings and already-reviewed execution-facing arrays.

Actual UI wiring:
1. The external audio and new subtitle lists dispatch every user `input`/`change` event through the same typed, all-or-nothing `commitLiveExternalAssetChanges`. Only after a complete immutable domain revision is built are legacy writer-facing row values synchronously materialized.
2. Async UI state capture must reconcile DOM changes **through the domain**, not silently assign to `externalAudioState`/`newSubtitleState`. Each rendered editor list carries an explicit **selection-authority epoch**: a new File/sidecar/font selection invalidates the previous markup even when identical names and timestamps make the old state look equivalent.
3. `syncNewTrackState` preserves prior audio/subtitle edit choices only if the actual selected browser `File` reference (and subtitle sidecar File reference) matches, not merely `name|size|lastModified`. A new selection rebinds a fresh domain project to the new current task without transferring a stale user's metadata.
4. The existing font-mode select writes through `commitExternalFontMode`; the font selection change event establishes a new exact-File inventory. This policy is distinct from a font-name/MIME editor.
5. The existing bulk clear-Default tool routes external audio/subtitle changes through the same domain command. The **single-task mux entry** checks domain/editor/selection agreement *before* the legacy preparation and existing separate subtitle execution witness. The frozen independent batch executor remains isolated and unchanged; a fresh batch JobPlan still has its own guards.
6. Text typing uses bounded semantic history compaction without dropping current field values. No-op operations do not mint fake revisions. Bad typed changes or any bypass of the owner fail closed.

## What this does NOT deliver

- This is **one bounded external-resource domain session** plus the existing source-scan-bound `ContainerProject` session, not yet a single serializable super-project containing every source and external object with one cross-surface atomic transaction.
- External audio/subtitle metadata edits are currently **session-local**; there is no new trusted cross-session external File grant or portable detached-document replay. Browser File identities are not proof of matching bytes on later visits.
- Resource-only output is still an inspectable candidate. The current validated browser FFmpeg writer remains video-rooted; no silent support for audio-only, subtitle-only or attachment-only outputs.
- `preserve|force` policy has no direct proof of fonts actually delivered: existing independent font recognition, dedupe, mux and artifact audit must run. No general AttachmentUID/targeted Tag/Chapter writer permissions are added. The unresolved #77 complex EBML preservation block remains.

## Test and independent output evidence

`tests/live-external-asset-authority.test.mjs` covers the real `ContainerProject` object/type mapping, multi-object metadata commit, invalid mixed edit rollback, File replacement with identical display metadata, sidecar/format/identity drift, forbidden direct executor mutation, font exact-inventory + mode, no-op, 150 consecutive field edits and zero-asset policy without falsely granting resource-only writer authorization.

`tests/e2e/browser-mux.e2e.mjs` adds one true Chromium integration scenario:
- source MP4 + external FLAC + ASS subtitle + TTF font;
- edit a title, replace the selected audio with a different browser `File` object containing **identical bytes and the same name, length and mtime**; verify the previous title is *not* inherited;
- author new external audio language/title/Commentary and subtitle language/title/Forced, select font `force`;
- actually produce MKV and verify native **independent ffprobe** audio/subtitle tags, dispositions and font attachment presence.

A targeted direct execution of the actual project and new domain modules passed: one combined audio/subtitle transaction, invalid mixed edit rejection, domain font-mode change, 125 sequential typing actions with bounded history, and replacing an otherwise identical File reference failing closed. Exact-head Node/Vite/Chromium tests **Pending**, and no cross-player or actual tablet acceptance claimed.

## Execution boundary

Submit one cohesive pull request. Let the existing GitHub CI run asynchronously once for the exact submitted head, fix any concrete failing evidence only in a later bounded generation. Keep `.uigs/tasks/2026-10-14-mkv-theory-integrated-delivery.json` current for future handoff.
