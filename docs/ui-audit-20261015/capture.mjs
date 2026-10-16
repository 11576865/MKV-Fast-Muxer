import { chromium } from '../../node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const out = path.resolve('docs/ui-audit-20261015');
await fs.mkdir(path.join(out,'screenshots'),{recursive:true});
await fs.mkdir('.e2e/ui-audit',{recursive:true});
const fixture = name => path.resolve('.e2e/fixtures', name);
const browser = await chromium.launch({headless:true, executablePath:'/usr/bin/chromium'});
const context = await browser.newContext({acceptDownloads:true,viewport:{width:1180,height:820},locale:'zh-CN'});
const page = await context.newPage();
const evidence = {base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), url:'http://127.0.0.1:4173/', viewports:[], errors:[]};
page.on('pageerror',e=>evidence.errors.push(String(e)));
const snap = async (name,width,height) => {
 await page.setViewportSize({width,height});
 await page.screenshot({path:path.join(out,'screenshots',name+'.png')});
 evidence.viewports.push({name,width,height,...await page.evaluate(()=>{
  const box=id=>{const el=document.getElementById(id);const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!!(r.width&&r.height),insideViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};};
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
  return {documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),source:box('sf14Source'),composition:box('sf14Composition'),inspector:box('sf14Inspector'),mux:box('muxBtn'),fileIdentity:window.auditInput===document.getElementById('videoInput'),fileName:document.getElementById('videoInput').files[0]?.name,smallTabs:[...document.querySelectorAll('[data-sf-section]')].map(e=>({text:e.textContent,height:e.getBoundingClientRect().height})),};
 })});
};
try {
 await page.goto(evidence.url,{waitUntil:'networkidle'});
 await page.locator('#sf14Root').waitFor();
 await snap('tablet-landscape-empty-1180',1180,820);
 await page.setInputFiles('#unifiedAssetInput',fixture('source-multitrack.mkv'));
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('轨道扫描完成：'),null,{timeout:180000});
 await page.evaluate(()=>{window.auditInput=document.getElementById('videoInput');});
 await page.locator('.composition-select[data-composition-id="source:audio:2"]').click();
 await snap('tablet-landscape-source-1180',1180,820);
 await snap('tablet-landscape-source-1024',1024,768);
 await snap('desktop-source-1440',1440,900);
 await snap('tablet-portrait-source-820',820,1180);
 for (const [width,height] of [[390,844],[360,780]]) {
  await page.setViewportSize({width,height});
  await page.locator('[data-sf-focus="composition"]').click();
  await snap('phone-composition-'+width,width,height);
 }
 await page.setViewportSize({width:1180,height:820});
 await page.locator('[data-sf-section="attachments"]').click();
 await snap('tablet-attachments-1180',1180,820);
 evidence.attachmentNotice=await page.locator('#sf14SectionNotice').innerText();
 await page.locator('[data-sf-section="tracks"]').click();
 // Existing control, accessed through the real options drawer; no injected edit state.
 if(!await page.locator('#sf14OptionsDrawer').evaluate(e=>e.open)) await page.locator('#sf14OptionsDrawer > summary').click();
 await page.locator('#appendPreserveAll').uncheck();
 await page.locator('.composition-select[data-composition-id="source:audio:2"]').click();
 await page.locator('#assetInspectorHost [data-tree-track-field="title"]').fill('UI audit English track');
 await page.locator('#sf14OptionsDrawer > summary').click();
 await snap('tablet-edited-audio-1180',1180,820);
 for(const width of [390,1440,1180]) {
  await page.setViewportSize({width,height:820});
  assert.equal(await page.locator('#assetInspectorHost [data-tree-track-field="title"]').inputValue(),'UI audit English track');
 }
 evidence.editedTitleSurvivedResize=true;
 assert.match(await page.locator('#compositionTracks').innerText(),/UI audit English track/);
 await page.locator('#muxBtn').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#downloadLink').click();
 await (await downloadPromise).saveAs('.e2e/ui-audit/edited-source.mkv');
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_chapters','-show_format','-of','json','.e2e/ui-audit/edited-source.mkv'],{encoding:'utf8'}));
 assert.ok(probe.streams.some(s=>s.codec_type==='audio'&&s.tags?.title==='UI audit English track'));
 evidence.mux={status:await page.locator('#status').innerText(),streams:probe.streams.map(s=>({index:s.index,type:s.codec_type,codec:s.codec_name,title:s.tags?.title})),chapters:probe.chapters.length,output:'.e2e/ui-audit/edited-source.mkv',sha256:execFileSync('sha256sum',['.e2e/ui-audit/edited-source.mkv'],{encoding:'utf8'}).split(' ')[0]};
 await snap('tablet-delivery-1180',1180,820);
 await page.locator('[data-sf-view="batch"]').click();
 await page.setInputFiles('#batchUnifiedInput',[fixture('Batch S01E01.mp4'),fixture('Batch S01E01.zh-Hans.ass'),fixture('Batch S01E02.mp4'),fixture('Batch S01E02.en.srt')]);
 await page.waitForFunction(()=>document.querySelectorAll('#batchAssetInventory .asset-entry').length===4&&document.querySelector('#batchPlan').textContent.includes('Batch S01E02.mp4'),null,{timeout:120000});
 await snap('tablet-batch-1180',1180,820);
 evidence.batchGeometry=await page.evaluate(()=>{
  const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  return {input:rect('.batch-inputs'),matrix:rect('#batchPlan'),actions:rect('.batch-actions'),display:getComputedStyle(document.querySelector('.batch-layout')).display,columns:getComputedStyle(document.querySelector('.batch-layout')).gridTemplateColumns};
 });
 evidence.batchPlan=await page.locator('#batchPlan').innerText();
 await page.locator('[data-sf-view="single"]').click();
 // Start a fresh task: importing a second container into the existing task correctly requires explicit source choice.
 await page.goto(evidence.url,{waitUntil:'networkidle'});
 await page.setInputFiles('#unifiedAssetInput',fixture('p0-independent-mkvtoolnix.mkv'));
 await page.evaluate(()=>{window.auditInput=document.getElementById('videoInput');});
 await page.waitForFunction(()=>document.querySelector('#preservationReadiness')?.dataset.status==='blocked',null,{timeout:90000});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('轨道扫描完成：')&&document.querySelector('#cancelBtn').disabled,null,{timeout:180000});
 assert.equal(await page.locator('#preservationReadiness').getAttribute('data-status'),'blocked');
 assert.equal(await page.locator('#muxBtn').isDisabled(),true);
 evidence.complexSource={blocked:true,description:await page.locator('#preservationReadinessDescription').innerText()};
 await snap('tablet-complex-source-blocked-1180',1180,820);
 evidence.completed=true;
} finally {
 await fs.writeFile(path.join(out,'baseline.json'),JSON.stringify(evidence,null,2)+'\n');
 await browser.close();
}
console.log('New default UI real source editing, download and independent ffprobe PASS');
