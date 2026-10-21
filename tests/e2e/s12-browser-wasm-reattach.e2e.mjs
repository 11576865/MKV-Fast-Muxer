/**
 * S12 BOUNDED real browser FFmpeg.wasm media-only input + Blob native
 * attachment-byte reinsertion research. The browser must load FFmpeg.wasm
 * via local worker and successfully exec explicit A/V+SRT maps that exclude
 * original attachment streams. A real browser download is then independently
 * probed and all original payload SHA-256 verified by native MKVToolNix.
 * NOT production UI / not general EBML writer authorization.
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
const output=f('browser-wasm-media-only-reattached-original-byte-lane.mkv');
const receiptPath=f('s12-browser-wasm-reattach-receipt.json');
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
 schema:'softmux-s12-browser-FFmpegWasm-media-only-Blob-original-attachments-v1',
 tier,chunkMiB,attachmentBytes:fixture.attachmentBytes,
 actualSourceBytes:fixture.actualSourceBytes,
 status:'PENDING',phase:'init',startedAt:new Date().toISOString(),
 notProven:[
  'arbitrary Matroska source Tags/Chapters/UID graph or unknown EBML layout',
  'physical tablet memory, production UI workflow, long source media packet preservation',
 ],error:null
};
const persist=async()=>fs.writeFile(receiptPath,JSON.stringify(report,null,2)+'\n');
const stage=async name=>{report.phase=name;await persist();console.log('S12 browser WASM media-only byte lane',name)};
let browser,page,context;
try{
 await stage('verify-real-native-fixture');
 assert.equal((await fs.stat(source)).size,fixture.actualSourceBytes);
 assert.equal(await sha(source),fixture.sourceSha256);
 // The native baseline may exist as an independently generated fixture,
 // but it is never passed to Chromium in this test. The browser itself must
 // run real FFmpeg.wasm to build the media-only remux.
 report.nativeBaselineNotUsedInBrowser=true;
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
  '/research/s12-browser-wasm-reattach.html';
 await page.goto(url,{waitUntil:'networkidle',timeout:60_000});
 assert.equal(await page.locator('#execute').isDisabled(),true);
 await stage('select-real-browser-File-original');
 await page.locator('#source').setInputFiles(source,{timeout:180_000});
 assert.equal(await page.locator('#execute').isDisabled(),false);
 const picked=await page.locator('#source').evaluate(el=>({
  size:el.files?.[0]?.size,name:el.files?.[0]?.name,
  isFile:el.files?.[0] instanceof File,
 }));
 assert.equal(picked.isFile,true);
 assert.equal(picked.size,fixture.actualSourceBytes);
 report.browserOriginalFileSelection=picked;
 await stage('real-browser-wasm-media-only-mux-then-Blob-download');
 const dlPromise=page.waitForEvent('download',{timeout:210_000});
 // A rejected composition does not constitute a download. Catch the event
 // promise later if the research gate fails before it is dispatched.
 await page.locator('#execute').click();
 await page.waitForFunction(()=>{
  const s=window.__s12WasmReattach?.phase;
  return s==='failed'||s==='download-dispatched';
 },null,{timeout:210_000});
 const result=await page.evaluate(()=>window.__s12WasmReattach);
 report.wasmExitCode=result.wasmExitCode;
 report.wasmLogTail=result.wasmLogTail;
 report.wasmExecArgs=result.execArgs;
 if(result.phase==='failed'){
  dlPromise.catch(()=>{});
  throw Error('S12_BROWSER_WASM_REATTACH_REJECTED: '+result.error);
 }
 report.browserEvidence=result.evidence;
 assert.equal(result.wasmExitCode,0,
  'real browser FFmpeg.wasm must execute the media-only mux command');
 assert.equal(result.evidence.wasmExitCode,0);
 assert.equal(result.evidence.authorization,'NONE_RESEARCH_ONLY');
 assert.equal(result.evidence.sourceType,'[object File]');
 assert.equal(result.evidence.sourceBytes,fixture.actualSourceBytes);
 assert.equal(result.wasmExecArgs.filter(x=>x==='-map').length,3);
 assert.ok(result.wasmExecArgs.includes('0:a:0'));
 assert.ok(result.wasmExecArgs.includes('1:s:0'));
 assert.equal(result.wasmExecArgs.some(x=>/0:t:|attachment/.test(x)),false,
  'the real FFmpeg.wasm command must NOT map source original attachment streams');
 const dl=await dlPromise;
 await dl.saveAs(output);
 report.outputBytes=(await fs.stat(output)).size;
 assert.equal(report.outputBytes,result.evidence.outputBytes);
 assert.equal(report.outputBytes,result.evidence.wasmBaselineBytes+
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
 report.status='PASS_BROWSER_FFMPEG_WASM_MEDIA_ONLY_PLUS_ATTACHMENT_BLOB_NATIVE_AUDIT_ONLY';
 report.completedAt=new Date().toISOString();
 await stage('done');
 console.log('S12 BROWSER TRUE FFMPEG WASM + ORIGINAL ATTACHMENT BLOB SHA PASS',JSON.stringify({
  tier,chunkMiB,outputBytes:report.outputBytes,attachments:fixture.attachmentParts.length
 }));
}catch(error){
 report.status='FAIL_BROWSER_FFMPEG_WASM_BYTE_LANE_RESEARCH';
 report.error={message:String(error?.message||error),stack:String(error?.stack||'').slice(0,4500)};
 report.browserState=page?
  await page.evaluate(()=>window.__s12WasmReattach).catch(()=>null):null;
 console.error('S12 BROWSER FFMPEG WASM BYTE LANE RESEARCH FAILED',report.phase,report.error);
 process.exitCode=1;
}finally{
 await context?.close().catch(()=>{});
 await browser?.close().catch(()=>{});
 report.finishedAt=new Date().toISOString();
 await persist();
}
