import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function scenarioBatchExecutionSelection(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});const files=[];
 for(let i=1;i<=3;i++){
  const video=path.join(outDir,'Pick S01E0'+i+'.mp4'),sub=path.join(outDir,'Pick S01E0'+i+'.en.srt');
  await fs.copyFile(path.join(root,'base.mp4'),video);await fs.writeFile(sub,'1\n00:00:00,100 --> 00:00:00,900\nSelected episode '+i+'\n');files.push(video,sub);
 }
 const sourceHashes=await Promise.all(files.map(async f=>sha(await fs.readFile(f))));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const waitCount=count=>page.waitForFunction(count=>document.querySelector('#batchSelectionStatus').textContent.includes('本次执行 '+count+' / 3'),count,{timeout:60000});
 const waitReady=()=>page.waitForFunction(()=>!document.querySelector('#batchStartBtn').disabled,null,{timeout:120000});
 const download=async(locator,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),locator.click()]);await d.saveAs(file);};
 const checked=()=>page.locator('#batchPlan [data-batch-execute-index]').evaluateAll(els=>els.map(el=>el.checked));
 const receipts=[];
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.locator('[data-sf-view="batch"]').click();
  await page.setInputFiles('#batchUnifiedInput',files);await waitCount(3);await waitReady();
  await page.locator('#batchSelectNoneBtn').click();await waitCount(0);assert.equal(await page.locator('#batchStartBtn').isDisabled(),true);
  await page.locator('#batchInvertSelectionBtn').click();await waitCount(3);
  await page.locator('#batchPlan [data-batch-execute-index="1"]').uncheck();await waitCount(2);
  await page.locator('#batchPlan [data-batch-job-index="1"]').click();
  await page.locator('#batchJobInspector [data-batch-task-field="title"]').fill('Retained excluded episode two');
  await waitCount(2);await waitReady();assert.deepEqual(await checked(),[true,false,true]);
  if(await page.locator('[data-sf-batch-controls="recipe"]').isVisible())await page.locator('[data-sf-batch-controls="recipe"]').click();
  const recipePath=path.join(outDir,'all-reviewed-recipe.json');await download(page.locator('#batchRecipeV2ExportBtn'),recipePath);
  assert.equal(JSON.parse(await fs.readFile(recipePath,'utf8')).jobs.length,3,'recipe keeps all reviewed task rules rather than serializing execution selection');
  await page.evaluate(()=>{
   const d={name:'selection-destination',files:new Map([['Pick S01E02.mkv',new Blob(['EXISTING EXCLUDED FILE'])],['Pick S01E02.mux-report.json',new Blob(['EXISTING EXCLUDED REPORT'])]]),writes:[],hold:true,
    requestPermission:async()=> 'granted',async *entries(){for(const n of this.files.keys())yield[n,{kind:'file'}];},
    async getFileHandle(n,{create=false}={}){
     if(!this.files.has(n)){if(!create)throw new DOMException('Not found','NotFoundError');this.files.set(n,new Blob([]));}
     const dir=this;return{getFile:async()=>dir.files.get(n),createWritable:async()=>{let pending;return{
      write:async blob=>{pending=blob;if(dir.hold&&n.endsWith('.mkv')){dir.hold=false;window.__selectionHeld=true;await new Promise(resolve=>window.__selectionRelease=resolve);}},
      close:async()=>{dir.files.set(n,pending);dir.writes.push(n);},abort:async()=>{}};}};
    }};window.__selectionDir=d;window.showDirectoryPicker=async()=>d;
  });
  await page.locator('#batchOutputDirBtn').click();await waitReady();
  await page.locator('#batchStartBtn').click();await page.waitForFunction(()=>window.__selectionHeld===true,null,{timeout:180000});
  assert.equal(await page.locator('#batchSelectAllBtn').isDisabled(),true);
  assert.equal(await page.locator('#batchPlan [data-batch-execute-index]').evaluateAll(els=>els.every(e=>e.disabled)),true);
  await page.evaluate(()=>window.__selectionRelease());
  await page.waitForFunction(()=>document.querySelector('#batchStatus').textContent.startsWith('批量完成：'),null,{timeout:180000});
  assert.equal(await page.locator('#batchResults a.download').count(),2);
  assert.equal(await page.evaluate(async()=>window.__selectionDir.files.get('Pick S01E02.mkv').text()),'EXISTING EXCLUDED FILE');
  const verifyOutputs=async(name,episodes)=>{
   const runPath=path.join(outDir,name+'.run.json');await download(page.locator('#batchRunExportBtn'),runPath);
   const record=JSON.parse(await fs.readFile(runPath,'utf8'));assert.equal(record.jobs.length,episodes.length);
   const items=[];
   for(let i=0;i<episodes.length;i++){
    const ep=episodes[i],output=path.join(outDir,name+'-'+ep+'.mkv');await download(page.locator('#batchResults a.download').nth(i),output);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'}));
    const subs=info.streams.filter(s=>s.codec_type==='subtitle');assert.equal(subs.length,1);assert.equal(info.streams.filter(s=>s.codec_type==='video').length,1);
    const text=execFileSync('ffmpeg',['-v','error','-i',output,'-map','0:s:0','-c:s','srt','-f','srt','pipe:1'],{encoding:'utf8'});assert.ok(text.includes('Selected episode '+ep));
    if(ep===2)assert.equal(subs[0].tags.title,'Retained excluded episode two');
    const rp=path.join(outDir,name+'-'+ep+'.report.json');await download(page.locator('#batchResults a.report-download').nth(i),rp);
    const report=JSON.parse(await fs.readFile(rp,'utf8'));assert.equal(report.audit.ok,true);assert.equal(report.output.sha256,sha(await fs.readFile(output)));
    items.push({episode:ep,sha256:report.output.sha256,title:subs[0].tags.title});
   }return {record,items};
  };
  receipts.push(await verifyOutputs('first-and-third',[1,3]));
  assert.equal(await page.locator('#batchPlan [data-batch-job-index]').count(),3);
  await page.locator('#batchInvertSelectionBtn').click();await waitCount(1);assert.deepEqual(await checked(),[false,true,false]);
  await page.waitForFunction(()=>document.querySelector('#batchStartBtn').disabled===true);
  // The user removes the selected target conflict outside the application.
  await page.evaluate(()=>{window.__selectionDir.files.delete('Pick S01E02.mkv');window.__selectionDir.files.delete('Pick S01E02.mux-report.json');});
  await page.locator('#batchOutputDirBtn').click();await waitReady();
  await page.locator('#batchPlan [data-batch-job-index="1"]').click();
  assert.equal(await page.locator('#batchJobInspector [data-batch-task-field="title"]').inputValue(),'Retained excluded episode two');
  await page.locator('#batchStartBtn').click();await page.waitForFunction(()=>document.querySelector('#batchStatus').textContent.startsWith('批量完成：'),null,{timeout:180000});
  assert.equal(await page.locator('#batchResults a.download').count(),1);receipts.push(await verifyOutputs('second-only',[2]));
  const writes=await page.evaluate(()=>window.__selectionDir.writes);assert.equal(writes.length,6);assert.equal(new Set(writes).size,6);
  assert.equal(await page.locator('#batchVideoInput').evaluate(el=>el.files.length),3);
  assert.deepEqual(await Promise.all(files.map(async f=>sha(await fs.readFile(f)))),sourceHashes);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(outDir,'selected-batch-desktop.png'),fullPage:true});
  for(const width of [1024,768]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.locator('#batchPlan [data-batch-execute-index="1"]').isVisible(),true);
   assert.ok((await page.locator('#batchSelectAllBtn').boundingBox()).height>=44);
   await page.screenshot({path:path.join(outDir,'selected-batch-'+width+'.png'),fullPage:true});
  }
  await fs.writeFile(path.join(outDir,'batch-selection-evidence.json'),JSON.stringify({schema:'softmux-batch-execution-selection-v1',result:'pass',receipts,writes,sourceHashes,retainedReviewedTasks:3,reimportRequired:false,limits:'Controlled exact-File session selection and 3 actual outputs with injected directory backpressure; not reload replay, arbitrary malformed-input bypass or physical disk/tablet acceptance.'},null,2)+'\n');
  console.log('Batch execution selection: 1+3 then edited 2 without reimport; scoped conflicts/native outputs PASS');
 }catch(error){console.error('Batch selection:',await page.locator('#batchStatus').textContent(),await page.locator('#batchSelectionStatus').textContent());throw error;}
 finally{await context.close();}
}
