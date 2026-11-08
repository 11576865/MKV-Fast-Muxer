import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

// Actual native Group subset output proof with TWO independently paired
// ASS tracks. One underlying File/JobPlan, one executor, no duplicated UI.
// Font coverage is checked independently through native fontconfig after
// attachment extraction. Glyph shaping and pixel parity are separate gates.
const dir=path.resolve('.e2e/ui-v35-ass-group');
await fs.mkdir(dir,{recursive:true});
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sfv35-group-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{
  encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024,...options,
});
const ff=(args)=>run('ffmpeg',['-hide_banner','-loglevel','error',...args]);
const font=run('fc-match',['-f','%{file}\n','DejaVu Sans']).trim().split('\n')[0];
const fontFile=await fs.readFile(font);
assert.ok(fontFile.length>50000,'font must be a real nontrivial scalable font');
assert.notEqual(fontFile.subarray(0,4).toString(),'ttcf',
  'Group subsetting needs single-face font, not a collection');
function supports(file,cp){
  const printed=run('fc-query',['--format','%{charset}\n',file]);
  return printed.trim().split(/\s+/).some(part=>{
    const [a,b]=part.split('-').map(v=>Number.parseInt(v,16));
    return Number.isFinite(a)&&cp>=a&&cp<=(Number.isFinite(b)?b:a);
  });
}
for(const codepoint of [0x03a9,0x0416]){
  assert.equal(supports(font,codepoint),true,
    'reference original font must actually contain both independent target glyphs');
}
const family=run('fc-query',['--format','%{family}\n',font])
  .split('\n')[0].split(',')[0].trim();
assert.ok(family&&!family.includes('\n'));
const videos=[
  path.join(dir,'Group A S01E01.mp4'),
  path.join(dir,'Group B S01E02.mp4'),
];
const subs=[
  path.join(dir,'Group A S01E01.en.ass'),
  path.join(dir,'Group B S01E02.en.ass'),
];
for(const [i,video]of videos.entries()){
  ff(['-y','-f','lavfi','-i','color=c='+(i?'green':'blue')+':s=320x180:r=24:d=1.3',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.3',
    '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','64k','-shortest',video]);
}
const lines=(text)=>[
  '[Script Info]','ScriptType: v4.00+','PlayResX: 640','PlayResY: 360','',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,'+family+',32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,5,10,10,10,1','',
  '[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.10,0:00:00.95,Default,,0,0,0,,'+text,'',
].join('\n');
const cues=['Group Omega Ω only','Group Zhe Ж only'];
for(let i=0;i<2;i++)await fs.writeFile(subs[i],lines(cues[i]));
const original=Object.fromEntries(await Promise.all([...videos,...subs]
  .map(async p=>[path.basename(p),sha(await fs.readFile(p))])));
original.font=sha(fontFile);
const receipt={schema:'sfv35-group-ass-union-real-two-mkv-v1',
  inputs:[...videos,...subs].map(p=>path.basename(p)),
  referenceFont:{fileName:path.basename(font),family,bytes:fontFile.length,sha256:sha(fontFile)},
  original,passed:false,images:[],outputs:[],limits:[
    'Fontconfig independent cMap coverage + attachment digest/size, not HarfBuzz shaping parity or independent pixel render',
    'Two actual short MP4 and two actual ASS episodes, not long heterogeneous source performance',
    'One shared on-host reference font; no font file bytes included as a loose CI artifact',
  ]};
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const context=await browser.newContext({
  viewport:{width:1440,height:900},acceptDownloads:true,
  deviceScaleFactor:1,
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const shots=async name=>{
  await page.screenshot({path:path.join(dir,name)});
  receipt.images.push(name);
};
async function download(selector,target){
  const [event]=await Promise.all([
    page.waitForEvent('download',{timeout:60000}),
    page.locator(selector).click(),
  ]);
  await event.saveAs(target);
}
try{
  const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-view'),'batch');
  await page.setInputFiles('#batchUnifiedInput',[...videos,...subs,font]);
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===2 &&
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===0 &&
    document.querySelector('#batchFontSubsetEnabled')!==null &&
    (document.querySelector('#batchAssetStatus')?.textContent||'').includes('5 文件')
  ),null,{timeout:120000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),false);
  assert.equal(await page.locator('#batchFontInput').evaluate(el=>el.files.length),1);
  await page.locator('#batchFontSubsetEnabled').check();
  await page.locator('#batchSubsetScope').selectOption('group');
  assert.equal(await page.locator('#batchSubsetScope').inputValue(),'group');
  await shots('01-real-ass-group-two-job-ready-1440.png');

  await page.locator('#batchStartBtn').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('#batchStatus')?.textContent||'';
    return status.startsWith('批量完成：') || status.startsWith('批量已取消：');
  },null,{timeout:360000});
  const terminal=await page.locator('#batchStatus').textContent();
  assert.match(terminal,/已生成 2，审计通过 2，待复核 0，执行失败 0/,
    'both jobs must really complete and pass native product audit');
  assert.equal(await page.locator('#batchResults a.download').count(),2);
  await shots('02-two-real-group-ass-mkvs-complete-1440.png');

  const fontDigests=[];
  for(let i=0;i<2;i++){
    const mkv=path.join(dir,'Group '+(i?'B':'A')+' actual.mkv');
    const reportPath=path.join(dir,'Group '+(i?'B':'A')+' audit.json');
    await download('#batchResults a.download >> nth='+i,mkv);
    await download('#batchResults a.report-download >> nth='+i,reportPath);
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    assert.equal(report.audit?.ok,true,
      'real generated MKV must pass original native independent audit');
    assert.equal(report.output?.sha256,sha(await fs.readFile(mkv)));
    assert.equal(report.plan?.execution,'frozen-batch-context-v1');
    assert.equal(report.plan?.policy?.subsetScope,'group');
    assert.equal(report.plan?.policy?.subsetEnabled,true);
    const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',mkv]));
    const subtitle=probe.streams.filter(stream=>stream.codec_type==='subtitle');
    const attachments=probe.streams.filter(stream=>stream.codec_type==='attachment');
    assert.equal(subtitle.length,1);
    assert.equal(subtitle[0].codec_name,'ass');
    assert.equal(attachments.length,1);
    const extractedFont=path.join(tmp,'extracted-'+i+'.ttf');
    // Actual Matroska attachment bytes extracted by independent native FFmpeg.
    ff(['-y','-dump_attachment:t:0',extractedFont,
      '-i',mkv,'-map','0:v:0','-c','copy','-f','null','-']);
    const extractedBytes=await fs.readFile(extractedFont);
    const digest=sha(extractedBytes);
    fontDigests.push(digest);
    assert.ok(extractedBytes.length>2000&&extractedBytes.length<fontFile.length,
      'real Group glyph subset must be nonempty and smaller than original');
    assert.notEqual(digest,sha(fontFile));
    for(const cp of [0x03a9,0x0416])
      assert.equal(supports(extractedFont,cp),true,
        'each independently extracted Group font must carry BOTH job-specific Unicode glyphs');
    const ass=run('ffmpeg',['-hide_banner','-v','error','-i',mkv,
      '-map','0:s:0','-c:s','ass','-f','ass','pipe:1']);
    assert.ok(ass.includes(cues[i]),'actual ASS event for each independently paired episode');
    receipt.outputs.push({
      mkv:path.basename(mkv),sha256:report.output.sha256,
      subtitleCodec:'ass',cue:cues[i],
      groupFontSha256:digest,groupFontBytes:extractedBytes.length,
      originalFontBytes:fontFile.length,
      attachmentName:attachments[0].tags?.filename||'',
      coverage:['Ω','Ж'],audit:report.audit.status,
    });
  }
  assert.equal(fontDigests[0],fontDigests[1],
    'the same Group font subset bytes MUST be embedded in BOTH distinct MKV outputs');
  for(const p of [...videos,...subs])
    assert.equal(sha(await fs.readFile(p)),original[path.basename(p)],
      'no source video or subtitle bytes may be rewritten');
  assert.equal(sha(await fs.readFile(font)),original.font);
  assert.deepEqual(errors,[]);
  receipt.passed=true;receipt.terminal=terminal;
  await fs.writeFile(path.join(dir,'group-ass-evidence.json'),
    JSON.stringify(receipt,null,2)+'\n');
  console.log('V3.5 GROUP ASS union: 2 real MKVs + identical embedded reduced font, union Ω/Ж, native extraction/audit PASS');
}catch(e){
  receipt.error=String(e);receipt.pageErrors=errors;
  receipt.native=await page.evaluate(()=>({
    view:document.querySelector('#sf14Root')?.dataset.view,
    jobs:document.querySelectorAll('#batchPlan button[data-batch-job-index]').length,
    status:document.querySelector('#batchStatus')?.textContent,
    review:document.querySelector('#batchReviewSummary')?.textContent,
    fontStatus:document.querySelector('#batchAssetStatus')?.textContent,
    fonts:document.querySelector('#batchFontInput')?.files?.length,
  })).catch(()=>null);
  await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(dir,'group-ass-evidence.json'),
    JSON.stringify(receipt,null,2)+'\n');
  throw e;
}finally{
  await context.close();
  await browser.close();
  await fs.rm(tmp,{recursive:true,force:true});
}
