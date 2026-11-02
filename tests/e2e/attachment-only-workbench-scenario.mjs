import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pngBytes} from '../../scripts/r02-attachment-only-fixture.mjs';
import {createMatroskaAttachmentReader} from '../../src/matroska-attachment-reader.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function scenarioAttachmentOnlyWorkbench(browser,{root,outDir,baseUrl,nativeAudit=true}) {
 const sources=[{name:'normal-poster.png',mime:'image/png',bytes:Buffer.from(pngBytes)},
  {name:'normal-notes.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-1.4\n% opaque attachment fixture; exact bytes must survive\n%%EOF\n')}];
 for(const source of sources)await fs.writeFile(path.join(root,source.name),source.bytes);
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try {
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',sources.map(s=>path.join(root,s.name)));
  await page.waitForFunction(()=>document.querySelectorAll('[data-generic-include]').length===2&&
   !document.querySelector('#muxBtn').disabled,null,{timeout:60000});
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files.length),0);
  const pdf=page.locator('#assetInventory .asset-entry').filter({has:page.locator('.asset-entry-name',{hasText:'normal-notes.pdf'})});
  await pdf.locator('[data-generic-include]').uncheck();
  assert.match(await page.locator('#compositionCount').textContent(),/附件 1/);
  const outputs=[];
  const generate=async(count)=>{
   await page.locator('#muxBtn').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('完成。纯附件'),null,{timeout:60000});
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);
   const destination=path.join(outDir,`normal-attachment-only-${count}.mkv`);await download.saveAs(destination);
   const bytes=await fs.readFile(destination),reader=createMatroskaAttachmentReader(new Blob([bytes]));
   const inventory=await reader.inspect();
   assert.equal(inventory.state,'inspected');
   assert.equal(inventory.structure.hasTracksElement,false);
   assert.equal(inventory.structure.hasClusterElement,false);
   assert.equal(inventory.attachments.length,count);
   const parsed=nativeAudit?JSON.parse(execFileSync('mkvmerge',['-J',destination],{encoding:'utf8'})):null;
   if(parsed){assert.equal(parsed.tracks.length,0);assert.equal(parsed.attachments.length,count);}
   for(let i=0;i<count;i++) {
    const actual=inventory.attachments[i],expected=sources[i];
    assert.equal(actual.filename,expected.name);assert.equal(actual.mimeType,expected.mime);
    assert.equal(sha(Buffer.from(await reader.openAttachment(actual.id).data.arrayBuffer())),sha(expected.bytes));
    if(parsed){
     const item=parsed.attachments[i];assert.equal(item.file_name,expected.name);assert.equal(item.content_type,expected.mime);
     const extracted=path.join(outDir,`normal-attachment-only-${count}-${i}.bin`);
     execFileSync('mkvextract',['attachments',destination,`${item.id}:${extracted}`]);
     assert.equal(sha(await fs.readFile(extracted)),sha(expected.bytes));
    }
   }
   const [reportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);
   const reportPath=path.join(outDir,`normal-attachment-only-${count}.json`);await reportDownload.saveAs(reportPath);
   const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
   assert.equal(report.attachments.length,count);assert.equal(report.mediaTrackCount,0);
   assert.equal(report.output.sha256,sha(bytes));
   assert.match(await page.locator('#outputEvidenceTitle').textContent(),/纯附件成品回读通过/);
   assert.ok((await page.locator('#downloadLink').boundingBox()).width>=120,'artifact download label must not be squeezed into an icon-sized column');
   outputs.push({name:path.basename(destination),sha256:sha(bytes),attachmentCount:count,nativeAudit});
  };
  await generate(1);
  await pdf.locator('[data-generic-include]').check();
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false');
  await generate(2);
  for(const width of [1440,1024,768]){
   await page.setViewportSize({width,height:800});
   await page.locator('#muxBtn').click({trial:true});
   assert.equal(await page.locator('#singleDirectoryActions').evaluate(el=>Boolean(el.closest('#sf14Inspector'))),true);
   const bounds=await page.locator('.sf14-output .execution-panel').evaluate(el=>{
    const panel=el.getBoundingClientRect(),dock=el.closest('.sf14-output').getBoundingClientRect();
    return {panelHeight:panel.height,dockHeight:dock.height};
   });
   assert.ok(bounds.panelHeight<=bounds.dockHeight,JSON.stringify(bounds));
   await page.screenshot({path:path.join(outDir,`normal-attachment-only-${width}.png`)});
  }
  // A real media grant from the legacy picker must participate in the new
  // mixed writer rather than being silently ignored by the attachment-only route.
  await page.setInputFiles('#videoInput',path.join(root,'base.mp4'));
  await page.waitForFunction(()=>!document.querySelector('#muxBtn').disabled&&
    document.querySelector('#outputEvidencePanel').dataset.current==='false',null,{timeout:120000});
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('完成。')&&!document.querySelector('#muxBtn').disabled,null,{timeout:180000});
  const mixed=path.join(outDir,'normal-legacy-media-with-attachments.mkv');
  const [mixedDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);await mixedDownload.saveAs(mixed);
  const mixedBytes=await fs.readFile(mixed),mixedReader=createMatroskaAttachmentReader(new Blob([mixedBytes])),mixedInv=await mixedReader.inspect();
  assert.equal(mixedInv.state,'inspected');assert.equal(mixedInv.structure.hasTracksElement,true);assert.equal(mixedInv.structure.hasClusterElement,true);assert.equal(mixedInv.attachments.length,2);
  const mixedProbe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',mixed],{encoding:'utf8'}));
  assert.equal(mixedProbe.streams.filter(s=>s.codec_type==='video'&&!s.disposition?.attached_pic).length,1);assert.equal(mixedProbe.streams.filter(s=>s.codec_type==='audio').length,1);
  for(const expected of sources){const actual=mixedInv.attachments.find(a=>a.filename===expected.name);assert.ok(actual);assert.equal(sha(Buffer.from(await mixedReader.openAttachment(actual.id).data.arrayBuffer())),sha(expected.bytes));}
  const [mixedReportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);const mixedReportPath=mixed+'.json';await mixedReportDownload.saveAs(mixedReportPath);
  const mixedReport=JSON.parse(await fs.readFile(mixedReportPath,'utf8'));assert.equal(mixedReport.audit.genericAttachmentPayloadAudit.status,'pass');assert.equal(mixedReport.output.sha256,sha(mixedBytes));
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'normal-attachment-only-evidence.json'),JSON.stringify({
   outputs,normalImportAndStart:true,noVideoRoot:true,mixedLegacyMediaIncluded:true,physicalTablet:false,
   nativeParseAndExtraction:nativeAudit?'passed':'not-run-local',
  },null,2));
 } catch(error) {
  console.error('Attachment-only status:',await page.locator('#status').textContent({timeout:1000}).catch(()=>''));
  await page.screenshot({path:path.join(outDir,'normal-attachment-only-failure.png')}).catch(()=>{});
  throw error;
 } finally {await context.close();}
}
