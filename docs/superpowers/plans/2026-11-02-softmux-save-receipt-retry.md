# Save receipt retry implementation plan

Goal: retain a reachable save-only retry for a newly selected directory after a previous directory was successfully saved.
Spec: `docs/softmux-1.0-product-acceptance-contract-20261020.md`, S11. Existing convergence plan authorizes inline execution.

Root cause: `createSingleOutputDirectorySaveSession().receipt` still contains directory A's success after a save into directory B throws before returning a receipt (for example name collision). The UI has already selected B but hides its retry button based on A's saved flag.

- [x] Reproduce with a unit test and current-workbench browser path: actual MKV -> save A -> cancel picker -> conflict in B -> remove conflict -> only retry B. Verify no overwrite and unchanged output bytes/log.
- [x] Clear the visible session receipt only when an authorized save attempt starts; keep generated artifacts and registry per-directory readback checks. A cancelled picker never calls save and keeps the prior success.
- [x] Check report-only permission failure/retry, corrupted readback and original download survival with the same actual output.
- [x] Run full Node tests/build, independent native FFprobe and fresh review. Wire mandatory artifacts; persist task/PR and stop after one immediate CI status read.

Constraints: no new mux on save-only retry; no overwritten conflicting files; no JSON/native File permission recreation; formal S11 stays unassessed until exact-candidate/device evidence.

Verification: unit and real-browser RED on prior build, GREEN after clearing the per-attempt visible receipt. 800/800 Node tests, production build and actual-browser/native output checks passed. Full exact-head CI remains pending. Registry directory identity, ownership checks and overwrite refusal are unchanged.

Fresh whole-branch review: no material findings; reviewer independently ran all 8 targeted session tests.
