import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyFinishedMkvAssRender} from '../../scripts/p3-final-ass-render-proof.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function scenarioEmbeddedAssPreview(browser,{root,outDir,baseUrl,nativeAudit=true}){
 await fs.mkdir(outDir,{recursive:true});
 const source=path.join(outDir,'source-with-internal-ass.mkv');
 const ass=path.join(root,'embedded-source-multiple.ass'),font=path.join(root,'P3EmbeddedProof.ttf');
 await fs.writeFile(ass,(await fs.readFile(path.join(root,'p3-embedded-proof.ass'),'utf8'))+'\nDialogue: 0,0:00:01.20,0:00:01.30,Proof,,0,0,0,,Middle cue\nDialogue: 0,0:00:01.60,0:00:01.70,Proof,,0,0,0,,Later cue\n');
 assert.ok(!execFileSync('fc-list',[':', 'family'],{encoding:'utf8'}).includes('UIGS P3 Embedded Proof'),'fixture font must not be installed globally');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-i',ass,
  '-map','0','-map','1:s:0','-c','copy','-attach',font,'-metadata:s:t:0','mimetype=font/ttf',
  '-metadata:s:t:0','filename=P3EmbeddedProof.ttf','-avoid_negative_ts','disabled',source]);
 const sourceHash=sha(await fs.readFile(source));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const imageBytes=async()=>Buffer.from(await page.locator('#previewImage').evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.src)).arrayBuffer()))));
 const render=async()=>{
  await page.locator('#previewTimeInput').fill('1.0');await page.locator('#previewRefreshBtn').click();
  await page.waitForFunction(()=>document.querySelector('#previewImage')?.src.startsWith('blob:'),null,{timeout:180000});
  return imageBytes();
 };
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[source]);
  await page.waitForFunction(()=>document.querySelector('#previewSubtitleSelect option[value^="source:"]')&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.equal(await page.locator('#subInput').evaluate(el=>el.files.length),0);
  assert.equal(await page.locator('#fontInput').evaluate(el=>el.files.length),0);
  const key=await page.locator('#previewSubtitleSelect option[value^="source:"]').first().getAttribute('value');
  await page.locator('#sf14PreviewDrawer > summary').click();
  await page.locator('#previewSubtitleSelect').selectOption(key);
  const planBefore=await page.locator('#compositionCount').textContent();
  const internal=await render();await fs.writeFile(path.join(outDir,'internal-preview.png'),internal);
  const log=await page.locator('#log').textContent();await fs.writeFile(path.join(outDir,'internal-preview.log'),log);
  assert.match(log,/fontselect:.*UIGS P3 Embedded Proof/);
  assert.match(log,/UIGSP3EmbeddedProof-Regular/,'the actual embedded family must be selected, not fallback');
  assert.equal(await page.locator('#compositionCount').textContent(),planBefore,'preview must not change output selection');
  assert.equal(await page.locator('#subInput').evaluate(el=>el.files.length),0);
  assert.equal(await page.locator('#fontInput').evaluate(el=>el.files.length),0);
  await page.locator('#previewTimeInput').fill('1.25');
  await page.locator('#previewNextCueBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
  assert.ok(Number(await page.locator('#previewTimeInput').inputValue().then(t=>t.split(':').at(-1)))>1.5,'cached source cue navigation must resolve the newly entered time before Next');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#muxBtn').click().then(async()=>{
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('完成。'),null,{timeout:180000});
   await page.locator('#downloadLink').click();
  })]);
  const output=path.join(outDir,'embedded-preview-delivery.mkv');await download.saveAs(output);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'}));
  assert.equal(probe.streams.filter(s=>s.codec_type==='subtitle'&&s.codec_name==='ass').length,1);
  assert.equal(probe.streams.filter(s=>s.codec_type==='attachment').length,1);
  if(nativeAudit)await verifyFinishedMkvAssRender({finalMkv:output,sourceAss:ass,sourceFont:font,outputDir:path.join(outDir,'native-render')});
  assert.equal(sha(await fs.readFile(source)),sourceHash);
  // Rebinding to an unrelated source clears the prior image and candidates.
  const unrelated=path.join(outDir,'unrelated.mp4');await fs.copyFile(path.join(root,'base.mp4'),unrelated);
  await page.setInputFiles('#videoInput',unrelated);
  await page.waitForFunction(()=>!document.querySelector('#previewImage')?.getAttribute('src'));
  assert.equal(await page.locator('#previewSubtitleSelect option[value^="source:"]').count(),0);
  // Compare to the existing external ASS/font path through the same browser
  // renderer. This independent input route must produce the same preview.
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[path.join(root,'base.mp4'),ass,font]);
  await page.waitForFunction(()=>!document.querySelector('#previewRefreshBtn').disabled,null,{timeout:60000});
  await page.locator('#sf14PreviewDrawer > summary').click();
  const reference=await render();await fs.writeFile(path.join(outDir,'external-reference.png'),reference);
  assert.equal(sha(internal),sha(reference),'internal-source preview must equal the existing external-reference render');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'embedded-preview-evidence.json'),JSON.stringify({schema:'softmux-embedded-ass-preview-v1',result:'pass',sourceSha256:sourceHash,outputSha256:sha(await fs.readFile(output)),previewSha256:sha(internal),externalReferenceSha256:sha(reference),fontFamily:'UIGS P3 Embedded Proof',onlyMkvImported:true,sourceUnchanged:true,nativeFinalRenderVerified:nativeAudit,limits:'Controlled ASS/font fixture at 1 second; not arbitrary player or full S03 acceptance'},null,2)+'\n');
  console.log('Embedded ASS/font preview + unchanged output membership + real MKV PASS');
 }catch(error){console.error('Embedded preview diagnostic:',await page.locator('#previewStatus').textContent(),(await page.locator('#log').textContent()).slice(-5000));throw error;}
 finally{await context.close();}
}
