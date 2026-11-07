import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// Real Matroska structure fixture, not names inferred from a design mock.
// The V3.5 route must reuse the current File-bound ffprobe observations.
const out=path.resolve('.e2e/ui-v35-source-structure');
await mkdir(out,{recursive:true});
const chapters=path.join(out,'structure.ffmeta');
const attachment=path.join(out,'notes.txt');
const mkv=path.join(out,'Structure Fixture.mkv');
await writeFile(chapters,[
  ';FFMETADATA1','title=Structure Fixture','artist=V3.5 Evidence',
  '[CHAPTER]','TIMEBASE=1/1000','START=0','END=950','title=Opening','',
].join('\n'));
await writeFile(attachment,'Matroska source attachment - only read, not an editable target.\n');
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=160x90:r=24:d=1',
  '-f','ffmetadata','-i',chapters,
  '-map','0:v:0','-map_metadata','1','-map_chapters','1',
  '-c:v','mpeg4','-q:v','5',
  '-attach',attachment,'-metadata:s:t','mimetype=text/plain',
  mkv,
],{stdio:'pipe'});
const probed=JSON.parse(execFileSync('ffprobe',[
  '-v','error','-show_streams','-show_chapters','-show_format',
  '-of','json',mkv,
],{encoding:'utf8'}));
assert.equal(probed.streams.filter(x=>x.codec_type==='attachment').length,1);
assert.equal(probed.chapters.length,1);
assert.equal(probed.chapters[0].tags.title,'Opening');
assert.equal(probed.format.tags.title,'Structure Fixture');

const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const result={schema:'v35-source-structure-exact-file-v1',
  sample:{file:path.basename(mkv),attachment:'notes.txt',
    chapter:'Opening',formatTag:'Structure Fixture'},claims:[],passed:false};
try{
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  const root=page.locator('#sf14Root.sfv3.sfv35-nav');
  await root.waitFor();
  const nav=page.locator('#sfv35FeatureNavigation');
  assert.deepEqual(await nav.locator('button').allTextContents(),[
    '来源','源结构','拟输出','轨道','字幕','字体','附件','批量任务',
    '验证','工程','容器工具',
  ]);
  assert.equal(await nav.locator('[data-sfv35-task="structure"]')
    .getAttribute('aria-controls'),'sfv3SourceContents');
  await page.setInputFiles('#unifiedAssetInput',mkv);
  await page.waitForFunction(()=>{
    const el=document.getElementById('videoInput')?.files?.[0];
    const cards=document.querySelectorAll('.sfv3-source-resource-card');
    return el?.name==='Structure Fixture.mkv' && cards.length===3 &&
      cards[0].textContent.includes('notes.txt') &&
      cards[1].textContent.includes('Opening') &&
      cards[2].textContent.includes('Structure Fixture');
  },null,{timeout:90000});
  await page.evaluate(()=>{
    window.__structureOriginalFile=document.getElementById('videoInput').files[0];
  });
  assert.notEqual(await root.getAttribute('data-sfv3-target-confirmed'),'true');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.equal(await page.locator('#sfv3ObservedStructure').isVisible(),false,
    'target-only structure projection must not masquerade as active output');

  await nav.locator('[data-sfv35-task="structure"]').click();
  await page.waitForFunction(()=>{
    const cards=[...document.querySelectorAll('.sfv3-source-resource-card')];
    return cards.length===3 && cards.every(c=>c.open) &&
      document.querySelector('#sf14Root')?.dataset?.sfv3Surface==='source';
  });
  assert.equal(await nav.locator('[data-sfv35-task="structure"]')
    .getAttribute('aria-current'),'page');
  assert.equal(await page.evaluate(()=>document.activeElement?.classList
    .contains('sfv3-source-resource-strip')),true,
    'direct structure task must focus actual source observation region');
  assert.notEqual(await root.getAttribute('data-sfv3-target-confirmed'),'true');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.equal(await page.locator('#sfv3ObservedStructure').isVisible(),false);
  assert.equal(await page.locator('.sfv3-source-resource-card').count(),3,
    'single source observation hierarchy, no shadow editor');
  const observations=await page.locator('.sfv3-source-resource-card').evaluateAll(nodes=>
    nodes.map(n=>({kind:n.dataset.kind,open:n.open,count:
      n.querySelector('.sfv3-source-resource-count')?.textContent,
      title:n.textContent.slice(0,180)})));
  assert.deepEqual(observations.map(x=>x.kind),['attachments','chapters','tags']);
  for(const item of observations)assert.ok(Number(item.count)>=1,
    'fixture must prove actual positive observations, not zero placeholders');
  assert.ok(observations.some(x=>x.title.includes('notes.txt')));
  assert.ok(observations.some(x=>x.title.includes('Opening')));
  assert.ok(observations.some(x=>x.title.includes('Structure Fixture')));
  result.claims.push('positive attachment/chapter/tag evidence from one exact MKV without target');

  await page.screenshot({path:path.join(out,'01-source-structure-open.png')});
  await nav.locator('[data-sfv35-task="batch"]').click();
  assert.equal(await root.getAttribute('data-view'),'batch');
  await nav.locator('[data-sfv35-task="structure"]').click();
  assert.equal(await root.getAttribute('data-view'),'single');
  assert.equal(await root.getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.evaluate(()=>
    window.__structureOriginalFile===document.getElementById('videoInput').files[0]),true);
  assert.notEqual(await root.getAttribute('data-sfv3-target-confirmed'),'true');
  result.claims.push('batch and source-structure navigation preserve original File identity');

  // Closing the existing disclosure then choosing the direct task
  // must reopen THE SAME resource cards, not clone a second observation.
  await page.locator('#sfv3SourceStructureToggle').click();
  assert.equal(await page.locator('.sfv3-source-resource-card[open]').count(),0);
  await nav.locator('[data-sfv35-task="source"]').click();
  await nav.locator('[data-sfv35-task="structure"]').click();
  await page.waitForFunction(()=>
    document.querySelectorAll('.sfv3-source-resource-card[open]').length===3);
  await page.setViewportSize({width:620,height:900});
  const bounds=await nav.locator('button').evaluateAll(nodes=>nodes.map(el=>{
    const r=el.getBoundingClientRect();
    return {top:Math.round(r.top),width:r.width,height:r.height,
      right:r.right};
  }));
  assert.equal(bounds.length,11);
  assert.equal(new Set(bounds.map(x=>x.top)).size,2,
    '11 tasks remain visible across two compact rows at 620px');
  assert.ok(bounds.every(x=>x.width>=49&&x.height>=39&&x.right<=621),
    'no task is hidden outside the compact viewport');
  assert.notEqual(await root.getAttribute('data-sfv3-target-confirmed'),'true');
  await page.screenshot({path:path.join(out,'02-compact-readonly-structure.png')});
  assert.deepEqual(errors,[]);
  result.passed=true;result.observations=observations;
  await writeFile(path.join(out,'structure-evidence.json'),
    JSON.stringify(result,null,2)+'\n');
  console.log('V3.5 exact-source attachment/chapter/tag navigation PASS');
}catch(e){
  result.error=String(e);result.pageErrors=errors;
  result.dom=await page.evaluate(()=>({
    view:document.querySelector('#sf14Root')?.dataset?.view,
    surface:document.querySelector('#sf14Root')?.dataset?.sfv3Surface,
    target:document.querySelector('#sf14Root')?.dataset?.sfv3TargetConfirmed,
    cards:[...document.querySelectorAll('.sfv3-source-resource-card')].map(x=>
      ({kind:x.dataset.kind,open:x.open,content:x.textContent.slice(0,170)})),
  })).catch(()=>null);
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(out,'structure-evidence.json'),
    JSON.stringify(result,null,2)+'\n');
  throw e;
}finally{
  await ctx.close();await browser.close();
}
