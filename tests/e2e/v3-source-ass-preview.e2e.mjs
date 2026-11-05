import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const dir=path.resolve('.e2e/ui-v3-ass-source');
await fs.mkdir(dir,{recursive:true});
const baseFile=path.join(dir,'base.mp4'),ass=path.join(dir,'proof.ass'),mkv=path.join(dir,'A-real-ASS.mkv');
const ff=args=>execFileSync('ffmpeg',['-hide_banner','-v','error','-y',...args],{timeout:90000});
ff(['-f','lavfi','-i','color=c=black:s=640x360:r=24:d=2','-c:v','mpeg4','-q:v','5',baseFile]);
await fs.writeFile(ass,[
'[Script Info]','ScriptType: v4.00+','PlayResX: 640','PlayResY: 360','',
'[V4+ Styles]',
'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
'Style: Default,DejaVu Sans,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,24,1',
'','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
'Dialogue: 0,0:00:00.10,0:00:01.40,Default,,0,0,0,,V3 ASS Native Preview',''].join('\n'));
ff(['-i',baseFile,'-i',ass,'-map','0:v:0','-map','1:s:0','-c','copy',
'-metadata:s:s:0','title=V3 Source ASS',mkv]);
const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',mkv],{encoding:'utf8'})).streams
 .find(s=>s.codec_type==='subtitle');
assert.equal(stream.codec_name,'ass');
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=sha(await fs.readFile(mkv));
const browser=await chromium.launch({headless:true,
 ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
 args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:820,height:1180},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const evidence={schema:'softmux-v3-ass-source-preview-v1',streamIndex:stream.index,
 limits:'Real ASS no embedded font. Not complex-font or Figma-pixel acceptance.'};
try {
 await page.goto(new URL('?ui=v3',process.env.E2E_BASE_URL||'http://127.0.0.1:4173/').href,{waitUntil:'networkidle'});
 await page.setInputFiles('#unifiedAssetInput',mkv);
 await page.waitForFunction(i=>!!document.querySelector('#previewSubtitleSelect option[value="source:'+i+'"]')&&
  !!document.querySelector('#sfv3SourceContents .sfv3-row-select'),stream.index,{timeout:120000});
 const row=page.locator('#sfv3SourceContents .sfv3-row-select').filter({hasText:'V3 Source ASS'}).first();
 await row.click();
 const sourceHelp=page.locator('#sfv3SourceInspector #sfv3SubtitleFlagsHelp');
 assert.equal(await sourceHelp.count(),1,
   'V3-09 source ASS has the same single Default/Forced glossary as the target editor');
 assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').count(),1);
 assert.equal(await sourceHelp.isVisible(),true);
 const sourceFonts=page.locator('#sfv3SourceFontEvidence');
 await page.waitForFunction(()=>
   document.querySelector('#sfv3SourceFontEvidence')?.textContent
     ?.includes('0 项疑似字体附件'),null,{timeout:60000});
 assert.match(await sourceFonts.textContent(),/不等于字体 face、字重、斜体或字形依赖已验证/);
 assert.equal(await sourceFonts.locator('li').count(),0,
   'a real ASS with no attachments must not display invented font files');
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 await sourceHelp.locator('summary').click();
 assert.equal(await sourceHelp.getAttribute('open'),'');
 assert.match(await sourceHelp.textContent(),/默认轨道标记/);
 assert.match(await sourceHelp.textContent(),/强制字幕标记/);
 assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').count(),1,
   'opening source technical help cannot clone the shared help DOM');
 await page.screenshot({path:path.join(dir,'v3-source-ass-flags-and-font-observation.png')});
 await sourceHelp.locator('summary').click();
 assert.equal(await page.locator('#sfv3SourceInspectorPreview').isVisible(),true);
 assert.equal(await page.locator('#sfv3SourceInspectorAdd').isVisible(),true);
 assert.match(await page.locator('#sfv3SourceInspectorAdd').textContent(),/校验 ASS 与字体/);
 await page.locator('#sfv3SourceInspectorAdd').click();
 assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true,
   'ASS Add-to only opens explicit target choice; no target is granted');
 assert.equal(await page.locator('#sfv3ConfirmTarget').isDisabled(),true,
   'one imported source cannot act as its own destination');
 await page.locator('.sfv3-picker-cancel').click();
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#sfv3AssFontDependencies').isVisible(),false,
   'no font-closure evidence exists before actual source bundle processing');
 assert.equal(await page.locator('#sfv3SourceInspectorExtract').isVisible(),true);
 assert.match(await page.locator('#sfv3SourceInspectorExtract').textContent(),/不含字体/);
 const denied=await page.evaluate(i=>{
  const file=document.querySelector('#videoInput').files[0];
  const key=document.querySelector('#sfv3SourceTab').dataset.sfv3SourceKey;
  const event=new CustomEvent('softmux:v3-preview-source',{bubbles:true,cancelable:true,
    detail:{sourceKey:key,sourceFile:new File(['fake'],file.name,{lastModified:file.lastModified}),streamIndex:i}});
  document.querySelector('#sf14Root').dispatchEvent(event);
  return event.defaultPrevented;
 },stream.index);
 assert.equal(denied,false,'forged File must fail closed');
 const deniedExtraction=await page.evaluate(i=>{
  const file=document.querySelector('#videoInput').files[0];
  const key=document.querySelector('#sfv3SourceTab').dataset.sfv3SourceKey;
  const event=new CustomEvent('softmux:v3-extract-source',{bubbles:true,cancelable:true,
    detail:{sourceKey:key,sourceFile:new File(['fake'],file.name,{lastModified:file.lastModified}),streamIndex:i}});
  document.querySelector('#sf14Root').dispatchEvent(event);
  return event.defaultPrevented;
 },stream.index);
 assert.equal(deniedExtraction,false,'forged File cannot gain original-track extraction permission');
 await page.locator('#sfv3SourceInspectorPreview').click();
 assert.equal(await page.locator('#sfv3SourceInspector #sf14PreviewDrawer').count(),1);
 // No font attachment is present, and the isolated ffmpeg.wasm libass runtime
 // has NO host/browser font provider. This must fail visibly, not claim a
 // successful black preview merely because FFmpeg returned code 0.
 await page.waitForFunction(()=>
   (document.querySelector('#previewStatus')?.textContent||'')
    .includes('WASM 字幕渲染器没有可用字体提供程序'),
   null,{timeout:180000});
 assert.equal(await page.locator('#previewImage').isVisible(),false);
 evidence.noFontProviderRefusal=true;
 // Controlled positive: give the exact same source an available font through
 // the existing native font input. Keep the source File, subtitle selection
 // and explicit target authorization unchanged. Never ship this system font
 // as a repository or CI artifact.
 const fontPath=execFileSync('fc-match',['-f','%{file}','DejaVu Sans'],
   {encoding:'utf8'}).trim();
 assert.ok(fontPath && /\.(?:ttf|otf)$/i.test(fontPath));
 await fs.access(fontPath);
 await page.setInputFiles('#fontInput',fontPath);
 await page.waitForFunction(()=>
   document.querySelector('#fontInput')?.files?.length===1 &&
   !document.querySelector('#previewRefreshBtn')?.disabled,
   null,{timeout:90000});
 const originalFontSelection=await page.locator('#fontInput').evaluate(el=>({
   name:el.files?.[0]?.name||'',bytes:el.files?.[0]?.size||0,
 }));
 evidence.explicitFontInput=originalFontSelection;
 const firstStatus=await page.locator('#previewStatus').textContent();
 await page.locator('#previewRefreshBtn').click();
 await page.waitForFunction(previous=>{
  const image=document.getElementById('previewImage');
  const status=document.getElementById('previewStatus')?.textContent||'';
  return image?.src?.startsWith('blob:') && image.complete && image.naturalWidth>0 &&
    /^预览帧：/.test(status) || (status!==previous && /^无法生成预览帧：/.test(status));
 },firstStatus,{timeout:45000});
 const currentStatus=await page.locator('#previewStatus').textContent();
 assert.match(currentStatus,/^预览帧：/,
   'explicit valid font must yield a visible preview, not a second font-provider refusal: '+currentStatus);
 assert.match(currentStatus,/显式字体 1 个/);
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
   'an explicitly selected preview font must not grant a target document');
 evidence.explicitFontSupplied={name:path.basename(fontPath),sourceHasEmbeddedFont:false};
 assert.match(await page.locator('#previewStatus').textContent(),/FFmpeg\/libass/);
 // The approved 820px ASS context shows the real rendered frame next to
 // preview controls. Earlier CI showed the image stacked below the visible
 // bottom sheet despite a successful FFmpeg/libass result.
 for(const [width,height] of [[820,1180],[620,900]]){
  await page.setViewportSize({width,height});
  const stage=await page.locator('#sfv3SourceInspector #previewStage').boundingBox();
  const controls=await page.locator('#sfv3SourceInspector #previewControls').boundingBox();
  const image=await page.locator('#sfv3SourceInspector #previewImage').boundingBox();
  const sheet=await page.locator('#sfv3SourceInspector').boundingBox();
  assert.ok(stage && controls && image && sheet,
    'the same actual preview, image and controls must be present at '+width);
  assert.ok(stage.width>=165 && stage.height>=95 && image.width>0 && image.height>0,
    'the visible preview image must remain usable at '+width);
  assert.ok(stage.x>=-2 && stage.x+stage.width<=width+2 &&
    stage.y>=0 && stage.y+stage.height<=height-50,
    'preview frame must be visible ABOVE the footer at '+width+' rather than clipped below sheet');
  assert.ok(controls.x>=stage.x+stage.width-12 &&
    Math.abs(stage.y-controls.y)<=85,
    'at '+width+' the native real controls must be beside the frame, not in a hidden vertical stack');
  assert.ok(sheet.x>=-2 && sheet.x+sheet.width<=width+2,
    'source sheet must never horizontally overflow the viewport');
  assert.equal(await page.locator('#previewImage').count(),1);
  assert.equal(await page.locator('#previewRefreshBtn').count(),1);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  await page.screenshot({path:path.join(dir,'v3-native-ass-preview-'+width+'.png')});
 }
 // This controlled fixture has a black source frame and a 0.10–1.40 s
 // WHITE ASS cue at the 0.75 s preview timestamp. A blob: PNG and a green
 // libass exit code do not prove any subtitle glyph actually appeared.
 // The assertion is fixture-specific: do not apply it to arbitrary videos,
 // deliberately empty cues, dark text or unknown source fonts.
 const previewPixels=await page.locator('#previewImage').evaluate(img=>{
   const canvas=document.createElement('canvas');
   canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(img,0,0);
   const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let brightPixels=0;
   for(let i=0;i<rgba.length;i+=4)
     if(Math.max(rgba[i],rgba[i+1],rgba[i+2])>=180)brightPixels++;
   return {width:canvas.width,height:canvas.height,brightPixels};
 });
 evidence.previewContentPixels=previewPixels;
 // Preserve the actual FFmpeg.wasm/libass log, not a theory about missing fonts.
 // Restrict to relevant lines to avoid injecting arbitrary source data in CI.
 evidence.previewRuntimeDiagnostics=(await page.locator('#log').textContent())
   .split(/\r?\n/).filter(line=>/ass|font|glyph|shaper|subtitl|error|warning/i.test(line))
   .slice(-75).map(line=>line.slice(0,450));
 await page.setViewportSize({width:820,height:1180});
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#muxBtn').isDisabled(),true);
 assert.equal(await page.locator('#compositionTracks [data-composition-id]').count(),0);
 assert.equal(await page.locator('#previewImage').count(),1);
 await page.screenshot({path:path.join(dir,'v3-native-ass-preview.png')});
 // The same source selection must extract a genuine standalone ASS with
 // the existing Stream Copy + independent output probe + JSON audit path.
 await page.locator('#sfv3SourceInspectorExtract').click();
 assert.equal(await page.locator('#sfv3SourceInspector #originalTrackExtractionPanel').count(),1,
   'native original-track result must move, never be cloned');
 await page.waitForFunction(()=>{
  const a=document.getElementById('originalTrackDownload');
  return a && !a.hidden && a.href.startsWith('blob:') &&
    /单轨编码\/参数回读通过/.test(document.getElementById('originalTrackExtractionStatus')?.textContent||'');
 },null,{timeout:180000});
 assert.equal(await page.locator('#originalTrackDownload').count(),1);
 assert.equal(await page.locator('#originalTrackReport').count(),1);
 const [trackDownload]=await Promise.all([
  page.waitForEvent('download'),
  page.locator('#originalTrackDownload').click(),
 ]);
 const extractedPath=path.join(dir,'real-source-extraction.ass');
 await trackDownload.saveAs(extractedPath);
 const extractedBytes=await fs.readFile(extractedPath);
 assert.ok(extractedBytes.length>0);
 assert.match(extractedBytes.toString('utf8'),/V3 ASS Native Preview/);
 const nativeExtractProbe=JSON.parse(execFileSync('ffprobe',[
  '-v','error','-show_streams','-of','json',extractedPath,
 ],{encoding:'utf8'}));
 assert.equal(nativeExtractProbe.streams?.length,1);
 assert.equal(nativeExtractProbe.streams[0].codec_name,'ass');
 const [reportDownload]=await Promise.all([
  page.waitForEvent('download'),
  page.locator('#originalTrackReport').click(),
 ]);
 const reportPath=path.join(dir,'real-source-extraction.json');
 await reportDownload.saveAs(reportPath);
 const audit=JSON.parse(await fs.readFile(reportPath,'utf8'));
 assert.equal(audit.schema,'softmux-original-track-extraction-v1');
 assert.equal(audit.source.streamIndex,stream.index);
 assert.equal(audit.audit.ok,true);
 assert.equal(audit.output.format,'native');
 assert.equal(audit.output.sha256,sha(extractedBytes));
 assert.equal(audit.policy.includeAttachments,false);
 assert.equal(audit.policy.includeChapters,false);
 assert.equal(audit.policy.includeGlobalTags,false);
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 assert.equal(await page.locator('#muxBtn').isDisabled(),true);
 assert.equal(await page.locator('#compositionTracks [data-composition-id]').count(),0);
 evidence.extraction={sha256:sha(extractedBytes),size:extractedBytes.length,
   streamIndex:stream.index,format:'native',attachmentsIncluded:false,reportValidated:true};
 await page.screenshot({path:path.join(dir,'v3-native-ass-extraction.png')});
 await page.locator('#sfv3SourceInspectorClose').click();
 assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').count(),1);
 assert.equal(await page.locator('#sfv3SourceInspector #sfv3SubtitleFlagsHelp').count(),0,
   'closing source object must restore the ONE technical help to target inspector');
 assert.equal(await page.locator('#sf14PreviewDrawer').count(),1);
 assert.equal(await page.locator('#sfv3SourceInspector #sf14PreviewDrawer').count(),0);
 assert.equal(await page.locator('#originalTrackExtractionPanel').count(),1);
 assert.equal(await page.locator('#sfv3SourceInspector #originalTrackExtractionPanel').count(),0);
 assert.equal(sha(await fs.readFile(mkv)),original);
 assert.deepEqual(errors,[]);
 assert.ok(previewPixels.brightPixels>=100,
   'V3 real ASS preview PNG is visually blank: a known white active dialogue on a black frame must render actual bright glyph pixels (check libass font availability, cue timing and frame composition)');
 evidence.passed=true;
} catch(err){
 evidence.passed=false;evidence.error=String(err);
 evidence.lastPreviewStatus=await page.locator('#previewStatus').textContent().catch(()=>null);
 evidence.lastFontFiles=await page.locator('#fontInput').evaluate(el=>
   [...(el.files||[])].map(f=>({name:f.name,size:f.size}))).catch(()=>[]);
 evidence.lastFFmpegFontLogs=(await page.locator('#log').textContent().catch(()=>''))
   .split(/\r?\n/).filter(line=>/ass|font|glyph|shaper|error|warning/i.test(line))
   .slice(-45).map(line=>line.slice(0,450));
 await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
 throw err;
} finally {
 evidence.errors=errors;
 await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 await context.close();await browser.close();
}
