import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('page references the bundled SVG favicon', async () => {
  const [html, svg] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg\?v=1"/);
  assert.match(svg, /<svg[^>]+viewBox="0 0 32 32"/);
  assert.doesNotMatch(svg, /<text\b|font-family=/i);
});
