import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const oracle = fileURLToPath(
  new URL('../scripts/p0-audit-track-tag-relations.py', import.meta.url),
);

test('P0 independent TrackUID semantic oracle allows valid UID reassignment and detects dangling/missing relations', () => {
  const stdout = execFileSync(process.env.E2E_PYTHON || 'python3', [oracle, '--selftest'], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.match(stdout, /P0 track tag semantic oracle self-test PASS/);
});
