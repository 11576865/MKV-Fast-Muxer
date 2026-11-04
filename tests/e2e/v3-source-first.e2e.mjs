import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const output = path.resolve('.e2e/ui-v3-evidence');
await mkdir(output,{recursive:true});
const source = path.join(output,'V3 Source 01.mkv');
execFileSync('ffmpeg',[
 '-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1',
 '-c:v','mpeg4','-q:v','4',source,
],{stdio:'pipe'});
const browser = await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE ? {executablePath:process.env.E2E_BROWSER_EXECUTABLE} : {}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/';
const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
const page = await ctx.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
const evidence={schema:'softmux-ui-v3-wu01-browser-evidence-v1',source:path.basename(source),views:[],checks:[],limits:'Opt-in V3 source-only pilot. Does not prove exact Figma fidelity, true optional OutputPlan domain transition, portrait object actions, motion, real mux success, or physical tablet.'};
try {
 await page.goto(new URL('?ui=v3',base).href,{waitUntil:'networkidle'});
 await page.locator('#sf14Root.sfv3').waitFor();
 assert.equal(await page.locator('#sfv3Empty').isVisible(),true);
 assert.equal(await page.locator('#sfv3SourceTab').textContent(),'未加载');
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false);
 assert.equal(await page.locator('#unifiedAssetInput').count(),1);
 assert.equal(await page.locator('#assetDropzone').count(),1);
 await page.screenshot({path:path.join(output,'1440-empty.png'),fullPage:false});
 evidence.views.push('1440-empty.png');
 evidence.checks.push('empty source visible with no target or false success');
 await page.evaluate(()=>{window.__nativeSourceInput=document.getElementById('videoInput');window.__nativeAssetInput=document.getElementById('unifiedAssetInput');window.__nativeMuxButton=document.getElementById('muxBtn');});
 await page.locator('#unifiedAssetInput').setInputFiles(source);
 await page.waitForFunction(()=>{
   const root=document.getElementById('sf14Root');
   const name=document.getElementById('sfv3FileName');
   const c=document.getElementById('outputCompositionPanel');
   return root?.classList.contains('sfv3') && name?.textContent==='V3 Source 01.mkv' && c && !c.hidden &&
       document.querySelector('#sfv3SourceContents .sfv3-observed-row');
 },null,{timeout:150000});
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#sfv3EnterOutput').isVisible(),true);
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false,
   'real legacy editable composition must not be presented as source observation');
 assert.ok((await page.locator('#sfv3SourceContents .sfv3-observed-row').count())>=1);
 assert.equal(await page.locator('#sfv3FileName').textContent(),'V3 Source 01.mkv');
 await page.screenshot({path:path.join(output,'1440-loaded-source.png'),fullPage:false});
 evidence.views.push('1440-loaded-source.png');
 evidence.checks.push('actual imported MKV and source-only scan projection');
 await page.setViewportSize({width:820,height:1180});
 await page.screenshot({path:path.join(output,'820-portrait-source.png'),fullPage:false});
 evidence.views.push('820-portrait-source.png');
 assert.equal(await page.locator('#sfv3FileName').textContent(),'V3 Source 01.mkv');
 await page.setViewportSize({width:620,height:900});
 await page.screenshot({path:path.join(output,'620-compact-source.png'),fullPage:false});
 evidence.views.push('620-compact-source.png');
 assert.equal(await page.locator('#sfv3FileName').textContent(),'V3 Source 01.mkv');
 evidence.checks.push('same source File and observation retained across viewport changes');
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.locator('#muxBtn').isDisabled(),true,
   'the real executor must reject output before explicit target choice');
 await page.locator('#sfv3EnterOutput').click();
 assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true);
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false);
 await page.locator('.sfv3-picker-cancel').click();
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
   'cancel must not authorize output');
 await page.locator('#sfv3EnterOutput').click();
 await page.locator('#sfv3ConfirmTarget').click();
 assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-target-confirmed'),'true');
 assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'plan');
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),true);
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),true);
 assert.equal(await page.evaluate(()=>
   window.__nativeSourceInput===document.getElementById('videoInput') &&
   window.__nativeAssetInput===document.getElementById('unifiedAssetInput') &&
   window.__nativeMuxButton===document.getElementById('muxBtn')
 ),true,'existing input/mux node identity must survive surface transition');
 await page.screenshot({path:path.join(output,'1440-existing-plan-bridge.png'),fullPage:false});
 evidence.views.push('1440-existing-plan-bridge.png');
 evidence.checks.push('explicit transition reuses original editor/input/mux DOM without clones');
 await page.locator('#sfv3SourceTab').click();
 assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'source');
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false);
 assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0]?.name),'V3 Source 01.mkv');
 assert.deepEqual(pageErrors,[]);
 evidence.checks.push('returning to source retains exact File and no page exceptions');
 await writeFile(path.join(output,'v3-wu01-browser.json'),JSON.stringify({...evidence,passed:true},null,2)+'\n');
 console.log('V3 WU-01 actual browser source observation PASS');
} catch (error) {
 await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
 await writeFile(path.join(output,'v3-wu01-browser.json'),JSON.stringify({...evidence,passed:false,error:String(error),pageErrors},null,2)+'\n');
 throw error;
} finally {
 await ctx.close();
 await browser.close();
}
