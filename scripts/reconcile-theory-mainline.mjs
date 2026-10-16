/**
 * R0: Read-only reconciliation of the original 57-scenario theory ledger with
 * separately observed GitHub PR facts. This never changes acceptance states.
 *
 * Usage: node scripts/reconcile-theory-mainline.mjs <snapshot.json> [ledger.json]
 * The snapshot must be freshly captured/confirmed by a human or GitHub client.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditTheoryLedger } from './verify-theory-sprint-ledger.mjs';

const REPOSITORY = '11576865/MKV-Fast-Muxer';
const SHA = /^[a-f\d]{40}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set(['open', 'closed']);
const fail = code => { throw new Error('THEORY_RECONCILIATION_' + code); };

function validateSnapshot(snapshot) {
  if (snapshot?.schema !== 'softmux-theory-mainline-snapshot-v1' ||
      snapshot.repository !== REPOSITORY ||
      !SHA.test(snapshot.main_sha ?? '') ||
      !DATE.test(snapshot.observed_date ?? '') ||
      Number.isNaN(Date.parse(snapshot.observed_date + 'T00:00:00Z'))) fail('HEADER');
  if (!Array.isArray(snapshot.pull_requests) || !Array.isArray(snapshot.round_links)) fail('COLLECTIONS');

  const prs = new Map();
  for (const p of snapshot.pull_requests) {
    if (!Number.isSafeInteger(p?.number) || p.number < 1 || prs.has(p.number) ||
        !statuses.has(p.state) || typeof p.merged !== 'boolean' ||
        p.merged && (p.state !== 'closed' || !DATE.test(p.merged_date ?? '')) ||
        !p.merged && p.merged_date != null ||
        p.url !== 'https://github.com/' + REPOSITORY + '/pull/' + p.number) {
      fail('PR_FACTS');
    }
    prs.set(p.number, p);
  }

  const roundLinks = new Map();
  for (const entry of snapshot.round_links) {
    if (!Number.isInteger(entry?.round) || entry.round < 1 || entry.round > 10 ||
        roundLinks.has(entry.round) || !Array.isArray(entry.prs) ||
        new Set(entry.prs).size !== entry.prs.length ||
        entry.prs.some(n => !prs.has(n)) ||
        typeof entry.scope !== 'string' || !entry.scope.trim()) fail('ROUND_LINKS');
    roundLinks.set(entry.round, entry);
  }
  if (roundLinks.size !== 10) fail('MISSING_ROUND_LINK');
  return { prs, roundLinks };
}

/**
 * The returned state is a triage hint, not an acceptance decision.
 * In particular: closed/unmerged PRs may have been integrated via another PR;
 * merged PRs do not prove full functionality, run success or deployment.
 */
export function reconcileTheoryMainline(ledger, snapshot) {
  const acceptance = auditTheoryLedger(ledger);
  const { prs, roundLinks } = validateSnapshot(snapshot);
  const rounds = ledger.rounds.map(row => {
    const link = roundLinks.get(row.round);
    const related = link.prs.map(n => prs.get(n));
    const merged = related.filter(p => p.merged);
    const open = related.filter(p => p.state === 'open');
    let discrepancy = 'no_observed_status_conflict';
    if (row.state === 'planned' && related.length) {
      discrepancy = 'ledger_planned_but_related_activity_observed';
    } else if (row.ci === 'pending' && merged.length) {
      discrepancy = 'historical_pending_ci_requires_exact_head_recheck';
    } else if (row.state === 'submitted' && related.some(p => p.state === 'closed' && !p.merged)) {
      discrepancy = 'closed_unmerged_requires_semantic_main_diff';
    }
    return {
      round: row.round,
      focus: row.focus,
      historical_ledger_state: row.state,
      historical_ci: row.ci,
      historical_pr: row.pr,
      observed_related_prs: related.map(p => ({
        number: p.number, state: p.state, merged: p.merged, url: p.url
      })),
      merged_related_prs: merged.map(p => p.number),
      open_related_prs: open.map(p => p.number),
      relation_scope: link.scope,
      discrepancy,
      acceptance: 'NOT_EVALUATED_BY_THIS_TOOL'
    };
  });
  return {
    schema: 'softmux-theory-mainline-reconciliation-v1',
    repository: REPOSITORY,
    observed_date: snapshot.observed_date,
    observed_main_sha: snapshot.main_sha,
    historical_ledger_main_sha: ledger.baseline.sha,
    main_changed_since_ledger_baseline: snapshot.main_sha !== ledger.baseline.sha,
    original_acceptance: acceptance,
    rounds,
    needs_manual_review: rounds.filter(r => r.discrepancy !== 'no_observed_status_conflict')
      .map(r => r.round),
    automatic_verified_promotions: 0,
    invariant: 'PR activity, merge, CI and 57-scenario acceptance are separate facts. Do not mutate ledger requirements or promote phases from this report.'
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    process.stderr.write('Usage: node scripts/reconcile-theory-mainline.mjs <snapshot.json> [ledger.json]\n');
    process.exitCode = 2;
  } else {
    const ledgerPath = process.argv[3] ??
      fileURLToPath(new URL('../docs/ten-round-sprint-20261015/acceptance-ledger.json', import.meta.url));
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    process.stdout.write(JSON.stringify(reconcileTheoryMainline(ledger, snapshot), null, 2) + '\n');
  }
}
