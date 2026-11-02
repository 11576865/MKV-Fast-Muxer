# Unified workspace edit history

Goal: deliver a visible, usable multi-step undo/redo workflow for supported single-project authoring. S09 is the binding scope; this supersedes another repair-only unit at the user's request.
Architecture: the existing live workspace dispatcher records its accepted immutable project revisions in a private bounded session history. Undo/redo first verifies both executor projections and exact File bindings, then projects a fresh immutable revision into the same existing adapters. It never reads imported history as authority or serializes File permission.

- [x] Test and implement 50-step bounded history across source audio/subtitle metadata/membership/order, original attachment include/name/MIME, external audio/subtitle fields/membership and font mode.
- [x] Test inverse flag restoration, branch truncation, coalesced text entry, no-op behavior, stale File/projection rejection without partial mutation, source rebind/reset and out-of-dispatch recovery invalidation.
- [x] Add visible Undo/Redo, next-action labels and operation list in the existing inspector. Keyboard shortcuts respect native text-field undo. Busy execution blocks travel; preserve-all blocks source travel.
- [x] Real current-workbench scenario edits across domains, travels backward/forward, creates actual MKVs at each state and independently checks native metadata/attachment bytes. Add mid-history branch and File rebind checks.
- [x] Run Node suite/build, browser regressions and fresh review; persist task, branch and PR.

Scope is supported metadata authoring in the current bound task, not adding/removing/rebinding input files, font-subset checkbox, preserve-all switch, chapters/Tags experimental writers, generated files or arbitrary imported recovery. These boundaries are visible in the UI. Rebinding or applying a recovery starts new history. An existing generated output remains a historical output, not proof that restored edits were executed.

Validation: 806/806 Node tests, build and actual history scenario passed; source audio order/title, included external subtitle title, subtitle counts, original attachment name/content independently checked in all 3 MKVs. Fresh review: no material findings; its external-title evidence limitation was addressed by retaining the renamed subtitle and excluding a separate second subtitle. Recovery reset RED/GREEN included. Full CI pending after PR.

Final regression: candidate preview/membership actual-output scenario passed. Busy execution locks both history controls; old output evidence is stale after undo and redo before re-execution.
