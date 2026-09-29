import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Windows desktop layout uses the available browser canvas', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(css, /Windows desktop layout authority v2/);
  assert.match(
    css,
    /@media \(min-width: 1280px\) and \(hover: hover\) and \(pointer: fine\)/
  );
  assert.match(
    css,
    /width: calc\(100% - clamp\(24px, 2vw, 40px\)\);\n    max-width: none;/
  );
  assert.match(
    css,
    /grid-template-columns: minmax\(0, 1fr\) clamp\(400px, 24vw, 560px\);/
  );
  assert.match(
    css,
    /grid-template-columns: clamp\(340px, 28%, 560px\) minmax\(0, 1fr\);/
  );
  assert.match(css, /grid-column: 1 \/ -1;\n    grid-row: 2;/);
  assert.match(css, /max-height: calc\(100vh - 28px\);/);
});
