import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function scenarioSingleSaveReceipt(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 const source=path.join(root,'base.mp4'),sourceSha=sha(await fs.readFile(source));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const waitStatus=text=>page.waitForFunction(text=>document.querySelector('#singleDirectorySaveStatus').textContent.includes(text),text,{timeout:60000});
 const download=async(selector,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(file);};
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[source,path.join(root,'sample.srt')]);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:60000});
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
  const output=path.join(outDir,'generated.mkv'),reportPath=path.join(outDir,'generated.report.json');
  await download('#downloadLink',output);await download('#reportLink',reportPath);
  const outputSha=sha(await fs.readFile(output)),report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.output.sha256,outputSha);assert.equal(report.audit.ok,true);
  const completedLog=await page.locator('#log').textContent();
  // Controlled browser API fault injection; actual generated blobs pass through
  // production writers and full-byte readback. This is not physical-disk proof.
  await page.evaluate(()=>{
   const make=name=>({name,files:new Map(),writes:[],denyReport:false,corrupt:false,
    requestPermission:async()=> 'granted',
    async *entries(){for(const key of this.files.keys())yield [key,{kind:'file'}];},
    async getFileHandle(name,{create=false}={}){
     if(create&&this.denyReport&&name.endsWith('.json'))throw new DOMException('Report permission revoked','NotAllowedError');
     if(!this.files.has(name)){if(!create)throw new DOMException('Not found','NotFoundError');this.files.set(name,new Blob([]));}
     const dir=this;
     return {getFile:async()=>dir.corrupt&&name.endsWith('.mkv')?new Blob(['corrupt readback']):dir.files.get(name),
      createWritable:async()=>{let pending;return {write:async blob=>{pending=blob;},close:async()=>{dir.files.set(name,pending);dir.writes.push(name);},abort:async()=>{}};}};
    }});
   window.__receiptDirs=[make('directory-A'),make('directory-B'),make('directory-C'),make('directory-D')];
   window.__receiptSelection=0;window.__receiptCancel=false;
   window.showDirectoryPicker=async()=>{if(window.__receiptCancel){window.__receiptCancel=false;throw new DOMException('Cancelled','AbortError');}return window.__receiptDirs[window.__receiptSelection];};
  });
  await page.locator('#singleChooseDirectoryBtn').click();await waitStatus('均已逐字节回读一致');
  const firstStatus=await page.locator('#singleDirectorySaveStatus').textContent();
  assert.equal(await page.locator('#singleRetryDirectoryBtn').isVisible(),false);
  await page.evaluate(()=>{window.__receiptCancel=true;});
  await page.locator('#singleChooseDirectoryBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#singleChooseDirectoryBtn').disabled);
  assert.equal(await page.locator('#singleDirectorySaveStatus').textContent(),firstStatus,'cancel preserves successful A receipt');
  await page.evaluate(()=>{
   const a=window.__receiptDirs[0],b=window.__receiptDirs[1];
   const name=[...a.files.keys()].find(n=>n.endsWith('.mkv'));
   b.files.set(name,new Blob(['existing user data']));window.__receiptSelection=1;
  });
  await page.locator('#singleChooseDirectoryBtn').click();await waitStatus('已存在');
  assert.equal(await page.locator('#singleRetryDirectoryBtn').isVisible(),true,'failed B must not inherit A success and hide save-only retry');
  assert.equal(await page.evaluate(async()=>[...window.__receiptDirs[1].files.values()][0].text()),'existing user data');
  assert.equal(await page.evaluate(()=>window.__receiptDirs[1].writes.length),0);
  await page.evaluate(()=>{window.__receiptDirs[1].files.clear();}); // User resolves conflict outside the app.
  await page.locator('#singleRetryDirectoryBtn').click();await waitStatus('均已逐字节回读一致');
  assert.match(await page.locator('#singleDirectorySaveStatus').textContent(),/directory-B/);
  await page.evaluate(()=>{window.__receiptSelection=2;window.__receiptDirs[2].denyReport=true;});
  await page.locator('#singleChooseDirectoryBtn').click();await waitStatus('报告未保存');
  assert.equal(await page.locator('#singleRetryDirectoryBtn').isVisible(),true);
  await page.evaluate(()=>{window.__receiptDirs[2].denyReport=false;});
  await page.locator('#singleRetryDirectoryBtn').click();await waitStatus('均已逐字节回读一致');
  await page.evaluate(()=>{window.__receiptSelection=3;window.__receiptDirs[3].corrupt=true;});
  await page.locator('#singleChooseDirectoryBtn').click();await waitStatus('目录保存未完成');
  assert.equal(await page.locator('#singleRetryDirectoryBtn').isVisible(),true);
  const writesBefore=await page.evaluate(()=>window.__receiptDirs[3].writes.length);
  await page.locator('#singleRetryDirectoryBtn').click();await waitStatus('已存在');
  assert.equal(await page.evaluate(()=>window.__receiptDirs[3].writes.length),writesBefore,'failed readback residual must not be overwritten');
  const saved=await page.evaluate(async()=>Promise.all(window.__receiptDirs.map(async d=>({name:d.name,writes:d.writes,files:await Promise.all([...d.files].map(async([name,b])=>({name,size:b.size,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('')})))}))));
  for(const entry of saved.slice(0,3)){
   assert.equal(entry.writes.length,2,'exactly one MKV and one report write per successful destination');
   assert.equal(entry.files.find(f=>f.name.endsWith('.mkv')).sha256,outputSha);
   assert.equal(entry.files.find(f=>f.name.endsWith('.json')).sha256,sha(await fs.readFile(reportPath)));
  }
  assert.equal(saved[3].writes.length,1);
  assert.equal(saved[3].files.filter(f=>f.name.endsWith('.json')).length,0);
  assert.equal(await page.locator('#log').textContent(),completedLog,'save retries must not rerun mux/audit');
  const fallback=path.join(outDir,'fallback-after-failures.mkv');await download('#downloadLink',fallback);
  assert.equal(sha(await fs.readFile(fallback)),outputSha);
  assert.equal(sha(await fs.readFile(source)),sourceSha);assert.deepEqual(errors,[]);
  const native=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',fallback],{encoding:'utf8'}));
  assert.equal(native.streams.filter(s=>s.codec_type==='video').length,1);
  assert.equal(native.streams.filter(s=>s.codec_type==='subtitle').length,1);
  await fs.writeFile(path.join(outDir,'single-save-receipt-evidence.json'),JSON.stringify({schema:'softmux-single-save-receipt-v1',result:'pass',outputSha256:outputSha,sourceSha256:sourceSha,sourceUnchanged:true,destinations:saved,saveOnly:true,limits:'Real browser output/native FFprobe, injected directory API faults and byte readback. Not physical-disk/power-loss persistence, target tablet or full S11 acceptance.'},null,2)+'\n');
  console.log('Single save receipt: directory switch conflict, save-only retry, report permission and corrupt readback PASS');
 }catch(error){console.error('Single save receipt',await page.locator('#singleDirectorySaveStatus').textContent());throw error;}
 finally{await context.close();}
}
