import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function scenarioMultiSourceDrafts(browser,{root,outDir,baseUrl}) {
 const names=['draft-A.mkv','draft-B.mkv'];
 for(const [i,name] of names.entries())execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-i',path.join(root,'base.mp4'),'-i',path.join(root,'en.ass'),'-map','0','-map','1','-c','copy',
  '-attach',path.join(root,'DejaVuSans.ttf'),'-metadata:s:t:0','filename=OriginalFont.ttf',
  '-metadata:s:t:0','mimetype=application/x-truetype-font','-metadata:s:a:0',`title=Original ${i?'B':'A'}`,
  path.join(root,name)]);
 const sourceHashes=await Promise.all(names.map(async name=>sha(await fs.readFile(path.join(root,name)))));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const row=name=>page.locator('#assetInventory .asset-entry').filter({has:page.locator('.asset-entry-name',{hasText:name})});
 const waitSource=async name=>{
  await page.waitForFunction(expected=>document.querySelector('#videoInput')?.files[0]?.name===expected &&
   document.querySelector('#assetInventory [data-asset-source]:checked')?.closest('.asset-entry')?.querySelector('[data-tree-select="audio:1"]') &&
   !document.querySelector('#unifiedAssetInput').disabled,name,{timeout:180000});
 };
 const open=async name=>{
  await row(name).locator('[data-asset-source]').waitFor({state:'attached'});
  if(!await row(name).locator('[data-asset-source]').isVisible())
   await page.locator('#sf14SourceToggle').click();
  await row(name).locator('[data-asset-source]').check();await waitSource(name);
 };
 const audioTitle=async()=>{
  await page.locator('#assetInventory [data-tree-select="audio:1"]').click();
  return page.locator('#assetInspectorHost [data-tree-track-field="title"]');
 };
 const edit=async letter=>{
  await page.locator('#assetInventory [data-tree-preserve-all]').uncheck();
  await (await audioTitle()).fill(`Authored ${letter}`);
  await page.locator('#assetInventory [data-tree-select="attachment:3"]').click();
  await page.locator('#assetInspectorHost [data-tree-attachment-field="filename"]').fill(`${letter}-edited.ttf`);
 };
 const verifyDraft=async letter=>{
  assert.equal(await page.locator('#assetInventory [data-tree-preserve-all]').isChecked(),false);
  assert.equal(await (await audioTitle()).inputValue(),`Authored ${letter}`);
  await page.locator('#assetInventory [data-tree-select="attachment:3"]').click();
  assert.equal(await page.locator('#assetInspectorHost [data-tree-attachment-field="filename"]').inputValue(),`${letter}-edited.ttf`);
 };
 const exportOutput=async letter=>{
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>{
   const value=document.querySelector('#status')?.textContent||'';
   if(value.startsWith('失败：'))throw Error(value);
   return value.startsWith('完成。');
  },null,{timeout:180000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);
  const dest=path.join(outDir,`multi-source-authored-${letter}.mkv`);await download.saveAs(dest);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',dest],{encoding:'utf8'}));
  assert.equal(probe.streams.find(s=>s.codec_type==='audio').tags.title,`Authored ${letter}`);
  assert.equal(probe.streams.find(s=>s.codec_type==='attachment').tags.filename,`${letter}-edited.ttf`);
  return {file:path.basename(dest),sha256:sha(await fs.readFile(dest))};
 };
 try {
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',path.join(root,names[0]));await waitSource(names[0]);
  await edit('A');
  // Repeated change on the exact existing grant must not erase its authored draft.
  await page.locator('#videoInput').dispatchEvent('change');await waitSource(names[0]);await verifyDraft('A');
  await page.setInputFiles('#unifiedAssetInput',path.join(root,names[1]));
  await page.waitForFunction(()=>document.querySelectorAll('#assetInventory [data-asset-source]').length===2);
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0].name),names[0],
   'adding B must keep the currently opened A');
  await verifyDraft('A');
  await open(names[1]);
  assert.equal(await (await audioTitle()).inputValue(),'Original B');await edit('B');
  await open(names[0]);await verifyDraft('A');
  assert.equal(await page.locator('#downloadLink').isVisible(),false,'switching and inspection must not generate artifacts');
  const outputA=await exportOutput('A');
  await open(names[1]);await verifyDraft('B');
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false');
  const outputB=await exportOutput('B');
  // Removal drops the old File's session. A reselected same-name File starts
  // from its actual source metadata, not the former authored projection.
  await row(names[0]).locator('[data-asset-remove]').click();
  await page.setInputFiles('#unifiedAssetInput',path.join(root,names[0]));await open(names[0]);
  assert.equal(await page.locator('#assetInventory [data-tree-preserve-all]').isChecked(),true);
  assert.equal(await (await audioTitle()).inputValue(),'Original A');
  for(const width of [1024,768]) {
   await page.setViewportSize({width,height:800});
   await open(names[1]);
   assert.match(await page.locator('#assetInventory [data-tree-select="audio:1"]').textContent(),/Authored B/);
   await open(names[0]);
   assert.match(await page.locator('#assetInventory [data-tree-select="audio:1"]').textContent(),/Original A/);
   await page.locator('#sf14SourceToggle').click();
   await page.screenshot({path:path.join(outDir,`multi-source-drafts-${width}.png`)});
  }
  const after=await Promise.all(names.map(async name=>sha(await fs.readFile(path.join(root,name)))));
  assert.deepEqual(after,sourceHashes);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(outDir,'multi-source-drafts-1440.png')});
  await fs.writeFile(path.join(outDir,'multi-source-drafts-evidence.json'),JSON.stringify({
   sameFileEventPreservesDraft:true,activeSourceRetainedOnImport:true,sourceSpecificDrafts:true,
   removedFileCannotReplayDraft:true,sourcesUnchanged:true,outputs:[outputA,outputB],physicalTablet:false,
  },null,2));
 } catch(error) {
  console.error('Multi-source status:',await page.locator('#status').textContent({timeout:1000}).catch(()=>''));
  console.error('Multi-source log:',await page.locator('#log').textContent({timeout:1000}).catch(()=>''));
  await page.screenshot({path:path.join(outDir,'multi-source-drafts-failure.png')}).catch(()=>{});throw error;
 } finally {await context.close();}
}
