// V3 shell-only structural rebuild pilot: real Files, one native workbench,
// exact existing target authority. No mock buttons, extra media writer, or
// alteration to public '/' (opt-in via ?ui=v3&shell=next only).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {inspectV3ShellGeometry} from '../../src/v3-shell-geometry-contract.mjs';

const dir=path.resolve('.e2e/ui-v3-shell-next');
await fs.mkdir(dir,{recursive:true});
const source=path.resolve('.e2e/ui-v3-multitrack/V3 Five Track Source.mkv');
await fs.access(source);
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const url=new URL(base);url.searchParams.set('ui','v3');url.searchParams.set('shell','next');
const browser=await chromium.launch({headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900},
  acceptDownloads:true,reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(60000);
const evidence={schema:'v3-next-state-owned-shell-prototype-v1',
  sourceFileName:path.basename(source),frames:[],passed:false,
  scope:'Browser structural shell plus real source File/target authorization; NOT Figma inner component pixel acceptance or a released default layout'};
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const measure=async frame=>{
  await page.waitForFunction(frame=>
    document.getElementById('sf14Root')?.dataset.sfv3ShellFrame===frame,
    frame,{timeout:25000});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const boxes=await page.evaluate(()=>{
    const rect=query=>{
      const b=document.querySelector(query)?.getBoundingClientRect();
      return b?Object.fromEntries(['x','y','width','height']
        .map(k=>[k,Math.round(b[k]*100)/100])):null;
    };
    const root=document.getElementById('sf14Root');
    return {
      shell:root.dataset.sfv3Shell,frame:root.dataset.sfv3ShellFrame,
      surface:root.dataset.sfv3Surface,
      sourceFile:document.getElementById('videoInput')?.files?.[0]?.name,
      originalEditorCount:document.querySelectorAll('#newSubtitleList').length,
      originalMuxButtonCount:document.querySelectorAll('#muxBtn').length,
      rootOverflow:document.documentElement.scrollWidth>innerWidth+2,
      chrome:rect('.sf14-header'),workspace:rect('#sf14Single'),
      footer:rect(root.dataset.sfv3Surface==='plan'?'.sf14-output':'.sfv3-source-status'),
    };
  });
  const reference=inspectV3ShellGeometry(frame,boxes);
  evidence.frames.push({frame,boxes,reference});
  assert.equal(boxes.shell,'next');
  assert.equal(boxes.frame,frame);
  assert.equal(boxes.sourceFile,path.basename(source));
  assert.equal(boxes.originalEditorCount,1,'original native editor must stay unique');
  assert.equal(boxes.originalMuxButtonCount,1,'single actual mux executor');
  assert.equal(boxes.rootOverflow,false,'shell cannot introduce x-axis overflow');
  assert.equal(reference.matched,true,
    'new shell must occupy the approved Figma chrome/workspace/footer slots: '+
    JSON.stringify(reference.discrepancies));
  await page.screenshot({path:path.join(dir,frame+'.png')});
};
try{
  await page.goto(url.href,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',source);
  await page.waitForFunction(name=>
    document.getElementById('videoInput')?.files?.[0]?.name===name &&
    document.querySelectorAll('#sfv3SourceContents .sfv3-observed-row').length>=4,
    path.basename(source),{timeout:180000});
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true,
    'source-only view may never authorize a write');
  await measure('desktop-source');
  // V3-01 desktop rail is a functional object-navigation system, not
  // decoration. Each action delegates to original DOM and input ownership.
  assert.equal(await page.locator('#sfv3Rail').getAttribute('aria-label'),
    '资源与对象导航');
  const rail=page.locator('#sfv3Rail');
  assert.equal(await rail.locator('button:visible').count(),4,
    'Figma source rail has documents, object list, search and help');
  const loadedRailIcons=await page.locator('#sfv3Rail .sfv3-shell-rail-action img')
    .evaluateAll(async icons=>Promise.all(icons.map(async img=>{
      await img.decode().catch(()=>{});
      return {icon:img.dataset.sfv3Icon,
        loaded:img.complete&&img.naturalWidth>0&&img.naturalHeight>0,
        width:img.naturalWidth,height:img.naturalHeight};
    })));
  assert.deepEqual(loadedRailIcons.map(x=>x.icon),['object-list','search','help']);
  assert.ok(loadedRailIcons.every(x=>x.loaded),
    'the Figma rail must show real locally bundled SVGs, not broken glyph placeholders: '+
    JSON.stringify(loadedRailIcons));
  assert.equal(await page.locator('#sfv3Rail > button[aria-label="添加资源"]').isVisible(),false,
    'native import still belongs in the real header, not duplicate rail button');
  await page.locator('#sfv3ShellObjectList').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfv3SourceContents',
    'object rail locates and focuses the real source list');
  await page.locator('#sfv3ShellSearch').click();
  assert.equal(await page.locator('#sfv3SourceSearch').isVisible(),true,
    'rail search opens original source search, not a shadow index');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfv3SourceSearch');
  await page.locator('#sfv3SourceSearch').fill('aac');
  assert.equal(await page.locator('#sfv3SourceContents .sfv3-observed-row')
    .filter({hasText:'aac'}).count(),1,'real scanned AAC source is searchable');
  await page.locator('#sfv3SourceSearch').fill('');
  await page.locator('#sfv3SourceSearchToggle').click();
  await page.locator('#sfv3ShellHelp').click();
  assert.equal(await page.locator('#sf14HelpDialog').evaluate(el=>el.open),true,
    'rail help opens the native workbench dialog');
  await page.locator('#sf14HelpDialog button').last().click();
  assert.equal(await page.locator('#sf14HelpDialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files?.[0]?.name),
    path.basename(source),'navigation cannot revoke File provenance');

  await page.setViewportSize({width:820,height:1180});
  await measure('portrait-source');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);

  await page.locator('#sfv3EnterOutput').click();
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>document.querySelector('#sf14Root')
    ?.dataset.sfv3TargetConfirmed==='true',{timeout:180000});
  await page.locator('#sfv3TargetTab').click();
  await measure('portrait-target');
  assert.equal(await page.locator('#sf14Root').evaluate(el=>el.dataset.sfv3TargetConfirmed),'true',
    'the original V3 exact-File target authority must survive portrait shell positioning');

  await page.setViewportSize({width:1440,height:900});
  await measure('desktop-target');
  await page.locator('#sfv3SourceTab').click();
  await measure('desktop-source');
  await page.locator('#sfv3TargetTab').click();
  await measure('desktop-target');
  assert.deepEqual(errors,[],'no browser exceptions during shell mode transitions');
  evidence.passed=true;
  console.log('V3 next shell: Figma 1440/820 source and target geometry PASS (opt-in only)');
}catch(e){
  evidence.error=String(e);
  await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
  throw e;
}finally{
  evidence.errors=errors;
  await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  await context.close();
  await browser.close();
}
