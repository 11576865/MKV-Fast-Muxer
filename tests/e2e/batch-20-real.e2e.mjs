import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

/**
 * Softmux 1.0 S10 - twenty ACTUAL browser/Wasm jobs, NOT twenty fake plan rows.
 * This is a repeat-execution baseline built from two already independently
 * generated, real 2-second AAC/MPEG-4 fixtures. It does not certify varied
 * feature-film inputs, tablet memory, 1+ GB files or persistence after restart.
 */
const root = path.resolve(process.env.E2E_FIXTURE_DIR || '.e2e/fixtures');
const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/';
const outDir = path.resolve('.e2e/batch20-output');
const stagedDir = path.join(outDir, 'inputs');
const evidencePath = path.join(outDir, 'softmux-s10-twenty-real-mkvs-evidence.json');
await fs.rm(outDir, {recursive:true,force:true});
await fs.mkdir(stagedDir,{recursive:true});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function shaFile(file) { return sha256(await fs.readFile(file)); }
function nativeProbe(file) {
  return JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_streams','-show_format','-of','json',file,
  ],{encoding:'utf8',timeout:30000}));
}
function codecStreams(json,type) {
  return (json.streams || []).filter(s=>s.codec_type===type);
}
function packetHash(file,type) {
  const stream = type==='video'?'0:v:0':'0:a:0';
  return execFileSync('ffmpeg',[
    '-hide_banner','-loglevel','error','-i',file,'-map',stream,
    '-c','copy','-f','hash','-hash','SHA256','-',
  ],{encoding:'utf8',timeout:30000}).trim();
}
async function downloadTo(page,selector,dest) {
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),
    page.locator(selector).click()]);
  await download.saveAs(dest);
}
const normalized = x=>String(x).replace(/\r/g,'').trim();
const pad = n=>String(n).padStart(2,'0');

const manifest={
  schema:'softmux-s10-twenty-real-mkv-v1',
  claim:'20 sequential real Chromium FFmpeg/Wasm mux + independently downloaded artifact verification',
  limitations:[
    'Sources are 20 separately named local File objects derived from two real 2-second AAC/MPEG-4 test sources',
    'This does not prove 20 heterogeneous long-form media sources',
    'No directory write selected: awaitingSave is correct until user downloads',
    'This does not prove desktop/tablet >1 GB reliability or power-loss persistence',
  ],
  startedAt:new Date().toISOString(),status:'IN_PROGRESS',
  totalJobs:20,verifiedJobs:0,files:[],browser:null,errors:[],
};
const artifacts=[];
const started=Date.now();
let browser;
try {
  for(let i=1;i<=20;i++){
    const episode='Batch Stress S09E'+pad(i);
    const srt=i%2===0;
    const sourceVideo=path.join(root,srt?'Batch S01E02.mp4':'Batch S01E01.mp4');
    const sourceSubtitle=path.join(root,srt?'Batch S01E02.en.srt':'Batch S01E01.zh-Hans.ass');
    const videoPath=path.join(stagedDir,episode+'.mp4');
    const subtitlePath=path.join(stagedDir,episode+(srt?'.en.srt':'.zh-Hans.ass'));
    await fs.copyFile(sourceVideo,videoPath);
    await fs.copyFile(sourceSubtitle,subtitlePath);
    artifacts.push({
      episode,srt,videoPath,subtitlePath,
      outputName:episode+'.mkv',
      videoHashBefore:await shaFile(videoPath),
      subtitleHashBefore:await shaFile(subtitlePath),
    });
  }
  const expectedVideoHash=packetHash(path.join(root,'Batch S01E01.mp4'),'video');
  const expectedAudioHash=packetHash(path.join(root,'Batch S01E01.mp4'),'audio');
  browser=await chromium.launch({
    headless:true,
    ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  });
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>{pageErrors.push(String(e));console.error('BATCH20 pageerror',e);});
  await page.goto(new URL('?ui=legacy',baseUrl).toString(),{waitUntil:'networkidle'});
  await page.locator('#batchStartBtn').waitFor();
  manifest.browser=await page.evaluate(()=>({
    userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,
  }));
  // Existing independent single-project draft must never be rewritten by batch.
  await page.setInputFiles('#videoInput',path.join(root,'base.mp4'));
  await page.setInputFiles('#subInput',path.join(root,'zh.ass'));
  await page.waitForFunction(()=>Boolean(document.querySelector('#videoInput')?.files?.length &&
      document.querySelector('#subInput')?.files?.length),null,{timeout:30000});
  const before=await page.evaluate(()=>({
    video:document.querySelector('#videoInput')?.files?.[0]?.name,
    subtitle:document.querySelector('#subInput')?.files?.[0]?.name,
  }));
  await page.locator('.batch-drawer > summary').click();
  await page.setInputFiles('#batchVideoInput',artifacts.map(a=>a.videoPath));
  await page.setInputFiles('#batchSubtitleInput',artifacts.map(a=>a.subtitlePath));
  await page.setInputFiles('#batchFontInput',path.join(root,'DejaVuSans.ttf'));
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan [data-batch-job-index]').length===20 &&
    document.querySelector('#batchStartBtn')?.disabled===false
  ),null,{timeout:120000});
  assert.equal(await page.locator('#batchPlan [data-batch-job-index]').count(),20);
  assert.equal(await page.locator('#batchPlan .batch-review-state[data-state="blocked"]').count(),0);
  assert.equal(await page.locator('#batchResults .new-track-row').count(),0,
    'reviewed plan must not fabricate delivered objects');
  console.log('S10 BATCH20 20 reviewed independent video/subtitle pairings, shared font; actual run starting');
  await page.locator('#batchStartBtn').click();
  await page.waitForFunction(()=>{
    const label=document.querySelector('#batchStatus')?.textContent||'';
    return label.startsWith('批量完成：')||label.startsWith('批量已取消：');
  },null,{timeout:1_200_000});
  const terminal=await page.locator('#batchStatus').textContent();
  manifest.batchTerminal=terminal;
  assert.match(terminal,/成功 20，失败 0/);
  assert.doesNotMatch(terminal,/审计存在差异|审计.*不可用|未完整写入目录/);
  assert.equal(await page.locator('#batchResults .new-track-row').count(),20);
  assert.equal(await page.locator('#batchResults a.download').count(),20);
  assert.equal(await page.locator('#batchResults a.report-download').count(),20);
  assert.equal(await page.locator('#batchPlan .batch-review-state[data-state="awaitingSave"]').count(),20,
    'successful generated/audited but not disk-persisted MKVs remain awaitingSave');
  assert.equal(await page.locator('#batchPlan .batch-review-state[data-state="auditWarning"]').count(),0);
  const after=await page.evaluate(()=>({
    video:document.querySelector('#videoInput')?.files?.[0]?.name,
    subtitle:document.querySelector('#subInput')?.files?.[0]?.name,
  }));
  assert.deepEqual(after,before,'20-item frozen batch cannot overwrite independent single project');
  assert.deepEqual(pageErrors,[],'no uncaught browser page errors during batch');

  const seenJobIds=new Set(),seenOutputs=new Set();
  for(let i=0;i<artifacts.length;i++){
    const job=artifacts[i];
    const mkvPath=path.join(outDir,job.outputName);
    const reportPath=path.join(outDir,job.episode+'.mux-report.json');
    const row='#batchResults .new-track-row:nth-child('+(i+1)+')';
    await downloadTo(page,row+' a.download',mkvPath);
    await downloadTo(page,row+' a.report-download',reportPath);
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    const info=nativeProbe(mkvPath);
    const sourceInfo=nativeProbe(job.videoPath);
    const video=codecStreams(info,'video'),audio=codecStreams(info,'audio');
    const subs=codecStreams(info,'subtitle');
    const attachments=codecStreams(info,'attachment');
    assert.equal(report.plan.execution,'frozen-batch-context-v1');
    assert.equal(report.plan.outputName,job.outputName);
    assert.match(String(report.plan.jobId),/^batch:/);
    assert.equal(seenJobIds.has(report.plan.jobId),false,'each output must have a unique frozen Job ID');
    assert.equal(seenOutputs.has(report.plan.outputName),false,'output filename collision');
    seenJobIds.add(report.plan.jobId);
    seenOutputs.add(report.plan.outputName);
    assert.equal(report.output.sha256,await shaFile(mkvPath),
      'report SHA-256 must bind the actual downloaded final MKV');
    assert.equal(report.audit?.ok,true,
      'each completed product must have an independently passing source-bound audit');
    assert.equal(video.length,1,'video must be present');
    assert.equal(audio.length,1,'audio must be present');
    assert.equal(subs.length,1,'exactly one new subtitle must survive');
    assert.equal(video[0].codec_name,codecStreams(sourceInfo,'video')[0].codec_name);
    assert.equal(audio[0].codec_name,codecStreams(sourceInfo,'audio')[0].codec_name);
    assert.equal(packetHash(mkvPath,'video'),expectedVideoHash,
      'compressed video packet stream must be byte-identical to original');
    assert.equal(packetHash(mkvPath,'audio'),expectedAudioHash,
      'compressed audio packet stream must be byte-identical to original');
    assert.equal(subs[0].codec_name,job.srt?'subrip':'ass');
    assert.ok(attachments.length>=1,
      'shared valid font must be attached to every delivered Matroska artifact');
    if(job.srt){
      assert.equal(report.audit?.subripCueAudit?.status,'pass');
      const extracted=execFileSync('ffmpeg',[
        '-hide_banner','-loglevel','error','-copyts','-i',mkvPath,
        '-map','0:s:0','-f','srt','-',
      ],{encoding:'utf8',timeout:30000});
      const expected=await fs.readFile(job.subtitlePath,'utf8');
      assert.equal(normalized(extracted),normalized(expected),
        'finished MKV SubRip millisecond cues/text/order must equal actual source');
    }else{
      assert.equal(report.audit?.assEventAudit?.status,'pass',
        'finished MKV ASS dialogue time/text/order must be independently verified');
    }
    assert.equal(await shaFile(job.videoPath),job.videoHashBefore,'source file may not be overwritten');
    assert.equal(await shaFile(job.subtitlePath),job.subtitleHashBefore,'subtitle source may not be overwritten');
    const rowEvidence={
      ordinal:i+1,jobId:report.plan.jobId,source:job.episode+'.mp4',
      subtitle:job.episode+(job.srt?'.en.srt':'.zh-Hans.ass'),
      outputName:job.outputName,mkvSha256:report.output.sha256,
      bytes:(await fs.stat(mkvPath)).size,outputVideoCodec:video[0].codec_name,
      outputAudioCodec:audio[0].codec_name,
      outputSubtitleCodec:subs[0].codec_name,
      streamCopyVideoHashVerified:true,streamCopyAudioHashVerified:true,
      fontAttachments:attachments.length,outputAudit:report.audit.status,
      subtitleAudit:job.srt?report.audit.subripCueAudit?.status:report.audit.assEventAudit?.status,
      outputStatus:'generated-and-audited-awaiting-user-save',
      sourceFilesUnchanged:true,
    };
    manifest.files.push(rowEvidence);
    manifest.verifiedJobs=manifest.files.length;
    console.log('S10 BATCH20 verified '+manifest.verifiedJobs+'/20: '+job.outputName+
      ', actual SHA256='+rowEvidence.mkvSha256.slice(0,12)+
      ', subtitle='+rowEvidence.subtitleAudit);
    await fs.writeFile(evidencePath,JSON.stringify(manifest,null,2)+'\n');
  }
  assert.equal(manifest.files.length,20);
  assert.equal(seenJobIds.size,20);
  manifest.status='PASS';
  manifest.completedAt=new Date().toISOString();
  manifest.elapsedMs=Date.now()-started;
  console.log('S10 BATCH20: 20 real jobs / 20 independent MKVs, strict output audit and retention PASS');
  await context.close();
}catch(error){
  manifest.status='FAIL';
  manifest.errors.push(error?.stack||String(error));
  console.error('S10 BATCH20 FAILED after '+manifest.verifiedJobs+' independently verified jobs:',error);
  throw error;
}finally{
  manifest.completedAt ||= new Date().toISOString();
  manifest.elapsedMs ||= Date.now()-started;
  await fs.writeFile(evidencePath,JSON.stringify(manifest,null,2)+'\n');
  if(browser) await browser.close();
}
