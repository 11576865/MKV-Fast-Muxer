import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const native=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
export async function scenarioWorkspaceHistory(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 const source=path.join(outDir,'history-source.mkv'),note=path.join(outDir,'original-note.txt');
 const otherSubtitle=path.join(outDir,'history-other.srt');await fs.copyFile(path.join(root,'sample.srt'),otherSubtitle);
 await fs.writeFile(note,'History attachment exact payload 91872\n');
 native('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-i',path.join(root,'zh.ass'),
  '-map','0:v:0','-map','0:a:0','-map','0:a:0','-map','1:s:0','-c','copy',
  '-metadata:s:a:0','title=Original A','-metadata:s:a:1','title=Original B',
  '-attach',note,'-metadata:s:t:0','filename=original-note.txt','-metadata:s:t:0','mimetype=text/plain','-avoid_negative_ts','disabled',source]);
 const sourceHash=sha(await fs.readFile(source));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const receipt=[];
 const openFont=async()=>{
  await page.locator('#assetInventory .asset-entry[data-kind="font"] [data-asset-focus-key]').first().click();
  if(!await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open))await page.locator('#sf14OptionsDrawer > summary').click();
 };
 const openSubtitle=async()=>{
  await page.locator('#assetInventory .asset-entry[data-kind="subtitle"] [data-asset-focus-key]').first().click();
  if(!await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open))await page.locator('#sf14OptionsDrawer > summary').click();
 };
 const save=async(name,edited)=>{
  await page.locator('#muxBtn').click();
  assert.equal(await page.locator('#workspaceUndoBtn').isDisabled(),true,'execution locks history travel');
  assert.equal(await page.locator('#workspaceRedoBtn').isDisabled(),true);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
  const output=path.join(outDir,name+'.mkv');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);await d.saveAs(output);
  const probe=JSON.parse(native('ffprobe',['-v','error','-show_streams','-of','json',output]));
  const audios=probe.streams.filter(s=>s.codec_type==='audio'),subs=probe.streams.filter(s=>s.codec_type==='subtitle');
  assert.deepEqual(audios.map(a=>a.tags.title),edited?['Original B','Edited A']:['Original A','Original B']);
  assert.equal(subs.length,edited?2:3);
  if(edited)assert.ok(subs.some(s=>s.tags.title==='Edited external'),'included external authored title must survive redo into the actual MKV');
  if(!edited)assert.ok(subs.some(s=>s.tags.title===originalExternalTitle));
  const att=probe.streams.filter(s=>s.codec_type==='attachment').find(s=>s.tags.mimetype==='text/plain');
  assert.equal(att.tags.filename,edited?'edited-note.txt':'original-note.txt');
  const extracted=path.join(outDir,name+'.note.txt');
  native('ffmpeg',['-v','error','-y','-dump_attachment:'+att.index,extracted,'-i',output,'-map','0:v:0','-c','copy','-f','null','-']);
  assert.equal(sha(await fs.readFile(extracted)),sha(await fs.readFile(note)));
  const[r]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);
  const reportPath=path.join(outDir,name+'.report.json');await r.saveAs(reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.audit.ok,true);
  receipt.push({phase:name,outputSha256:sha(await fs.readFile(output)),audios:audios.map(a=>a.tags.title),subtitleCount:subs.length,attachmentName:att.tags.filename,attachmentSha256:sha(await fs.readFile(extracted)),fontMode:await page.locator('#fontMode').inputValue()});
 };
 let originalExternalTitle;
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[source,path.join(root,'sample.srt'),otherSubtitle,path.join(root,'DejaVuSans.ttf')]);
  await page.waitForFunction(()=>document.querySelectorAll('#trackList [data-track-action="include"]').length>=3&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.equal(await page.locator('#workspaceUndoBtn').isDisabled(),true);
  const tree=page.locator('#assetInventory .asset-container-tree').first();
  if(!await tree.evaluate(el=>el.open))await tree.locator('summary').first().click();
  await tree.locator('[data-tree-preserve-all]').uncheck();
  await tree.locator('[data-tree-group="audio"] [data-tree-select]').first().click();
  await page.locator('#assetInspectorHost [data-tree-track-field="title"]').fill('Edited A');
  await tree.locator('[data-tree-group="attachment"] [data-tree-select]').first().click();
  await page.locator('#assetInspectorHost [data-tree-attachment-field="filename"]').fill('edited-note.txt');
  await openSubtitle();
  const externalTitle=page.locator('#newSubtitleList [data-new-sub-field="title"]').first();
  originalExternalTitle=await externalTitle.inputValue();await externalTitle.fill('Edited external');
  await page.locator('#newSubtitleList [data-new-sub-field="include"]').nth(1).uncheck();
  await openFont();await page.locator('#fontMode').selectOption('force');
  await tree.locator('[data-tree-group="audio"] [data-tree-select]').nth(1).click();
  await page.locator('#assetInspectorHost [data-tree-track-move="-1"]').click();
  assert.equal(await page.locator('#workspaceHistoryList li[data-applied="true"]').count(),6);
  await page.locator('#workspaceHistoryPanel summary').click();
  await page.screenshot({path:path.join(outDir,'history-desktop.png'),fullPage:true});
  await save('edited',true);
  for(let i=0;i<6;i++)await page.locator('#workspaceUndoBtn').click();
  assert.equal(await page.locator('#workspaceUndoBtn').isDisabled(),true);
  assert.equal(await page.locator('#fontMode').inputValue(),'preserve');
  assert.equal(await page.locator('#workspaceHistoryList li[data-applied="false"]').count(),6);
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false','edited output must not certify undone plan');
  await save('undone',false);
  for(let i=0;i<6;i++)await page.locator('#workspaceRedoBtn').click();
  assert.equal(await page.locator('#workspaceRedoBtn').isDisabled(),true);
  assert.equal(await page.locator('#fontMode').inputValue(),'force');
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false','undone output must not certify redone plan');
  await save('redone',true);
  // Native text-field undo is not hijacked by workspace history.
  await openSubtitle();const title=page.locator('#newSubtitleList [data-new-sub-field="title"]').first();
  await title.focus();const before=await page.locator('#workspaceHistoryStatus').textContent();
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('#workspaceHistoryStatus').textContent(),before);
  // Outside fields, keyboard travel uses the same commands as the toolbar.
  await page.locator('#workspaceUndoBtn').focus();await page.keyboard.press('Control+z');
  assert.equal(await page.locator('#workspaceHistoryList li[data-applied="false"]').count(),1);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.locator('#workspaceHistoryList li[data-applied="false"]').count(),0);
  await page.locator('#workspaceUndoBtn').click();await page.locator('#workspaceUndoBtn').click();
  await openSubtitle();await page.locator('#newSubtitleList [data-new-sub-field="include"]').nth(1).check();
  assert.equal(await page.locator('#workspaceRedoBtn').isDisabled(),true,'new edit discards redo branch');
  for(const width of [1024,768]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.locator('#workspaceUndoBtn').isVisible(),true);
   await page.screenshot({path:path.join(outDir,'history-'+width+'.png'),fullPage:true});
  }
  assert.equal(sha(await fs.readFile(source)),sourceHash);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#workspaceUndoBtn').isDisabled(),true);
  assert.equal(await page.locator('#workspaceRedoBtn').isDisabled(),true);
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files.length),0);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'workspace-history-evidence.json'),JSON.stringify({schema:'softmux-workspace-history-v1',result:'pass',steps:6,receipt,sourceHash,sourceUnchanged:true,branchTruncation:true,reloadClearsPermissionsAndHistory:true,keyboardOutsideFields:true,limits:'Controlled source/external/font/attachment sequence and 3 actual outputs; session-local metadata history, not persisted File grants, arbitrary input changes or physical tablet acceptance.'},null,2)+'\n');
  console.log('Workspace history: 6 cross-domain steps, undo/redo, branch, shortcuts and 3 actual MKVs PASS');
 }catch(error){console.error('History:',await page.locator('#status').textContent(),await page.locator('#workspaceHistoryStatus').textContent(),(await page.locator('#log').textContent()).slice(-1600));throw error;}
 finally{await context.close();}
}
