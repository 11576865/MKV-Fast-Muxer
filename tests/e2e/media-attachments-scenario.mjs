import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {createMatroskaAttachmentReader} from '../../src/matroska-attachment-reader.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
const probe=f=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',f]));
export async function scenarioMediaAttachments(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});const source=path.join(outDir,'source.mkv'),oldCover=path.join(outDir,'original-cover.png'),cover=path.join(outDir,'cover.png'),pdf=path.join(outDir,'notes.pdf');
 const font=path.join(root,'DejaVuSans.ttf'),fontBytes=await fs.readFile(font),fontHash=sha(fontBytes);
 const opaque=path.join(outDir,'DejaVuSans-mkvfm-'+fontHash.slice(0,8)+'.ttf');
 run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=16x16','-frames:v','1','-threads','1',oldCover]);run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=16x16','-frames:v','1','-threads','1',cover]);
 await fs.writeFile(pdf,'%PDF-1.4\n% exact opaque delivery\n%%EOF\n');await fs.writeFile(opaque,'{"license":"opaque JSON, never a font decoder input"}');
 run('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-map','0:v:0','-map','0:a:0','-c','copy',
  '-attach',oldCover,'-metadata:s:t:0','filename=cover.png','-metadata:s:t:0','mimetype=image/png',
  '-attach',font,'-metadata:s:t:1','filename=DejaVuSans.ttf','-metadata:s:t:1','mimetype=application/x-truetype-font','-avoid_negative_ts','disabled',source]);
 const sourceSha=sha(await fs.readFile(source)),input=probe(source),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],receipts=[];
 page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(60000);
 const download=async(sel,file)=>{const[d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);await d.saveAs(file);};
 const generate=async(name,expected,videoCount=1)=>{
  await page.locator('#muxBtn').click();await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
  assert.match(await page.locator('#status').textContent(),/^完成。/);
  const output=path.join(outDir,name+'.mkv');await download('#downloadLink',output);await download('#reportLink',output+'.json');
  const bytes=await fs.readFile(output),report=JSON.parse(await fs.readFile(output+'.json','utf8')),actual=probe(output);
  assert.equal(report.output.sha256,sha(bytes));assert.equal(report.audit.ok,true,JSON.stringify(report.audit.issues));
  assert.equal(report.audit.genericAttachmentPayloadAudit.status,'pass');assert.equal(report.audit.genericAttachmentPayloadAudit.verified,expected.length);
  assert.equal(report.genericAttachments.length,expected.length);assert.match(await page.locator('#outputEvidenceFacts').textContent(),new RegExp('新增普通附件字节验证：'+expected.length+'/'+expected.length));assert.equal(actual.streams.filter(s=>s.codec_type==='video'&&!s.disposition?.attached_pic).length,videoCount);
  const reader=createMatroskaAttachmentReader(new Blob([bytes])),inv=await reader.inspect();assert.equal(inv.state,'inspected');
  for(const file of expected){
   const claim=report.genericAttachments.find(a=>a.sourceName===path.basename(file));assert.ok(claim);
   const found=inv.attachments.filter(a=>a.filename===claim.filename);assert.equal(found.length,1);
   assert.equal(found[0].mimeType,claim.mimeType);assert.equal(sha(Buffer.from(await reader.openAttachment(found[0].id).data.arrayBuffer())),sha(await fs.readFile(file)));
   const nativeAtt=actual.streams.find(s=>(s.codec_type==='attachment'||s.disposition?.attached_pic)&&s.tags?.filename===claim.filename);assert.ok(nativeAtt);
   const extracted=path.join(outDir,name+'-attachment-'+expected.indexOf(file)+'.bin');
   if(nativeAtt.disposition?.attached_pic)run('ffmpeg',['-v','error','-y','-i',output,'-map','0:'+nativeAtt.index,'-c','copy','-frames:v','1','-f','image2',extracted]);
   else run('ffmpeg',['-v','error','-y','-dump_attachment:'+nativeAtt.index,extracted,'-i',output,'-map','0:a:0','-c','copy','-f','null','-']);
   assert.equal(sha(await fs.readFile(extracted)),sha(await fs.readFile(file)));
  }
  receipts.push({name,sha256:sha(bytes),ordinary:report.genericAttachments});return {report,actual,inv,reader};
 };
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',[source,cover,pdf,opaque,font,path.join(root,'zh.ass')]);
  await page.waitForFunction(()=>document.querySelectorAll('#assetInventory .asset-entry').length===6&&!document.querySelector('#assetImportStatus').textContent.includes('正在'),null,{timeout:120000});
  assert.equal(await page.locator('[data-asset-as-attachment]').count(),1,'unknown bytes need an explicit opaque-role action');
  await page.locator('[data-asset-as-attachment]').click();await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});
  assert.equal(await page.locator('#assetInventory [data-generic-include]').count(),3);
  const first=await generate('mixed-all',[cover,pdf,opaque]);
  assert.equal(first.report.audit.fontPayloadAudit.status,'pass');assert.equal(first.report.audit.assEventAudit.status,'pass');
  assert.notEqual(first.report.genericAttachments.find(a=>a.sourceName==='cover.png').filename,'cover.png');
  assert.notEqual(first.report.genericAttachments.find(a=>a.sourceName===path.basename(opaque)).filename,path.basename(opaque),'ordinary must not collide with the renamed uploaded font');
  const names=first.inv.attachments.map(a=>a.filename.toLowerCase());assert.equal(new Set(names).size,names.length);
  for(const type of ['video','audio']){
   const before=input.streams.find(s=>s.codec_type===type),after=first.actual.streams.find(s=>s.codec_type===type);
   const a=input.packets.filter(p=>p.stream_index===before.index),b=first.actual.packets.filter(p=>p.stream_index===after.index);
   assert.deepEqual(b.map(p=>p.data_hash),a.map(p=>p.data_hash));for(let i=0;i<a.length;i++)assert.ok(Math.abs(Number(a[i].pts_time)-Number(b[i].pts_time))<=0.0011);
  }
  const old=first.inv.attachments.find(a=>a.filename==='cover.png');assert.equal(sha(Buffer.from(await first.reader.openAttachment(old.id).data.arrayBuffer())),sha(await fs.readFile(oldCover)));
  const coverRow=page.locator('#assetInventory .asset-entry[data-kind="attachment"]').filter({has:page.locator('.asset-entry-name',{hasText:/^cover\.png$/})});
  await coverRow.locator('[data-generic-include]').uncheck();assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false');
  const excluded=await generate('mixed-excluded',[pdf,opaque]);assert.equal(excluded.inv.attachments.filter(a=>a.filename.startsWith('cover')).length,1,'only retained source cover remains');
  await coverRow.locator('[data-generic-include]').check();
  // Cancel through the real control at a late audit boundary. The observer
  // watches actual user-visible output, never the application's private state.
  await page.evaluate(()=>{
    document.body.dataset.lateAuditCancel='waiting';
    const observer=new MutationObserver(()=>{
      const log=document.querySelector('#log').textContent;
      if(log.includes('AUDIT: 最终 MKV 中')&&!document.querySelector('#cancelBtn').disabled){
        observer.disconnect();document.body.dataset.lateAuditCancel='clicked';document.querySelector('#cancelBtn').click();
      }
    });observer.observe(document.querySelector('#log'),{childList:true,characterData:true,subtree:true});
  });
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>document.body.dataset.lateAuditCancel==='clicked'&&!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
  assert.match(await page.locator('#status').textContent(),/任务已取消/);assert.equal(await page.locator('#downloadLink').isVisible(),false,'late cancel cannot publish');
  await generate('mixed-reincluded',[cover,pdf,opaque]);
  // Selective source attachment edits use raw source indices, not appended ordinals.
  const tree=page.locator('#assetInventory .asset-container-tree').first();if(!await tree.evaluate(e=>e.open))await tree.locator('summary').first().click();
  await tree.locator('[data-tree-preserve-all]').uncheck();
  await page.locator('[data-tree-select="attachment:2"]').click();
  await page.locator('#assetInspectorHost [data-tree-attachment-field="filename"]').fill('original-renamed.png');
  await page.locator('[data-tree-select="attachment:3"]').click();
  await page.locator('#assetInspectorHost [data-tree-attachment-include="3"]').uncheck();
  const edited=await generate('mixed-source-edited',[cover,pdf,opaque]);
  const retainedImage=edited.inv.attachments.find(a=>a.filename==='original-renamed.png');assert.ok(retainedImage);
  assert.equal(sha(Buffer.from(await edited.reader.openAttachment(retainedImage.id).data.arrayBuffer())),sha(await fs.readFile(oldCover)));
  assert.equal(edited.inv.attachments.length,5,'excluded original font is not silently retained');
  const audio=path.join(outDir,'audio.mka');run('ffmpeg',['-v','error','-y','-copyts','-i',source,'-map','0:a:0','-c','copy','-avoid_negative_ts','disabled',audio]);
  await page.goto(baseUrl,{waitUntil:'networkidle'});await page.setInputFiles('#unifiedAssetInput',[audio,pdf]);
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled,null,{timeout:120000});await generate('audio-with-pdf',[pdf],0);
  assert.equal(sha(await fs.readFile(source)),sourceSha);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'media-attachments-evidence.json'),JSON.stringify({schema:'softmux-media-attachments-evidence-v1',result:'pass',sourceSha256:sourceSha,sourceUnchanged:true,opaqueAssignmentExplicit:true,sharedNamesUnique:true,retainedMediaPacketsAndPts:true,lateAuditCancelNoPublication:true,cancelRecovery:true,receipts,limits:'Named short video/audio sources; no batch, full EBML, file-safety or physical-device claim.'},null,2)+'\n');
  console.log('Media attachments: 5 actual video/audio outputs, source/font/ordinary collision names + source-image edits + late cancel/recovery, PNG/PDF/explicit opaque JSON exact native payloads, selection staleness and unchanged media packets/PTS PASS');
 }catch(error){console.error('Media attachments:',await page.locator('#status').textContent(),(await page.locator('#log').textContent()).slice(-2400),errors);throw error;}finally{await context.close();}
}
