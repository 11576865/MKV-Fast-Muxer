import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createResearchFixture} from '../../scripts/r02-attachment-only-fixture.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function scenarioContainerBatchReview(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 const valid=path.join(outDir,'review-valid.mkv');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(root,'base.mp4'),'-i',path.join(root,'zh.ass'),'-map','0','-map','1:s:0','-c','copy','-attach',path.join(root,'DejaVuSans.ttf'),'-metadata:s:t:0','mimetype=font/ttf',valid]);
 const broken=path.join(outDir,'review-broken.mkv'),only=path.join(outDir,'review-only-attachment.mkv');
 await fs.writeFile(broken,(await fs.readFile(valid)).subarray(0,80));await fs.writeFile(only,createResearchFixture());
 const files=[path.join(root,'base.mp4'),broken,valid,only];
 const before=await Promise.all(files.map(async file=>sha(await fs.readFile(file))));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),path.join(root,'zh.ass')]);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled);
  await page.evaluate(()=>{window.__reviewSingleVideo=document.querySelector('#videoInput').files[0];window.__reviewSingleSub=document.querySelector('#subInput').files[0];});
  const composition=await page.locator('#compositionCount').textContent();
  await page.locator('[data-sf-view="batch"]').click();
  await page.setInputFiles('#batchUnifiedInput',files);
  await page.waitForFunction(()=>!document.querySelector('#batchInspectBtn').disabled,null,{timeout:60000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true,'no subtitles must not create mux jobs');
  await page.locator('#batchInspectBtn').click();
  await page.waitForFunction(()=>document.querySelector('#batchInspectStatus').textContent.startsWith('检查已结束'),null,{timeout:180000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#batchInspectDownload').click()]);
  const dest=path.join(outDir,'container-batch-report.json');await download.saveAs(dest);
  const report=JSON.parse(await fs.readFile(dest,'utf8'));
  assert.equal(report.operation,'read-only-container-review');assert.equal(report.rows.length,4);
  const rows=Object.fromEntries(report.rows.map(row=>[row.source.name,row]));
  assert.equal(rows['base.mp4'].state,'inspected');assert.equal(rows['review-broken.mkv'].state,'failed');
  assert.equal(rows['review-valid.mkv'].state,'inspected');assert.equal(rows['review-only-attachment.mkv'].state,'partial');
  assert.equal(rows['review-only-attachment.mkv'].observation.attachmentInventory.attachments[0].fileUid,'42');
  for(const file of [files[0],valid]){
   const native=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_chapters','-show_format','-of','json',file],{encoding:'utf8'}));
   const observed=rows[path.basename(file)].observation;
   assert.deepEqual(observed.streams.map(s=>[s.index,s.codec_type,s.codec_name]),native.streams.map(s=>[s.index,s.codec_type,s.codec_name]));
   assert.equal(observed.chapters.length,(native.chapters||[]).length);
   assert.equal(observed.claims.writerAdmission,'not-evaluated');assert.equal(observed.claims.remux,'not-performed');
  }
  assert.equal(await page.evaluate(()=>document.querySelector('#videoInput').files[0]===window.__reviewSingleVideo&&document.querySelector('#subInput').files[0]===window.__reviewSingleSub),true,'inspection cannot replace single-project grants');
  assert.equal(await page.locator('#compositionCount').textContent(),composition);
  assert.equal(await page.locator('#batchResults a[download$=".mkv"]').count(),0);
  assert.equal(report.claims.reportPersistence,'download-not-confirmed');
  assert.deepEqual(await Promise.all(files.map(async file=>sha(await fs.readFile(file)))),before,'source bytes changed');
  for(const width of [1440,1024]){await page.setViewportSize({width,height:900});await page.locator('#batchInspectStatus').scrollIntoViewIfNeeded();assert.equal(await page.locator('#batchInspectDownload').isVisible(),true);await page.screenshot({path:path.join(outDir,'container-review-'+width+'.png'),fullPage:true});}
  await page.evaluate(()=>{
    window.__reviewCancelObserver=new MutationObserver(()=>{
      const rows=document.querySelectorAll('#batchInspectResults [data-container-review-state]');
      if(rows[0]?.dataset.containerReviewState==='inspected'&&rows[1]?.dataset.containerReviewState==='inspecting'){
        window.__reviewCancelObserver.disconnect();document.querySelector('#batchInspectCancelBtn').click();
      }
    });
    window.__reviewCancelObserver.observe(document.querySelector('#batchInspectResults'),{childList:true,subtree:true});
  });
  await page.locator('#batchInspectBtn').click();
  await page.waitForFunction(()=>document.querySelector('#batchInspectStatus').textContent.startsWith('检查已结束'),null,{timeout:180000});
  const [cancelDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#batchInspectDownload').click()]);
  const cancelledPath=path.join(outDir,'container-cancelled-report.json');await cancelDownload.saveAs(cancelledPath);
  const cancelled=JSON.parse(await fs.readFile(cancelledPath,'utf8'));
  assert.equal(cancelled.cancelled,true);assert.deepEqual(cancelled.rows.map(r=>r.state),['inspected','cancelled','notRun','notRun']);
  assert.equal(await page.locator('#batchInspectResults a[download]').count(),1,'completed first report must survive cancellation');
  const [itemDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#batchInspectResults a[download]').click()]);
  const itemPath=path.join(outDir,'retained-first-report.json');await itemDownload.saveAs(itemPath);
  assert.equal(JSON.parse(await fs.readFile(itemPath,'utf8')).state,'inspected');
  assert.deepEqual(await Promise.all(files.map(async file=>sha(await fs.readFile(file)))),before);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'container-review-evidence.json'),JSON.stringify({schema:'softmux-container-review-browser-v1',result:'pass',sourceSha256:before,states:report.rows.map(r=>r.state),singleProjectFileGrantsUnchanged:true,actualSourcesCrossCheckedWithNativeFfprobe:true,cancellationStates:cancelled.rows.map(r=>r.state),completedReportRetainedOnCancel:true,remuxPerformed:false,viewports:[1440,1024]},null,2)+'\n');
  console.log('Read-only container batch: no subtitles, per-file continuation/partial reports, native metadata and draft isolation PASS');
 }catch(error){console.error('Container review diagnostic:',await page.locator('#batchInspectStatus').textContent(),(await page.locator('#log').textContent()).slice(-4000));throw error;}
 finally{await context.close();}
}
