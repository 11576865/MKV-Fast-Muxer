import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
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
 // Actual user click on the APPROVED EMPTY CANVAS, not test-side input
 // injection. The original unified file input must own the file chooser.
 const blank=await page.locator('#sfv3Empty').boundingBox();
 assert.ok(blank && blank.width>230 && blank.height>=300);
 const blankPoint={x:blank.x+blank.width*.26,y:blank.y+blank.height*.31};
 assert.equal(await page.evaluate(({x,y})=>
   document.elementFromPoint(x,y)?.closest('#assetDropzone')?.id||'',blankPoint),
   'assetDropzone','the exact native dropzone must cover the clickable empty canvas');
 const [chooser]=await Promise.all([
   page.waitForEvent('filechooser'),
   page.mouse.click(blankPoint.x,blankPoint.y),
 ]);
 assert.equal(await chooser.element().evaluate(el=>el.id),'unifiedAssetInput',
   'the entire empty canvas must forward to the ONE original file picker');
 await chooser.setFiles(source);
 await page.waitForFunction(()=>{
   const root=document.getElementById('sf14Root');
   const name=document.getElementById('sfv3FileName');
   const c=document.getElementById('outputCompositionPanel');
   return root?.classList.contains('sfv3') && name?.textContent==='V3 Source 01.mkv' && c && c.hidden &&
       document.querySelector('#sfv3SourceContents .sfv3-observed-row') &&
       !document.querySelector('#compositionTracks [data-composition-id]');
 },null,{timeout:150000});
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#sfv3EnterOutput').isVisible(),true);
 assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false,
   'real legacy editable composition must not be presented as source observation');
 assert.ok((await page.locator('#sfv3SourceContents .sfv3-observed-row').count())>=1);
 assert.equal(await page.locator('#compositionTracks [data-composition-id]').count(),0,
   'no internal output composition should exist before explicit target authorization');
 assert.equal(await page.locator('#sfv3FileName').textContent(),'V3 Source 01.mkv');
 // Every rendered static icon must come from an actual downloaded SVG.
 // No missing asset, temporary Figma link, browser fallback glyph or 0x0 box.
 await page.waitForFunction(()=>{
   const icons=[...document.querySelectorAll('#sf14Root img.sfv3-svg-icon')];
   return icons.length>=9 && icons.every(img=>img.complete && img.naturalWidth>0 &&
     img.naturalHeight>0 && !img.src.includes('figma.com/api/mcp/asset/'));
 },null,{timeout:25000});
 const iconSlots=await page.locator('#sf14Root img.sfv3-svg-icon').evaluateAll(nodes=>
   nodes.filter(node=>node.getClientRects().length>0)
     .map(node=>({url:node.src,natural:[node.naturalWidth,node.naturalHeight],
       box:[Math.round(node.getBoundingClientRect().width),Math.round(node.getBoundingClientRect().height)]})));
 assert.ok(iconSlots.length>=9,'visible source view needs at least nine real SVG affordances');
 assert.ok(iconSlots.every(icon=>icon.box[0]>0&&icon.box[1]>0),
   'only visible icon slots must occupy nonzero layout geometry');
 evidence.checks.push('all visible Figma-exported SVG icon slots resolve from local build assets');
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
 evidence.checks.push('actual pointer click on empty-canvas title opened original native file chooser');
 // The other required empty-entry route: real browser DataTransfer/DragEvent
 // on the full-canvas native dropzone, still delivered by the
 // existing unified importer. This is browser drag-data simulation,
 // not a physical OS-to-browser file drag claim.
 await page.goto(new URL('?ui=v3',base).href,{waitUntil:'networkidle'});
 assert.equal(await page.locator('#sfv3Empty').isVisible(),true);
 const sourceBytes=await readFile(source);
 const transferred=await page.evaluateHandle(({base64,name})=>{
   const binary=atob(base64);
   const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const dt=new DataTransfer();
   dt.items.add(new File([bytes],name,{type:'video/x-matroska'}));
   return dt;
 },{base64:sourceBytes.toString('base64'),name:'V3 Canvas Dropped.mkv'});
 const actualDropzone=page.locator('#assetDropzone');
 await actualDropzone.dispatchEvent('dragover',{dataTransfer:transferred});
 await actualDropzone.dispatchEvent('drop',{dataTransfer:transferred});
 await transferred.dispose();
 await page.waitForFunction(()=>{
   const file=document.getElementById('videoInput')?.files?.[0];
   return file?.name==='V3 Canvas Dropped.mkv' &&
     document.getElementById('sfv3FileName')?.textContent===file.name &&
     document.querySelector('#sfv3SourceContents .sfv3-observed-row') &&
     document.getElementById('outputCompositionPanel')?.hidden &&
     document.querySelectorAll('#compositionTracks [data-composition-id]').length===0;
 },null,{timeout:150000});
 assert.equal(await page.locator('#unifiedAssetInput').count(),1);
 assert.equal(await page.locator('#assetDropzone').count(),1);
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#muxBtn').isDisabled(),true);
 await page.screenshot({path:path.join(output,'1440-empty-canvas-drop-result.png'),
   fullPage:false});
 evidence.views.push('1440-empty-canvas-drop-result.png');
 evidence.checks.push('canvas-overlaid native DataTransfer/drop reused real importer, source scan and no implicit target');
 assert.deepEqual(pageErrors,[]);
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
