import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const python = process.env.E2E_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const helper = fileURLToPath(new URL('../scripts/p1-browser-delivery-semantic-audit.py', import.meta.url));
const available = spawnSync(python, ['--version'], { encoding: 'utf8' });

test('P1 browser-output semantic comparator requires exact approved attachment deltas', {
  skip: Boolean(available.error) || available.status !== 0,
}, () => {
  const result = spawnSync(python, [helper, '--selftest'], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  assert.match(result.stdout, /declared-delta oracle selftest: PASS/);
});
