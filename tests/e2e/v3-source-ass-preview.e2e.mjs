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
 await page.waitForFunction(()=>{
  const image=document.getElementById('previewImage');
  return image?.src?.startsWith('blob:') && image.complete && image.naturalWidth>0 &&
    /预览帧：/.test(document.getElementById('previewStatus')?.textContent||'');
 },null,{timeout:180000});
 assert.match(await page.locator('#previewStatus').textContent(),/FFmpeg\/libass/);
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
 assert.equal(await page.locator('#sf14PreviewDrawer').count(),1);
 assert.equal(await page.locator('#sfv3SourceInspector #sf14PreviewDrawer').count(),0);
 assert.equal(await page.locator('#originalTrackExtractionPanel').count(),1);
 assert.equal(await page.locator('#sfv3SourceInspector #originalTrackExtractionPanel').count(),0);
 assert.equal(sha(await fs.readFile(mkv)),original);
 assert.deepEqual(errors,[]);
 evidence.passed=true;
} catch(err){
 evidence.passed=false;evidence.error=String(err);
 await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
 throw err;
} finally {
 evidence.errors=errors;
 await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 await context.close();await browser.close();
}
