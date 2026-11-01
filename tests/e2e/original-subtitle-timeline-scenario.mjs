import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const probe=(file,selector)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams',selector,
 '-show_packets','-show_streams','-show_data_hash','sha256','-of','json',file],{encoding:'utf8'}));
function assertTimelineCopy(source,output){
 const receipts=[];
 for(const selector of ['v:0','a:0','s:0']){
  const before=probe(source,selector),after=probe(output,selector);
  assert.equal(before.streams.length,1);assert.equal(after.streams.length,1);
  assert.equal(after.streams[0].codec_name,before.streams[0].codec_name);
  assert.ok(before.packets.length>0);
  assert.deepEqual(after.packets.map(p=>p.data_hash),before.packets.map(p=>p.data_hash),selector+' payload changed');
  for(let i=0;i<before.packets.length;i++){
   assert.ok(Number.isFinite(Number(before.packets[i].pts_time))&&Number.isFinite(Number(after.packets[i].pts_time)),'missing packet PTS');
   assert.ok(Math.abs(Number(before.packets[i].pts_time)-Number(after.packets[i].pts_time))<=0.0011,
    selector+' packet '+i+' timeline shifted: '+before.packets[i].pts_time+' -> '+after.packets[i].pts_time);
  }
  receipts.push({selector,codec:before.streams[0].codec_name,packets:before.packets.length,
   sourcePts:before.packets.map(p=>p.pts_time),outputPts:after.packets.map(p=>p.pts_time),payloadSha256:after.packets.map(p=>p.data_hash)});
 }
 return receipts;
}
export async function scenarioOriginalSubtitleTimeline(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 const source=path.join(outDir,'negative-aac-original-ass.mkv');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-copyts','-i',path.join(root,'base.mp4'),
  '-i',path.join(root,'zh.ass'),'-map','0','-map','1:s:0','-c','copy','-metadata:s:s:0','language=zho',
  '-metadata:s:s:0','title=Original-source-ASS','-avoid_negative_ts','disabled',source]);
 const sourceHash=sha(await fs.readFile(source));
 assert.ok(Number(probe(source,'a:0').packets[0].pts_time)<0,'fixture must preserve AAC priming as a real negative timestamp');
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const receipts=[];
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[source]);
  await page.waitForFunction(()=>document.querySelectorAll('#trackList [data-track-action="include"]').length>=2&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.equal(await page.locator('#subInput').evaluate(el=>el.files.length),0);
  for(const mode of ['preserve-all','selected-original']){
   if(mode==='preserve-all')assert.equal(await page.locator('#appendPreserveAll').isChecked(),true);
   if(mode==='selected-original'){
    await page.locator('[data-tree-advanced-tools]').click();
    await page.locator('#sf14OptionsDrawer > summary').click();
    await page.locator('#appendPreserveAll').uncheck();
    assert.equal(await page.locator('#appendPreserveAll').isChecked(),false);
    const title=page.locator('#trackList [data-track-field="title"]').last();
    await title.fill('Edited original subtitle');
   }
   await page.locator('#muxBtn').click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);
   const output=path.join(outDir,mode+'.mkv');await download.saveAs(output);
   const [reportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);
   const reportPath=path.join(outDir,mode+'.report.json');await reportDownload.saveAs(reportPath);
   const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.audit.ok,true);
   const streams=assertTimelineCopy(source,output);
   if(mode==='selected-original')assert.equal(probe(output,'s:0').streams[0].tags.title,'Edited original subtitle');
   receipts.push({mode,outputSha256:sha(await fs.readFile(output)),uiAuditOk:report.audit.ok,streams});
  }
  assert.equal(sha(await fs.readFile(source)),sourceHash);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'original-subtitle-timeline-evidence.json'),JSON.stringify({schema:'softmux-original-subtitle-timeline-v1',result:'pass',sourceSha256:sourceHash,sourceUnchanged:true,externalSubtitleFiles:0,receipts,limits:'Controlled negative-AAC Matroska source with one original ASS; packet PTS tolerance 1.1 ms. Not all timestamp/discontinuity/container combinations.'},null,2)+'\n');
  console.log('Original subtitles without additions: actual copy packets and timestamps PASS');
 }catch(error){console.error('Original timeline:',await page.locator('#status').textContent(),(await page.locator('#log').textContent()).slice(-2500));throw error;}
 finally{await context.close();}
}
