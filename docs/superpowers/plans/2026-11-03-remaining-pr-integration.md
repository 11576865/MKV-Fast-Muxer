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
- [ ] Consolidate isolated research and independent audits with provenance; run all imported focused Node tests.
- [ ] Preserve controlled attachment cardinality fixture support; retain current native oracle and exact count/hash checks.
- [ ] Run full Node/build, native research oracle and relevant real-browser research proof; request independent whole-branch review.
- [ ] Push one coherent integration commit, merge, close all nine old PRs with exact disposition; persist terminal task state.

## Decisions
- Ruling: preserve research source files as research-only without connecting them to the production UI. Cost if wrong: research remains unavailable to end users rather than granting an unproven writer.
- Ruling: known failing historical P0/stress branches are superseded, not blindly merged. Their oracle and evidence remain available; product limitations remain explicit.
