import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {p3RenderFilterPath} from '../../scripts/p3-final-ass-render-proof.mjs';

// Real product E2E, independent native oracle. The font is test-generated
// under a unique family absent from system fontconfig; only the in-memory
// browser input and delivered Matroska attachments hold its bytes.
// This establishes chosen-file, multi-job glyph union, HarfBuzz shaping,
// and named-fixture libass image parity. NOT all player/locale equivalence.
const out=path.resolve('.e2e/ui-v35-ass-group-isolated');
await fs.mkdir(out,{recursive:true});
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'v35-isolated-font-'));
const fixtureRoot=path.join(tmp,'font-fixtures');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args,opts={})=>execFileSync(command,args,{
  encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024,...opts,
});
const ff=args=>run('ffmpeg',['-hide_banner','-loglevel','error',...args]);
const python=process.env.E2E_PYTHON||'/usr/bin/python3';
const fontProof=(...args)=>JSON.parse(
  run(python,['scripts/s03-native-font-proof.py',...args]));
const shape=(file,text)=>fontProof('shape',file,text);
const inspect=(file,text)=>fontProof('inspect',file,text).faces[0];
const fontDir=path.join(tmp,'font-reference');
await fs.mkdir(fontDir,{recursive:true});
const negativeDir=path.join(tmp,'font-negative');
await fs.mkdir(negativeDir,{recursive:true});
const outputs=['Isolated A S01E01','Isolated B S01E02'];
const cues=['office ffi AV a\u0301','العربية لا Ω Ж'];
const videos=outputs.map(stem=>path.join(out,stem+'.mp4'));
const assFiles=outputs.map(stem=>path.join(out,stem+'.en.ass'));
const proof={schema:'v35-ass-group-native-isolated-shaping-pixels-v1',
  status:'IN_PROGRESS',passed:false,inputs:[],products:[],rendered:[],
  limits:[
    'Only two test-generated real FFmpeg MP4 sources and two distinct ASS tracks',
    'The test font is a uniquely named regular TrueType face derived from installed DejaVu outlines, not all proprietary font families or multi-face collections',
    'System HarfBuzz clusters/advances and two separate exact pixel oracles: ass-to-ass, subtitles-to-subtitles. Cross-filter SSIM is diagnostic only; no all-player, all-effects or physical-device certification',
    'No loose font files are uploaded or redistributed in the CI artifact; delivered Matroska includes its needed embedded subset',
  ]};
let browser,context,page;
const writeProof=()=>fs.writeFile(path.join(out,'isolated-ass-group-evidence.json'),
  JSON.stringify(proof,null,2)+'\n');
function render(ass,fonts,dest,{engine='ass'}={}){
  assert.ok(['ass','subtitles'].includes(engine),
    'CI oracle only accepts the two explicit FFmpeg/libass entry paths');
  // Critical: FFmpeg's "ass" and "subtitles" filters are NOT pixel
  // interchangeable for some complex-script samples even with the same
  // source font, source ASS, and canvas dimensions. Compare only a given
  // filter to the SAME filter's reference. Do not loosen an SSIM threshold.
  const filter=engine+'=filename='+p3RenderFilterPath(ass)+
    ':fontsdir='+p3RenderFilterPath(fonts);
  const proc=spawnSync('ffmpeg',[
    '-hide_banner','-loglevel','verbose','-nostdin','-y',
    '-f','lavfi','-i','color=c=black:s=640x360:r=10:d=1.2',
    '-vf',filter,'-ss','0.65','-frames:v','1',
    '-c:v','png','-f','image2',dest,
  ],{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
  assert.equal(proc.status,0,proc.error?.message||String(proc.stderr).slice(-1600));
  const log=String(proc.stderr||'');
  const selected=log.split('\n')
    .filter(line=>line.includes('fontselect:'))
    .map(line=>line.split('->').slice(1).join('->').trim());
  return {log,selected};
}
function renderMkvDirect(mkv,dest){
  // The original delivered Matroska is read by libass including its
  // embedded font; unlike the reference, no external fontsdir is supplied.
  const filter='subtitles=filename='+p3RenderFilterPath(mkv)+':si=0';
  const proc=spawnSync('ffmpeg',[
    '-hide_banner','-loglevel','verbose','-nostdin','-y',
    '-f','lavfi','-i','color=c=black:s=640x360:r=10:d=1.2',
    '-vf',filter,'-ss','0.65','-frames:v','1',
    '-c:v','png','-f','image2',dest,
  ],{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
  assert.equal(proc.status,0,proc.error?.message||String(proc.stderr).slice(-1800));
  const log=String(proc.stderr||'');
  const selected=log.split('\n').filter(x=>x.includes('fontselect:'))
    .map(x=>x.split('->').slice(1).join('->').trim());
  return {selected};
}
function imageSsim(source,delivered){
  const proc=spawnSync('ffmpeg',[
    '-hide_banner','-loglevel','info','-nostdin',
    '-i',source,'-i',delivered,'-lavfi','ssim','-f','null','-',
  ],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(proc.status,0,proc.error?.message||String(proc.stderr).slice(-700));
  const match=String(proc.stderr||'').match(/All:([0-9]+(?:\.[0-9]+)?)/);
  assert.ok(match,'independent native FFmpeg did not report SSIM');
  return Number(match[1]);
}
function makeAss(family,cue){
  return [
    '[Script Info]',
    'Title: isolated native group union proof',
    'ScriptType: v4.00+','PlayResX: 640','PlayResY: 360','',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,'+family+',38,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,5,20,20,20,1','',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:00.15,0:00:00.95,Default,,0,0,0,,'+cue,'',
  ].join('\n');
}
async function dl(selector,file){
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:60000}),page.locator(selector).click(),
  ]);
  await download.saveAs(file);
}
try{
  run(python,['scripts/s03-make-font-fixtures.py',fixtureRoot]);
  const fixture=JSON.parse(await fs.readFile(
    path.join(fixtureRoot,'fixture-manifest.json'),'utf8'));
  const family=fixture.families.ttc;
  const original=path.join(fontDir,'TrueTypeRegularOnly.ttf');
  await fs.copyFile(path.join(fixtureRoot,'TrueTypeRegularOnly.ttf'),original);
  const originalBytes=await fs.readFile(original);
  assert.ok(originalBytes.length>40000);
  const globallyInstalled=run('fc-list',[':', 'family']);
  assert.equal(globallyInstalled.includes(family),false,
    'the unique test font must NOT be globally installed; fallback can fake a good render');
  const union=cues.join(' ');
  const initial=inspect(original,union);
  assert.equal(initial.family,family);
  assert.equal(initial.missing.length,0);
  for(const tag of ['GSUB','GPOS'])
    assert.ok(initial.layout.includes(tag),'original layout table '+tag);
  assert.equal(shape(original,'office').hasNotdef,false);
  assert.ok(shape(original,'office').glyphCount<6,
    'source font must perform an actual office ligature substitution');
  for(let i=0;i<2;i++){
    ff(['-y','-f','lavfi','-i','color=c='+(i?'green':'blue')+
      ':s=320x180:r=24:d=1.3',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.3',
      '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','64k',
      '-shortest',videos[i]]);
    await fs.writeFile(assFiles[i],makeAss(family,cues[i]));
  }
  proof.family=family;
  proof.originalFont={
    fileName:path.basename(original),sha256:sha(originalBytes),
    bytes:originalBytes.length,faces:1,layout:initial.layout,
    familyIsNotInstalled:true,
  };
  proof.inputs=await Promise.all([...videos,...assFiles].map(async file=>({
    file:path.basename(file),sha256:sha(await fs.readFile(file)),
  })));
  browser=await chromium.launch({headless:true,
    ...(process.env.E2E_BROWSER_EXECUTABLE?
      {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
    args:['--no-sandbox','--disable-dev-shm-usage']});
  context=await browser.newContext({
    acceptDownloads:true,viewport:{width:1440,height:900},deviceScaleFactor:1,
  });
  page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  await page.locator('#sfv35FeatureNavigation [data-sfv35-task="batch"]').click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-view'),'batch');
  await page.setInputFiles('#batchUnifiedInput',[
    ...videos,...assFiles,original,
  ]);
  await page.waitForFunction(()=>(
    document.querySelectorAll('#batchPlan button[data-batch-job-index]').length===2 &&
    document.querySelectorAll('#batchPlan select[data-batch-tie-index]').length===0 &&
    document.querySelector('#batchFontInput')?.files?.length===1 &&
    !document.querySelector('#batchStartBtn')?.disabled
  ),null,{timeout:120000});
  assert.equal(await page.locator('#batchFontInput').evaluate(el=>el.files[0].name),
    'TrueTypeRegularOnly.ttf');
  await page.locator('#batchFontSubsetEnabled').check();
  await page.locator('#batchSubsetScope').selectOption('group');
  assert.equal(await page.locator('#batchSubsetScope').inputValue(),'group');
  await page.screenshot({path:path.join(out,'01-isolated-font-group-ready.png')});
  await page.locator('#batchStartBtn').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('#batchStatus')?.textContent||'';
    return status.startsWith('批量完成：')||status.startsWith('批量已取消：');
  },null,{timeout:360000});
  proof.terminal=await page.locator('#batchStatus').textContent();
  assert.match(proof.terminal,/已生成 2，审计通过 2，待复核 0，执行失败 0/);
  assert.equal(await page.locator('#batchResults a.download').count(),2);
  await page.screenshot({path:path.join(out,'02-isolated-group-real-outputs.png')});
  const digests=[];
  for(let i=0;i<2;i++){
    const mkv=path.join(out,outputs[i]+'.mkv');
    const reportName=path.join(out,outputs[i]+'.report.json');
    await dl('#batchResults a.download >> nth='+i,mkv);
    await dl('#batchResults a.report-download >> nth='+i,reportName);
    const report=JSON.parse(await fs.readFile(reportName,'utf8'));
    assert.equal(report.audit?.ok,true);
    const realMkvHash=sha(await fs.readFile(mkv));
    assert.equal(report.output?.sha256,realMkvHash);
    assert.equal(report.plan?.execution,'frozen-batch-context-v1');
    assert.equal(report.plan?.policy?.subsetScope,'group');
    assert.equal(report.plan?.policy?.subsetEnabled,true);
    const info=JSON.parse(run('ffprobe',[
      '-v','error','-show_streams','-of','json',mkv]));
    const subtitles=info.streams.filter(stream=>stream.codec_type==='subtitle');
    const fonts=info.streams.filter(stream=>stream.codec_type==='attachment');
    assert.equal(subtitles.length,1);
    assert.equal(subtitles[0].codec_name,'ass');
    assert.equal(fonts.length,1);
    assert.match(fonts[0].tags?.filename||'',/\.subset\.ttf$/);
    const deliveredDir=path.join(tmp,'delivered-'+i);
    await fs.mkdir(deliveredDir,{recursive:true});
    const delivered=path.join(deliveredDir,'TrueTypeRegularOnly.subset.ttf');
    ff(['-y','-dump_attachment:t:0',delivered,'-i',mkv,
      '-map','0:v:0','-c','copy','-f','null','-']);
    const actualFontBytes=await fs.readFile(delivered);
    const deliveredHash=sha(actualFontBytes);
    digests.push(deliveredHash);
    assert.ok(actualFontBytes.length>2000&&
      actualFontBytes.length<originalBytes.length,
      'real output must carry a reduced Group font attachment');
    assert.notEqual(deliveredHash,sha(originalBytes));
    const infoFace=inspect(delivered,union);
    assert.deepEqual(infoFace.missing,[],
      'same Group font must include every glyph from BOTH ASS episodes');
    assert.equal(infoFace.family,family);
    assert.equal(infoFace.postScript,initial.postScript,
      'actual delivered font must retain the isolated reference face identity');
    for(const tag of ['GSUB','GPOS'])
      assert.ok(infoFace.layout.includes(tag),'Group subset lost layout table '+tag);
    const nativeShapes=[];
    for(const sample of [...cues,'office','لا','a\u0301']){
      const sourceShape=shape(original,sample);
      const subsetShape=shape(delivered,sample);
      assert.equal(subsetShape.hasNotdef,false,
        'actual Group font cannot emit .notdef for '+JSON.stringify(sample));
      assert.deepEqual(subsetShape,sourceShape,
        'actual Group font must retain native HarfBuzz cluster / glyph count / advances / offsets for '+JSON.stringify(sample));
      nativeShapes.push({text:sample,source:sourceShape,subset:subsetShape});
    }
    // The negative is another font with identical name/outlines but its
    // GSUB/GPOS/GDEF removed; it should produce measurably worse shaping.
    const altered=path.join(negativeDir,
      'TrueTypeRegularOnly.subset.ttf');
    run(python,['scripts/s03-native-font-proof.py','strip-layout',
      delivered,altered]);
    assert.notDeepEqual(shape(altered,'office'),shape(delivered,'office'),
      'removing GSUB/GPOS must defeat the office-ligature control');
    const extractedAss=path.join(tmp,'delivered-'+i+'.ass');
    const stagedAss=path.join(tmp,'staged-'+i+'.ass');
    await fs.copyFile(assFiles[i],stagedAss);
    const muxAss=run('ffmpeg',['-hide_banner','-loglevel','error','-i',mkv,
      '-map','0:s:0','-c:s','ass','-f','ass','pipe:1']);
    await fs.writeFile(extractedAss,muxAss);
    assert.ok(muxAss.includes(cues[i]),
      'real delivered Matroska ASS must contain its original event text');
    const prefix=path.join(out,String(i+1)+'-'+(i?'B':'A'));
    const referencePng=prefix+'-reference.png';
    const actualPng=prefix+'-delivered.png';
    const changedPng=prefix+'-layout-stripped-negative.png';
    const directPng=prefix+'-direct-mkv.png';
    const subtitlesReferencePng=prefix+'-subtitles-filter-reference.png';
    const directMkv=path.join(tmp,'direct-'+i+'.mkv');
    await fs.copyFile(mkv,directMkv);
    // libavfilter's CI-only path sanitizer rejects spaces; the SAME exact
    // original ASS bytes are staged under a safe temporary basename.
    const refRender=render(stagedAss,fontDir,referencePng);
    const gotRender=render(extractedAss,deliveredDir,actualPng);
    const alteredRender=render(extractedAss,negativeDir,changedPng);
    // Same libass entry path comparison: original ASS as subtitles filter
    // with isolated source font, versus delivered MKV as subtitles filter
    // with ONLY the embedded font. Their resulting pixels must be exact.
    const sourceSubtitleRender=render(stagedAss,fontDir,
      subtitlesReferencePng,{engine:'subtitles'});
    const directRender=renderMkvDirect(directMkv,directPng);
    assert.ok(directRender.selected.some(s=>
      s.includes(initial.postScript)||s.includes(family)),
      'direct final MKV must select embedded isolated font, not system fallback: '+
      directRender.selected.join(' | '));
    assert.ok(sourceSubtitleRender.selected.some(s=>
      s.includes(initial.postScript)||s.includes(family)),
      'original ASS subtitles filter must select isolated font, not fallback: '+
      sourceSubtitleRender.selected.join(' | '));
    const sameEngineSsim=imageSsim(subtitlesReferencePng,directPng);
    assert.equal(sha(await fs.readFile(directPng)),
      sha(await fs.readFile(subtitlesReferencePng)),
      'direct MKV subtitles filter must pixel-match original ASS through SAME subtitles filter');
    assert.equal(sameEngineSsim,1,
      'same-engine independent SSIM must be 1, not silently weakened');
    // Deliberate non-gating diagnostic: the distinct ass/subtitles filter
    // entry points may render Arabic ligatures/kerning differently.
    const crossEngineSsim=imageSsim(referencePng,directPng);
    for(const [name,evidence] of [['reference',refRender],['delivered',gotRender]]){
      assert.ok(evidence.selected.some(s=>
        s.includes(initial.postScript)||s.includes(family)),
      name+' libass must explicitly SELECT unique isolated face, not fallback: '+evidence.selected.join(' | '));
    }
    const rendered={
      originalSha256:sha(await fs.readFile(referencePng)),
      deliveredSha256:sha(await fs.readFile(actualPng)),
      strippedLayoutSha256:sha(await fs.readFile(changedPng)),
      originalSelection:refRender.selected,
      deliveredSelection:gotRender.selected,
      strippedLayoutSelection:alteredRender.selected,
      directMkvSelection:directRender.selected,
      subtitlesFilterReferenceSelection:sourceSubtitleRender.selected,
      directMkvPngSha256:sha(await fs.readFile(directPng)),
      subtitlesFilterReferencePngSha256:sha(await fs.readFile(subtitlesReferencePng)),
      sameSubtitlesFilterSsim:sameEngineSsim,
      crossAssVsSubtitlesFilterSsim:crossEngineSsim,
      crossFilterPixelEquivalenceClaim:false,
    };
    assert.equal(rendered.deliveredSha256,rendered.originalSha256,
      'libass exact pixels of delivered ASS+Group subset must match reference original ASS+source font at fixed time');
    assert.notEqual(rendered.strippedLayoutSha256,rendered.deliveredSha256,
      'GSUB/GPOS stripping negative control must alter visible rendered pixels');
    proof.products.push({
      file:path.basename(mkv),sha256:realMkvHash,
      attachmentSha256:deliveredHash,attachmentBytes:actualFontBytes.length,
      attachmentName:fonts[0].tags?.filename,
      subtitleCodec:'ass',actualCue:cues[i],
      fontFace:infoFace,nativeShapes,rendered,outputAudit:report.audit.status,
    });
  }
  assert.equal(digests.length,2);
  assert.equal(digests[0],digests[1],
    'both distinct audited MKVs must contain the identical actual Group subset bytes');
  for(const input of proof.inputs){
    const file=[...videos,...assFiles].find(p=>path.basename(p)===input.file);
    assert.equal(sha(await fs.readFile(file)),input.sha256);
  }
  assert.equal(sha(await fs.readFile(original)),proof.originalFont.sha256);
  assert.deepEqual(pageErrors,[]);
  proof.status='PASS';proof.passed=true;
  await writeProof();
  console.log('V3.5 isolated Group font: two real MKVs, face identity, HarfBuzz union shaping, exact libass pixels, negative controls PASS');
}catch(error){
  proof.status='FAIL';proof.passed=false;
  proof.error=String(error);
  if(page)await page.screenshot({
    path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
  await writeProof();
  throw error;
}finally{
  await context?.close();
  await browser?.close();
  await fs.rm(tmp,{recursive:true,force:true});
}
