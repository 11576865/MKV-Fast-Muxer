# Multiple imported MKV source drafts — 2026-11-01

Status: implemented and locally verified; exact-head full CI pending. PR #208 was merged after exact head cd54b391 build, complete browser/native attachment extraction and S12 success; merged baseline e9f9066966cc55fc9c3f30f7f60f5454b3ed2d11.

## Delivered behavior

Adding another container retains the currently opened one. Each imported MKV can be opened using its existing source selector; no automatic merge, output generation or separate inspection mode is introduced.

A session-only WeakMap binds inactive drafts to the exact imported File. It retains the existing source-domain session and validated trackState projection, including source audio/subtitle attributes/order, attachment include/name/MIME and preserve-mode controls. The adapter validates both before storage and before retrieval; then rejoins only the source subset with the current external-resource domain in the existing single workspace authority. It creates no second writable source model.

Returning to a source re-reads its Matroska header before restoring its draft and avoids an automatic rescan overwriting authored fields. A failed draft validation blocks writing until the user explicitly rescans. An explicit rescan drops the saved draft. Removing an imported File deletes its shelf entry; a same-name/size/mtime replacement cannot borrow a prior File's draft. Repeated change events keeping the exact active File preserve authored state while still re-reading the header.

The source-selector wording is now Open, with a file-specific accessible name. The current opened source remains the existing writer's source when the user explicitly generates an output.

## Evidence actually obtained

- Baseline 764 Node tests passed; final 767 passed, zero failures/skips. Build passed, retaining the existing large-chunk advisory.
- Source shelf tests observed RED→GREEN for A/B identity separation, forged/mutated executor rejection and explicit deletion.
- Independent reviewer identified a same-exact-File change-event loss. A real Chromium reproduction first failed (preserve mode reverted to defaults), then passed after the active source was also saved before reset.
- Actual native FFmpeg fixtures A/B contain video, audio, ASS and a real TTF attachment. The built application authored different A/B audio titles and attachment names, switched A→B→A, and exported two real MKVs. Native FFprobe confirmed Authored A/A-edited.ttf and Authored B/B-edited.ttf separately. Original source SHA-256 remained unchanged.
- No output was generated merely by opening or switching. Adding B retained A. Same-File change retained A. Removing A and reimporting the same path restored original source values. Historical A output evidence became stale when B was opened.
- 1440 desktop plus 1024/768 viewport source switching passed through the actual source drawer. Viewport simulation is not physical-tablet evidence.
- Existing candidate-subtitle/media and attachment-only focused browser regressions also passed locally. New full-suite CI uploads both MKVs, JSON receipts and viewport screenshots.

## Explicit boundaries

This shelf is for source-side edits within the current browser session, not full independent per-target external subtitle/font recipes, durable File permissions, cross-reload recovery, output artifacts or restoration of prior undo/approval receipts. Current external resources retain their existing shared workspace semantics. Source bytes are not rehashed merely on navigation; final writer preflight, actual output audits and source-bound execution checks remain unchanged. Generic multi-source track merging and arbitrary EBML writing remain unsupported.

1.0 is not released by this unit. Complete release-contract reconciliation, final candidate verification, physical devices and deployment/rollback evidence remain open.
