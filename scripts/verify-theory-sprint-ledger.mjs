/** Fail-closed acceptance reporting for the 2026-10-12 approved model. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ranges = { R: 5, T: 15, B: 17, S: 8, U: 12 };
const phases = new Set(['P0', 'P1', 'P2', 'P3', 'P3-B', 'P4', 'P5', 'P6']);
const priorities = new Set(['critical', 'high', 'normal']);
const states = new Set(['unassessed', 'partial', 'blocked', 'field-pending', 'verified']);
const isSha = v => typeof v === 'string' && /^[0-9a-f]{40}$/i.test(v);
const isDigest = v => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);
const fail = code => { throw new Error('THEORY_LEDGER_' + code); };
const hasExactProof = evidence => Array.isArray(evidence) && evidence.some(e =>
  e && isSha(e.commit_sha) && Number.isSafeInteger(e.workflow_run_id) &&
  e.workflow_run_id > 0 && typeof e.scenario === 'string' && e.scenario.length > 0 &&
  typeof e.independent_oracle === 'string' && e.independent_oracle.length > 0 &&
  isDigest(e.artifact_sha256));

export function auditTheoryLedger(data) {
  if (data?.schema !== 'mkv-ten-round-acceptance-ledger-v1') fail('SCHEMA');
  if (data.decision_source !== '软封工程_未来规划总决议_2026-10-12(1).txt') fail('SOURCE_DRIFT');
  if (!isSha(data.baseline?.sha) || data.baseline.repository !== '11576865/MKV-Fast-Muxer') fail('BASELINE');
  if (data.goal?.rounds !== 10 || data.goal.high_priority_target_percent !== 75) fail('TARGET');
  if (!Array.isArray(data.decisions) || data.decisions.length !== 10 ||
      data.decisions.some((d, i) => d?.id !== 'D-' + String(i + 1).padStart(2, '0') || !d.statement)) fail('DECISIONS');
  if (!Array.isArray(data.phases) || data.phases.length !== phases.size ||
      new Set(data.phases.map(p => p.id)).size !== phases.size ||
      data.phases.some(p => !phases.has(p.id))) fail('PHASES');
  if (data.safety?.legacy_remux_complete_preservation !== 'not-proven' &&
      !hasExactProof([data.safety?.legacy_remux_resolution])) fail('FALSE_P0_FULL_PRESERVATION');
  if (data.safety?.no_silent_source_overwrite !== true ||
      data.safety?.unknown_layout !== 'fail-closed-or-read-only' ||
      data.safety?.require_independent_output_audit !== true ||
      data.safety?.do_not_promote_single_observation_to_canonical !== true) fail('SAFETY_GATE');
  if (!Array.isArray(data.requirements)) fail('REQUIREMENTS');
  const ids = new Map();
  for (const r of data.requirements) {
    if (!r || typeof r.id !== 'string' || ids.has(r.id)) fail('DUPLICATE_OR_INVALID_ID');
    ids.set(r.id, r);
    if (!r.title || !phases.has(r.phase) || !priorities.has(r.priority) ||
        !states.has(r.state) || !Array.isArray(r.evidence) ||
        typeof r.caveat !== 'string' || !r.caveat) fail('REQUIREMENT_FIELDS');
    if (r.state === 'verified' && !hasExactProof(r.evidence)) fail('VERIFIED_WITHOUT_EXACT_INDEPENDENT_PROOF');
    if (r.state === 'partial' && !r.evidence.some(e =>
      e?.url?.startsWith('https://github.com/') && e.scope)) fail('PARTIAL_WITHOUT_SCOPED_SOURCE');
  }
  let expected = 0;
  for (const [prefix, count] of Object.entries(ranges)) for (let i = 1; i <= count; i++) {
    const id = prefix + '-' + String(i).padStart(prefix === 'R' ? 2 : 3, '0');
    expected++;
    if (!ids.has(id)) fail('MISSING_' + id);
  }
  if (ids.size !== expected) fail('UNDECLARED_IDS');
  const risk = ids.get('R-01');
  if (!risk.evidence.some(e => e.url === 'https://github.com/11576865/MKV-Fast-Muxer/issues/77') ||
      risk.state === 'verified') fail('HISTORICAL_P0_COUNTEREXAMPLE_MISSING');
  if (!Array.isArray(data.rounds) || data.rounds.length !== 10) fail('ROUNDS');
  for (let i = 0; i < data.rounds.length; i++) {
    const round = data.rounds[i];
    if (round.round !== i + 1 ||
        !['planned', 'in-progress', 'submitted', 'accepted'].includes(round.state)) fail('ROUND_ORDER');
    if (['submitted', 'accepted'].includes(round.state) &&
        (!isSha(round.head_sha) || !Number.isSafeInteger(round.pr) || round.pr <= 0)) fail('ROUND_SUBMITTED_WITHOUT_SHA_PR');
    if (round.state === 'accepted' && round.ci !== 'exact-head-passed') fail('ROUND_ACCEPTED_WITHOUT_CI');
  }
  const high = data.requirements.filter(r => r.priority !== 'normal');
  return Object.freeze({
    schema: data.schema, total_scenarios: ids.size,
    high_priority_scenarios: high.length,
    target_verified: Math.ceil(high.length * 0.75),
    accepted_verified: high.filter(r => r.state === 'verified').length,
    partial: data.requirements.filter(r => r.state === 'partial').length,
    not_assessed: data.requirements.filter(r => r.state === 'unassessed').length,
    interpretation: 'Ledger proof count, NOT the existing code implementation percentage.'
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] ?? fileURLToPath(new URL('../docs/ten-round-sprint-20261015/acceptance-ledger.json', import.meta.url));
  console.log(JSON.stringify(auditTheoryLedger(JSON.parse(readFileSync(file, 'utf8'))), null, 2));
}
