import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRODUCT_LABEL, PRODUCT_PACKAGE_VERSION, PRODUCT_VERSION }
  from '../src/product-version.js';
import { SOFTMUX_1014_UI_VERSION } from '../src/softmux-10.14-workbench.js';

const text = async path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('current UI and exported mux report use one incremented product release', async () => {
  const pkg = JSON.parse(await text('package.json'));
  const main = await text('src/main.js');
  const readme = await text('README.md');
  assert.equal(pkg.version, PRODUCT_PACKAGE_VERSION);
  assert.match(PRODUCT_PACKAGE_VERSION, /^0\.\d+\.\d+$/);
  assert.equal(PRODUCT_VERSION, PRODUCT_PACKAGE_VERSION.replace(/\.0$/, ''));
  assert.equal(SOFTMUX_1014_UI_VERSION, PRODUCT_LABEL);
  assert.match(readme, new RegExp('软封' + PRODUCT_VERSION.replace(/\./g,'\\.') + '版本'));
  assert.match(main, /appVersion:\s*PRODUCT_PACKAGE_VERSION/);
  assert.doesNotMatch(main, /appVersion:\s*['"]1\.2\.2['"]/);
});

test('1.0 release must not be advertised before its acceptance gate', () => {
  assert.notEqual(PRODUCT_VERSION, '1.0');
  assert.match(PRODUCT_LABEL,/^软封0\./);
});
