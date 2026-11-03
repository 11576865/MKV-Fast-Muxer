import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/p1-uid-role-oracle.py', import.meta.url));
const python = process.env.E2E_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const available = spawnSync(python, ['--version'], { encoding: 'utf8' });

test('P1 UID role comparison accepts referentially intact remaps and rejects misdirected/dangling targets',
  { skip: Boolean(available.error) || available.status !== 0 }, () => {
    const result = spawnSync(python, [helper, '--selftest'], {
      encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, (result.stderr || '') + '\n' + (result.stdout || ''));
    assert.match(result.stdout, /UID role selftest: PASS/);
  });
