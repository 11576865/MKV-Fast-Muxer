# S10/S11 combined recovery slice — 2026-11-03

The prior20-output baseline, execution retry and report-only retry were separate scenarios. This slice verifies their composition in one actual default-workbench batch. No production behavior or version change was needed.

## Actual bounded workflow

1. Import unmatched video/subtitle inputs: zero executable jobs, Start disabled, no worker mux attempts or results. Remove those Files explicitly before selecting a new valid batch; same-label File objects are not assumed interchangeable.
2. Review20 real video/subtitle pairs and one shared font in the default workbench, with an independent single-project draft already loaded. Sources are separately named Files derived from two real2-second MPEG-4/AAC fixtures, alternating ASS and SRT.
3. Inject nonzero worker EXEC results only for mux attempts2/11. Inject one directory quota failure before creating the first report file. All successful results use the actual FFmpeg.wasm worker and actual native tools.
4. Verify initial18 generated/audited outputs, two execution failures and one report-only save warning. Recover the report without another mux or rewriting its already saved MKV.
5. Remove episode2's subtitle and the shared font through the actual current batch inventory. The live plan now has19 jobs. Retry the two retained failures; each adds exactly one actual mux and still uses its frozen original Files. The18 prior result URLs remain identical.
6. Download all20 final MKVs and reports. Native FFprobe/FFmpeg verifies exact A/V packet hashes, one correct subtitle, retained font inventory, all SRT text/millisecond timings, and all ASS event times/style/text. Report SHA and directory-byte SHA equal every downloaded actual file. Original source/subtitle file hashes and single-project exact File objects remain unchanged.

## Results

- Actual Chromium153/FFmpeg.wasm local scenario: **PASS**,20 native-verified outputs,22 mux attempts,40 unique completed directory member writes, zero uncaught page errors.
- `npm test`:854/854 passed; `npm run build`: passed. New script syntax, CI YAML and whitespace checks passed.
- Standalone runner: `node tests/e2e/batch-recovery-real.e2e.mjs` after normal fixture generation/build/preview startup. Supports the existing E2E_BASE_URL/E2E_BROWSER_EXECUTABLE/E2E_FIXTURE_DIR environment overrides.
- Mandatory Browser CI step added after the existing20-success baseline; receipt and representative actual outputs always uploaded, including failure receipts. Exact-head full CI remains pending until observed.
- Durable local receipt: [evidence/s10-combined-recovery-20261103.json](evidence/s10-combined-recovery-20261103.json); CI receipt: `.e2e/batch-recovery-output/s10-combined-recovery-evidence.json`; sample recovered outputs E02/E11 and report-recovered E01 are retained as CI artifacts.

## Boundaries

The directory API is a controlled in-memory handle, not physical disk durability. Twenty short repeated media templates do not prove twenty heterogeneous films, device memory, tablet interaction, reload recovery or power-loss safety. This slice does not promote the formal S10/S11 verdicts or any14/44/57 acceptance row. Native font inventory is checked, not full shaping or multi-face collection acceptance.

Initial harness corrections: unmatched inputs correctly yield zero job rows, and unified intake adds resources rather than replacing a live selection. The scenario now uses explicit inventory removals for both setup and post-failure mutation. These were test assumptions, not product defects; no product gates or assertions were weakened.
