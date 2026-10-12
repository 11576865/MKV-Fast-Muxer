# ContainerDocument v0 — P1 read-only vertical slice

Status: **implementation submitted for asynchronous CI; not production-authoritative**.
Base: \`main@0b2d2a502e015374043f0bf664fbacd2cc14b82c\`.

## What changed

- \`src/container-document.js\` builds a **read-only, source-scoped snapshot** from the existing single-file source scan, edited source tracks, external audio/subtitles and font inputs.
- The actual composition display and click-to-edit lookup in \`src/main.js\` now read through \`buildContainerDocument(...).composition\`. They still dispatch edits to the *existing* legacy editors; no duplicate mutable track collection is introduced.
- The displayed legacy row IDs remain unchanged for compatibility. A separate \`sourceKey\` scopes object identities in the snapshot, and \`reconcileContainerSelection\` clears stale selection when the main source changes.
- The snapshot adds **inspection-only** entries for source data/other streams, ffprobe-flat chapters, and global tag names. Their \`included: null\` is deliberate: they cannot be called preserved or excluded on the basis of the output-composition UI.
- A no-video/only-resource projection is inspectable, but remains **non-executable** under the existing video-rooted writer. \`execution.wholeEbmlPreservation = 'unverified'\` even if the original streams appear in the UI.
- Collision detection reports duplicate legacy projection IDs without claiming content-derived uniqueness. Current IDs use path/name/size/mtime heuristics, not hashes.

## Authority and invariants

| Concern | Authority |
| --- | --- |
| Source streams and metadata | Existing ffprobe-backed \`trackState\` |
| Source-track editable state | Existing single-file editor |
| External audio/subtitle/font selection | Existing editor/input state |
| Visible output composition | \`ContainerDocument.composition\` (derived snapshot) |
| Command arguments, staging, mux, output audit | **Unchanged legacy execution path** |
| P0 nested chapters/targeted tags | **Unchanged** \`preservation-preflight.js\`; Issue #77 remains OPEN |

The v0 document does **not** replace \`trackState\` or become a second writable domain database. Its structured objects are scoped views, not universal Matroska node identities.

## Verification contract

\`tests/container-document.test.mjs\` covers:

1. Equality with legacy output-composition projection and absence of trackState mutations.
2. Source namespace and stale selection rejection across source changes.
3. Header-only sources remain unverified rather than acquiring invented streams.
4. Data streams/flat chapters/global metadata remain explicitly observational.
5. Resource-only plans do not imply writer support.
6. Legacy ID collisions are diagnosed instead of silently called unique.

\`tests/composition-workspace.test.mjs\` asserts the runtime UI uses the new projection entry point while retaining its original action routes.

The branch/PR CI determines actual Node/Vite/Chromium outcomes. **No passing CI, real-media proof or release is claimed by this document.**

## Next P1 slices (not part of v0)

- Establish durable \`SourceAsset\` and \`ContainerDocument\` object identities beyond file metadata heuristics.
- Define explicit \`EditIntent\`, write scope and plan version; migrate *one* legacy subtitle operation with dual-path equivalence tests before extending mutation ownership.
- Add full preservation-capability / risk provenance to object-level planned edits without confusing a preflight permit with a preservation certificate.
- Extract independent \`JobPlan\` / executor APIs before migrating legacy batch UI orchestration.
- Keep the independently reproduced #77 failure corpus; do not “fix” it by weakening the oracle or enabling unsafe writer fallbacks.
