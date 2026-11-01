# Multiple imported MKV source drafts

Goal: switch imported A→B→A without losing each source's audio/subtitle metadata, attachment edits, order or preserve mode. Keep current source open when importing another container. No new inspect-only mode, automatic merge or output; no external-resource-per-target rewrite.
Architecture: a session-only WeakMap keyed by the exact imported File holds the existing validated source-track session and its executor projection. Revalidate before storage and retrieval. On return, re-read the header first and reconcile the stored source subset with the current external-resource authority. Never restore File permissions, output artifacts, checkpoint approvals or undo receipts from this cache. Removed File entries delete their draft; same-metadata replacements cannot inherit it.

Tasks:
- [x] Write failing tests for exact-reference A/B draft separation, invalid projection rejection, take/delete semantics and replacement identity.
- [x] Implement the source-only shelf over existing inspectLiveSourceTrackSession; integrate before source reset and after fresh Matroska header identity.
- [x] Keep active source when importing B; expose current source switching as opening a container, not implicit merge.
- [x] Real browser regression: edit A and B track/attachment fields, switch back, output each, independently check actual source-specific metadata and attachments; check removal and no spontaneous generation.
- [x] Full Node/build, focused Chromium regressions, independent review, durable submission and exact-head CI.

Review focus: fresh identity/header before restore; source-only cached authority joined to one current workspace; no stale File/name replay; imported-file lifetime; manually chosen legacy inputs; existing rescan and batch behavior.
