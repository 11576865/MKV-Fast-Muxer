import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMatroskaAttachmentReader} from '../../src/matroska-attachment-reader.js';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Exercise the actual modern workbench and independently inspect its downloaded
// MKV. Preview focus and delivery membership must remain separate end to end.
export async function scenarioCandidateMembership(browser,{root,outDir,baseUrl}) {
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('Candidate page error:',String(e));});
 try {
  console.log('Candidate E2E: open actual workbench');
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  console.log('Candidate E2E: import exact media/subtitle/font files');
  await page.setInputFiles('#unifiedAssetInput',[
   path.join(root,'base.mp4'),path.join(root,'zh.ass'),path.join(root,'en.ass'),
   path.join(root,'DejaVuSans.ttf'),path.join(root,'external.flac'),
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#newSubtitleList [data-new-sub-field="include"]').length===2 &&
   !document.querySelector('#muxBtn').disabled,null,{timeout:60000});
  console.log('Candidate E2E: exclude output members');
  // Use the inventory's real visible checkbox, not a mutation of internal state.
  const subtitleRows=page.locator('#assetInventory .asset-entry[data-kind="subtitle"]');
  const candidate=subtitleRows.filter({has:page.locator('.asset-entry-name',{hasText:'en.ass'})});
  const chosen=subtitleRows.filter({has:page.locator('.asset-entry-name',{hasText:'zh.ass'})});
  await candidate.locator('[data-asset-include]').uncheck();
  await page.locator('#assetInventory .asset-entry[data-kind="audio"] [data-asset-include]').uncheck();
  assert.equal(await chosen.locator('[data-asset-include]').isChecked(),true);
  assert.equal(await page.locator('#subInput').evaluate(el=>el.files.length),2,
   'excluding a candidate must not remove the preview File grant');
  await candidate.locator('[data-asset-focus-key]').click();
  // The explicit metadata remains attached to the candidate even while excluded.
  await page.locator('#sf14OptionsDrawer > summary').click();
  const title=page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="1"]');
  await title.fill('Retained candidate title');
  await page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="0"]').fill('Retained candidate title');
  await page.locator('#newSubtitleList [data-new-sub-field="language"][data-index="0"]').selectOption('eng');
  await page.locator('#newSubtitleList [data-new-sub-field="default"][data-index="0"]').uncheck();
  await page.locator('#sf14PreviewDrawer > summary').click();
  await page.locator('#previewSubtitleSelect').selectOption('1');
  await page.locator('#previewTimeInput').fill('0.5');
  await page.locator('#previewRefreshBtn').click();
  await page.waitForFunction(()=>document.querySelector('#previewImage')?.getAttribute('src')?.startsWith('blob:'),null,{timeout:180000});
  assert.equal(await candidate.locator('[data-asset-include]').isChecked(),false,
   'rendering a candidate must not add it to the output');
  assert.match(await page.locator('#compositionCount').textContent(),/字幕 1/);
  const preview=path.join(outDir,'candidate-excluded-preview.png');
  const image=await page.locator('#previewImage').evaluate(async el=>Array.from(new Uint8Array(await (await fetch(el.src)).arrayBuffer())));
  await fs.writeFile(preview,Buffer.from(image));
  const save=async name=>{
   await page.screenshot({path:path.join(outDir,name+'.png')});
   await page.locator('#muxBtn').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('#muxBtn').evaluate(el=>{
    const r=el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
   }),true,'completed-result content must not move Start above the dock scroll origin');
   await page.locator('#muxBtn').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.startsWith('完成。'),null,{timeout:180000});
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);
   const dest=path.join(outDir,name);await download.saveAs(dest);
   const parsed=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',dest],{encoding:'utf8'}));
   return {dest,streams:parsed.streams};
  };
  const first=await save('candidate-excluded.mkv');
  // Ordinary attachments now have a media writer. Their addition still makes
  // the preceding artifact stale; only a newly generated artifact certifies it.
  const opaquePng=path.join(root,'media-currency-cover.png');
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=16x16','-frames:v','1','-threads','1',opaquePng]);
  await page.setInputFiles('#unifiedAssetInput',opaquePng);
  await page.waitForFunction(()=>document.querySelector('#assetInventory .asset-entry[data-kind="attachment"]'));
  assert.equal(await page.locator('#muxBtn').isEnabled(),true,'ordinary attachment delivery is now supported');
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false');
  assert.equal(await page.locator('#outputIndexInspectBtn').isEnabled(),false);
  const mixed=await save('candidate-with-cover.mkv');
  assert.equal(mixed.streams.filter(stream=>stream.codec_type==='subtitle').length,1,'candidate remains excluded in actual mixed output');
  const mixedBytes=await fs.readFile(mixed.dest),reader=createMatroskaAttachmentReader(new Blob([mixedBytes]));
  const observed=await reader.inspect();assert.equal(observed.state,'inspected');
  const cover=observed.attachments.filter(item=>item.filename==='media-currency-cover.png');assert.equal(cover.length,1);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const coverSha256=hash(await fs.readFile(opaquePng));
  assert.equal(hash(Buffer.from(await reader.openAttachment(cover[0].id).data.arrayBuffer())),coverSha256);
  const[reportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);
  const mixedReportPath=path.join(outDir,'candidate-with-cover.mux-report.json');await reportDownload.saveAs(mixedReportPath);
  const mixedReport=JSON.parse(await fs.readFile(mixedReportPath,'utf8'));
  assert.equal(mixedReport.output.sha256,hash(mixedBytes));assert.equal(mixedReport.audit.genericAttachmentPayloadAudit.status,'pass');
  assert.equal(mixedReport.audit.genericAttachmentPayloadAudit.verified,1);
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'true');
  await page.locator('#assetInventory .asset-entry[data-kind="attachment"] [data-asset-remove]').click();
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false','removing an included attachment also stales the mixed output');
  const mediaOnly=await save('candidate-cover-removed.mkv');
  assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'true',
   'restore an actually current media-only baseline before testing equal-label member swaps');

  assert.equal(first.streams.filter(s=>s.codec_type==='subtitle').length,1);
  const source=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path.join(root,'base.mp4')],{encoding:'utf8'}));
  assert.equal(first.streams.filter(s=>s.codec_type==='audio').length,source.streams.filter(s=>s.codec_type==='audio').length);
  // Equal authored fields produce the same displayed plan. Membership must
  // nevertheless invalidate old completed-output evidence by exact File identity.
  await chosen.locator('[data-asset-include]').uncheck();
  await candidate.locator('[data-asset-include]').check();
  assert.match(await page.locator('#outputEvidenceRevision').textContent(),/输出成员/);
  assert.equal(await page.locator('#outputIndexInspectBtn').isEnabled(),false);
  await chosen.locator('[data-asset-include]').check();
  assert.equal(await title.inputValue(),'Retained candidate title');
  const second=await save('candidate-reincluded.mkv');
  const subs=second.streams.filter(s=>s.codec_type==='subtitle');
  assert.equal(subs.length,2);
  assert.ok(subs.some(s=>s.tags?.title==='Retained candidate title'));
  for(const width of [1024,768]) {
   await page.setViewportSize({width,height:800});
   await page.locator('#muxBtn').click({trial:true});
   await page.screenshot({path:path.join(outDir,`candidate-workbench-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(outDir,'candidate-membership-evidence.json'),JSON.stringify({
   previewRetainedWhileExcluded:true,previewDoesNotInclude:true,
   excludedOutputSubtitleCount:1,reincludedOutputSubtitleCount:2,
   excludedExternalAudioAbsent:true,authoredMetadataRetained:true,equalLabelSwapStalesEvidence:true,
   genericAttachmentDeliverySupported:true,genericAdditionAndRemovalStaleEvidence:true,
   genericPayloadSha256:coverSha256,mixed:mixed.dest,mediaOnlyBaseline:mediaOnly.dest,
   first:first.dest,second:second.dest,physicalTabletVerified:false,
  },null,2));
 } catch(error) {
  console.error('Candidate scenario status:',await page.locator('#status').textContent({timeout:1000}).catch(()=>''));
  console.error('Candidate scenario log:',await page.locator('#log').textContent({timeout:1000}).catch(()=>''));
  throw error;
 } finally {await context.close();}
}
