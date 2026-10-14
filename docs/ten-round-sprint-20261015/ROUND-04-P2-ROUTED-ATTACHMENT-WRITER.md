# Round 4 / P2 — one route selector for four real bounded existing-MKV FileData writers

**Submitted-only engineering slice. Full exact-head Node, Vite, Chromium + independent native output CI remain Pending.** Parent dependencies: #142 (two workflows exact-head succeeded, still Draft/unmerged); #143 and #144 (Draft, no exact-head runs observed at kickoff). This branch is stacked on #144 at `a305dde5486c068f689d45f340dfdd457e02c5b8`.

## Rationale: integration, not a fifth writer

As of #141, four distinct source-edit operators existed as separate small UI drawers. Each has its own narrow geometry and self-audit, but a user must understand whether the original FileData size matches, whether adjacent Void exists, whether Attachments is the last Segment child, or whether indexed nonterminal Attachments supports chained SeekHead. This is writer-selection logic, not a fifth way to rewrite EBML.

This round adds:
- `src/p2-existing-mkv-writer-router.js`: one `prepareRoutedAttachmentReplacement` that reads REAL source raw EBML, attachment FileUID inventory and TagAttachmentUID graph before dispatch, and never accepts a referenced FileUID. On equal byte length it tries only the existing same-size operator. On unequal length it tries **adjacent Void → terminal Attachments size rewrite → nonterminal chained SeekHead relay** in order, each through its existing standalone capability checks.
- A plan has **opaque WeakMap session bindings** and a required explicit review. The plan reports route, original target metadata and SHA-256, not a general writer grant. If no proven operator is available, it returns a typed refusal with individual backend diagnostics, **not** FFmpeg remux fallback. Invalid CRC, malformed or changed sources must not be reinterpreted as compatibility success by another route.
- `executeRoutedAttachmentReplacement` consumes the plan once; first the selected existing writer performs all original byte geometry, Segment/SeekHead/CRC, field size, offsets, attached payload, and primary audit. A *second, common* independent source/candidate pass checks every original unmodified FileUID, filename, MIME and payload SHA-256; full TagTarget relation graph parity; all protected non-SeekHead top-level bytes at original positions, including Clusters, Chapters, Tags, Cues, Tracks and unknown known-eligible elements; source and new input SHA-256 before and after. The output is an independent copy with native validation explicitly **Pending**.
- `src/p2-existing-mkv-writer-router-ui.js`, `index.html`, `src/main.js`: one real opt-in Advanced drawer to choose source, real FileUID, payload and explicit review, generate and display reviewed route+SHA-256, then manually download the audited new copy. Existing 4 individual drawers remain as backward-compatible bounded interfaces until their behavior and UX migration have actually passed browser tests; this round does **not** delete them.

## Required tests

`tests/p2-existing-mkv-writer-router.test.mjs` has synthetic valid Matroska with nonzero TagAttachmentUID to a different attachment and nested ChapterAtom:
- equal size → same-size;
- adjacent Void + growth → adjacent-void;
- no Void, Attachments at Segment EOF → tail-resize;
- no Void, nonterminal indexed Attachments → chained seekhead-relay.
Each test must verify returned actual Blob, UID and source attachment bytes, new FileData bytes, original source SHA, route and no leaked writer authority. Separate negatives: referenced target UID, unknown top EBML, stale SeekHead, absent review, forged/replayed plan.

New `scenarioRoutedExistingMkvNativeOutput` in full Chromium uses **independent MKVToolNix/mkvpropedit-authored real complex source**, two attachments and nested Chapters with target Tag, then the unified actual UI replaces the unreferenced FileUID by same-size bytes. The test saves actual browser output and uses independent `mkvmerge -J`, `mkvextract chapters`, `mkvextract tags`, and `mkvextract attachments` to verify unchanged identities and raw chapter/tag XML plus exact replacement byte payload.

**The tests are authored, not claimed passed.** The connector-only environment cannot clone GitHub by local DNS; CI exact-head results are authoritative. If green Node but red real Chromium/native output, fix the actual failure and do not advance P2 acceptance.

## Explicit limits

No general Matroska writer, Chapters/Tags modification, arbitrary UID relinking, CRC-covered SeekHead rewrite, unknown top EBML editing, ordinary huge-media writer, audio-only product completion, source overwrite, save transaction or external player acceptance. This router does not replace the legacy FFmpeg mux pipeline or independent frozen BatchJobPlan.

**Two levels of evidence remain separate:** output Blob-local metadata/bytes audit versus native tools and device/player compatibility. Do not count this as P2 fully complete or as proof that the 75% target is reached. The retained individual writers are only approved for their own already validated scopes; a router does not broaden them.
