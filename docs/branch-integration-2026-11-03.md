# 2026-11-03 remaining historical PR consolidation

Baseline: `2c06a49788152e863cd4a899f010053b0d63e458`, Softmux 0.1046.
Scope: all nine open historical PRs. Historical remote branch refs and the maintenance/outbox branches are not automatically deleted or merged.

| PR | Integration disposition |
|---|---|
| #196 | Add the isolated Void-resident SeekHead repair, six negative/positive Node cases, dated research report and non-publishing observation in the accepted current S12 oracle. Keep current CueTrack/Block checks. |
| #179 | Retain the exact verified 1GiB-era research implementation, including equal-span shadow input, original SeekHead integrity preflight, source identity checks, native and browser independent oracles. No production UI entry. |
| #181 | Retain the dated decision record. Its implementation regressed to a 340MiB branch and is not a superset of #179; do not replace #179 with it. Its cancelled exact-head research run is not success. |
| #176 / #178 | Earlier research generations superseded by #179; retain lineage and original PR history, rather than merge duplicate older versions. |
| #174 | Preserve controlled 32/64/128MiB original-attachment fixture geometry and exact count verification. Retain the genuine large-envelope workflow as an explicit diagnostic dispatch; known historical failures remain failures. |
| #170 | Source staging already integrated through #172; later accepted current native oracle retained. No rollback of src/main.js, source staging or package version. |
| #154 | Preserve historical UI audit, machine baseline, capture script and original screenshots. Add a historical-status annotation; no UI redesign or acceptance promotion. |
| #76 | Preserve independent semantic/attachment comparator, XML hierarchy/UID projector and nine focused negative tests. Keep current independent fixture generator and current fail-closed product regression. Do not reactivate the historical known-failing unsafe writer route. |

Exact PR heads and one-read historical CI observations: [machine record](branch-integration-2026-11-03.json).

## What changed

Research code stays under `research/`, outside the production bundle and with no import from `src/`. Its standalone browser pages are development-only experiments. Only an explicitly dispatched research workflow starts the large dual-path experimental matrix. A successful research Blob does not confer writer/publication authorization.

The existing scoped S12 oracle observes Void feasibility on the unchanged original and actual downloaded output. It never replaces either file or downloads a research Blob. Existing CueTrack/Block checks, exact original attachment SHA checks and final source SHA check remain. The ordinary scoped workflow includes repairer/test path triggers so a later change cannot evade its three real native tiers.

The cardinality stress workflow is manually dispatched because historical OOM/refusal tiers are diagnostic evidence, not green release gates. No `continue-on-error`, weakened assertions or renamed successful verdicts were introduced. Dispatch runs still fail on an actual failure and preserve bounded receipts.

No change to `src/`, `index.html`, `package.json`, any 14/44/57 verdict, production writer permission, product version or physical-device acceptance.

## Validation

- `npm test`: **854/854** passed (839 existing + 15 imported preservation/XML/repair tests).
- `npm run build`: passed; existing bundle-size advisory remains.
- `git diff --check`: passed.
- New native/browser experimental paths have historical exact-head evidence recorded in the machine record. Their new combined-tree execution is **Pending External Validation**, not passed. Local environment lacks Chromium, FFmpeg and MKVToolNix.
- #76 historical native/browser preservation failure and #174 historical large-envelope failures remain explicitly recorded. Consolidation is not a declaration that they now pass.
- UIGS Intake: Checked; this preserves existing research and previously recorded failures, without new reusable findings or Canonical promotion.

## Decisions and limits

- Preserve #179 rather than overwrite it with the narrower #181 code. Cost if wrong: a later researcher must consult both historical PRs; no product writer is enabled.
- Keep known failing diagnostics explicit/manual, rather than introduce them as always-red release gates. Cost: researchers must deliberately dispatch these expensive experiments.
- Preserve historical evidence without treating it as current UI specifications. Cost: current behavior still requires current-head acceptance.

## Independent review

Fresh whole-branch review: no Critical/Important integration findings. The reviewer independently reran all 15 imported tests successfully, confirmed the nine #179 implementation/oracle files exactly match `e54e31a`, no production imports or bundled research assets, and no weakening of existing S12 checks.

Deferred minor: the simplified `research/s12-browser-byte-lane.mjs` page can change selection during an async combination, retain old evidence, and download a result bound to the older File. It is historical research code, not production UI. The separate Wasm research page has epoch/File identity guards; its guarantees must not be attributed to the simplified page. This inherited research UI limitation remains open and must be fixed before treating that page as a product flow.

## Terminal integration result

PR #225 merged into main as `003c2364163da4a8f9778c32a6b69d8b605d4bf7`. All nine historical PRs were closed only after fresh exact-head checks and supersession notes. The repository open-PR inventory was independently fetched after closure and was empty. Historical refs are retained. External combined-tree/browser/native/deployment validation remains pending; this is a completed integration unit, not a completed 1.0 release.

## 2026-11-03 external validation closure

- Exact reviewed head `b9e67fa`: Browser run41577638418 and scoped S12 run41577638387 succeeded.
- Merged main `003c236`: full Browser run41577657294 succeeded, including twenty actual batch deliveries and independent media checks.
- Latest checkpoint `68d5bb4`: Pages run41577802627 build and deploy jobs both succeeded. The cancelled PR deployment was superseded, not failed product validation.
- Actual Void observation: 128MiB attachment original and downloaded output yielded research-only validated Blobs;512MiB/1000MiB PCM both refused repair for insufficient reserved bytes (deficits2896/5463B). Underlying actual mux tiers passed; a repair refusal is not a repair PASS. No file replaced or research Blob published.
- Complete machine receipt: `branch-integration-validation-2026-11-03.json`. Manual dual-path experiments and physical-device acceptance remain outside this closure.
