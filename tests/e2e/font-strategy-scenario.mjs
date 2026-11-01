import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {p3RenderFilterPath, p3FontSelectionProvesFamily, P3_FAMILY, P3_DIALOGUE} from '../../scripts/p3-final-ass-render-proof.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',file]));
function fontInfo(file,text){
 return JSON.parse(run(process.env.E2E_PYTHON || 'python3',['-c',`import json,sys
from fontTools.ttLib import TTFont
f=TTFont(sys.argv[1]); cmap=f.getBestCmap()
print(json.dumps({'families':sorted(set(n.toUnicode() for n in f['name'].names if n.nameID in [1,16])), 'missing':sorted(set(ord(c) for c in sys.argv[2] if ord(c) not in cmap)), 'glyphs':len(f.getGlyphOrder())}))`,file,text]));
}
async function render(ass,fontDir,dest){
 const filter=ass ? 'ass=filename='+p3RenderFilterPath(ass)+':fontsdir='+p3RenderFilterPath(fontDir) : null;
 const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','verbose','-nostdin','-y','-f','lavfi','-i','color=c=black:s=320x180:r=10:d=2',...(filter?['-vf',filter]:[]),'-ss','1','-frames:v','1','-c:v','png',dest],{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,r.stderr);await fs.writeFile(dest+'.log',r.stderr);return {bytes:await fs.readFile(dest),log:r.stderr};
}
async function download(page,selector,dest){const [d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(dest);}
export async function scenarioFontStrategies(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 const font=path.join(root,'P3EmbeddedProof.ttf'),originalFont=await fs.readFile(font);
 const originalAss=(await fs.readFile(path.join(root,'p3-embedded-proof.ass'),'utf8')).replace(P3_DIALOGUE,P3_DIALOGUE+'\\hfi\u2003AV');
 const requiredGlyphs=P3_DIALOGUE+'\u00a0fi\u2003AV';
 const missingFamily='Softmux Deliberately Missing Family 91872';
 assert.ok(!run('fc-list',[':','family']).includes(P3_FAMILY));
 assert.ok(!run('fc-list',[':','family']).includes(missingFamily));
 assert.ok(fontInfo(font,'中').missing.includes(0x4e2d),'negative glyph must actually be absent');
 const sourceFiles=[path.join(root,'base.mp4'),font,path.join(root,'DejaVuSans.ttf')];
 const sourceHashes=await Promise.all(sourceFiles.map(async f=>sha(await fs.readFile(f))));
 const receipts=[];
 for(const mode of ['preserve','subset','force','negative']){
  const dir=path.join(outDir,mode);await fs.mkdir(dir,{recursive:true});
  const inputAss=path.join(dir,'input.ass'),expectedAss=path.join(dir,'expected.ass');
  let text=originalAss;
  if(mode==='force')text=text.replaceAll(P3_FAMILY,missingFamily).replace(P3_DIALOGUE,'{\\fn'+missingFamily+'}'+P3_DIALOGUE);
  if(mode==='negative')text=text.replace('\n[Events]','\nStyle: Missing,'+missingFamily+',24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1\n\n[Events]')+
    '\nDialogue: 0,0:00:00.20,0:00:01.80,Proof,,0,0,0,,中\nDialogue: 0,0:00:00.20,0:00:01.80,Missing,,0,0,0,,Missing family\n';
  await fs.writeFile(inputAss,text);
  const expected=mode==='force'?text.replaceAll(missingFamily,P3_FAMILY):text;
  await fs.writeFile(expectedAss,expected);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   await page.goto(baseUrl,{waitUntil:'networkidle'});
   await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),inputAss,font,...(mode==='force'?[path.join(root,'DejaVuSans.ttf')]:[])]);
   await page.waitForFunction(()=>document.querySelectorAll('#newSubtitleList .track-meta').length===1&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
   // The font inventory action opens its real inspector and options drawer.
   await page.locator('#assetInventory .asset-entry[data-kind="font"] [data-asset-focus-key]').first().click();
   if(!await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open)) await page.locator('#sf14OptionsDrawer > summary').click();
   await page.locator('#fontMode').selectOption(mode==='force'?'force':'preserve');
   await page.locator('#fontSubsetEnabled').setChecked(mode==='subset');
   assert.equal(await page.locator('#fontMode').inputValue(),mode==='force'?'force':'preserve');
   assert.equal(await page.locator('#fontSubsetEnabled').isChecked(),mode==='subset');
   await page.locator('#muxBtn').click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
   const output=path.join(dir,'output.mkv'),reportPath=path.join(dir,'report.json');
   await download(page,'#downloadLink',output);await download(page,'#reportLink',reportPath);
   const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
   const log=await page.locator('#log').textContent();await fs.writeFile(path.join(dir,'browser.log'),log);
   assert.equal(report.audit.ok,true,JSON.stringify(report.audit));
   const attachments=probe(output).streams.filter(s=>s.codec_type==='attachment');
   assert.equal(attachments.length,1,'force must exclude the second uploaded font');
   const deliveredFontDir=path.join(dir,'delivered-font-only');await fs.mkdir(deliveredFontDir,{recursive:true});
   const deliveredFont=path.join(deliveredFontDir,'delivered.ttf');
   run('ffmpeg',['-v','error','-y','-dump_attachment:t:0',deliveredFont,'-i',output,'-map','0:v:0','-c','copy','-f','null','-']);
   const delivered=await fs.readFile(deliveredFont),info=fontInfo(deliveredFont,requiredGlyphs);
   assert.ok(info.families.includes(P3_FAMILY));assert.deepEqual(info.missing,[]);
   if(mode==='subset'){
    assert.ok(delivered.length<originalFont.length);assert.ok(info.glyphs<fontInfo(font,P3_DIALOGUE).glyphs);
    assert.equal(report.fonts.attachments[0].subset.applied,true);
    assert.match(attachments[0].tags.filename,/\.subset\.ttf$/);
   }else assert.equal(sha(delivered),sha(originalFont));
   const demuxedAss=path.join(dir,'delivered.ass');
   run('ffmpeg',['-v','error','-y','-copyts','-i',output,'-map','0:s:0','-c:s','ass',demuxedAss]);
   const demuxed=await fs.readFile(demuxedAss,'utf8');
   if(mode==='force'){
    assert.ok(!demuxed.includes(missingFamily),'force must rewrite style and inline font names');
    assert.ok(demuxed.includes('\\fn'+P3_FAMILY));
   }else assert.ok(demuxed.includes('Style: Proof,'+P3_FAMILY));
   if(mode==='negative'){
    assert.ok(demuxed.includes(missingFamily)&&demuxed.includes('中'));
    assert.match(log,/字体依赖未满足/);assert.match(log,/仍缺少.*中\(U\+4E2D\)/);
    assert.ok(report.warnings.fontDependencyWarningCount>=2);
    assert.match(await page.locator('#status').textContent(),/字体检查存在/);
    const negativeRender=await render(demuxedAss,deliveredFontDir,path.join(dir,'negative.png'));
    assert.ok(negativeRender.log.includes(missingFamily),'native renderer must encounter the authored missing family');
    assert.equal(p3FontSelectionProvesFamily(negativeRender.log,missingFamily),false,'missing family cannot become a verified selected font');
   }else{
    assert.equal(report.warnings.fontDependencyWarningCount,0);
    const refDir=path.join(dir,'reference-font-only');await fs.mkdir(refDir,{recursive:true});await fs.copyFile(font,path.join(refDir,'reference.ttf'));
    const reference=await render(expectedAss,refDir,path.join(dir,'reference.png'));
    const actual=await render(demuxedAss,deliveredFontDir,path.join(dir,'delivered.png'));
    assert.ok(p3FontSelectionProvesFamily(reference.log));assert.ok(p3FontSelectionProvesFamily(actual.log));
    assert.equal(sha(actual.bytes),sha(reference.bytes),'delivered ASS/font rendering must match the independent expected policy');
    const blank=await render(null,refDir,path.join(dir,'blank.png'));
    assert.notEqual(sha(actual.bytes),sha(blank.bytes),'glyphs must visibly render');
    const altered=path.join(dir,'altered.ass');await fs.writeFile(altered,expected.replace(P3_DIALOGUE,'Wrong glyph render control'));
    const wrong=await render(altered,refDir,path.join(dir,'altered.png'));
    assert.notEqual(sha(actual.bytes),sha(wrong.bytes),'changed text must fail the render oracle');
    // Missing delivered font must be observable even if a system fallback renders.
    const empty=path.join(dir,'empty-fonts');await fs.mkdir(empty,{recursive:true});
    const omitted=await render(demuxedAss,empty,path.join(dir,'omitted-font.png'));
    assert.equal(p3FontSelectionProvesFamily(omitted.log),false);
   }
   assert.equal(await fs.readFile(inputAss,'utf8'),text,'source ASS must remain unchanged');
   assert.deepEqual(errors,[]);
   receipts.push({mode,outputSha256:sha(await fs.readFile(output)),fontSha256:sha(delivered),fontBytes:delivered.length,fontInfo:info,warningGroups:report.warnings.fontDependencyWarningCount,uiAuditOk:report.audit.ok,nativeDemux:true,nativeRenderObserved:true,pixelEquivalenceVerified:mode!=='negative'});
  }catch(error){console.error('Font strategy '+mode,await page.locator('#status').textContent(),(await page.locator('#log').textContent()).slice(-4500));throw error;}
  finally{await context.close();}
 }
 assert.deepEqual(await Promise.all(sourceFiles.map(async f=>sha(await fs.readFile(f)))),sourceHashes);
 await fs.writeFile(path.join(outDir,'font-strategy-evidence.json'),JSON.stringify({schema:'softmux-font-strategies-v1',result:'pass',receipts,sourceHashes,sourceUnchanged:true,limits:'One named SFNT font/ASS frame; no arbitrary shaping, OTC/multi-face, physical device, all-player or formal S03 PASS claim. Missing dependency warnings do not prevent container audit success.'},null,2)+'\n');
 console.log('Font strategies: preserve/subset/force native outputs and missing-family/glyph diagnostics PASS');
}
