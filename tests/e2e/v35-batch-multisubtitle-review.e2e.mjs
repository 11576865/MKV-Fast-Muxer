import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// This is a true source-file and independent MKV-output test, not a mock
// of UI states. It covers two simultaneous unresolved subtitle ties and
// two actual subtitle tracks per native Batch Job.
const out=path.resolve('.e2e/ui-v35-multisubtitle-review');
await mkdir(out,{recursive:true});
const f=(s)=>path.join(out,s);
const videoA=f('Series A S01E01.mp4');
const videoB=f('Series B S01E01.mp4');
const exactA=f('Series A S01E01.en.srt');
const exactB=f('Series B S01E01.en.srt');
const tieZh=f('S01E01.zh.srt');
const tieFr=f('S01E01.fr.srt');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [video,color] of [[videoA,'blue'],[videoB,'green']]){
  execFileSync('ffmpeg',[
    '-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','color=c='+color+':s=320x180:r=24:d=1.45',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.45',
    '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','64k','-shortest',video,
  ],{timeout:80000});
}
for(const [file,caption] of [[exactA,'A English cue'],
  [exactB,'B English cue'],[tieZh,'Manually assigned Chinese cue'],
  [tieFr,'Manually assigned French cue']]){
  await writeFile(file,'1\n00:00:00,100 --> 00:00:00,850\n'+caption+'\n\n');
}
const files=[videoA,videoB,exactA,exactB,tieZh,tieFr];
const original=Object.fromEntries(await Promise.all(files.map(async file=>
  [path.basename(file),hash(await readFile(file))])));
const browser=await chromium.launch({headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({
  viewport:{width:820,height:1180},acceptDownloads:true,deviceScaleFactor:1});
const page=await context.newPage();const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const result={schema:'v35-two-ties-two-tracks-native-actual-mkv-v1',
  inputs:files.map(file=>path.basename(file)),original,passed:false,
  shots:[],checks:[],limits:[
    'Two independent genuinely ambiguous subtitles; no auto-mapping or alternate business owner',
    'Two short actual FFmpeg videos and four actual SRT tracks; not a long-form performance benchmark',
    'One audited two-subtitle MKV output, not a claim that both tasks were executed',
  ]};
const shot=async name=>{
  await page.screenshot({path:f(name)});
  result.shots.push(name);
};
const ties=()=>page.locator('#batchPlan select[data-batch-tie-index]');
const jobs=()=>page.locator('#batchPlan button[data-batch-job-index]');
const rows=()=>page.locator('#batchJobInspector .batch-inspector-subtitle');
async function selectCandidate(name){
  const select=ties().first();
  const opts=await select.locator('option').allTextContents();
  const index=opts.findIndex(t=>t.includes(name));
  assert.ok(index>=1,'explicit native candidate option '+name+': '+opts.join(' | '));
  await select.selectOption(String(index-1));
}
async function edit(trackFile,field,value){
  const row=rows().filter({has:page.locator('strong',{hasText:trackFile})});
  assert.equal(await row.count(),1,'must find exact native File-specific subtitle row');
  const input=row.locator('[data-batch-task-field="'+field+'"]');
  assert.equal(await input.count(),1);
  assert.match(await input.getAttribute('aria-label'),new RegExp(trackFile.replaceAll('.','\\.')));
  await input.fill(value);
  await input.press('Tab');
  await page.waitForFunction(({file,field,value})=>
    [...document.querySelectorAll('#batchJobInspector .batch-inspector-subtitle')]
      .some(el=>
        el.querySelector('strong')?.textContent.includes(file) &&
        el.querySelector('[data-batch-task-field="'+field+'"]')?.value===value),
    {file:trackFile,field,value},{timeout:30000});
}
async function setFlag(trackFile,field,wanted){
  // Real per-track native checkbox, not a synthesized output disposition.
  // Change triggers existing File-identity-bound metadata projection.
  const row=rows().filter({has:page.locator('strong',{hasText:trackFile})});
  assert.equal(await row.count(),1);
  const input=row.locator('[data-batch-task-field="'+field+'"]');
  if(wanted)await input.check();
  else await input.uncheck();
  await page.waitForFunction(({trackFile,field,wanted})=>
    [...document.querySelectorAll('#batchJobInspector .batch-inspector-subtitle')]
      .some(el=>el.querySelector('strong')?.textContent.includes(trackFile) &&
        el.querySelector('[data-batch-task-field="'+field+'"]')?.checked===wanted),
    {trackFile,field,wanted},{timeout:30000});
}
try{
  const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  const root=page.locator('#sf14Root.sfv3.sfv35-nav');
  await root.waitFor();
  await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
  await page.setInputFiles('#batchUnifiedInput',files);
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===2 &&
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===2
  ),null,{timeout:120000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true);
  await page.waitForFunction(()=>(
    document.querySelectorAll('.sfv35-pair-ordinal').length===2 &&
    [...document.querySelectorAll('.sfv35-pair-review')].every(
      row=>row.dataset.sfv35Candidates==='2')
  ));
  assert.equal(await page.locator('#sfv35BatchFlow').count(),0);
  assert.match(await page.locator('.sfv35-pair-review').nth(0).textContent(),/候选来源 2 个/);
  await shot('01-two-unresolved-ties-820.png');
  result.checks.push('Two genuine simultaneous native tie selectors; Start blocked; no implicit first candidate');

  // First explicit grant affects only the chosen subtitle, and the other
  // unresolved conflict continues blocking ALL execution.
  const firstFile=await page.locator('.sfv35-pair-review').first().textContent();
  await selectCandidate('Series B S01E01.mp4');
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===1 &&
    document.querySelectorAll('.sfv35-pair-ordinal').length===1 &&
    (document.querySelector('#batchReviewSummary')?.textContent||'')
      .includes('1 项已人工确认')
  ),null,{timeout:30000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true);
  await shot('02-first-grant-one-still-blocked-820.png');
  // Whichever tie is first in the normalized original batch order,
  // choose the OTHER source for the second one.
  const secondFile=await page.locator('.sfv35-pair-review').first().textContent();
  const secondChoice=secondFile.includes('S01E01.zh.srt')?'Series A S01E01.mp4'
    :'Series A S01E01.mp4';
  await selectCandidate(secondChoice);
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===0 &&
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===2 &&
    (document.querySelector('#batchReviewSummary')?.textContent||'')
      .includes('2 项已人工确认')
  ),null,{timeout:30000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),false);
  await shot('03-both-ties-explicitly-resolved-820.png');
  result.checks.push('First grant alone still blocked; second deliberate grant resolves exactly 2 original tie mappings');

  const jobLabels=await jobs().allTextContents();
  const bIndex=jobLabels.findIndex(t=>t.includes('Series B S01E01'));
  assert.ok(bIndex>=0);
  await page.locator('#batchPlan button[data-batch-job-index="'+bIndex+'"]').click();
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchJobInspector .batch-inspector-subtitle').length===2 &&
    document.querySelectorAll('.sfv35-subtitle-index').length===2
  ),null,{timeout:15000});
  assert.equal(await rows().count(),2);
  const trackFiles=await rows().locator(':scope > strong').allTextContents();
  assert.ok(trackFiles.includes('Series B S01E01.en.srt'));
  assert.ok(trackFiles.some(t=>t.startsWith('S01E01.')));
  // Verify the original edit controls have unique per-File labels and
  // track-number indicators, not two indistinguishable "subtitle title" fields.
  const semantics=await rows().evaluateAll(els=>els.map(el=>({
    source:el.querySelector(':scope > strong')?.textContent,
    ordinal:el.querySelector('.sfv35-subtitle-index')?.textContent,
    group:el.getAttribute('aria-label'),
    title:el.querySelector('[data-batch-task-field="title"]')?.getAttribute('aria-label'),
    language:el.querySelector('[data-batch-task-field="language"]')?.getAttribute('aria-label'),
  })));
  assert.ok(semantics.every((x,i)=>
    x.ordinal.includes((i+1)+' / 02')||x.ordinal.includes('0'+(i+1)+' / 02')));
  assert.ok(semantics.every(x=>x.title.includes(x.source)&&x.language.includes(x.source)));
  await shot('04-two-native-subtitle-editors-820.png');
  result.checks.push('Two real subtitle metadata rows, each original track-index binding and unique accessible label');

  const exactName='Series B S01E01.en.srt';
  const sharedName=trackFiles.find(t=>t.startsWith('S01E01.'));
  await edit(exactName,'title','English for B reviewed');
  await edit(exactName,'language','eng');
  await edit(sharedName,'title','Shared track for B reviewed');
  await edit(sharedName,'language','zho');
  // Explicitly choose non-inferred, opposite flags. Both Default and Forced
  // must survive the one native metadata owner all the way into EBML,
  // not merely appear checked in the visible UI.
  await setFlag(exactName,'default',false);
  await setFlag(exactName,'forced',true);
  await setFlag(sharedName,'default',true);
  await setFlag(sharedName,'forced',false);
  await shot('05-both-subtitle-tracks-edited-820.png');

  // Original File-identity metadata must survive selecting another job
  // and returning. No separate editor draft store may shadow it.
  const aIndex=jobLabels.findIndex(t=>t.includes('Series A S01E01'));
  assert.ok(aIndex>=0);
  await page.locator('#batchPlan button[data-batch-job-index="'+aIndex+'"]').click();
  assert.equal(await rows().count(),2);
  await page.locator('#batchPlan button[data-batch-job-index="'+bIndex+'"]').click();
  assert.equal(await rows().count(),2);
  const edited=await rows().evaluateAll(els=>els.map(el=>({
    file:el.querySelector(':scope > strong')?.textContent,
    title:el.querySelector('[data-batch-task-field="title"]')?.value,
    language:el.querySelector('[data-batch-task-field="language"]')?.value,
    default:el.querySelector('[data-batch-task-field="default"]')?.checked,
    forced:el.querySelector('[data-batch-task-field="forced"]')?.checked,
  })));
  assert.equal(edited.find(x=>x.file===exactName).title,'English for B reviewed');
  assert.deepEqual([edited.find(x=>x.file===exactName).default,
    edited.find(x=>x.file===exactName).forced],[false,true]);
  assert.deepEqual([edited.find(x=>x.file===sharedName).default,
    edited.find(x=>x.file===sharedName).forced],[true,false]);
  assert.equal(edited.find(x=>x.file===sharedName).title,'Shared track for B reviewed');
  await shot('06-track-specific-drafts-survive-job-switch-820.png');
  result.checks.push('Per-track metadata survives actual A->B task switching without cross-track contamination');

  // Compact mode still uses the SAME native inspector and its two controls.
  await page.setViewportSize({width:620,height:900});
  await page.locator('#batchPlan button[data-batch-job-index="'+bIndex+'"]').click();
  const secondLanguage=rows().filter({has:page.locator('strong',{hasText:sharedName})})
    .locator('[data-batch-task-field="language"]');
  await secondLanguage.scrollIntoViewIfNeeded();
  assert.equal(await secondLanguage.isVisible(),true);
  assert.equal(await root.getAttribute('data-view'),'batch');
  await shot('07-compact-second-subtitle-edit-620.png');

  // The real frozen BatchRunner executes only explicit B, which must now
  // produce two independent subtitle tracks with exact titles/languages.
  await page.locator('#batchSelectNoneBtn').click();
  await page.waitForFunction(()=>(
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('0 / 2')
  ));
  await page.locator('#batchPlan input[data-batch-execute-index="'+bIndex+'"]').check();
  await page.waitForFunction(()=>(
    document.querySelector('#batchStartBtn')?.disabled===false &&
    (document.querySelector('#batchSelectionStatus')?.textContent||'').includes('1 / 2')
  ));
  await page.locator('#batchStartBtn').click();
  await page.waitForFunction(()=>{
    const s=document.querySelector('#batchStatus')?.textContent||'';
    return s.startsWith('批量完成：')||s.startsWith('批量已取消：');
  },null,{timeout:360000});
  const terminal=await page.locator('#batchStatus').textContent();
  assert.match(terminal,/已生成 1，审计通过 1，待复核 0，执行失败 0/);
  const output=f('B-two-subtitles.mkv');
  const report=f('B-two-subtitles.report.json');
  async function download(locator,file){
    const [d]=await Promise.all([page.waitForEvent('download',{timeout:30000}),
      page.locator(locator).click()]);
    await d.saveAs(file);
  }
  await download('#batchResults a.download',output);
  await download('#batchResults a.report-download',report);
  const receipt=JSON.parse(await readFile(report,'utf8'));
  assert.equal(receipt.audit?.ok,true);
  assert.equal(receipt.output.sha256,hash(await readFile(output)));
  const info=JSON.parse(execFileSync('ffprobe',[
    '-v','error','-show_streams','-of','json',output
  ],{encoding:'utf8',timeout:30000}));
  const ss=info.streams.filter(stream=>stream.codec_type==='subtitle');
  assert.equal(ss.length,2);
  assert.ok(ss.every(stream=>stream.codec_name==='subrip'));
  const titles=new Set(ss.map(s=>s.tags?.title));
  const languages=new Set(ss.map(s=>s.tags?.language));
  assert.deepEqual([...titles].sort(),
    ['English for B reviewed','Shared track for B reviewed'].sort());
  assert.deepEqual([...languages].sort(),['eng','zho']);
  const byLanguage=new Map(ss.map(track=>[track.tags?.language,track]));
  // Independent Matroska stream-level Default/Forced: the 2 tracks must
  // have opposite dispositions matching exactly the original checkboxes.
  assert.equal(Boolean(byLanguage.get('eng')?.disposition?.default),false,
    'original English subtitle was explicitly NOT Default');
  assert.equal(Boolean(byLanguage.get('eng')?.disposition?.forced),true,
    'original English subtitle was explicitly Forced');
  assert.equal(Boolean(byLanguage.get('zho')?.disposition?.default),true,
    'original Chinese subtitle was explicitly Default');
  assert.equal(Boolean(byLanguage.get('zho')?.disposition?.forced),false,
    'original Chinese subtitle was explicitly NOT Forced');
  result.checks.push('Independent FFprobe validates four Default/Forced stream dispositions from exact native metadata flags');
  let allCues='';
  for(let i=0;i<2;i++){
    allCues+=execFileSync('ffmpeg',[
      '-hide_banner','-v','error','-i',output,'-map','0:s:'+i,
      '-c:s','srt','-f','srt','pipe:1'
    ],{encoding:'utf8',timeout:30000});
  }
  assert.match(allCues,/B English cue/);
  assert.match(allCues,/Manually assigned/);
  for(const file of files)
    assert.equal(hash(await readFile(file)),original[path.basename(file)]);
  await shot('08-actual-two-track-mkv-audited-620.png');
  result.checks.push('Real downloaded MKV has exactly two SubRip tracks, original per-track tags and cues; SHA and all input hashes checked');
  result.passed=true;result.terminal=terminal;result.mkvSHA256=receipt.output.sha256;
  result.subtitleStreams=ss.map(s=>({codec:s.codec_name,tags:s.tags}));
  result.semantics=semantics;
  await writeFile(f('multi-subtitle-review-evidence.json'),JSON.stringify(result,null,2)+'\n');
  console.log('V3.5 two simultaneous tie blocks, 2 track-specific original metadata rows and real 2-subtitle MKV PASS');
}catch(error){
  result.error=String(error);result.errors=errors;
  result.dom=await page.evaluate(()=>({
    view:document.querySelector('#sf14Root')?.dataset.view,
    jobs:document.querySelectorAll('#batchPlan button[data-batch-job-index]').length,
    tieCount:document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length,
    source:document.querySelector('#batchAssetStatus')?.textContent,
    inspector:document.querySelector('#batchJobInspector')?.textContent?.slice(0,700),
    terminal:document.querySelector('#batchStatus')?.textContent,
  })).catch(()=>null);
  await page.screenshot({path:f('failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(f('multi-subtitle-review-evidence.json'),JSON.stringify(result,null,2)+'\n');
  throw error;
}finally{await context.close();await browser.close();}
