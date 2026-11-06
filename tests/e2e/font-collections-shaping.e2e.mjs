import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {p3RenderFilterPath} from '../../scripts/p3-final-ass-render-proof.mjs';

const root=path.resolve(process.env.E2E_FIXTURE_DIR||'.e2e/fixtures');
const inputs=path.resolve(process.env.E2E_S03_FONT_DIR||'.e2e/s03-font-inputs');
const out=path.resolve(process.env.E2E_S03_OUTPUT_DIR||'.e2e/s03-collection-output');
const baseUrl=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const python=process.env.E2E_PYTHON||'python3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
const fontProof=(...args)=>JSON.parse(run(python,['scripts/s03-native-font-proof.py',...args]));
const texts=['office','العربية','a\u0301 AV','a\u0302\u0301','a\u0327\u0302\u0301'];
const required='office ffi AV a\u0301 العربية لا a\u0302\u0301 a\u0327\u0302\u0301';
await fs.mkdir(out,{recursive:true});
const proof={schema:'softmux-s03-collection-shaping-v1',status:'IN_PROGRESS',startedAt:new Date().toISOString(),cases:[],errors:[],
 limits:['Generated unique DejaVu-derived two-face fixtures, not arbitrary fonts/scripts','Collection subsetting is not authorized; original bytes must be retained','No device, all-player or formal S03 verdict promotion']};
const selected=(log,name)=>String(log).split('\n').some(l=>l.includes('fontselect:')&&l.split('->')[1]?.includes(name));
async function render(ass,fontDir,destination){
 const filter=ass?'ass=filename='+p3RenderFilterPath(ass)+':fontsdir='+p3RenderFilterPath(fontDir):null;
 const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','verbose','-nostdin','-y','-f','lavfi','-i','color=c=black:s=640x360:r=10:d=2',...(filter?['-vf',filter]:[]),'-ss','1','-frames:v','1','-c:v','png',destination],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 assert.equal(r.status,0,r.stderr);await fs.writeFile(destination+'.log',r.stderr);
 return{sha:sha(await fs.readFile(destination)),log:r.stderr};
}
function assText(family,both){
 return `[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Regular,${family},24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,5,10,10,10,1\nStyle: Bold,${family},24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,0,5,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.20,0:00:01.80,Regular,,0,0,0,,{\\pos(320,100)}${required}\n`+(both?`Dialogue: 0,0:00:00.20,0:00:01.80,Bold,,0,0,0,,{\\pos(320,210)}${required}\n`:'');
}
let browser;
try{
 run(python,['scripts/s03-make-font-fixtures.py',inputs]);
 const fixture=JSON.parse(await fs.readFile(path.join(inputs,'fixture-manifest.json'),'utf8'));
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{})});
 for(const mode of ['ttc','otc','otf-subset','batch-otf-subset']){
  const batch=mode==='batch-otf-subset',collection=mode==='ttc'||mode==='otc',family=fixture.families[mode==='ttc'?'ttc':'otc'];
  assert.ok(!run('fc-list',[':','family']).includes(family),'fixture family must be absent from installed fonts');
  const name=mode==='ttc'?'TrueTypeProof.ttc':mode==='otc'?'OpenTypeProof.otc':'OpenTypeProof.otf';
  const sourceFont=path.join(inputs,name),sourceBytes=await fs.readFile(sourceFont),sourceInfo=fontProof('inspect',sourceFont,required);
  assert.equal(sourceInfo.faces.length,collection?2:1);
  if(mode!=='ttc')assert.ok(sourceInfo.faces.every(f=>f.cff),'OTC must contain actual CFF faces');
  if(collection)assert.deepEqual(sourceInfo.faces.map(f=>f.weight),[400,700]);
  const dir=path.join(out,mode);await fs.mkdir(dir,{recursive:true});
  const ass=path.join(dir,batch?'S03-S01E01.ass':'input.ass'),sourceAss=assText(family,collection);await fs.writeFile(ass,sourceAss);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   // This scenario is a regression of the pre-V3 production workbench.
   // Default / now uses V3's explicit-target permission gate; do not
   // silently authorize a target merely to satisfy a legacy fixture.
   await page.goto(new URL('?ui=workbench',baseUrl).href,{waitUntil:'networkidle'});
   await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),ass,sourceFont]);
   await page.waitForFunction(()=>document.querySelectorAll('#newSubtitleList .track-meta').length===1&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
   await page.locator('#assetInventory .asset-entry[data-kind="font"] [data-asset-focus-key]').click();
   if(!await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open))await page.locator('#sf14OptionsDrawer > summary').click();
   await page.locator('#fontMode').selectOption('preserve');await page.locator('#fontSubsetEnabled').setChecked(true);
   if(!await page.locator('#sf14PreviewDrawer').evaluate(el=>el.open))await page.locator('#sf14PreviewDrawer > summary').click();
   await page.locator('#previewTimeInput').fill('1.0');await page.locator('#previewRefreshBtn').click();
   await page.waitForFunction(()=>document.querySelector('#previewImage')?.src.startsWith('blob:'),null,{timeout:180000});
   const preview=Buffer.from(await page.locator('#previewImage').evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.src)).arrayBuffer()))));
   assert.equal(preview.subarray(1,4).toString(),'PNG');assert.ok(preview.length>1000);await fs.writeFile(path.join(dir,'preview.png'),preview);
   const previewLog=await page.locator('#log').textContent();await fs.writeFile(path.join(dir,'preview.log'),previewLog);
   if(batch){
    const video=path.join(dir,'S03-S01E01.mp4');await fs.copyFile(path.join(root,'base.mp4'),video);
    await page.locator('[data-sf-view="batch"]').click();
    await page.setInputFiles('#batchUnifiedInput',[video,ass,sourceFont]);
    await page.waitForFunction(()=>document.querySelectorAll('#batchPlan [data-batch-job-index]').length===1&&!document.querySelector('#batchStartBtn').disabled,null,{timeout:120000});
    if(await page.locator('[data-sf-batch-controls="recipe"]').isVisible())await page.locator('[data-sf-batch-controls="recipe"]').click();
    await page.locator('#batchFontSubsetEnabled').setChecked(true);
    await page.waitForFunction(()=>!document.querySelector('#batchStartBtn').disabled);
    await page.locator('#batchStartBtn').click();
    await page.waitForFunction(()=>/已生成 1，审计通过 1，待复核 0，执行失败 0/.test(document.querySelector('#batchStatus').textContent),null,{timeout:180000});
   }else{
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
   }
   const output=path.join(dir,'output.mkv'),reportPath=path.join(dir,'report.json');
   for(const [selector,destination] of [[batch?'#batchResults a.download':'#downloadLink',output],[batch?'#batchResults a.report-download':'#reportLink',reportPath]]){
    const[d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(destination);
   }
   const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.audit.ok,true,JSON.stringify(report.audit));
   if(batch)assert.equal(report.plan.execution,'frozen-batch-context-v1');
   assert.equal(report.output.sha256,sha(await fs.readFile(output)));assert.equal(report.warnings.fontDependencyWarningCount,0);
   const parsed=JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',output]));
   const attachments=parsed.streams.filter(s=>s.codec_type==='attachment');assert.equal(attachments.length,1);
   const deliveredDir=path.join(dir,'delivered-font-only');await fs.mkdir(deliveredDir,{recursive:true});
   const deliveredFont=path.join(deliveredDir,'delivered.'+(collection?mode:'otf'));
   run('ffmpeg',['-v','error','-y','-dump_attachment:t:0',deliveredFont,'-i',output,'-map','0:v:0','-c','copy','-f','null','-']);
   const deliveredBytes=await fs.readFile(deliveredFont),info=fontProof('inspect',deliveredFont,required);
   assert.equal(info.faces.length,sourceInfo.faces.length);assert.ok(info.faces.every(f=>!f.missing.length));
   assert.deepEqual(info.faces.map(f=>[f.family,f.style,f.weight,f.cff]),sourceInfo.faces.map(f=>[f.family,f.style,f.weight,f.cff]));
   if(collection){
    assert.equal(sha(deliveredBytes),sha(sourceBytes),'both original collection faces must survive byte-for-byte');
    assert.equal(report.fonts.attachments[0].subset.applied,false);assert.equal(report.fonts.attachments[0].subset.reason,'font-collection');
    assert.equal(attachments[0].tags.filename,name);
   }else{
    assert.equal(report.fonts.attachments[0].subset.applied,true);assert.ok(deliveredBytes.length<sourceBytes.length);
    assert.ok(info.faces[0].glyphs<sourceInfo.faces[0].glyphs);assert.ok(info.faces[0].layout.includes('GSUB')&&info.faces[0].layout.includes('GPOS'));
   }
   const deliveredAss=path.join(dir,'delivered.ass');run('ffmpeg',['-v','error','-y','-copyts','-i',output,'-map','0:s:0','-c:s','ass',deliveredAss]);
   const referenceDir=path.join(dir,'reference-font-only');await fs.mkdir(referenceDir,{recursive:true});await fs.copyFile(sourceFont,path.join(referenceDir,name));
   const reference=await render(ass,referenceDir,path.join(dir,'reference.png'));
   const actual=await render(deliveredAss,deliveredDir,path.join(dir,'actual.png'));
   assert.equal(actual.sha,reference.sha,'final extracted ASS/font must reproduce reference pixels');
   for(const face of sourceInfo.faces){assert.ok(selected(reference.log,face.postScript),reference.log);assert.ok(selected(actual.log,face.postScript),actual.log);}
   const blank=await render(null,referenceDir,path.join(dir,'blank.png'));assert.notEqual(actual.sha,blank.sha);
   const wrongAss=path.join(dir,'wrong.ass');await fs.writeFile(wrongAss,sourceAss.replaceAll(required,'WRONG TEXT'));
   const wrong=await render(wrongAss,referenceDir,path.join(dir,'wrong.png'));assert.notEqual(actual.sha,wrong.sha);
   const shapeProof=[];
   for(let face=0;face<info.faces.length;face++)for(const text of texts){
    const source=fontProof('shape',sourceFont,text,String(face)),delivered=fontProof('shape',deliveredFont,text,String(face));
    assert.equal(source.hasNotdef,false);assert.deepEqual(delivered,source,'native HarfBuzz clusters/advances/offsets must survive subset or passthrough');
    if(text==='office')assert.ok(source.glyphCount<text.length,'fixture must actually exercise Latin ligature substitution');
    shapeProof.push({face,text,...delivered});
   }
   let negative;
   const negativeDir=path.join(dir,'negative-font-only');await fs.mkdir(negativeDir,{recursive:true});
   if(collection){
    await fs.copyFile(path.join(inputs,mode==='ttc'?'TrueTypeRegularOnly.ttf':'OpenTypeRegularOnly.otf'),path.join(negativeDir,'regular.'+(mode==='ttc'?'ttf':'otf')));
    negative=await render(deliveredAss,negativeDir,path.join(dir,'regular-only.png'));
    assert.equal(selected(negative.log,sourceInfo.faces[1].postScript),false,'regular-only control must not select absent Bold');
   }else{
    const stripped=path.join(negativeDir,'stripped.otf');run(python,['scripts/s03-native-font-proof.py','strip-layout',deliveredFont,stripped]);
    const broken=fontProof('shape',stripped,'office');assert.notDeepEqual(broken,fontProof('shape',deliveredFont,'office'),'deleting real layout tables must invalidate shaping oracle');
    negative=await render(deliveredAss,negativeDir,path.join(dir,'layout-stripped.png'));
   }
   assert.notEqual(negative.sha,actual.sha,'missing face/layout negative must change actual visible rendering');
   assert.equal(sha(await fs.readFile(sourceFont)),sha(sourceBytes));assert.equal(await fs.readFile(ass,'utf8'),sourceAss);assert.deepEqual(errors,[]);
   proof.cases.push({mode,outputSha256:report.output.sha256,sourceFontSha256:sha(sourceBytes),deliveredFontSha256:sha(deliveredBytes),sourceFontBytes:sourceBytes.length,deliveredFontBytes:deliveredBytes.length,
    faceInfo:info.faces,subset:report.fonts.attachments[0].subset,previewPngSha256:sha(preview),referencePngSha256:reference.sha,actualPngSha256:actual.sha,negativePngSha256:negative.sha,
    nativeFaceSelectionVerified:true,previewProducedPng:true,previewFaceIdentityVerified:false,nativeShapeProof:shapeProof,sourceUnchanged:true});
   console.log('S03',mode,'actual preview/output/native faces/shaping/pixels/negative controls PASS');
  }catch(error){proof.lastStatus=await page.locator('#status').textContent().catch(()=>null);proof.lastLog=(await page.locator('#log').textContent().catch(()=>'' )).slice(-5000);throw error;}
  finally{await context.close();}
 }
 proof.status='PASS';console.log('S03 TTC/real-CFF OTC two-face preservation and OTF subset shaping PASS');
}catch(error){proof.status='FAIL';proof.errors.push(error.stack||String(error));throw error;}
finally{proof.completedAt=new Date().toISOString();await fs.writeFile(path.join(out,'s03-collection-shaping-evidence.json'),JSON.stringify(proof,null,2)+'\n');await browser?.close();}
