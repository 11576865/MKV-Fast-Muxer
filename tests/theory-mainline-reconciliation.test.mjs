import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileTheoryMainline } from '../scripts/reconcile-theory-mainline.mjs';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ledger = load('../docs/ten-round-sprint-20261015/acceptance-ledger.json');
const snapshot = load('../docs/theory-1.0/mainline-snapshot-20261016.json');
const mutate = fn => { const s = structuredClone(snapshot); fn(s); return s; };

test('R0 reconciles observed PR activity without changing 57-case proof denominator', () => {
  const old = structuredClone(ledger);
  const report = reconcileTheoryMainline(ledger, snapshot);
  assert.equal(report.original_acceptance.total_scenarios, 57);
  assert.equal(report.original_acceptance.high_priority_scenarios, 51);
  assert.equal(report.original_acceptance.target_verified, 39);
  assert.equal(report.original_acceptance.accepted_verified, 0);
  assert.equal(report.automatic_verified_promotions, 0);
  assert.deepEqual(ledger, old, 'reconciliation must be read only');
  assert.equal(report.main_changed_since_ledger_baseline, true);
  assert.equal(report.rounds.length, 10);
});

test('Round7, Round8 and release contract activity cannot be confused with completion', () => {
  const result = reconcileTheoryMainline(ledger, snapshot);
  for (const round of [7, 8, 10]) {
    const r = result.rounds[round - 1];
    assert.equal(r.historical_ledger_state, 'planned');
    assert.equal(r.discrepancy, 'ledger_planned_but_related_activity_observed');
    assert.equal(r.acceptance, 'NOT_EVALUATED_BY_THIS_TOOL');
  }
  assert.deepEqual(result.rounds[6].open_related_prs, [150, 151]);
  assert.deepEqual(result.rounds[7].merged_related_prs, [153, 155]);
  assert.deepEqual(result.rounds[9].merged_related_prs, [156]);
});

test('closed/unmerged direct R2 PR is not treated as proof of missing integrated functionality', () => {
  const r = reconcileTheoryMainline(ledger, snapshot).rounds[1];
  assert.equal(r.historical_pr, 143);
  assert.deepEqual(r.merged_related_prs, [148]);
  assert.match(r.relation_scope, /semantic main diff/);
  assert.equal(r.acceptance, 'NOT_EVALUATED_BY_THIS_TOOL');
});

test('missing or duplicated PR identity is rejected', () => {
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.pull_requests.push({...x.pull_requests[0]}))), /THEORY_RECONCILIATION_PR_FACTS/);
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.round_links[6].prs.push(99999))), /THEORY_RECONCILIATION_ROUND_LINKS/);
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.round_links.pop())), /THEORY_RECONCILIATION_MISSING_ROUND_LINK/);
});

test('forged or contradictory GitHub observations fail closed', () => {
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.main_sha = 'not-a-commit')), /THEORY_RECONCILIATION_HEADER/);
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.repository = 'some-other/repository')), /THEORY_RECONCILIATION_HEADER/);
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x => {
    const p = x.pull_requests.find(p => p.number === 150); p.merged = true;
  })), /THEORY_RECONCILIATION_PR_FACTS/);
  assert.throws(() => reconcileTheoryMainline(ledger, mutate(x =>
    x.pull_requests[0].url = 'https://example.invalid/pull/142')), /THEORY_RECONCILIATION_PR_FACTS/);
});

test('read-only reconciliation must not accept an unproven full original scenario', () => {
  const forged = structuredClone(ledger);
  forged.requirements.find(r => r.id === 'T-014').state = 'verified';
  assert.throws(() => reconcileTheoryMainline(forged, snapshot), /VERIFIED_WITHOUT_EXACT_INDEPENDENT_PROOF/);
});
