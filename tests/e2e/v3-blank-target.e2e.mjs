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
// Streamhash hashes encoded packet payloads rather than Matroska container bytes.
// It detects a transcoded or altered selected video stream despite a matching
// codec name, and deliberately makes no timestamp/EBML-preservation claim.
const videoPacketHash=file=>execFileSync('ffmpeg',[
  '-v','error','-i',file,'-map','0:v:0','-c','copy',
  '-f','streamhash','-hash','SHA256','-'
],{encoding:'utf8',timeout:90000}).trim();
const probe=file=>JSON.parse(execFileSync('ffprobe',
  ['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
run(['-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1','-c:v','mpeg4','-q:v','5',video]);
await fs.writeFile(srt,'1\n00:00:00,100 --> 00:00:00,700\nBlank destination source subtitle.\n');
run(['-i',video,'-i',srt,'-map','0:v:0','-map','1:s:0','-c','copy','-c:s','srt',
  '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=Source caption',a]);
const sourceBefore=checksum(await fs.readFile(a));
const sourceRows=probe(a).streams;
const sourceVideoPacketHash=videoPacketHash(a);
assert.match(sourceVideoPacketHash,/SHA256=[0-9a-f]{64}/i);
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
  sourceVideoStreamhash:sourceVideoPacketHash,
  snapshots:[],steps:[],limit:'One new zero-base MKV with source SubRip only, then explicitly add video. Native ffprobe validates streams. Not all ASS/font/EBML or physical-device acceptance.'};
const snap=async name=>{await page.screenshot({path:path.join(dir,name)});
  evidence.snapshots.push(name);};
const verifiedResult=async(label,expectedKinds)=>{
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>
    !document.querySelector('#downloadLink')?.classList.contains('hidden') &&
    /已生成新 MKV/.test(document.querySelector('#status')?.textContent||''),
    null,{timeout:180000});
  // Finished artifacts deliberately live in the single native object
  // inspector's "成品验证与下载" disclosure. Click the genuine visible user
  // entry instead of programmatically clicking a hidden descendant.
  await page.locator('#sfv3InspectorOpen').click();
  await page.locator('#outputEvidencePanel').waitFor({state:'visible'});
  const evidenceDrawer=page.locator('#sfv3DeliveryDrawer');
  if(!(await evidenceDrawer.evaluate(el=>el.open)))
    await evidenceDrawer.locator(':scope > summary').click();
  await page.locator('#downloadLink').waitFor({state:'visible'});
  const beforeDownload=await page.locator('#downloadLink').evaluate(link=>({
    href:link.href,download:link.download,
    visible:!!link.getClientRects().length,
    panelCurrent:link.closest('#outputEvidencePanel')?.dataset.current,
  }));
  assert.equal(beforeDownload.visible,true);
  assert.match(beforeDownload.href,/^blob:/);
  assert.equal(beforeDownload.download,'new.mkv');
  assert.equal(beforeDownload.panelCurrent,'true');
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:40000}),
    page.locator('#downloadLink').click(),
  ]);
  const saved=path.join(dir,label+'.mkv');
  await download.saveAs(saved);
  const inspected=probe(saved);
  const kinds=inspected.streams.map(s=>s.codec_type).sort();
  assert.deepEqual(kinds,[...expectedKinds].sort());
  assert.match(inspected.format.format_name,/matroska/i);
  const outputSubtitle=inspected.streams.find(stream=>stream.codec_type==='subtitle');
  assert.equal(outputSubtitle?.codec_name,'subrip',
    'selected source SubRip must remain SubRip in the new container');
  assert.equal(outputSubtitle?.tags?.language,'eng',
    'new-container mux preserves the explicitly selected source subtitle language');
  assert.equal(outputSubtitle?.tags?.title,'Source caption',
    'new-container mux preserves the explicitly selected source subtitle title');
  if(expectedKinds.includes('video')) {
    const outputVideo=inspected.streams.find(stream=>stream.codec_type==='video');
    assert.equal(outputVideo?.codec_name,'mpeg4');
    assert.equal(videoPacketHash(saved),sourceVideoPacketHash,
      'selected stream-copy video packet payload must match the original exact source');
  }
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
  evidence.steps.push(label+': '+kinds.join(',')+
    '; native FFprobe + subtitle metadata'+
    (expectedKinds.includes('video')?'; FFmpeg encoded-video packet SHA-256 matched source':'')+
    '; downloaded MKV and output report SHA-256');
  await page.locator('#sfv3InspectorClose').click();
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
  // V3-08 post-output state: a successful real mux may make the native
  // inspector-rehosted download links visible, but it must not collapse the
  // original plan/mux/status/inspector into the old oversized legacy dock.
  // This checks REAL completed output, not a synthetic result banner.
  const completedDock=await page.evaluate(()=>{
    const bounds=id=>{
      const r=document.getElementById(id)?.getBoundingClientRect();
      return r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;
    };
    const dock=document.querySelector('.sf14-output')?.getBoundingClientRect();
    return {dock:dock?{x:dock.x,y:dock.y,right:dock.right,bottom:dock.bottom,
        width:dock.width,height:dock.height}:null,
      status:bounds('status'),mux:bounds('muxBtn'),
      plan:bounds('sf14PlanToggle'),inspector:bounds('sfv3InspectorOpen'),
      cancelDisabled:document.getElementById('cancelBtn')?.disabled,
      statusText:document.getElementById('status')?.textContent?.trim()||'',
      downloadsRehosted:['downloadLink','reportLink'].every(id=>{
        const link=document.getElementById(id);
        return link && !link.classList.contains('hidden') &&
          link.closest('#outputEvidencePanel') && !link.closest('.sf14-output');
      }),
      background:getComputedStyle(document.querySelector('.sf14-output .execution-panel'))
        .backgroundColor,
      scrollWidth:document.documentElement.scrollWidth};
  });
  assert.equal(completedDock.cancelDisabled,true);
  assert.match(completedDock.statusText,/已生成新 MKV/);
  assert.equal(completedDock.downloadsRehosted,true,
    'real downloaded MKV and JSON report must still live in native inspector');
  assert.ok(completedDock.scrollWidth<=620+2,'no completed-output horizontal overflow');
  assert.ok(completedDock.dock && completedDock.dock.height<=65 &&
    completedDock.dock.bottom>=897,'completed compact dock should stay 60px');
  for(const [name,box] of [['status',completedDock.status],['mux',completedDock.mux],
    ['plan',completedDock.plan],['inspector',completedDock.inspector]]){
    assert.ok(box && box.width>0 && box.y>=completedDock.dock.y-3 &&
      box.bottom<=completedDock.dock.bottom+3,
      'completed V3-08 must retain visible native '+name+': '+JSON.stringify(completedDock));
  }
  assert.ok(completedDock.status.x<completedDock.mux.x &&
    completedDock.mux.x<completedDock.plan.x &&
    completedDock.plan.x<completedDock.inspector.x,
    'completed 620px dock must remain left-to-right ordered: '+
      JSON.stringify(completedDock));
  // Text and nested status boxes may extend their measured width while
  // clipping long live-status prose; a strict right<=left comparison rejects
  // a visually correct dock. Test actual clickable button hit-target centers
  // so no invisible overlay can steal the native actions.
  const buttonHits=await page.evaluate(()=>{
    const names=['muxBtn','sf14PlanToggle','sfv3InspectorOpen'];
    return names.map(id=>{
      const el=document.getElementById(id),r=el?.getBoundingClientRect();
      const hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {id,hitId:hit?.closest('button')?.id||'',enabled:!el?.disabled};
    });
  });
  for(const result of buttonHits)
    assert.equal(result.hitId,result.id,
      'completed 620px dock must preserve native pointer hit-target: '+
        JSON.stringify({result,buttonHits,completedDock}));
  assert.match(completedDock.background,/^(?:transparent|rgba\(0, 0, 0, 0\))$/,
    'old tinted execution panel must not return after a successful mux');
  await snap('blank-complete-dock-620.png');
  assert.equal(await page.locator('#sf14PlanToggle').getAttribute('aria-label'),
    '检查封装计划、风险及执行边界');
  await page.locator('#sf14PlanToggle').click();
  assert.equal(await page.locator('.sf14-output').getAttribute('data-plan-open'),'true',
    'existing plan detail must remain available after mux');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sf14-output').getAttribute('data-plan-open'),'false');
  await page.locator('#sfv3InspectorOpen').click();
  await page.locator('#outputEvidencePanel').waitFor({state:'visible'});
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'true');
  assert.equal(await page.locator('#downloadLink').isVisible(),true);
  assert.equal(await page.locator('#reportLink').isVisible(),true);
  assert.equal(await page.locator('#downloadLink').count(),1);
  assert.equal(await page.locator('#reportLink').count(),1);
  // Evidence screenshots must represent the fully visible *settled* context
  // sheet. The 150ms native transition intentionally starts at opacity .78;
  // capturing before it finishes makes the underlying tracks appear as false
  // visual overlap. This is screenshot stabilization, not a CSS or media fix.
  const inspector=page.locator('.sf14-pane.sf14-inspector');
  await inspector.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
  const opacity=await inspector.evaluate(el=>Number(getComputedStyle(el).opacity));
  assert.ok(opacity>=0.995,
    'completed-output evidence screenshot must wait for inspector entrance animation');
  await snap('blank-complete-evidence-620.png');
  await page.locator('#sfv3InspectorClose').click();
  evidence.steps.push('V3-08 completed 620px: native compact dock, plan/Escape, accessible real MKV/report and current audit');
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
