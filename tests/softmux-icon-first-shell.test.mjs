import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('the default workbench uses named icon actions without three top-level mode buttons', async () => {
  const js = await read('src/softmux-10.14-workbench.js');
  assert.match(js, /const sf14ToolbarIcons =/);
  assert.match(js, /<svg viewBox=/);
  assert.match(js, /data-sf-view="single" aria-label="返回工作台"/);
  for (const [id, name] of [
    ['sf14Add', '添加资源'],
    ['sf14Help', '帮助'],
    ['sf14Settings', '设置'],
    ['sf14SourceToggle', '显示或隐藏来源'],
  ]) {
    assert.match(js, new RegExp('id="' + id + '"[^\\n]*aria-label="' + name + '"'),
      id + ' must retain an accessible action name');
  }
  const navStart = js.indexOf('<nav class="sf14-nav"');
  const navEnd = js.indexOf('</nav>', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart);
  const navMarkup = js.slice(navStart, navEnd);
  assert.doesNotMatch(navMarkup, />单工程<|>批量任务<|>容器工具</,
    'old modes must not remain primary navigation labels');
  assert.match(navMarkup, /<details class="sf14-more" id="sf14More">/);
  assert.match(navMarkup, /<summary aria-label="其他工具"/);
  assert.match(navMarkup, /data-sf-view="tools"/);
  assert.match(navMarkup, /data-sf-view="batch"/);
  assert.match(js, /get\(doc, 'sf14More'\)\.open = false;/,
    'secondary disclosure closes after opening a legacy area');
});

test('compact responsive toolbar removes the tablet mode rail without deleting the editors', async () => {
  const [css, tablet, js] = await Promise.all([
    read('src/softmux-10.14.css'),
    read('src/softmux-figma-tablet.css'),
    read('src/softmux-10.14-workbench.js'),
  ]);
  assert.match(css, /One-workbench convergence, icon-first header/);
  assert.match(css, /\.sf14-more-menu/);
  assert.match(css, /\.sf14-more > summary:focus-visible/);
  assert.match(tablet, /Icon-first single-workbench convergence/);
  assert.match(tablet, /\.sf14-app \.sf14 \{ padding-left:0; \}/);
  assert.match(tablet, /\.sf14-app \.sf14-nav::before \{ content:none; \}/);
  for (const id of ['sf14Source', 'sf14Composition', 'sf14Inspector', 'sf14Output', 'sf14Batch', 'sf14Tools']) {
    assert.match(js, new RegExp('id="' + id + '"'),
      id + ' should remain mounted to preserve its current handlers and files');
  }
});
