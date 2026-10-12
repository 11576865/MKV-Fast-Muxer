import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('P0: UI, plan, runtime and README distinguish stream-copy from EBML preservation', () => {
  const main = read('src/main.js');
  const html = read('index.html');
  const readme = read('README.md');
  assert.match(html, /复制原轨并追加（重封装）/);
  assert.match(main, /正在使用 FFmpeg 重封装 MKV/);
  assert.match(main, /源流复制并追加/);
  assert.match(main, /重封装不保证原 EBML 结构或 UID 关系完整保留/);
  assert.match(main, /未验证所有章节层级与 UID 关联/);
  assert.match(readme, /Stream Copy 表示相关编码媒体流不必重新编码/);
  assert.match(readme, /Issue #77/);
  for (const [name, source] of [['main.js', main], ['index.html', html], ['README.md', readme]]) {
    for (const forbidden of [
      '完整保留原容器结构，仅追加', '保留原内容，只追加',
      '正在无损封装 MKV', '完整保留并追加 · 保持原 codec',
    ]) {
      assert.equal(source.includes(forbidden), false, name + ': unsupported guarantee ' + forbidden);
    }
  }
});
