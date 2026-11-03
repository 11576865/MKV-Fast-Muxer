# Remaining historical PR integration plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. The user has explicitly authorized completing integration in this turn without another handoff.

**Goal:** Resolve all nine remaining open PRs by integrating useful independent evidence and isolated research, preserving known failures and current production behavior.
**Architecture:** Start at main 2c06a497. Preserve the current application and release ledger. Consolidate research lineage using the verified #179 implementation plus #181 decision record, #196 isolated repair and tests, #174 controlled fixture geometry, #154 historical UI audit and #76 independent comparator/negative tests. Superseded or intentionally failing legacy entry points stay historical, not production.
**Tech Stack:** Git, Node test runner, Python stdlib, Vite, Chromium, FFmpeg, MKVToolNix.
**Spec:** User request “一口气和完”; repository AGENTS.md; exact PR bodies and main 0.1046.

## Global Constraints
- No src/, index.html, package version, acceptance verdict or production writer authorization changes.
- Research remains outside production build and not exposed by application UI.
- Known red pressure/P0 outcomes remain red evidence; no oracle weakening or false 1.0 claim.
- Preserve exact source SHAs, historical records and supersession links before closing old PRs.

## Review Focus
- #181 is not a superset of #179: retain verified 1GiB/shadow safety implementation, not older 340MiB code.
- #76 includes a known failing writer demonstration: integrate comparator and negatives, retain current fail-closed application tests.
- Historical UI conclusions must be dated, not promoted into current specifications.
- Stress workflows must remain explicit research executions, avoiding unintended expensive automatic release gates.
- Refuse any import from research into src/ production paths.

## Tasks
- [x] Consolidate isolated research and independent audits with provenance; run all imported focused Node tests.
- [x] Preserve controlled attachment cardinality fixture support; retain current native oracle and exact count/hash checks.
- [x] Run full Node/build and request independent whole-branch review; new combined native/browser proof is explicitly pending under the environment ruling.
- [x] Push one coherent integration commit, merge, close all nine old PRs with exact disposition; persist terminal task state.

## Decisions
- Ruling: preserve research source files as research-only without connecting them to the production UI. Cost if wrong: research remains unavailable to end users rather than granting an unproven writer.
- Ruling: known failing historical P0/stress branches are superseded, not blindly merged. Their oracle and evidence remain available; product limitations remain explicit.

## Execution record

- Consolidation tree `06c10d35a6cfd52ca4187150c4e99792ed66cf53` persisted on remote branch at `cacd84255c53829bc6636b0b6c50d5020df1e2d4`, PR #225.
- Focused tests 15/15; complete suite 854/854; build, YAML and JavaScript syntax passed.
- Ruling: this container has no Chromium/FFmpeg/MKVToolNix. Keep combined-tree native/browser checks Pending External Validation, rather than substitute historical results or fake outputs. Cost: research acceptance remains pending, production authorization remains unchanged.

- Final review: no Critical/Important issues; independent 15/15 tests passed.
- Final: minor (deferred): simplified byte-lane research page retains old input evidence during async source switching; not production, and not covered by Wasm page identity guarantees.

- Terminal: PR225 merged003c236; all nine oldPRs closed with unchanged head guards; zero openPRs verified. External validation remains pending.
