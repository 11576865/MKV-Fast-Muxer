# S10 combined batch fault recovery verification

> Execute inline using executing-plans; the user has repeatedly authorized continuing the existing 1.0 plan.

Goal: prove one actual default-workbench 20-job batch preserves successful artifacts across two execution faults and one report-only directory write failure, with independent native output checks.
Spec: docs/softmux-1.0-product-acceptance-contract-20261020.md S10/S11. No product behavior/version or verdict changes unless a concrete failing behavior requires repair.

- [ ] Add a standalone actual Chromium/FFmpeg.wasm scenario: invalid pair refuses execution;20 valid frozen jobs, faults on mux attempts2/11, first report write refused once.
- [ ] Verify initial18 successes/two failures; recover report without another mux or MKV rewrite; edit live inputs then retry only two frozen failures. All20 native outputs must retain source packets, subtitles/timestamps, fonts and exact report/directory SHA; single-project File identities and input bytes unchanged.
- [ ] Run actual local scenario, full Node/build; retain machine receipts and integrate as a mandatory CI step with always-uploaded receipt.
- [ ] Independent review, durable branch/PR and one exact-head CI status read. Do not promote formal S10/device acceptance from one bounded run.

Review focus: failures do not change retained URL/bytes; save-only retry does not remux or rewrite MKV; failure retry uses frozen original choices despite live changes; wrong pairing produces no output; directory API simulation does not imply physical-disk durability.
