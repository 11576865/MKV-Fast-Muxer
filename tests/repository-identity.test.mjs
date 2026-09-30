import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const oldSlug = 'MKV-Fast-Muxer-v3';
const repoUrl = 'https://github.com/11576865/MKV-Fast-Muxer';
const pagesUrl = 'https://11576865.github.io/MKV-Fast-Muxer/';

async function text(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('repository rename URLs stay consistent across public metadata and docs', async () => {
  const [readme, index, robots, sitemap, vite] = await Promise.all([
    text('README.md'),
    text('index.html'),
    text('public/robots.txt'),
    text('public/sitemap.xml'),
    text('vite.config.js'),
  ]);

  for (const [name, value] of Object.entries({ readme, index, robots, sitemap, vite })) {
    assert.equal(value.includes(oldSlug), false, name + ' must not reference the retired repository slug');
  }

  assert.equal(readme.includes(pagesUrl), true);
  assert.equal(readme.includes(repoUrl + '.git'), true);
  assert.match(readme, /cd MKV-Fast-Muxer\b/);

  assert.equal(index.includes('rel="canonical" href="' + pagesUrl + '"'), true);
  assert.equal(index.includes('"url": "' + pagesUrl + '"'), true);
  assert.equal(index.includes('"codeRepository": "' + repoUrl + '"'), true);

  assert.equal(robots.includes('Sitemap: ' + pagesUrl + 'sitemap.xml'), true);
  assert.equal(sitemap.includes('<loc>' + pagesUrl + '</loc>'), true);
  assert.match(vite, /base:\s*['"]\.\/['"]/);
});

test('product name keeps v3 even though the repository slug no longer does', async () => {
  const [readme, index, packageJson] = await Promise.all([
    text('README.md'),
    text('index.html'),
    text('package.json'),
  ]);

  assert.match(readme, /^# MKV Fast Muxer v3$/m);
  assert.match(index, /MKV Fast Muxer v3/);

  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.private, true);
  assert.equal(pkg.name, 'mkv-fast-muxer-v3');
});
