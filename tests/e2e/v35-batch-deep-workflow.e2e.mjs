import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// TRUE native V3.5 batch workflow, not just UI route snapshots.
// The independently probed artifacts, actual per-job edit and ambiguous
// pairing gate remain owned by the original batch executor.
const out=path.resolve('.e2e/ui-v35-batch-deep-workflow');
await mkdir(out,{recursive:true});
const a=path.join(out,'Series A S01E01.mp4');
const b=path.join(out,'Series B S01E01.mp4');
const subtitle=path.join(out,'S01E01.zh.srt');
const subtitleA=path.join(out,'Series A S01E01.en.srt');
const sha=b=>createHash('sha256').update(b).digest('hex');
const ff=(color,target)=>execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c='+color+':s=320x180:r=24:d=1.4',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.4',
  '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','64k',
  '-shortest',target,
],{timeout:90000,stdio:'pipe'});
ff('blue',a);ff('green',b);
await writeFile(subtitle,'1\n00:00:00,100 --> 00:00:00,900\nManually paired subtitle\n\n');
const before={a:sha(await readFile(a)),b:sha(await readFile(b)),
  subtitle:sha(await readFile(subtitle)),subtitleA:sha(await readFile(subtitleA))};
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const ctx=await browser.newContext({viewport:{width:1440,height:900},
  acceptDownloads:true,deviceScaleFactor:1});
const page=await ctx.newPage();const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const result={schema:'v35-eight-real-batch-contexts-v1',
  sourceNames:[path.basename(a),path.basename(b),path.basename(subtitle),path.basename(subtitleA)],
  beforeHash:before,screenFiles:[],checks:[],limits:[
    'Screenshots show 8 UI task contexts in 3 viewport sizes, NOT 24 different product features',
    'Uses two short synthetic videos with genuine bytes; not long-form media performance certification',
    'Group font policy is UI-controlled but no ASS font closure is claimed by this SRT fixture',
    'A generated and audited in-memory MKV is not saved to a user-specified directory',
  ],passed:false};
const phaseNav=page.locator('#sfv35BatchFlow');
const step=async(key)=>phaseNav.locator('[data-sfv35-batch-phase="'+key+'"]').click();
const screenshot=async(name)=>{
  await page.screenshot({path:path.join(out,name)});
  result.screenFiles.push(name);
};
const control=(key)=>phaseNav.locator('[data-sfv35-batch-phase="'+key+'"]');
try{
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  const root=page.locator('#sf14Root.sfv3.sfv35-nav');
  await root.waitFor();
  await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
  assert.equal(await root.getAttribute('data-view'),'batch');
  assert.equal(await phaseNav.isVisible(),true);
  const labels=await phaseNav.locator('button').allTextContents();
  assert.equal(labels.length,8);
  for(const label of ['资源清单','配对与冲突','逐任务属性','字体策略',
    '配方与目录','运行队列','成品与保存','容器检查'])
    assert.ok(labels.some(x=>x.includes(label)),'missing '+label);
  assert.equal(await page.locator('#batchPlan').count(),1);
  assert.equal(await page.locator('#batchJobInspector').count(),1);
  assert.equal(await page.locator('#batchUnifiedInput').count(),1);
  assert.equal(await page.locator('#batchStartBtn').count(),1);
  assert.equal(await page.locator('#batchResults').count(),1);
  assert.equal(await page.locator('#batchInspectBtn').count(),1);

  await step('resources');
  assert.equal(await control('resources').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#sf14Batch').getAttribute('data-controls'),'sources');
  await screenshot('01-resources-empty-1440.png');
  await page.setInputFiles('#batchUnifiedInput',[a,b,subtitle,subtitleA]);
  // A uniquely named A subtitle yields a legitimate independent job while
  // the shared-episode B subtitle remains ambiguous. The native batch owner
  // may build that unambiguous job, but MUST block all execution until the
  // remaining tie is explicitly reviewed. Never assume a guessed B job.
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===1 &&
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===1 &&
    (document.querySelector('#batchAssetStatus')?.textContent||'').includes('4 文件')
  ),null,{timeout:60000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true,
    'real ambiguous episode match MUST block execution');
  assert.match(await page.locator('#sfv35BatchReviewStatus').textContent(),/待处理/);
  result.checks.push('Four real files: one unambiguous A job, ONE unresolved B tie and Start blocked');

  await step('pairing');
  assert.equal(await control('pairing').getAttribute('aria-pressed'),'true');
  const tie=page.locator('#batchPlan select[data-batch-tie-index="0"]');
  assert.equal(await tie.locator('option').count(),3);
  await screenshot('02-ambiguous-pair-blocked-1440.png');
  const options=await tie.locator('option').allTextContents();
  const idxB=options.findIndex(x=>x.includes('Series B S01E01.mp4'));
  assert.ok(idxB>=1,'original tie selector must expose a real B source');
  await tie.selectOption(String(idxB-1));
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===0 &&
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===2 &&
    (document.querySelector('#batchReviewSummary')?.textContent||'').includes('1 项已人工确认')
  ),null,{timeout:60000});
  await screenshot('03-manual-pair-confirmed-1440.png');
  result.checks.push('Original per-session explicit B pairing resolves native ambiguous gate');

  await step('job');
  assert.equal(await control('job').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#batchJobInspector').textContent(),/Series B S01E01/);
  const title=page.locator('#batchJobInspector [data-batch-task-field="title"]');
  const language=page.locator('#batchJobInspector [data-batch-task-field="language"]');
  assert.equal(await title.count(),1);
  await title.fill('Review confirmed subtitle');
  await title.press('Tab');
  await page.waitForFunction(()=>(
    document.querySelector('#batchJobInspector [data-batch-task-field="title"]')?.value===
      'Review confirmed subtitle'
  ),null,{timeout:30000});
  await language.fill('zho');
  await language.press('Tab');
  await page.waitForFunction(()=>(
    document.querySelector('#batchJobInspector [data-batch-task-field="language"]')?.value==='zho'
  ),null,{timeout:30000});
  await screenshot('04-per-job-title-language-edited-1440.png');
  result.checks.push('Real per-job subtitle title/language mutable metadata, no secondary editor');

  await step('fonts');
  assert.equal(await control('fonts').getAttribute('aria-pressed'),'true');
  const subset=page.locator('#batchFontSubsetEnabled');
  await subset.check();
  await page.locator('#batchSubsetScope').selectOption('group');
  assert.match(await control('fonts').textContent(),/Group 子集/);
  await screenshot('05-group-font-policy-visible-1440.png');
  // This SRT proof does not contain ASS font dependencies; do not claim
  // execution proved Group HarfBuzz closure.
  await subset.uncheck();
  result.checks.push('Original Group subset control reachable and resets; no font-output claim');

  await step('recipe');
  assert.equal(await control('recipe').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#sf14Batch').getAttribute('data-controls'),'recipe');
  const [recipeDownload]=await Promise.all([
    page.waitForEvent('download',{timeout:30000}),
    page.locator('#batchRecipeV2ExportBtn').click(),
  ]);
  const recipeFile=path.join(out,'recipe-v2-real-download.json');
  await recipeDownload.saveAs(recipeFile);
  const recipeText=await readFile(recipeFile,'utf8');
  assert.ok(recipeText.includes('Review confirmed subtitle'),'recipe must contain actual edited title');
  assert.ok(recipeText.includes('zho'),'recipe must preserve reviewed language');
  await screenshot('06-recipe-v2-exported-1440.png');
  result.checks.push('Original recipe v2 download contains per-job metadata, not source grants');

  await step('pairing');
  const jobRows=await page.locator('#batchPlan button[data-batch-job-index]').allTextContents();
  const indexB=jobRows.findIndex(x=>x.includes('Series B S01E01'));
  assert.ok(indexB>=0,'B must be an actual queued source');
  await page.locator('#batchSelectNoneBtn').click();
  await page.waitForFunction(()=>(
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('0 / 2')
  ),null,{timeout:30000});
  await page.locator('#batchPlan input[data-batch-execute-index="'+indexB+'"]').check();
  await page.waitForFunction(()=>(
    document.querySelector('#batchStartBtn')?.disabled===false &&
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('1 / 2')
  ),null,{timeout:45000});
  await screenshot('07-one-job-explicitly-selected-1440.png');
  result.checks.push('Real 1/2 execution selection controlled by original native checkbox');

  await step('run');
  assert.equal(await control('run').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),false);
  await screenshot('08-run-ready-1440.png');
  await page.locator('#batchStartBtn').click();
  await page.waitForFunction(()=>{
    const s=document.querySelector('#batchStatus')?.textContent||'';
    return s.startsWith('批量完成：')||s.startsWith('批量已取消：');
  },null,{timeout:360000});
  const terminal=await page.locator('#batchStatus').textContent();
  assert.match(terminal,/已生成 1，审计通过 1，待复核 0，执行失败 0/);
  assert.equal(await page.locator('#batchResults a.download').count(),1);
  assert.equal(await page.locator('#batchResults a.report-download').count(),1);
  await screenshot('09-run-native-output-audited-1440.png');
  result.checks.push('Actual frozen native batch executor produced one independently audited output');

  await step('results');
  assert.equal(await control('results').getAttribute('aria-pressed'),'true');
  assert.match(await control('results').textContent(),/1 成品/);
  const mkv=path.join(out,'finished-B.mkv');
  const reportPath=path.join(out,'finished-B.report.json');
  const runPath=path.join(out,'finished-run-record.json');
  async function download(selector,dest){
    const [d]=await Promise.all([page.waitForEvent('download',{timeout:30000}),
      page.locator(selector).click()]);
    await d.saveAs(dest);
  }
  await download('#batchResults a.download',mkv);
  await download('#batchResults a.report-download',reportPath);
  await download('#batchRunExportBtn',runPath);
  const evidence=JSON.parse(await readFile(reportPath,'utf8'));
  const muxInfo=JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_streams','-show_format','-of','json',mkv,
  ],{encoding:'utf8',timeout:30000}));
  assert.equal(evidence.audit?.ok,true);
  assert.equal(evidence.output.sha256,sha(await readFile(mkv)));
  const subtitleStream=muxInfo.streams.find(s=>s.codec_type==='subtitle');
  assert.ok(subtitleStream);
  assert.equal(subtitleStream.codec_name,'subrip');
  assert.equal(subtitleStream.tags?.title,'Review confirmed subtitle');
  assert.equal(subtitleStream.tags?.language,'zho');
  const cues=execFileSync('ffmpeg',[
    '-hide_banner','-v','error','-i',mkv,'-map','0:s:0',
    '-c:s','srt','-f','srt','pipe:1',
  ],{encoding:'utf8'});
  assert.match(cues,/Manually paired subtitle/);
  const record=JSON.parse(await readFile(runPath,'utf8'));
  assert.ok(record.jobs?.length>=1,'original run-record export must produce a valid record');
  assert.equal(sha(await readFile(a)),before.a);
  assert.equal(sha(await readFile(b)),before.b);
  assert.equal(sha(await readFile(subtitle)),before.subtitle);
  assert.equal(sha(await readFile(subtitleA)),before.subtitleA);
  await screenshot('10-real-mkv-audit-and-save-links-1440.png');
  result.checks.push('Actual downloaded MKV and report SHA, ffprobe subtitle tags/cues, run-record, source immutability');

  await step('inspection');
  assert.equal(await control('inspection').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#batchInspectBtn').count(),1);
  await screenshot('11-native-container-inspection-entry-1440.png');
  result.checks.push('Independent source container-inspection interface is reachable, without claiming it has run');

  // Multi-viewport visual evidence: each screenshot shows a real native
  // underlying context selected through the same controls, not mock states.
  const phases=['resources','pairing','job','fonts','recipe','run','results','inspection'];
  for(const [width,height]of [[820,1180],[620,900]]){
    await page.setViewportSize({width,height});
    await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
    for(const key of phases){
      await step(key);
      assert.equal(await control(key).getAttribute('aria-pressed'),'true');
      await screenshot('phase-'+key+'-'+width+'.png');
    }
    const bounds=await phaseNav.locator('button').evaluateAll(els=>els.map(el=>{
      const r=el.getBoundingClientRect();
      return {width:r.width,height:r.height,right:r.right};
    }));
    assert.equal(bounds.length,8);
    assert.ok(bounds.every(b=>b.width>=60&&b.height>=45&&b.right<=width+1));
    assert.equal(await root.getAttribute('data-view'),'batch');
  }
  assert.deepEqual(pageErrors,[]);
  result.passed=true;result.finalMkvSHA256=sha(await readFile(mkv));
  result.finalCodec=subtitleStream.codec_name;result.nativeRunTerminal=terminal;
  await writeFile(path.join(out,'batch-deep-evidence.json'),
    JSON.stringify(result,null,2)+'\n');
  console.log('V3.5 real batch UI: 8 native phases, true ambiguity, manual pairing, metadata, receipt, real MKV audit PASS');
}catch(e){
  result.error=String(e);
  result.pageErrors=pageErrors;
  result.dom=await page.evaluate(()=>({
    view:document.querySelector('#sf14Root')?.dataset.view,
    focus:document.querySelector('#sf14Batch')?.dataset.sfv35BatchFocus,
    controls:document.querySelector('#sf14Batch')?.dataset.controls,
    nativeStatus:document.querySelector('#batchStatus')?.textContent,
    nativeReview:document.querySelector('#batchReviewSummary')?.textContent,
    jobCount:document.querySelectorAll('#batchPlan button[data-batch-job-index]').length,
    tieCount:document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length,
    resultCount:document.querySelectorAll('#batchResults a.download').length,
  })).catch(()=>null);
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(out,'batch-deep-evidence.json'),
    JSON.stringify(result,null,2)+'\n');
  throw e;
}finally{await ctx.close();await browser.close();}
