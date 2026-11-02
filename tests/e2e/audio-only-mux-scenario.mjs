import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',file]));
export async function scenarioAudioOnlyMux(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});const source=path.join(outDir,'source.mka'),flac=path.join(outDir,'external.flac');
 run('ffmpeg',['-v','error','-y','-i',path.join(root,'base.mp4'),'-map','0:a:0','-c:a','flac',flac]);
 run('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-i',flac,'-map','0:a:0','-map','1:a:0','-c','copy','-metadata:s:a:0','title=Original AAC','-metadata:s:a:1','title=Original FLAC','-avoid_negative_ts','disabled',source]);
 const before=sha(await fs.readFile(source)),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(String(e)));const receipts=[];
 const download=async(selector,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(file);};
 const mux=async(name)=>{
  await page.locator('#muxBtn').click();await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.match(await page.locator('#status').textContent(),/^完成。/);
  const output=path.join(outDir,name+'.mkv');await download('#downloadLink',output);await download('#reportLink',output+'.json');
  const report=JSON.parse(await fs.readFile(output+'.json','utf8')),actual=probe(output);assert.equal(report.audit.ok,true,JSON.stringify(report.audit.issues));assert.equal(report.output.sha256,sha(await fs.readFile(output)));assert.equal(report.output.streamCopy,true);assert.equal(actual.streams.filter(s=>s.codec_type==='video').length,0);receipts.push({name,sha256:sha(await fs.readFile(output)),streams:actual.streams.map(s=>({type:s.codec_type,codec:s.codec_name}))});return {actual,report,output};
 };
 try{
  console.log('Audio-only: opening');await page.goto(baseUrl,{waitUntil:'networkidle'});console.log('Audio-only: import');await page.setInputFiles('#unifiedAssetInput',source);
  await page.waitForFunction(()=>document.querySelectorAll('#trackList [data-track-action="include"]').length===2&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  console.log('Audio-only: starting retained');const copied=await mux('retained');assert.equal(copied.actual.streams.length,2);
  const original=probe(source);for(let i=0;i<2;i++){
   assert.deepEqual(copied.actual.packets.filter(p=>p.stream_index===i).map(p=>p.data_hash),original.packets.filter(p=>p.stream_index===i).map(p=>p.data_hash));
   assert.equal(copied.actual.streams[i].extradata_hash,original.streams[i].extradata_hash);
   const a=copied.actual.packets.filter(p=>p.stream_index===i),b=original.packets.filter(p=>p.stream_index===i);
   for(let j=0;j<a.length;j++)assert.ok(Math.abs(Number(a[j].pts_time)-Number(b[j].pts_time))<=0.0011,'audio timeline must survive');
  }
  assert.equal(await page.locator('#muxPlan [data-plan-group="视频"]').count(),0,'no phantom video in plan');
  await page.setInputFiles('#unifiedAssetInput',[path.join(root,'zh.ass'),path.join(root,'DejaVuSans.ttf'),flac]);
  await page.waitForFunction(()=>document.querySelectorAll('#newSubtitleList [data-new-sub-field="title"]').length===1&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  const tree=page.locator('#assetInventory .asset-container-tree').first();if(!await tree.evaluate(e=>e.open))await tree.locator('summary').first().click();
  await tree.locator('[data-tree-preserve-all]').uncheck();
  await page.locator('[data-tree-select="audio:0"]').click();
  await page.locator('#assetInspectorHost [data-tree-track-field="title"]').fill('Edited audio');
  await page.locator('#assetInspectorHost [data-tree-track-field="language"]').fill('jpn');
  await page.locator('[data-tree-select="audio:1"]').click();await page.locator('#assetInspectorHost [data-tree-track-include="1"]').uncheck();
  const authored=await mux('authored');
  const audios=authored.actual.streams.filter(s=>s.codec_type==='audio');assert.deepEqual(audios.map(s=>s.codec_name),['aac','flac']);
  assert.equal(audios[0].tags.title,'Edited audio');assert.equal(audios[0].tags.language,'jpn');
  const packetHashes=(p,index)=>p.packets.filter(x=>x.stream_index===index).map(x=>x.data_hash);
  assert.deepEqual(packetHashes(authored.actual,audios[0].index),packetHashes(original,0));
  assert.deepEqual(packetHashes(authored.actual,audios[1].index),packetHashes(probe(flac),0));
  assert.equal(authored.actual.streams.filter(s=>s.codec_type==='subtitle').length,1);
  const font=authored.actual.streams.find(s=>s.codec_type==='attachment');assert.ok(font);
  const extractedFont=path.join(outDir,'authored-font.ttf');run('ffmpeg',['-v','error','-y','-dump_attachment:'+font.index,extractedFont,'-i',authored.output,'-map','0:a:0','-c','copy','-f','null','-']);
  assert.equal(sha(await fs.readFile(extractedFont)),sha(await fs.readFile(path.join(root,'DejaVuSans.ttf'))));
  const extractedAss=path.join(outDir,'authored.ass');run('ffmpeg',['-v','error','-y','-copyts','-i',authored.output,'-map','0:s:0','-c','copy',extractedAss]);
  assert.match(await fs.readFile(extractedAss,'utf8'),/Primary subtitle/);
  assert.equal(authored.report.audit.fontPayloadAudit.status,'pass');assert.equal(authored.report.audit.assEventAudit.status,'pass');
  // Removing all audio is a refusal, and re-enabling an external audio recovers.
  await page.locator('[data-tree-select="audio:0"]').click();await page.locator('#assetInspectorHost [data-tree-track-include="0"]').uncheck();
  const external=page.locator('#assetInventory .asset-entry[data-kind="audio"] [data-asset-include]');await external.uncheck();
  await page.locator('#muxBtn').click();await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.match(await page.locator('#status').textContent(),/当前输出没有音频/);
  assert.equal(await page.locator('#downloadLink').isVisible(),false);
  await external.check();const replaced=await mux('external-replacement');
  const onlyAudio=replaced.actual.streams.filter(s=>s.codec_type==='audio');assert.equal(onlyAudio.length,1);assert.equal(onlyAudio[0].codec_name,'flac');
  assert.deepEqual(packetHashes(replaced.actual,onlyAudio[0].index),packetHashes(probe(flac),0));
  // M4A content remains a container source, with no synthetic video or renamed extension trick.
  const m4a=path.join(outDir,'source.m4a');run('ffmpeg',['-v','error','-y','-i',path.join(root,'base.mp4'),'-map','0:a:0','-c','copy',m4a]);
  const m4aSha=sha(await fs.readFile(m4a));await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',m4a);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  const mp4Audio=await mux('m4a-source');assert.equal(mp4Audio.actual.streams.length,1);
  assert.deepEqual(packetHashes(mp4Audio.actual,0),packetHashes(probe(m4a),0));assert.equal(sha(await fs.readFile(m4a)),m4aSha);
  // A real Opus WebM audio-only source exercises the other primary-container family.
  const webm=path.join(outDir,'source.webm');run('ffmpeg',['-v','error','-y','-i',path.join(root,'base.mp4'),'-map','0:a:0','-c:a','libopus',webm]);
  const webmSha=sha(await fs.readFile(webm));await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',webm);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  const webmAudio=await mux('webm-source');assert.equal(webmAudio.actual.streams.length,1);assert.equal(webmAudio.actual.streams[0].codec_name,'opus');
  assert.deepEqual(packetHashes(webmAudio.actual,0),packetHashes(probe(webm),0));assert.equal(sha(await fs.readFile(webm)),webmSha);
  // An actual subtitle-only MKS is readable but not granted this media composition workflow.
  const mks=path.join(outDir,'subtitle-only.mks');run('ffmpeg',['-v','error','-y','-i',path.join(root,'zh.ass'),'-c','copy','-f','matroska',mks]);
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',mks);
  await page.waitForFunction(()=>document.querySelectorAll('#trackList [data-track-action="include"]').length===1&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  await page.locator('#muxBtn').click();await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.match(await page.locator('#status').textContent(),/不支持纯字幕来源/);assert.equal(await page.locator('#downloadLink').isVisible(),false);
  assert.equal(sha(await fs.readFile(source)),before);assert.deepEqual(errors,[]);
  console.log('Audio-only mux: 5 actual zero-video outputs, retained/edited/external-only/M4A/WebM, native audio packets/PTS/font/ASS + empty-audio/subtitle-source refusals PASS');
  await fs.writeFile(path.join(outDir,'audio-only-mux-evidence.json'),JSON.stringify({schema:'softmux-audio-only-mux-evidence-v1',result:'pass',sourceSha256:before,sourceUnchanged:true,emptyAudioRefused:true,subtitleOnlySourceRefused:true,receipts,limits:'Named AAC/FLAC MKA, AAC M4A and Opus WebM. Matroska packet PTS/private checked on retained case; font bytes/ASS event readback. No raw-audio-primary/batch/physical-device/player or full EBML claim.'},null,2)+'\n');
 }catch(error){console.error('Audio-only:',await page.locator('#status').textContent(),(await page.locator('#log').textContent()).slice(-2200),errors);throw error;}finally{await context.close();}
}
