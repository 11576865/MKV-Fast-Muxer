import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const oracle = fileURLToPath(
  new URL('../scripts/p0-audit-attachment-tag-relations.py', import.meta.url),
);

test('P0 independent AttachmentUID oracle distinguishes UID renumbering, lost, wrong, dangling and changed payload', () => {
  const stdout = execFileSync(process.env.E2E_PYTHON || 'python3', [oracle, '--selftest'], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.match(stdout, /P0 attachment tag semantic oracle self-test PASS/);
});
