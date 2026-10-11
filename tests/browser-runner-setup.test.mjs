import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Chromium E2E reuses installed runner browser with an explicit fallback', async () => {
  const [workflow, e2e] = await Promise.all([
    source('.github/workflows/browser-e2e.yml'),
    source('tests/e2e/browser-mux.e2e.mjs'),
  ]);
  assert.match(workflow, /command -v google-chrome/);
  assert.match(workflow, /E2E_BROWSER_EXECUTABLE=/);
  assert.match(e2e, /process\.env\.E2E_BROWSER_EXECUTABLE/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /packages=\(\)/);
  assert.match(workflow, /packages\+=\(python3-fonttools\)/);
  assert.match(workflow, /sudo apt-get install -y "\$\{packages\[@\]\}"/);
});
