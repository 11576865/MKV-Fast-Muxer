import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {makeBitmapSubtitleFixtures} from '../../scripts/make-bitmap-subtitle-fixtures.mjs';
import {auditBitmapSubtitleOutput} from '../../scripts/audit-bitmap-subtitle-output.mjs';

export async function scenarioBitmapSubtitles(browser,{root,outDir,baseUrl}){
 await fs.mkdir(outDir,{recursive:true});
 await makeBitmapSubtitleFixtures(root);
 const sourceNames=['base.mp4','bitmap.sup','bitmap.idx','bitmap.sub'];
 const digest=async name=>createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');
 const before=await Promise.all(sourceNames.map(digest));
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
 const page=await context.newPage();const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(String(error)));
 try{
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',sourceNames.map(name=>path.join(root,name)));
  await page.waitForFunction(()=>document.querySelectorAll('#newSubtitleList [data-new-sub-field="title"]').length===2&&!document.querySelector('#muxBtn').disabled,null,{timeout:60000});
  await page.locator('#sf14OptionsDrawer > summary').click();
  const titles=page.locator('#newSubtitleList [data-new-sub-field="title"]');
  await titles.nth(0).fill('Authored PGS');await titles.nth(1).fill('Authored VobSub');
  await page.locator('#newSubtitleList [data-new-sub-field="language"]').nth(0).selectOption('eng');
  await page.locator('#newSubtitleList [data-new-sub-field="language"]').nth(1).selectOption('eng');
  await page.locator('#newSubtitleList [data-new-sub-field="default"]').nth(0).check();
  await page.locator('#newSubtitleList [data-new-sub-field="default"]').nth(1).uncheck();
  await page.locator('#newSubtitleList [data-new-sub-field="forced"]').nth(1).check();
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.startsWith('完成。'),null,{timeout:180000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLink').click()]);
  const output=path.join(outDir,'bitmap-subtitles.mkv');await download.saveAs(output);
  await fs.writeFile(path.join(outDir,'bitmap-workbench-log.txt'),await page.locator('#log').textContent());
  await page.screenshot({path:path.join(outDir,'bitmap-workbench.png'),fullPage:true});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'}));
  const subtitles=probe.streams.filter(stream=>stream.codec_type==='subtitle');
  assert.equal(subtitles.length,2);
  assert.deepEqual(subtitles.map(s=>s.codec_name),['hdmv_pgs_subtitle','dvd_subtitle']);
  assert.deepEqual(subtitles.map(s=>s.tags?.title),['Authored PGS','Authored VobSub']);
  assert.deepEqual(subtitles.map(s=>s.tags?.language),['eng','eng']);
  assert.equal(subtitles[0].disposition.default,1);assert.equal(subtitles[1].disposition.default,0);
  assert.equal(subtitles[1].disposition.forced,1);
  const [reportDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#reportLink').click()]);
  const reportPath=path.join(outDir,'bitmap-workbench-report.json');await reportDownload.saveAs(reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  const packageVersion=JSON.parse(await fs.readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
  assert.equal(report.application.version,packageVersion,'actual report version differs from built product');
  const receipt=await auditBitmapSubtitleOutput({root,video:path.join(root,'base.mp4'),output,outDir});
  assert.deepEqual(await Promise.all(sourceNames.map(digest)),before,'sources were modified');
  assert.deepEqual(pageErrors,[]);
  const fixtureDir=path.join(outDir,'fixtures');await fs.mkdir(fixtureDir,{recursive:true});
  for(const name of ['bitmap.sup','bitmap.idx','bitmap.sub','bitmap-fixture-manifest.json'])await fs.copyFile(path.join(root,name),path.join(fixtureDir,name));
  await fs.writeFile(path.join(outDir,'bitmap-workbench-delivery.json'),JSON.stringify({
   schema:'softmux-bitmap-workbench-delivery-v1',result:'pass',packageVersion,
   testedCheckout:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
   inputSha256:Object.fromEntries(sourceNames.map((name,index)=>[name,before[index]])),
   outputSha256:receipt.outputSha256,unchangedInputs:true,
   limits:'Authored 4x4 PGS/VobSub fixtures; sampled decoded frames at 0.5/1.5/3.5 seconds. Not general subtitle compatibility or full S02/1.0 acceptance.',
  },null,2)+'\n');
  console.log('Bitmap subtitles: real workbench + native packet/timestamp/decoded-image audit PASS',receipt.outputSha256);
 }catch(error){
  console.error('Bitmap status:',await page.locator('#status').textContent());
  console.error('Bitmap log:',await page.locator('#log').textContent());
  throw error;
 }finally{await context.close();}
}
