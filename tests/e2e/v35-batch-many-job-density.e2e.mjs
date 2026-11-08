import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

/* Actual 16-task import/selection test of the one native Batch JobPlan.
 * This is a VISUAL DENSITY and editor-reachability scenario; it is NOT
 * evidence of successfully executing 16 distinct MKV outputs.
 * The separate real-mux E2E proves executable output and audit. */
const dest=path.resolve('.e2e/ui-v35-batch-density');
await mkdir(dest,{recursive:true});
const master=path.join(dest,'input-template.mp4');
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=0.55',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.55',
  '-c:v','mpeg4','-q:v','7','-c:a','aac','-b:a','32k',
  '-shortest',master,
],{timeout:60000});
const media=await readFile(master);
const count=16;const paths=[];
for(let i=1;i<=count;i++){
  const id=String(i).padStart(2,'0');
  const video=path.join(dest,`Dense S01E${id}.mp4`);
  const subtitle=path.join(dest,`Dense S01E${id}.en.srt`);
  // Copying a valid, verified short media stream gives sixteen distinct
  // actual File identities and preserves pair-matching stress without
  // wasting CI time on repeated heavy encodes.
  await writeFile(video,media);
  await writeFile(subtitle,
    `1\n00:00:00,050 --> 00:00:00,450\nEpisode ${id}\n\n`);
  paths.push(video,subtitle);
}
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const context=await browser.newContext({
  viewport:{width:1440,height:900},acceptDownloads:true,
  deviceScaleFactor:1,
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const proof={schema:'v35-native-16-job-density-v1',count,passed:false,
  sourceBytes:media.length,states:[],files:[],limits:[
    'Imported sixteen distinct-named real MP4 Files and sixteen SRT Files; reused the short media bytes to test layout and matching density.',
    'This test does not run sixteen MKV muxes or establish Group ASS font output.',
    'All viewport measurements refer to this fixture and current browser/font, not a physical device.',
  ]};
const shot=async name=>{
  await page.screenshot({path:path.join(dest,name)});
  proof.files.push(name);
};
const numbers=()=>page.locator('#batchPlan button[data-batch-job-index]');
const sample=async width=>{
  const snap=await page.evaluate(()=>{
    const r=selector=>{
      const node=document.querySelector(selector),b=node?.getBoundingClientRect();
      return b?{left:b.left,top:b.top,right:b.right,bottom:b.bottom,
        width:b.width,height:b.height,scrollHeight:node.scrollHeight,
        clientHeight:node.clientHeight}:null;
    };
    return {
      viewport:[innerWidth,innerHeight],
      header:r('.sf14-header'),tasks:r('#sfv35FeatureNavigation'),
      pane:r('#sf14Batch'),queue:r('#sf14Batch .batch-queue'),matrix:r('#batchPlan'),
      inspector:r('#batchJobInspector'),
      titleInput:r('#batchJobInspector [data-batch-task-field="title"]'),
      globalScroll:scrollY,
      active:document.activeElement?.id,
      rowCount:document.querySelectorAll('#batchPlan button[data-batch-job-index]').length,
      phaseNavCount:document.querySelectorAll('#sfv35BatchFlow').length,
      sourceVisible:!!document.querySelector('#sf14Batch .batch-inputs')?.getClientRects().length,
    };
  });
  assert.equal(snap.viewport[0],width);
  assert.equal(snap.rowCount,count);
  assert.equal(snap.phaseNavCount,0);
  assert.equal(snap.header.top,0);
  assert.ok(snap.tasks.top>=56&&snap.tasks.top<62);
  assert.equal(snap.globalScroll,0);
  proof.states.push({width,...snap});
  return snap;
};
try{
  const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  await page.locator('#sf14Root.sfv3.sfv35-nav').waitFor();
  await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-view'),'batch');
  await page.setInputFiles('#batchUnifiedInput',paths);
  await page.waitForFunction(expected=>
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===expected &&
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===0 &&
    (document.querySelector('#batchAssetStatus')?.textContent||'').includes('32 文件'),
    count,{timeout:120000});
  assert.equal(await numbers().count(),count);
  assert.equal(await page.locator('#batchJobInspector').count(),1);
  assert.equal(await page.locator('#batchUnifiedInput').count(),1);
  assert.equal(await page.locator('.sfv35-batch-workflow').count(),0);

  const d=await sample(1440);
  assert.ok(Math.abs(d.matrix.top-d.inspector.top)<25);
  assert.ok(d.inspector.width>300&&d.matrix.width>300);
  await shot('01-desktop-sixteen-job-matrix-1440.png');

  await page.setViewportSize({width:820,height:1180});
  const tablet=await sample(820);
  assert.ok(Math.abs(tablet.matrix.top-tablet.inspector.top)<25,
    '820px must show the ONE native selected task editor alongside the live matrix: '+
    JSON.stringify(tablet));
  assert.ok(tablet.matrix.width>=280&&tablet.inspector.width>=355,
    'both tablet work areas must remain usable: '+JSON.stringify(tablet));
  assert.ok(tablet.titleInput?.top<980&&tablet.titleInput?.left>tablet.matrix.right,
    'subtitle authoring must be alongside the matrix, not below 16 jobs');
  assert.ok(tablet.matrix.scrollHeight>tablet.matrix.clientHeight+50,
    'real 16-job list must scroll in its own native matrix region');
  const unselectedPreview=await page.locator(
    '#batchPlan button[data-batch-job-index="1"]').evaluate(el=>{
    const label=el.parentElement.querySelector('.batch-job-check');
    const small=el.querySelector('.plan-main small');
    const css=getComputedStyle(small);
    return {
      previewText:small.textContent,
      height:small.getBoundingClientRect().height,
      lineHeight:parseFloat(css.lineHeight),
      clamp:css.webkitLineClamp,
      checkboxColumnWidth:label.getBoundingClientRect().width,
    };
  });
  assert.equal(unselectedPreview.clamp,'2',
    'unselected previews may be visually summarized, not removed from the DOM');
  assert.ok(unselectedPreview.height<=2*unselectedPreview.lineHeight+3,
    'unselected long subtitle provenance must fit two actual text lines');
  assert.ok(unselectedPreview.checkboxColumnWidth>=40,
    'never trade touch checkbox target size for denser task rows');
  assert.match(unselectedPreview.previewText,/Dense S01E02.en.srt/,
    'full provenance must still be readable by assistive technology and native object inspection');
  proof.tabletPreviewDensity=unselectedPreview;
  await shot('02-tablet-sixteen-job-split-820.png');

  const last=page.locator('#batchPlan button[data-batch-job-index="15"]');
  await last.click();
  assert.equal(await last.getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#batchJobInspector').textContent(),/Dense S01E16/);
  const tabletAfter=await sample(820);
  assert.ok(Math.abs(tabletAfter.matrix.top-tabletAfter.inspector.top)<25);
  await shot('03-tablet-last-task-inspector-820.png');

  await page.setViewportSize({width:620,height:900});
  const compact=await sample(620);
  assert.ok(compact.queue.top<400 && compact.matrix.top<550,
    'queue must begin in compact first screen, measured at its actual wrapper rather than only inside its controls: '+JSON.stringify(compact));
  assert.ok(compact.inspector.top>=compact.queue.top,
    'compact native layout deliberately stacks one real inspector');
  assert.equal(compact.sourceVisible,false);
  await shot('04-compact-sixteen-job-matrix-620.png');

  // Executing a job and INSPECTING a job are orthogonal actions. Toggling
  // the native checkbox must NOT send the user to the task editor.
  const executionBox=page.locator(
    '#batchPlan input[data-batch-execute-index="10"]');
  await executionBox.uncheck();
  await page.waitForFunction(()=>(
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('15 / 16')
  ),null,{timeout:15000});
  assert.ok((await page.locator('#sf14Batch').evaluate(el=>el.scrollTop))<20,
    'execution selection must not trigger a compact editor navigation');
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'batchJobInspector');
  await executionBox.check();
  await page.waitForFunction(()=>(
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('16 / 16')
  ),null,{timeout:15000});
  assert.equal(await numbers().count(),count);

  await page.locator('#batchPlan button[data-batch-job-index="13"]').click();
  // The compact selection's native delegated UI listener schedules one
  // requestAnimationFrame scroll/focus to the selected task's OWN inspector.
  await page.waitForFunction(()=>(
    document.activeElement?.id==='batchJobInspector' &&
    document.querySelector('#batchJobInspector')?.getBoundingClientRect().top<=
      document.querySelector('#sf14Batch')?.getBoundingClientRect().top+34
  ),null,{timeout:15000});
  const compactAfter=await sample(620);
  assert.ok(compactAfter.inspector.top>=compactAfter.pane.top-2&&
    compactAfter.inspector.top<=compactAfter.pane.top+34,
    'the selected editor must be visible without global document scroll');
  assert.ok(compactAfter.titleInput.top<900,
    'the actual subtitle title field must be reachable in the compact viewport');
  assert.match(await page.locator('#batchJobInspector').textContent(),/Dense S01E14/);
  await shot('05-compact-selected-job-inline-620.png');

  const title=page.locator('#batchJobInspector [data-batch-task-field="title"]');
  await title.fill('Episode 14 Reviewed');
  await title.press('Tab');
  assert.equal(await title.inputValue(),'Episode 14 Reviewed');
  // Verify the original per-job draft survives browsing to another actual
  // Job object and back; no second UI store can shadow the owner.
  await page.locator('#sf14Batch').evaluate(el=>{el.scrollTop=0;});
  await page.locator('#batchPlan button[data-batch-job-index="12"]').click();
  await page.waitForFunction(()=>
    document.querySelector('#batchJobInspector')?.textContent?.includes('Dense S01E13'),
    null,{timeout:10000});
  await page.locator('#sf14Batch').evaluate(el=>{el.scrollTop=0;});
  await page.locator('#batchPlan button[data-batch-job-index="13"]').click();
  await page.waitForFunction(()=>
    document.querySelector('#batchJobInspector [data-batch-task-field="title"]')?.value===
      'Episode 14 Reviewed',null,{timeout:10000});
  assert.equal(await title.inputValue(),'Episode 14 Reviewed');
  await shot('06-compact-editor-draft-preserved-620.png');
  assert.deepEqual(errors,[]);
  proof.passed=true;
  await writeFile(path.join(dest,'density-evidence.json'),
    JSON.stringify(proof,null,2)+'\n');
  console.log('V3.5 16 real Batch Jobs: tablet native matrix/inspector, compact selection and preserved draft PASS');
}catch(error){
  proof.error=String(error);
  proof.pageErrors=errors;
  proof.dom=await page.evaluate(()=>({
    root:document.querySelector('#sf14Root')?.dataset.view,
    source:document.querySelector('#batchAssetStatus')?.textContent,
    nativeJobs:document.querySelectorAll('#batchPlan button[data-batch-job-index]').length,
    viewport:[innerWidth,innerHeight],
    paneScroll:document.querySelector('#sf14Batch')?.scrollTop,
  })).catch(()=>null);
  await page.screenshot({path:path.join(dest,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(dest,'density-evidence.json'),
    JSON.stringify(proof,null,2)+'\n');
  throw error;
}finally{
  await context.close();
  await browser.close();
}
