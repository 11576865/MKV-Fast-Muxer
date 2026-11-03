import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readonlyWriterBoundaryFixtures} from '../../scripts/readonly-writer-boundary-fixtures.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function scenarioReadonlyWriterBoundary(browser,{outDir,baseUrl,nativeAudit=true}){
 await fs.mkdir(outDir,{recursive:true});
 const fixture=readonlyWriterBoundaryFixtures();
 const files=[path.join(outDir,'over-writer-budget.mkv'),path.join(outDir,'referenced-attachment.mkv')];
 await fs.writeFile(files[0],fixture.overBudget);await fs.writeFile(files[1],fixture.referenced);
 const replacement=path.join(outDir,'replacement.png');await fs.writeFile(replacement,fixture.replacement);
 const sourceHashes=[sha(fixture.overBudget),sha(fixture.referenced)];
 const payloads=[fixture.replacement,fixture.referencedPayload];
 const expectedCodes=['P2_ROUTE_SOURCE_OR_DATA_BUDGET','P2_ROUTE_TAG_REFERENCED_UID'];
 if(nativeAudit){
  for(let i=0;i<files.length;i++){
   const identified=JSON.parse(execFileSync('mkvmerge',['-J',files[i]],{encoding:'utf8'}));
   assert.equal(identified.tracks.length,0);assert.equal(identified.attachments.length,1);
   const dest=path.join(outDir,'native-'+i+'.png');
   execFileSync('mkvextract',['attachments',files[i],identified.attachments[0].id+':'+dest]);
   assert.deepEqual(await fs.readFile(dest),payloads[i]);
  }
  const tags=execFileSync('mkvextract',['tags',files[1]],{encoding:'utf8'});
  assert.match(tags,/<AttachmentUID>42<\/AttachmentUID>/);await fs.writeFile(path.join(outDir,'native-tags.xml'),tags);
 }
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let downloads=0;page.on('download',()=>downloads++);
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.locator('#sf14More > summary').click();
  await page.locator('[data-sf-view="tools"]').click();
  await page.locator('#existingMkvRoutedEditDetails > summary').click();
  await page.locator('#attachmentExtractionDetails > summary').click();
  for(let i=0;i<files.length;i++){
   await page.setInputFiles('#existingMkvRoutedSource',files[i]);
   await page.waitForFunction(()=>document.querySelector('#existingMkvRoutedTarget option[value="42"]'),null,{timeout:60000});
   await page.setInputFiles('#existingMkvRoutedReplacement',replacement);
   await page.locator('#existingMkvRoutedReview').check();
   await page.locator('#existingMkvRoutedReplacement').dispatchEvent('cancel');
   assert.equal(await page.locator('#existingMkvRoutedReview').isChecked(),true,'unchanged dialog cancellation must preserve consent');
   await page.locator('#existingMkvRoutedPrepare').click();
   await page.waitForFunction(()=>document.querySelector('#existingMkvRoutedStatus').dataset.state==='blocked',null,{timeout:15000});
   assert.ok((await page.locator('#existingMkvRoutedStatus').textContent()).includes(expectedCodes[i]));
   assert.equal(await page.locator('#existingMkvRoutedSave').isDisabled(),true);
   const before=downloads;
   await page.setInputFiles('#attachmentInspectInput',files[i]);
   await page.waitForFunction(()=>document.querySelectorAll('#attachmentInspectList [data-attachment-download]').length===1,null,{timeout:60000});
   assert.equal(downloads,before,'inspection must not automatically download or execute an attachment');
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#attachmentInspectList [data-attachment-download]').click()]);
   const dest=path.join(outDir,'browser-extracted-'+i+'.png');await download.saveAs(dest);
   assert.deepEqual(await fs.readFile(dest),payloads[i]);
   await page.setInputFiles('#existingMkvRoutedSource',files[i]);
   await page.waitForFunction(()=>document.querySelector('#existingMkvRoutedTarget option[value="42"]'));
   assert.equal(await page.locator('#existingMkvRoutedReview').isChecked(),false,'same-path source reselection must invalidate consent for its new File');
   await page.locator('#existingMkvRoutedReview').check();
   await page.locator('#existingMkvRoutedPrepare').click();
   await page.waitForFunction(()=>document.querySelector('#existingMkvRoutedStatus').dataset.state==='blocked');
   assert.ok((await page.locator('#existingMkvRoutedStatus').textContent()).includes(expectedCodes[i]),'read-only success must not authorize writer execution');
   assert.equal(await page.locator('#existingMkvRoutedSave').isDisabled(),true);
  }
  await page.locator('#sf14More > summary').click();
  await page.locator('[data-sf-view="batch"]').click();
  await page.setInputFiles('#batchUnifiedInput',files);
  await page.waitForFunction(()=>!document.querySelector('#batchInspectBtn').disabled,null,{timeout:60000});
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true);
  await page.locator('#batchInspectBtn').click();
  await page.waitForFunction(()=>document.querySelector('#batchInspectStatus').textContent.startsWith('检查已结束'),null,{timeout:180000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#batchInspectDownload').click()]);
  const reportPath=path.join(outDir,'readonly-boundary-report.json');await download.saveAs(reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.rows.length,2);
  for(const row of report.rows){
   assert.equal(row.state,'partial','zero-media structural observation must not become full media acceptance');
   assert.equal(row.observation.attachmentInventory.attachments[0].fileUid,'42');
   assert.equal(row.observation.claims.writerAdmission,'not-evaluated');
  }
  assert.deepEqual(await Promise.all(files.map(async file=>sha(await fs.readFile(file)))),sourceHashes);
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files.length),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(outDir,'readonly-boundary-batch.png'),fullPage:true});
  await fs.writeFile(path.join(outDir,'readonly-writer-boundary-evidence.json'),JSON.stringify({schema:'softmux-readonly-writer-boundary-v1',result:'pass',sourceSha256:sourceHashes,sourceBytes:[fixture.overBudget.length,fixture.referenced.length],writerRefusals:expectedCodes,readOnlyExtractionSha256:payloads.map(sha),batchStates:report.rows.map(row=>row.state),sourceUnchanged:true,nativeAttachmentAndTagCrosscheck:nativeAudit,limits:'Non-playing authored Matroska documents with a large legal Void or targeted AttachmentUID. Not large-media/Wasm/device acceptance; no writer ceilings changed.'},null,2)+'\n');
  console.log('Writer rejection + independent read-only UI extraction and batch reports PASS');
 }catch(error){console.error('Readonly boundary diagnostic:',await page.locator('#existingMkvRoutedStatus').textContent(),await page.locator('#batchInspectStatus').textContent());throw error;}
 finally{await context.close();}
}
