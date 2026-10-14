import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditTheoryLedger } from '../scripts/verify-theory-sprint-ledger.mjs';

const baseline = JSON.parse(readFileSync(
  new URL('../docs/ten-round-sprint-20261015/acceptance-ledger.json', import.meta.url), 'utf8'));
const changed = edit => { const copy = structuredClone(baseline); edit(copy); return copy; };

test('fixed theory IDs: 10 decisions, 8 phases, 57 cases and 75% high-priority gate', () => {
  const x = auditTheoryLedger(baseline);
  assert.equal(x.total_scenarios, 57);
  assert.equal(x.high_priority_scenarios, 51);
  assert.equal(x.target_verified, 39);
  assert.equal(x.accepted_verified, 0, 'historical partial PRs are not automatically full-scenario acceptance');
  assert.equal(x.partial, 9);
});

test('removed or duplicate original acceptance cases cannot improve the denominator', () => {
  assert.throws(() => auditTheoryLedger(changed(x => x.requirements.pop())), /MISSING_/);
  assert.throws(() => auditTheoryLedger(changed(x => x.requirements.push(x.requirements[0]))), /DUPLICATE/);
});

test('a previous PR link or partially scoped proof cannot be relabelled verified', () => {
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.requirements.find(r => r.id === 'T-014').state = 'verified';
  })), /VERIFIED_WITHOUT/);
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.requirements.find(r => r.id === 'T-011').state = 'verified';
  })), /VERIFIED_WITHOUT/);
});

test('P0 complex Chapter/Tag loss stays visible and unsafe remux cannot be certified by fiat', () => {
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.safety.legacy_remux_complete_preservation = 'proven';
  })), /FALSE_P0/);
  assert.throws(() => auditTheoryLedger(changed(x => {
    const r = x.requirements.find(r => r.id === 'R-01');
    r.evidence = []; r.state = 'unassessed';
  })), /HISTORICAL_P0/);
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.safety.unknown_layout = 'attempt-write';
  })), /SAFETY_GATE/);
});

test('PR submission, exact-head CI and accepted release are different statuses', () => {
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.rounds[0].state = 'submitted';
    x.rounds[0].head_sha = null;
    x.rounds[0].pr = null;
  })), /ROUND_SUBMITTED_WITHOUT/);
  assert.throws(() => auditTheoryLedger(changed(x => {
    x.rounds[0].state = 'accepted';
    x.rounds[0].head_sha = 'a'.repeat(40); x.rounds[0].pr = 142;
    x.rounds[0].ci = 'pending';
  })), /ROUND_ACCEPTED_WITHOUT_CI/);
});
