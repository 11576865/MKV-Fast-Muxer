import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const dir=path.resolve('.e2e/ui-v3-blank-target');
await fs.mkdir(dir,{recursive:true});
const a=path.join(dir,'A-source.mkv');
const video=path.join(dir,'A-video.mkv');
const srt=path.join(dir,'A.srt');
const run=args=>execFileSync('ffmpeg',['-v','error','-y',...args],{timeout:90000});
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const probe=file=>JSON.parse(execFileSync('ffprobe',
  ['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
run(['-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1','-c:v','mpeg4','-q:v','5',video]);
await fs.writeFile(srt,'1\n00:00:00,100 --> 00:00:00,700\nBlank destination source subtitle.\n');
run(['-i',video,'-i',srt,'-map','0:v:0','-map','1:s:0','-c','copy','-c:s','srt',
  '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=Source caption',a]);
const sourceBefore=checksum(await fs.readFile(a));
const sourceRows=probe(a).streams;
const videoIndex=sourceRows.find(s=>s.codec_type==='video')?.index;
const subtitleIndex=sourceRows.find(s=>s.codec_type==='subtitle')?.index;
assert.ok(Number.isSafeInteger(videoIndex)&&Number.isSafeInteger(subtitleIndex));
const browser=await chromium.launch({headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({acceptDownloads:true,
  viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(60000);
const faults=[];
page.on('pageerror',error=>faults.push(String(error)));
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const evidence={schema:'v3-real-new-matroska-output-e2e-v1',
  source:path.basename(a),sourceSha256:sourceBefore,
  snapshots:[],steps:[],limit:'One new zero-base MKV with source SubRip only, then explicitly add video. Native ffprobe validates streams. Not all ASS/font/EBML or physical-device acceptance.'};
const snap=async name=>{await page.screenshot({path:path.join(dir,name)});
  evidence.snapshots.push(name);};
const verifiedResult=async(label,expectedKinds)=>{
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>
    !document.querySelector('#downloadLink')?.classList.contains('hidden') &&
    /已生成新 MKV/.test(document.querySelector('#status')?.textContent||''),
    null,{timeout:180000});
  const beforeDownload=await page.locator('#downloadLink').evaluate(link=>({
    outerHTML:link.outerHTML.slice(0,550), href:link.href,
    download:link.download, visible:!!link.getClientRects().length,
    connected:link.isConnected, ancestorHidden:[...function*(node){
      for(let p=node.parentElement;p;p=p.parentElement)
        if(p.hidden || getComputedStyle(p).display==='none')yield p.id||p.className;
    }(link)],
    mediaType:'video/x-matroska',
  }));
  console.log('V3_BLANK_PRE_DOWNLOAD '+JSON.stringify(beforeDownload));
  await page.evaluate(()=>{
    window.__v3BlankLastClick=[];
    const record=(phase)=>(e)=>{
      if(e.target.closest('#downloadLink'))
        window.__v3BlankLastClick.push({phase,defaultPrevented:e.defaultPrevented,
          target:e.target.id,href:e.target.closest('a')?.href});
    };
    document.addEventListener('click',record('capture'),true);
    document.addEventListener('click',record('bubble'),false);
  });
  const downloadPromise=page.waitForEvent('download',{timeout:15000});
  await page.locator('#downloadLink').click();
  const clickTrace=await page.evaluate(()=>({events:window.__v3BlankLastClick,
    location:location.href,link:document.querySelector('#downloadLink')?.outerHTML}));
  console.log('V3_BLANK_POST_DOWNLOAD_CLICK '+JSON.stringify(clickTrace));
  const download=await downloadPromise;
  const saved=path.join(dir,label+'.mkv');
  await download.saveAs(saved);
  const inspected=probe(saved);
  const kinds=inspected.streams.map(s=>s.codec_type).sort();
  assert.deepEqual(kinds,[...expectedKinds].sort());
  assert.match(inspected.format.format_name,/matroska/i);
  const reportPromise=page.waitForEvent('download',{timeout:40000});
  await page.locator('#reportLink').click();
  const reportDownload=await reportPromise;
  const reportPath=path.join(dir,label+'.json');
  await reportDownload.saveAs(reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.kind,'new-matroska');
  assert.equal(report.audit.status,'pass');
  assert.equal(report.sourceChaptersAndTagsCopied,false);
  assert.equal(report.output.sha256,checksum(await fs.readFile(saved)));
  evidence.steps.push(label+': '+kinds.join(',')+'; actual downloaded MKV and independent native FFprobe');
};
try{
  await page.goto(new URL('?ui=v3',base).href,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',a);
  await page.waitForFunction(()=>
    document.querySelector('#sfv3FileName')?.textContent==='A-source.mkv' &&
    document.querySelectorAll('#sfv3SourceContents .sfv3-row-select').length>=2,
    null,{timeout:180000});
  assert.equal(await page.locator('#muxBtn').isDisabled(),true,
    'observing A never implicitly grants a target');
  await page.locator('#sfv3EnterOutput').click();
  const picker=page.locator('#sfv3TargetPicker');
  await picker.waitFor({state:'visible'});
  await picker.locator('input[value="__v3_blank__"]').check();
  await picker.locator('#sfv3BlankStreamSelection').waitFor({state:'visible'});
  const check=picker.locator('input[data-blank-stream-index="'+subtitleIndex+'"]');
  await check.check();
  assert.equal(await picker.locator('input[data-blank-stream-index="'+videoIndex+'"]').isChecked(),false,
    'a new blank target cannot inherit the source video');
  await snap('blank-choice-selected-subtitle-1440.png');
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>
    document.querySelector('#sf14Root')?.dataset.sfv3Surface==='plan' &&
    document.querySelector('#sfv3PlanName')?.textContent==='新建空 MKV' &&
    document.querySelector('#muxBtn')?.disabled===false,
    null,{timeout:120000});
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files?.[0]?.name),'A-source.mkv');
  const kind=await page.locator('#compositionTracks .sfv3-blank-plan-row')
    .evaluateAll(rows=>rows.map(row=>row.dataset.sfv3ObjectKind));
  assert.deepEqual(kind,['subtitle']);
  await snap('blank-plan-only-subtitle-1440.png');
  await verifiedResult('zero-base-only-subrip',['subtitle']);
  await page.locator('#sfv3BlankChange').click();
  await picker.waitFor({state:'visible'});
  assert.equal(await picker.locator('input[value="__v3_blank__"]').isChecked(),true);
  await picker.locator('input[data-blank-stream-index="'+videoIndex+'"]').check();
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>
    document.querySelectorAll('#compositionTracks .sfv3-blank-plan-row').length===2,
    null,{timeout:60000});
  await page.setViewportSize({width:620,height:900});
  await snap('blank-plan-video-subtitle-620.png');
  await verifiedResult('zero-base-selected-video-subrip',['video','subtitle']);
  assert.equal(checksum(await fs.readFile(a)),sourceBefore,
    'original input A file must not be overwritten or transformed');
  assert.deepEqual(faults,[],'no browser unhandled errors');
  await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log('V3-03 new real Matroska blank target PASS: '+evidence.steps.join('; '));
}catch(error){
  await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(dir,'failure.json'),JSON.stringify({
    error:String(error),stack:error?.stack,pageFaults:faults,evidence,
  },null,2));
  throw error;
}finally{await browser.close();}
