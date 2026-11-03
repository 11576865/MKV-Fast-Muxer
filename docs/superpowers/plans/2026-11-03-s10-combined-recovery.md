# S10 combined batch fault recovery verification

> Execute inline using executing-plans; the user has repeatedly authorized continuing the existing 1.0 plan.

Goal: prove one actual default-workbench 20-job batch preserves successful artifacts across two execution faults and one report-only directory write failure, with independent native output checks.
Spec: docs/softmux-1.0-product-acceptance-contract-20261020.md S10/S11. No product behavior/version or verdict changes unless a concrete failing behavior requires repair.

- [x] Add a standalone actual Chromium/FFmpeg.wasm scenario: invalid pair refuses execution;20 valid frozen jobs, faults on mux attempts2/11, first report write refused once.
- [x] Verify initial18 successes/two failures; recover report without another mux or MKV rewrite; edit live inputs then retry only two frozen failures. All20 native outputs must retain source packets, subtitles/timestamps, fonts and exact report/directory SHA; single-project File identities and input bytes unchanged.
- [x] Run actual local scenario, full Node/build; retain machine receipts and integrate as a mandatory CI step with always-uploaded receipt.
- [ ] Independent review, durable branch/PR and one exact-head CI status read. Do not promote formal S10/device acceptance from one bounded run.

Review focus: failures do not change retained URL/bytes; save-only retry does not remux or rewrite MKV; failure retry uses frozen original choices despite live changes; wrong pairing produces no output; directory API simulation does not imply physical-disk durability.

Local actual scenario passed20/20,22attempts40unique writes. Ruling: unified intake is additive; explicit inventory removals express changes without silently replacing File authority. Invalid pairing yields zero executable jobs. No production fix required.

Final review: one Important stale receipt corrected through isolated output directory plus validated20-output rerun; no Critical. Minor (deferred): exact shared-font identity oracle, count alone does not establish bytes/name. Native font identity is not claimed.
