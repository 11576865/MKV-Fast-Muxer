import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// S10/S11 combined recovery proof. The directory API is simulated; every
// successful media output is produced by real Chromium/FFmpeg.wasm and then
// independently downloaded/probed. No production hooks or fake output bytes.
const root=path.resolve(process.env.E2E_FIXTURE_DIR||'.e2e/fixtures');
const out=path.resolve(process.env.E2E_BATCH_RECOVERY_OUTPUT_DIR||'.e2e/batch-recovery-output');
const inputs=path.join(out,'inputs');
const baseUrl=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
await fs.mkdir(inputs,{recursive:true});
const evidencePath=path.join(out,'s10-combined-recovery-evidence.json');
const proof={schema:'softmux-s10-combined-recovery-v1',status:'IN_PROGRESS',
 startedAt:new Date().toISOString(),verifiedJobs:0,files:[],errors:[],
 scope:'20 real default-workbench jobs, two worker execution faults, one report-only directory failure',
 limits:['Two short real media templates, not20heterogeneous films',
  'Directory handle/write failures simulated in memory; no physical disk/tablet/power-loss guarantee',
  'Worker faults injected only before selected mux EXEC; successful outputs use the real Wasm worker']};
const sha=b=>createHash('sha256').update(b).digest('hex');
const shaFile=async p=>sha(await fs.readFile(p));
const native=(command,args)=>execFileSync(command,args,{encoding:'utf8',timeout:30000,maxBuffer:10*1024*1024});
const probe=file=>JSON.parse(native('ffprobe',['-v','error','-show_streams','-of','json',file]));
const packets=(file,stream)=>native('ffmpeg',['-v','error','-i',file,'-map',stream,'-c','copy','-f','hash','-hash','SHA256','-']).trim();
const normal=s=>s.replace(/\r/g,'').trim();
const time=s=>{const[h,m,v]=s.trim().split(':').map(Number);return Math.round((h*3600+m*60+v)*1000);};
function assEvents(text){
 let section='',format=[];const events=[];
 for(const line of text.replace(/\r/g,'').split('\n')){
  if(/^\[.*\]$/.test(line.trim()))section=line.trim();
  else if(section==='[Events]'&&line.startsWith('Format:'))format=line.slice(7).split(',').map(s=>s.trim());
  else if(section==='[Events]'&&line.startsWith('Dialogue:')){
   const fields=line.slice(9).trimStart().split(',');
   const value=Object.fromEntries(format.map((key,i)=>[key,i===format.length-1?fields.slice(i).join(','):fields[i]]));
   events.push({start:time(value.Start),end:time(value.End),style:value.Style,text:value.Text});
  }
 }
 assert.ok(events.length,'independent ASS readback must contain real dialogue');return events;
}
let browser,page;
const artifacts=[];
console.log('S10 recovery starting actual browser');
try{
 for(let i=1;i<=20;i++){
  const stem='Recovery S10E'+String(i).padStart(2,'0'),srt=i%2===0;
  const video=path.join(inputs,stem+'.mp4'),subtitle=path.join(inputs,stem+(srt?'.en.srt':'.zh-Hans.ass'));
  await fs.copyFile(path.join(root,srt?'Batch S01E02.mp4':'Batch S01E01.mp4'),video);
  await fs.copyFile(path.join(root,srt?'Batch S01E02.en.srt':'Batch S01E01.zh-Hans.ass'),subtitle);
  artifacts.push({stem,srt,video,subtitle,outputName:stem+'.mkv',videoSha:await shaFile(video),subtitleSha:await shaFile(subtitle)});
 }
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 // This scenario is a regression of the pre-V3 production workbench.
   // Default / now uses V3's explicit-target permission gate; do not
   // silently authorize a target merely to satisfy a legacy fixture.
   await page.goto(new URL('?ui=workbench',baseUrl).href,{waitUntil:'networkidle'});
 await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),path.join(root,'zh.ass')]);
 await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:60000});
 await page.evaluate(()=>{
  window.__s10SingleVideo=document.querySelector('#videoInput').files[0];
  window.__s10SingleSubs=[...document.querySelector('#subInput').files];
  const original=Worker.prototype.postMessage;window.__s10MuxAttempts=0;
  window.__s10Faults=[];
  Worker.prototype.postMessage=function(message,...rest){
   if(message?.type==='EXEC'&&message.data?.args?.at(-1)?.endsWith('-output.mkv')){
    const ordinal=++window.__s10MuxAttempts;
    if([2,11].includes(ordinal)){
     window.__s10Faults.push(ordinal);
     queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,type:'EXEC',data:1}})));
     return;
    }
   }
   return original.call(this,message,...rest);
  };
  const directory={name:'s10-controlled-directory',files:new Map(),writes:[],reportFailureLeft:1,
   requestPermission:async()=> 'granted',
   async *entries(){for(const name of this.files.keys())yield[name,{kind:'file'}];},
   async getFileHandle(name,{create=false}={}){
    if(create&&this.reportFailureLeft&&name==='Recovery S10E01.mux-report.json'){
     this.reportFailureLeft--;throw new DOMException('S10 injected report quota failure','QuotaExceededError');
    }
    if(!this.files.has(name)){if(!create)throw new DOMException('Missing','NotFoundError');this.files.set(name,new Blob([]));}
    const owner=this;return{getFile:async()=>owner.files.get(name),createWritable:async()=>{
     let staged;return{write:async blob=>{staged=blob;},close:async()=>{owner.files.set(name,staged);owner.writes.push(name);},abort:async()=>{}};
    }};
   }};
  window.__s10Directory=directory;window.showDirectoryPicker=async()=>directory;
 });
 await page.locator('[data-sf-view="batch"]').click();
 console.log('S10 recovery standalone loaded, batch view open');
 // An invalid pairing is a preflight refusal, never a fake executed task.
 await page.setInputFiles('#batchUnifiedInput',[artifacts[0].video,artifacts[1].subtitle]);
 await page.waitForFunction(()=>document.querySelectorAll('#batchAssetInventory .asset-entry').length===2&&document.querySelector('#batchStartBtn').disabled);
 assert.equal(await page.locator('#batchPlan [data-batch-job-index]').count(),0,'unmatched inputs cannot become executable jobs');
 assert.equal(await page.evaluate(()=>window.__s10MuxAttempts),0);
 assert.equal(await page.locator('#batchResults a.download').count(),0);
 proof.invalidPairRefusedWithoutExecution=true;
 console.log('S10 recovery: unmatched pair refused before execution');
 // Release the two deliberately unmatched Files before selecting the actual
 // batch; a same-label fresh File must not silently replace its old authority.
 while(await page.locator('#batchAssetInventory [data-batch-asset-remove]').count())await page.locator('#batchAssetInventory [data-batch-asset-remove]').first().click();
 await page.setInputFiles('#batchUnifiedInput',[...artifacts.flatMap(a=>[a.video,a.subtitle]),path.join(root,'DejaVuSans.ttf')]);
 await page.waitForFunction(()=>document.querySelectorAll('#batchPlan [data-batch-job-index]').length===20&&!document.querySelector('#batchStartBtn').disabled,null,{timeout:120000});
 console.log('S10 recovery: twenty valid jobs reviewed');
 if(await page.locator('[data-sf-batch-controls="recipe"]').isVisible())await page.locator('[data-sf-batch-controls="recipe"]').click();
 await page.locator('#batchOutputDirBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#batchStartBtn').disabled);
 await page.locator('#batchStartBtn').click();
 console.log('S10 recovery: real queue started');
 const terminal=()=>page.waitForFunction(()=>document.querySelector('#batchStatus').textContent.startsWith('批量完成：'),null,{timeout:1200000});
 await terminal();
 proof.initialTerminal=await page.locator('#batchStatus').textContent();
 console.log('S10 recovery initial terminal:',proof.initialTerminal);
 assert.match(proof.initialTerminal,/已生成 18，审计通过 18，待复核 0，执行失败 2/);
 assert.equal(await page.evaluate(()=>window.__s10MuxAttempts),20);
 assert.deepEqual(await page.evaluate(()=>window.__s10Faults),[2,11]);
 assert.equal(await page.locator('[data-batch-job-retry]').count(),2);
 assert.equal(await page.locator('[data-batch-save-retry]').count(),1);
 const retained=await page.locator('#batchResults a.download').evaluateAll(links=>Object.fromEntries(links.map(a=>[a.download,a.href])));
 const originalMkv=await page.evaluate(async()=>{
  const d=window.__s10Directory,b=d.files.get('Recovery S10E01.mkv');
  return{sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join(''),writes:d.writes.filter(n=>n==='Recovery S10E01.mkv').length};
 });
 assert.equal(originalMkv.writes,1);
 await page.locator('[data-batch-save-retry]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-batch-save-retry]'));
 assert.equal(await page.evaluate(()=>window.__s10MuxAttempts),20,'report-only save recovery must not run another mux');
 assert.equal(await page.evaluate(()=>window.__s10Directory.writes.filter(n=>n==='Recovery S10E01.mkv').length),1,'report-only recovery must not rewrite valid MKV');
 proof.reportOnlyRecovery={muxAttempts:20,mkvWrites:1,reportWrites:await page.evaluate(()=>window.__s10Directory.writes.filter(n=>n==='Recovery S10E01.mux-report.json').length)};
 assert.equal(proof.reportOnlyRecovery.reportWrites,1);
 // Remove the failed episode's live subtitle and the shared live font via
 // actual inventory controls. Frozen retries must retain their original Files.
 await page.locator('#batchAssetInventory .asset-entry').filter({hasText:path.basename(artifacts[1].subtitle)}).locator('[data-batch-asset-remove]').click();
 await page.locator('#batchAssetInventory .asset-entry').filter({hasText:'DejaVuSans.ttf'}).locator('[data-batch-asset-remove]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#batchPlan [data-batch-job-index]').length===19);
 for(let i=0;i<2;i++){
  await page.locator('[data-batch-job-retry]').first().click();await terminal();
  console.log('S10 recovery retry:',i+1,await page.locator('#batchStatus').textContent());
  assert.equal(await page.evaluate(()=>window.__s10MuxAttempts),21+i,'exactly one failed job may execute per retry');
  assert.equal(await page.locator('[data-batch-job-retry]').count(),1-i);
  const current=await page.locator('#batchResults a.download').evaluateAll(links=>Object.fromEntries(links.map(a=>[a.download,a.href])));
  for(const [name,url] of Object.entries(retained))assert.equal(current[name],url,'retained successful output URL must not be regenerated');
 }
 assert.match(await page.locator('#batchStatus').textContent(),/已生成 20，审计通过 20，待复核 0，执行失败 0/);
 assert.equal(await page.locator('#batchResults a.download').count(),20);
 assert.equal(await page.locator('[data-batch-save-retry]').count(),0);
 const directorySnapshot=await page.evaluate(async()=>{
  const d=window.__s10Directory,hashes={};
  for(const [name,blob] of d.files)hashes[name]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return{hashes,writes:d.writes};
 });
 assert.equal(directorySnapshot.writes.length,40);
 assert.equal(new Set(directorySnapshot.writes).size,40,'each MKV and report is committed exactly once');
 const ids=new Set();
 for(const a of artifacts){
  const row=page.locator('#batchResults .new-track-row').filter({has:page.locator('a.download').filter({hasText:'保存 MKV'})}).filter({hasText:path.basename(a.video)});
  assert.equal(await row.count(),1);
  const mkv=path.join(out,a.outputName),reportPath=path.join(out,a.stem+'.mux-report.json');
  for(const [locator,destination] of [[row.locator('a.download'),mkv],[row.locator('a.report-download'),reportPath]]){
   const[d]=await Promise.all([page.waitForEvent('download'),locator.click()]);await d.saveAs(destination);
  }
  const report=JSON.parse(await fs.readFile(reportPath,'utf8')),info=probe(mkv),digest=await shaFile(mkv);
  assert.equal(report.plan.execution,'frozen-batch-context-v1');assert.equal(report.plan.outputName,a.outputName);
  assert.equal(ids.has(report.plan.jobId),false);ids.add(report.plan.jobId);
  assert.equal(report.audit.ok,true);assert.equal(report.output.sha256,digest);
  assert.equal(directorySnapshot.hashes[a.outputName],digest);
  assert.equal(directorySnapshot.hashes[a.stem+'.mux-report.json'],await shaFile(reportPath));
  const kinds=type=>info.streams.filter(s=>s.codec_type===type);
  assert.equal(kinds('video').length,1);assert.equal(kinds('audio').length,1);assert.equal(kinds('subtitle').length,1);
  assert.equal(kinds('subtitle')[0].codec_name,a.srt?'subrip':'ass');assert.ok(kinds('attachment').length>=1);
  assert.equal(packets(mkv,'0:v:0'),packets(a.video,'0:v:0'));assert.equal(packets(mkv,'0:a:0'),packets(a.video,'0:a:0'));
  const extracted=native('ffmpeg',['-v','error','-copyts','-i',mkv,'-map','0:s:0','-c:s',a.srt?'srt':'ass','-f',a.srt?'srt':'ass','-']);
  const source=await fs.readFile(a.subtitle,'utf8');
  if(a.srt)assert.equal(normal(extracted),normal(source),'native SRT text and millisecond timeline must match frozen source');
  else assert.deepEqual(assEvents(extracted),assEvents(source),'native ASS times/style/text must match frozen source');
  assert.equal(await shaFile(a.video),a.videoSha);assert.equal(await shaFile(a.subtitle),a.subtitleSha);
  proof.files.push({jobId:report.plan.jobId,outputName:a.outputName,sha256:digest,bytes:(await fs.stat(mkv)).size,
   nativePacketsAndSubtitleVerified:true,directoryAndReportHashesVerified:true,sourceUnchanged:true});
  proof.verifiedJobs=proof.files.length;console.log('S10 recovery native verified',proof.verifiedJobs,'/20');await fs.writeFile(evidencePath,JSON.stringify(proof,null,2)+'\n');
 }
 assert.equal(directorySnapshot.hashes['Recovery S10E01.mkv'],originalMkv.sha);
 assert.equal(await page.evaluate(()=>document.querySelector('#videoInput').files[0]===window.__s10SingleVideo&&[...document.querySelector('#subInput').files].every((f,i)=>f===window.__s10SingleSubs[i])&&document.querySelector('#subInput').files.length===window.__s10SingleSubs.length),true);
 assert.deepEqual(errors,[]);
 proof.finalAttempts=22;proof.finalDirectoryWrites=40;proof.singleProjectFileIdentityUnchanged=true;proof.retainedSuccesses=18;proof.status='PASS';
 console.log('S10 combined recovery PASS:20 native-verified MKVs,22 mux attempts,40 unique directory members; frozen retry/save-only recovery and single-project identity retained');
 await context.close();
}catch(error){proof.status='FAIL';proof.errors.push(error.stack||String(error));if(page){proof.lastStatus=await page.locator('#batchStatus').textContent().catch(()=>null);proof.lastPlan=await page.locator('#batchPlan').textContent().catch(()=>null);proof.dom=await page.evaluate(()=>({entries:document.querySelectorAll('#batchAssetInventory .asset-entry').length,start:document.querySelector('#batchStartBtn')?.disabled})).catch(()=>null);}throw error;}
finally{proof.completedAt=new Date().toISOString();await fs.writeFile(evidencePath,JSON.stringify(proof,null,2)+'\n');await browser?.close();}
