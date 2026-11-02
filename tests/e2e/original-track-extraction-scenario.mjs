import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {makeBitmapSubtitleFixtures} from '../../scripts/make-bitmap-subtitle-fixtures.mjs';
import {assertCopiedBitmapPackets} from '../../scripts/audit-bitmap-subtitle-output.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
const probe=(file,selector)=>JSON.parse(run('ffprobe',['-v','error',...(selector?['-select_streams',selector]:[]),'-show_streams','-show_packets','-show_data','-show_data_hash','sha256','-of','json',file]));
export async function scenarioOriginalTrackExtraction(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});await makeBitmapSubtitleFixtures(root);
 const flac=path.join(outDir,'source.flac'),source=path.join(outDir,'source-tracks.mkv');
 run('ffmpeg',['-v','error','-y','-i',path.join(root,'base.mp4'),'-map','0:a:0','-c:a','flac',flac]);
 const extra=[];
 for(const [codec,ext] of [['libmp3lame','mp3'],['ac3','ac3'],['eac3','eac3']]){
  const f=path.join(outDir,'source.'+ext);run('ffmpeg',['-v','error','-y','-i',path.join(root,'base.mp4'),'-map','0:a:0','-c:a',codec,f]);extra.push(f);
 }
 run('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-i',flac,'-i',path.join(root,'zh.ass'),
  '-i',path.join(root,'sample.srt'),'-i',path.join(root,'bitmap.sup'),'-i',path.join(root,'bitmap.idx'),...extra.flatMap(f=>['-i',f]),
  '-map','0:v:0','-map','0:a:0','-map','1:a:0','-map','2:s:0','-map','3:s:0','-map','4:s:0','-map','5:s:0','-map','6:a:0','-map','7:a:0','-map','8:a:0','-c','copy',
  '-metadata:s:a:0','title=Original AAC','-metadata:s:a:0','language=jpn',
  '-metadata:s:a:1','title=Original FLAC','-metadata:s:a:1','language=eng',
  '-metadata:s:s:0','title=Original ASS','-metadata:s:s:1','title=Original SRT',
  '-metadata:s:s:2','title=Original PGS','-metadata:s:s:3','title=Original VobSub','-avoid_negative_ts','disabled',source]);
 const before=sha(await fs.readFile(source));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));const receipts=[];
 const download=async(selector,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);await d.saveAs(file);};
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',source);
  await page.waitForFunction(()=>document.querySelectorAll('#trackList [data-track-action="include"]').length===9&&!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  const tree=page.locator('#assetInventory .asset-container-tree').first();if(!await tree.evaluate(e=>e.open))await tree.locator('summary').first().click();
  await tree.locator('[data-tree-preserve-all]').uncheck();
  await page.locator('[data-tree-select="audio:1"]').click();
  await page.locator('#assetInspectorHost [data-tree-track-field="title"]').fill('Pending title must not be extracted');
  await page.locator('#muxBtn').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。'),null,{timeout:180000});
  const mainHref=await page.locator('#downloadLink').getAttribute('href'),planBefore=await page.locator('#muxPlan').textContent(),history=await page.locator('#workspaceHistoryStatus').textContent();
  const cases=[
   [1,'audio','aac','matroska','.mka'],[1,'audio','aac','native','.aac'],[2,'audio','flac','matroska','.mka'],[2,'audio','flac','native','.flac'],
   [3,'subtitle','ass','matroska','.mks'],[3,'subtitle','ass','native','.ass'],[4,'subtitle','subrip','matroska','.mks'],[4,'subtitle','subrip','native','.srt'],
   [5,'subtitle','hdmv_pgs_subtitle','matroska','.mks'],[5,'subtitle','hdmv_pgs_subtitle','native','.sup'],[6,'subtitle','dvd_subtitle','matroska','.mks'],[7,'audio','mp3','native','.mp3'],[8,'audio','ac3','native','.ac3'],[9,'audio','eac3','native','.eac3']];
  for(const [index,kind,codec,format,extension] of cases){
   await page.locator('[data-tree-select="'+kind+':'+index+'"]').click();
   await page.locator('[data-original-track-format="'+index+'"]').selectOption(format);
   await page.locator('[data-extract-original-track-index="'+index+'"]').click();
   await page.waitForFunction(()=>!document.querySelector('#originalTrackDownload').hidden&&!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
   const file=path.join(outDir,index+'-'+format+extension),rp=file+'.json';
   await download('#originalTrackDownload',file);await download('#originalTrackReport',rp);
   const report=JSON.parse(await fs.readFile(rp,'utf8'));assert.equal(report.audit.ok,true);assert.equal(report.output.sha256,sha(await fs.readFile(file)));
   assert.equal(report.policy.applyPendingEdits,false);assert.equal(report.source.streamIndex,index);
   const original=probe(source,String(index)),actual=probe(file);
   let payloadActual=actual;
   if(codec==='aac'&&format==='native'){
    const canonical=file+'.adts-normalized.mka';
    run('ffmpeg',['-v','error','-y','-i',file,'-c','copy','-bsf:a','aac_adtstoasc','-f','matroska',canonical]);
    payloadActual=probe(canonical);
   }
   assert.equal(actual.streams.length,1);assert.equal(actual.streams[0].codec_type,kind);assert.equal(actual.streams[0].codec_name,codec);
   assert.ok(original.packets.length>0);
   if(format==='matroska'&&original.streams[0].extradata_hash)assert.equal(actual.streams[0].extradata_hash,original.streams[0].extradata_hash,'codec private data must survive single-track Matroska copy');
   if(codec==='hdmv_pgs_subtitle')assertCopiedBitmapPackets(original,actual,'PGS '+format);
   else{
    assert.deepEqual(payloadActual.packets.map(p=>p.data_hash),original.packets.map(p=>p.data_hash),codec+' packet payload/count');
    if(format==='matroska')for(let i=0;i<original.packets.length;i++)assert.ok(Math.abs(Number(actual.packets[i].pts_time)-Number(original.packets[i].pts_time))<=0.0011,codec+' timeline changed');
   }
   if(format==='matroska'&&index===1)assert.equal(actual.streams[0].tags.title,'Original AAC','pending authored edits are not original bytes');
   assert.equal(await page.locator('#muxPlan').textContent(),planBefore);assert.equal(await page.locator('#workspaceHistoryStatus').textContent(),history);
   assert.equal(await page.locator('#downloadLink').getAttribute('href'),mainHref,'extraction must not replace the main completed output');
   receipts.push({index,codec,format,name:path.basename(file),sha256:report.output.sha256,packets:actual.packets.length,sourcePackets:original.packets.length,codecPrivateSha256:format==='matroska'?actual.streams[0].extradata_hash:null,
    ptsChecked:format==='matroska'||codec==='hdmv_pgs_subtitle',adtsTransportHeaderNormalized:codec==='aac'&&format==='native'});
  }
  await page.locator('[data-tree-select="audio:1"]').click();
  // Two real DOM actions in one event turn deterministically cancel startup,
  // before worker staging can publish anything. No product hook is used.
  await page.evaluate(()=>{document.querySelector('[data-extract-original-track-index="1"]').click();document.querySelector('#cancelBtn').click();});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('提取已取消')&&document.querySelector('#cancelBtn').disabled,null,{timeout:60000});
  assert.equal(await page.locator('#originalTrackDownload').isHidden(),true);
  await page.locator('[data-extract-original-track-index="1"]').click();
  await page.waitForFunction(()=>!document.querySelector('#originalTrackDownload').hidden&&!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
  const recovered=path.join(outDir,'after-cancel.mka');await download('#originalTrackDownload',recovered);
  assert.deepEqual(probe(recovered).packets.map(p=>p.data_hash),probe(source,'1').packets.map(p=>p.data_hash));
  assert.equal(await page.locator('#downloadLink').getAttribute('href'),mainHref);
  await page.screenshot({path:path.join(outDir,'original-track-extraction.png'),fullPage:true});
  // Replace actual source: no stale extraction link may certify its tracks.
  await page.setInputFiles('#videoInput',path.join(root,'base.mp4'));
  await page.waitForFunction(()=>document.querySelector('#originalTrackDownload').hidden);
  // A single-audio MKA can itself be a source; no video host is required for reading/extraction.
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',path.join(outDir,'1-matroska.mka'));
  await page.waitForFunction(()=>document.querySelector('[data-extract-original-track-index="0"]')&&!document.querySelector('[data-extract-original-track-index="0"]').disabled,null,{timeout:120000});
  await page.locator('[data-original-track-format="0"]').selectOption('native');
  await page.locator('[data-extract-original-track-index="0"]').click();
  await page.waitForFunction(()=>!document.querySelector('#originalTrackDownload').hidden,null,{timeout:180000});
  const audioOnly=path.join(outDir,'audio-only-source.aac');await download('#originalTrackDownload',audioOnly);
  const normalized=audioOnly+'.normalized.mka';run('ffmpeg',['-v','error','-y','-i',audioOnly,'-c','copy','-bsf:a','aac_adtstoasc','-f','matroska',normalized]);
  assert.deepEqual(probe(normalized).packets.map(p=>p.data_hash),probe(source,'1').packets.map(p=>p.data_hash));
  assert.equal(sha(await fs.readFile(source)),before);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'original-track-extraction-evidence.json'),JSON.stringify({schema:'softmux-original-track-extraction-evidence-v1',result:'pass',sourceSha256:before,sourceUnchanged:true,planUnchanged:true,originalOutputUnchanged:true,cancelledStartupNoPublication:true,cancelRecovery:true,audioOnlyMkaSource:true,receipts,
   limits:'Named AAC/FLAC/MP3/AC3/EAC3/ASS/SRT/PGS/VobSub source. Native packet payload equality; absolute PTS checked for single-track Matroska and PGS SUP, not generic elementary audio timelines. No font/chapters/Tags/UID preservation claim or physical-device guarantee.'},null,2)+'\n');
  console.log('Original track extraction: 14 actual AAC/FLAC/MP3/AC3/EAC3/ASS/SRT/PGS/VobSub exports + cancel recovery + audio-only source native packets/timestamps PASS');
 }catch(error){console.error('Track extraction:',errors,await page.locator('#status').textContent(),await page.locator('#originalTrackExtractionStatus').textContent(),(await page.locator('#log').textContent()).slice(-1800));throw error;}
 finally{await context.close();}
}
