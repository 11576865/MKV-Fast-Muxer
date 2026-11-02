import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function scenarioBatchRunConsole(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});const files=[];
 for(let i=1;i<=3;i++){
  const stem='Console S01E0'+i,video=path.join(outDir,stem+'.mp4'),sub=path.join(outDir,stem+'.en.srt');
  await fs.copyFile(path.join(root,'base.mp4'),video);
  await fs.writeFile(sub,'1\n00:00:00,100 --> 00:00:00,900\nConsole episode '+i+'\n');files.push(video,sub);
 }
 const sourceHash=sha(await fs.readFile(path.join(root,'base.mp4')));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));const receipts=[];
 const download=async(selector,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(file);};
 const directory=async()=>page.evaluate(()=>{
  window.__consoleHeld=false;window.__consoleRelease=null;
  const d={name:'controlled-batch-directory',files:new Map(),writes:[],heldOnce:false,
   requestPermission:async()=> 'granted',async *entries(){for(const n of this.files.keys())yield[n,{kind:'file'}];},
   async getFileHandle(n,{create=false}={}){
    if(!this.files.has(n)){if(!create)throw new DOMException('Not found','NotFoundError');this.files.set(n,new Blob([]));}
    const dir=this;return{getFile:async()=>dir.files.get(n),createWritable:async()=>{let staged;return{
     write:async blob=>{staged=blob;if(n.endsWith('.mkv')&&!dir.heldOnce){dir.heldOnce=true;window.__consoleHeld=true;await new Promise(resolve=>window.__consoleRelease=resolve);}},
     close:async()=>{dir.files.set(n,staged);dir.writes.push(n);},abort:async()=>{}};}};
   }};
  window.__consoleDirectory=d;window.showDirectoryPicker=async()=>d;
 });
 const runRecord=async name=>{const file=path.join(outDir,name+'.run.json');await download('#batchRunExportBtn',file);return JSON.parse(await fs.readFile(file,'utf8'));};
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),path.join(root,'sample.srt')]);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:60000});
  await page.locator('#assetInventory .asset-entry[data-kind="subtitle"] [data-asset-focus-key]').click();
  if(!await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open))await page.locator('#sf14OptionsDrawer > summary').click();
  await page.locator('#newSubtitleList [data-new-sub-field="title"]').fill('Standalone draft stays intact');
  await page.locator('[data-sf-view="batch"]').click();
  await page.setInputFiles('#batchUnifiedInput',files);
  await page.waitForFunction(()=>document.querySelectorAll('#batchPlan [data-batch-job-index]').length===3&&!document.querySelector('#batchStartBtn').disabled,null,{timeout:120000});
  if(await page.locator('[data-sf-batch-controls="recipe"]').isVisible())await page.locator('[data-sf-batch-controls="recipe"]').click();
  const saveOutputs=async(name,count)=>{
   assert.equal(await page.locator('#batchResults a.download').count(),count);
   const items=[];
   for(let i=0;i<count;i++){
    const output=path.join(outDir,name+'-'+i+'.mkv');
    const[d]=await Promise.all([page.waitForEvent('download'),page.locator('#batchResults a.download').nth(i).click()]);await d.saveAs(output);
    const parsed=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'}));
    assert.equal(parsed.streams.filter(s=>s.codec_type==='video').length,1);assert.equal(parsed.streams.filter(s=>s.codec_type==='subtitle').length,1);
    const text=execFileSync('ffmpeg',['-v','error','-i',output,'-map','0:s:0','-c:s','srt','-f','srt','pipe:1'],{encoding:'utf8'});
    assert.ok(text.includes('Console episode '+(i+1)));
    const reportPath=path.join(outDir,name+'-'+i+'.report.json');const[r]=await Promise.all([page.waitForEvent('download'),page.locator('#batchResults a.report-download').nth(i).click()]);await r.saveAs(reportPath);
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.audit.ok,true);assert.equal(report.output.sha256,sha(await fs.readFile(output)));
    items.push({name:path.basename(output),directoryName:report.output.name,sha256:report.output.sha256,text:text.trim()});
   }
   return items;
  };
  for(const mode of ['resume','stop','cancel-paused']){
   await directory();await page.locator('#batchOutputDirBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#batchStartBtn').disabled,null,{timeout:60000});
   await page.locator('#batchStartBtn').click();
   await page.waitForFunction(()=>window.__consoleHeld===true,null,{timeout:180000});
   if(mode==='stop')await page.locator('#batchStopAfterBtn').click();else await page.locator('#batchPauseBtn').click();
   assert.equal(await page.locator('#batchStartBtn').isDisabled(),true);
   await page.evaluate(()=>window.__consoleRelease());
   let paused=null;
   if(mode!=='stop'){
    await page.waitForFunction(()=>document.querySelector('#batchRunStatus').dataset.phase==='paused',null,{timeout:60000});
    assert.equal(await page.locator('#batchResults a.download').count(),1);
    assert.equal(await page.locator('#batchUnifiedInput').isDisabled(),true);
    paused=await runRecord(mode+'-paused');
    assert.equal(paused.control.phase,'paused');assert.deepEqual(paused.jobs.map(j=>j.state),['succeeded','queued','queued']);
    // Download while paused; valid generated bytes remain available.
    await saveOutputs(mode+'-paused',1);
    await page.screenshot({path:path.join(outDir,mode+'-paused.png'),fullPage:true});
    if(mode==='resume')await page.locator('#batchResumeBtn').click();else await page.locator('#batchCancelBtn').click();
   }
   const expected=mode==='resume'?'批量完成：':mode==='stop'?'批量已停止':'批量已取消：';
   await page.waitForFunction(expected=>document.querySelector('#batchStatus').textContent.includes(expected),expected,{timeout:180000});
   const record=await runRecord(mode+'-finished'),outputs=await saveOutputs(mode,mode==='resume'?3:1);
   assert.equal(record.control.phase,'finished');
   assert.equal(record.terminal.stopped===true,mode==='stop');assert.equal(record.terminal.cancelled,mode==='cancel-paused');
   const writes=await page.evaluate(()=>window.__consoleDirectory.writes);
   assert.equal(new Set(writes).size,writes.length,'resume must not rewrite any output member');
   assert.equal(writes.length,mode==='resume'?6:2);
   const savedHashes=await page.evaluate(async()=>Object.fromEntries(await Promise.all([...window.__consoleDirectory.files].filter(([name])=>name.endsWith('.mkv')).map(async([name,blob])=>[name,[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('')]))));
   for(const output of outputs)assert.equal(savedHashes[output.directoryName],output.sha256,'directory bytes must match independently downloaded native-checked output');
   assert.match(record.capturedAt,/^20/);assert.match(record.scope,/snapshot/);
   assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"]').inputValue(),'Standalone draft stays intact');
   assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0].name),'base.mp4');
   receipts.push({mode,paused,record,outputs,writes});
  }
  assert.equal(sha(await fs.readFile(path.join(root,'base.mp4'))),sourceHash);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'batch-run-console-evidence.json'),JSON.stringify({schema:'softmux-batch-run-console-evidence-v1',result:'pass',receipts,sourceHash,singleDraftUnchanged:true,limits:'Real browser mux/native outputs with injected directory backpressure; session control only, not reload recovery, background service or physical disk/tablet acceptance.'},null,2)+'\n');
  console.log('Batch run console: pause/download/resume 3 outputs, finish-current stop and paused cancel PASS');
 }catch(error){console.error('Batch console:',await page.locator('#batchStatus').textContent(),await page.locator('#batchRunStatus').textContent());throw error;}
 finally{await context.close();}
}
