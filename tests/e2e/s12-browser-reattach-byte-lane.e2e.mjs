/**
 * S12 bounded browser File/Blob >128MiB research. This verifies a real File
 * input and real browser Blob download AFTER a separate native FFmpeg remux;
 * it does NOT demonstrate FFmpeg.wasm's no-attachment remux success.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const tier=process.env.S12_REATTACH_TIER||'128m';
const chunkMiB=Number(process.env.S12_REATTACH_CHUNK_MIB||64);
const dir=path.resolve(process.env.S12_REATTACH_DIR||'.e2e/s12-reattach-large');
const f=name=>path.join(dir,name);
const source=f('source-'+tier+'-'+chunkMiB+'m.mkv');
const clean=f('remux-without-original-attachments.mkv');
const output=f('browser-reattached-original-byte-lane.mkv');
const receiptPath=f('s12-browser-reattach-receipt.json');
const fixture=JSON.parse(await fs.readFile(f('s12-large-reattach-receipt.json'),'utf8'));
assert.equal(fixture.status,'FIXTURE_READY_ONLY_NOT_ACCEPTED');
assert.equal(fixture.tier,tier);assert.equal(fixture.chunkMiB,chunkMiB);
const native=(tool,args,timeout=120_000)=>execFileSync(tool,args,{
 encoding:'utf8',timeout,maxBuffer:10*1024*1024
});
const sha=async file=>{
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
};
const report={
 schema:'softmux-s12-browser-File-Blob-original-attachments-v1',
 tier,chunkMiB,attachmentBytes:fixture.attachmentBytes,
 actualSourceBytes:fixture.actualSourceBytes,
 status:'PENDING',phase:'init',startedAt:new Date().toISOString(),
 notProven:[
  'FFmpeg.wasm excludes original attachment streams in this run: baseline remux is native FFmpeg',
  'arbitrary Matroska source Tags/Chapters/UID graph or unknown EBML layout',
  'physical tablet memory, production UI workflow, long source media packet preservation',
 ],error:null
};
const persist=async()=>fs.writeFile(receiptPath,JSON.stringify(report,null,2)+'\n');
const stage=async name=>{report.phase=name;await persist();console.log('S12 browser byte lane',name)};
let browser,page,context;
try{
 await stage('verify-real-native-fixture');
 assert.equal((await fs.stat(source)).size,fixture.actualSourceBytes);
 assert.equal(await sha(source),fixture.sourceSha256);
 report.nativeRemuxBytes=(await fs.stat(clean)).size;
 const base=JSON.parse(native('ffprobe',[
  '-v','error','-show_streams','-of','json',clean
 ]));
 assert.equal(base.streams.filter(x=>x.codec_type==='attachment').length,0);
 assert.ok(base.streams.some(x=>x.codec_type==='subtitle'));
 await stage('launch-real-chromium');
 browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{})
 });
 report.browserVersion=browser.version();
 context=await browser.newContext({acceptDownloads:true});
 page=await context.newPage();
 page.setDefaultTimeout(180_000);
 page.on('crash',()=>{report.browserCrashed=true});
 page.on('pageerror',e=>{report.pageError=String(e)});
 const url=(process.env.S12_REATTACH_BASE_URL||'http://127.0.0.1:4179')+
  '/research/s12-browser-byte-lane.html';
 await page.goto(url,{waitUntil:'networkidle',timeout:60_000});
 assert.equal(await page.locator('#run').isDisabled(),true);
 await stage('select-real-browser-File-original-and-baseline');
 await page.locator('#originalFile').setInputFiles(source,{timeout:180_000});
 await page.locator('#remuxedFile').setInputFiles(clean,{timeout:60_000});
 assert.equal(await page.locator('#run').isDisabled(),false);
 const picked=await page.locator('#originalFile').evaluate(el=>({
  size:el.files?.[0]?.size,name:el.files?.[0]?.name,
  isFile:el.files?.[0] instanceof File,
 }));
 assert.equal(picked.isFile,true);
 assert.equal(picked.size,fixture.actualSourceBytes);
 report.browserOriginalFileSelection=picked;
 await stage('compose-browser-Blob-slices-and-download');
 const dlPromise=page.waitForEvent('download',{timeout:210_000});
 // A rejected composition does not constitute a download. Catch the event
 // promise later if the research gate fails before it is dispatched.
 await page.locator('#run').click();
 await page.waitForFunction(()=>{
  const s=window.__s12BrowserByteLane?.stage;
  return s==='failed'||s==='download-dispatched';
 },null,{timeout:210_000});
 const result=await page.evaluate(()=>window.__s12BrowserByteLane);
 if(result.stage==='failed'){
  dlPromise.catch(()=>{});
  throw Error('S12_BROWSER_REATTACH_REJECTED: '+result.error);
 }
 report.browserEvidence=result.evidence;
 assert.equal(result.evidence.authorization,'NONE_RESEARCH_ONLY');
 assert.equal(result.evidence.sourceKind,'[object File]');
 assert.equal(result.evidence.originalBytes,fixture.actualSourceBytes);
 const dl=await dlPromise;
 await dl.saveAs(output);
 report.outputBytes=(await fs.stat(output)).size;
 assert.equal(report.outputBytes,result.evidence.outputBytes);
 assert.equal(report.outputBytes,report.nativeRemuxBytes+
  result.evidence.rawAttachmentsElementBytes);
 await stage('independent-native-output-and-SHA-oracle');
 const nativeOutput=JSON.parse(native('ffprobe',[
  '-v','error','-show_streams','-show_format','-of','json',output
 ],180_000));
 for(const kind of ['video','audio','subtitle'])
  assert.ok(nativeOutput.streams.some(x=>x.codec_type===kind),'missing '+kind);
 assert.equal(nativeOutput.streams.filter(x=>x.codec_type==='attachment').length,
  fixture.attachmentParts.length,'lost/duplicate attachment');
 const mkv=JSON.parse(native('mkvmerge',['-J',output],180_000));
 assert.equal(mkv.attachments?.length,fixture.attachmentParts.length);
 const args=['attachments',output];
 for(const part of fixture.attachmentParts){
  const a=mkv.attachments.find(x=>x.file_name===part.name);
  assert.ok(a&&Number.isSafeInteger(a.id),'original attachment identity missing '+part.name);
  args.push(String(a.id)+':'+f('browser-extracted-'+part.name));
 }
 native('mkvextract',args,300_000);
 for(const part of fixture.attachmentParts){
  const extracted=f('browser-extracted-'+part.name);
  assert.equal((await fs.stat(extracted)).size,part.bytes);
  assert.equal(await sha(extracted),part.sha256,'original payload drift '+part.name);
 }
 assert.equal(await sha(source),fixture.sourceSha256,
  'original MKV was changed by the browser experiment');
 report.sourceSha256=fixture.sourceSha256;
 report.outputSha256=await sha(output);
 report.nativeFinalStreamKinds=nativeOutput.streams.map(x=>x.codec_type);
 report.status='PASS_BROWSER_FILE_BLOB_NATIVE_AUDIT_ONLY';
 report.completedAt=new Date().toISOString();
 await stage('done');
 console.log('S12 BROWSER TRUE FILE BLOB ORIGINAL ATTACHMENTS SHA PASS',JSON.stringify({
  tier,chunkMiB,outputBytes:report.outputBytes,attachments:fixture.attachmentParts.length
 }));
}catch(error){
 report.status='FAIL_BROWSER_FILE_BLOB_RESEARCH';
 report.error={message:String(error?.message||error),stack:String(error?.stack||'').slice(0,4500)};
 report.browserState=page?
  await page.evaluate(()=>window.__s12BrowserByteLane).catch(()=>null):null;
 console.error('S12 BROWSER TRUE FILE BLOB RESEARCH FAILED',report.phase,report.error);
 process.exitCode=1;
}finally{
 await context?.close().catch(()=>{});
 await browser?.close().catch(()=>{});
 report.finishedAt=new Date().toISOString();
 await persist();
}
