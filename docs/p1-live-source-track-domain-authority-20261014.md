# P1: live source-track ContainerProject authority — integrated bounded migration

Date: 2026-10-14  
Base: `main@1583570d59234a965c180b22a8fc24707703a24e` (merged #125)  
Status: **implemented on feature branch, exact-head Node/build/Chromium Pending**  
Scope: only the user-approved Matroska P1 migration of existing source audio/subtitle track fields.

## Why this exists

The P1 workbench already emitted a detached `ContainerProject` with user-visible edit deltas and could explicitly re-apply a verified imported draft, but **normal editing continued to mutate the legacy `trackState` directly**. Adding another read-only projection or another “review” panel would not migrate ownership. This change introduces an actual *live immutable domain owner*, while retaining the proven FFmpeg data path.

## Domain and execution architecture

```text
actual File + completed ffprobe scan
       -> ContainerDocument (observed source-scoped projection)
       -> LiveSourceTrackSession { immutable ContainerProject }
       -> UI command (single field or bulk logical transaction)
       -> new immutable ContainerProject revision(s)
       -> synchronous derived legacy trackState projection
       -> existing FFmpeg mux preflight, writer, final audit
```

`src/live-source-track-authority.js` owns precisely these source-bound **audio and subtitle** properties: `include`, `title`, `language`, `default`, `forced`. A concrete successfully scanned browser `File` reference, track inventory and key are bound at initialization; replacing the File object, changing its track collection or bypassing the domain owner fails closed. An action validates all selected edits and creates new immutable project state **before** mutating any execution-facing track object. The FFmpeg path still reads exactly the same legacy fields; no second mux writer or standalone permission is introduced.

The migration connects the actual `src/main.js` entry points: central source inventory inspector, traditional source track form change/input, per-type bulk language, Default assignment/clear, include/exclude all, metadata reset, and scan/session setup. A verified detached import replay or guarded undo deliberately **reseeds** the owner from the now-authorized legacy state. Text input uses bounded edit-history compaction rather than failing after 100 keystrokes. Compaction preserves the effective semantic state and deliberately does not claim a permanent chronological edit journal.

## Not migrated (and not falsely asserted)

- Advanced source dispositions `original`, `commentary`, `hearingImpaired` are still legacy-owned; exclusion clears them under the previous user-facing rule.
- Source-track ordering, source attachment filename/MIME/include, external audio/subtitles, new fonts, chapters, Tags, advanced ffprobe structure and batch JobPlan are not yet immutable project-owned.
- This does not provide global `ContainerProject` single write authority, persist browser File grants, grant writer permissions, solve nested Chapter / targeted Tag preservation (#77), or certify output from domain state alone.
- There is **no automatic import replay**. Imported detached JSON remains untrusted; SHA commitment, source exact identity, old field values, user confirmation and the independent writer preflight still gate replay.

## Required verification

`tests/live-source-track-authority.test.mjs` covers domain-owned changes, bulk transaction rollback on invalid edit, stale File and source state, long typing beyond history budget, no-op & preserve-all, exclusions and advanced fields intentionally outside scope. One lightweight execution of actual module functions and real composition projections passed, including 150 consecutive title characters and atomic invalid edit rejection.

`tests/e2e/browser-mux.e2e.mjs` exercises real browser source MKV scan → bulk language/Default → normal track title → subtitle include off/on → **actual mux** → independent `ffprobe` output check (two audio languages, flags, title and retained subtitle). The existing source tree, responsive, original track writer and source attachment regressions remain in the same suite.

Exact-head Node/Vite/real Chromium outcomes are **Pending** until CI publishes actual results. Do not infer field-device or complex structure safety from a Node pass or the source-only E2E.

## Execution cadence

Build one coherent branch and submit one PR. Full CI is run asynchronously on PR; no repeated tests after every small file edit. Any concrete CI failure is repaired in a later bounded generation after examining the first failure evidence.
