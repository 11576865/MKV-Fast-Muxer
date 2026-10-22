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
const shadowMode=process.env.S12_REATTACH_SHADOW==='true';
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
 tier,chunkMiB,shadowMode,attachmentBytes:fixture.attachmentBytes,
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
  '/research/s12-browser-wasm-reattach.html'+(shadowMode?'?media-shadow=1':'');
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
 report.sourceStagingMode=result.inputMode;
 report.shadowEvidence=result.shadowEvidence;
 assert.equal(result.inputMode,shadowMode?'temporary-void-shadow':'original-direct');
 if(shadowMode){
  assert.equal(result.shadowEvidence?.authorization,'NONE_RESEARCH_ONLY');
  assert.equal(result.shadowEvidence?.originalBytes,fixture.actualSourceBytes);
  assert.equal(result.shadowEvidence?.shadowBytes,fixture.actualSourceBytes);
  assert.equal(result.shadowEvidence?.unchangedElementOffsets,true);
  assert.equal(result.shadowEvidence?.seekHeadOriginalAttachmentsIndexMayBeStale,true);
 }else assert.equal(result.shadowEvidence,null);
 assert.equal(result.wasmExitCode,0,
  'real browser FFmpeg.wasm must execute the media-only mux command');
 assert.equal(result.evidence.wasmExitCode,0);
 assert.equal(result.evidence.authorization,'NONE_RESEARCH_ONLY');
 assert.equal(result.evidence.sourceType,'[object File]');
 assert.equal(result.evidence.sourceBytes,fixture.actualSourceBytes);
 const actualMappings=result.execArgs.flatMap((arg,index,args)=>
  arg==='-map'?[args[index+1]]:[]);
 assert.deepEqual(actualMappings,['0:v:0','0:a:0','1:s:0'],
  'the real FFmpeg.wasm output must map exactly A/V and new SRT, never any original attachment stream');
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
 // Exact encoded packet byte-content parity is stronger than mere stream
 // inventory. Compare independently recomputed native ffprobe hashes in
 // packet order for both copied A/V tracks; timestamp rewriting may differ,
 // but -c copy must not silently transcode, omit or alter these packets.
 const sourceProbe=JSON.parse(native('ffprobe',[
  '-v','error','-show_streams','-of','json',source
 ],180_000));
 for(const kind of ['video','audio']){
  const from=sourceProbe.streams.find(x=>x.codec_type===kind);
  const delivered=nativeOutput.streams.find(x=>x.codec_type===kind);
  assert.equal(delivered.codec_name,from.codec_name,
   'copied '+kind+' codec identity changed');
 }
 const packetHashes=(file,selector)=>JSON.parse(native('ffprobe',[
  '-v','error','-select_streams',selector,
  '-show_packets','-show_data_hash','sha256',
  '-show_entries','packet=data_hash','-of','json',file
 ],180_000)).packets?.map(x=>x.data_hash)||[];
 report.avPacketSHA256Parity={};
 for(const [kind,selector] of [['video','v:0'],['audio','a:0']]){
  const sourceHashes=packetHashes(source,selector);
  const outputHashes=packetHashes(output,selector);
  assert.ok(sourceHashes.length>2&&sourceHashes.every(x=>typeof x==='string'&&x.startsWith('SHA256:')),
   'source '+kind+' independent packet hash oracle did not produce usable SHA256');
  assert.deepEqual(outputHashes,sourceHashes,
   'actual encoded '+kind+' packet bytes lost/changed across WASM and Blob output');
  report.avPacketSHA256Parity[kind]={
   codec:sourceProbe.streams.find(x=>x.codec_type===kind).codec_name,
   packets:sourceHashes.length,allOrderedSHA256Equal:true
  };
 }
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
 // Strong negative branch: construct a REAL tagged Matroska copy with
 // native mkvpropedit, select it through Chromium File input, and prove the
 // bounded source preflight rejects before even starting FFmpeg.wasm.
 // A successful prior output must not authorize a later edited source.
 if(tier==='128m'){
  await stage('real-tagged-source-refused-before-wasm');
  const tagged=f('negative-source-with-real-tags.mkv');
  const xml=f('negative-source-tags.xml');
  await fs.copyFile(source,tagged);
  await fs.writeFile(xml,[
   '<?xml version="1.0" encoding="utf-8"?>',
   '<Tags><Tag><Targets/><Simple>',
   '<Name>S12_TAGGED_SOURCE_UNSUPPORTED</Name>',
   '<String>Should be rejected before wasm loads</String>',
   '</Simple></Tag></Tags>'
  ].join(''));
  native('mkvpropedit',[tagged,'--tags','global:'+xml],180_000);
  await page.locator('#source').setInputFiles(tagged,{timeout:180_000});
  const sourceSwitch=await page.evaluate(()=>window.__s12WasmReattach);
  assert.equal(sourceSwitch.evidence,null,
   'selecting a different File must synchronously revoke stale success evidence');
  assert.equal(sourceSwitch.downloadable,false,
   'the previous original source download URL must be revoked after reselect');
  assert.equal(sourceSwitch.wasmExitCode,null,
   'a selected new File has not executed FFmpeg.wasm');
  await page.locator('#execute').click();
  await page.waitForFunction(()=>window.__s12WasmReattach?.phase==='failed',
   null,{timeout:45_000});
  const refused=await page.evaluate(()=>({
   error:window.__s12WasmReattach.error,
   wasmExitCode:window.__s12WasmReattach.wasmExitCode,
   evidence:window.__s12WasmReattach.evidence,
   preflight:window.__s12WasmReattach.preflight
  }));
  assert.match(refused.error||'',/SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE/,
   'actual tagged source must fail closed, not silently lose Tags');
  assert.equal(refused.wasmExitCode,null,
   'unsupported source metadata must reject before FFmpeg.wasm exec');
  assert.equal(refused.evidence,null,
   'old downloaded output evidence cannot transfer to a newly rejected File');
  assert.equal(refused.preflight,null);
  report.realTaggedSourceNegative={status:'REJECTED_BEFORE_WASM_EXEC',
   reason:refused.error,realOriginalTags:true};
  await fs.rm(tagged);

  // A genuine source Chapters master is an independent graph hazard.
  // Editing these objects into a native original MKV must fail CLOSED before
  // the research wasm executor, not silently flatten ChapterUID semantics.
  await stage('real-chaptered-source-refused-before-wasm');
  const chaptered=f('negative-source-with-real-chapters.mkv');
  const chaptersXml=f('negative-source-chapters.xml');
  await fs.copyFile(source,chaptered);
  await fs.writeFile(chaptersXml,[
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Chapters><EditionEntry><ChapterAtom>',
    '<ChapterUID>987654321</ChapterUID>',
    '<ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>',
    '<ChapterDisplay><ChapterString>S12 chapter graph must be refused</ChapterString>',
    '<ChapterLanguage>eng</ChapterLanguage></ChapterDisplay>',
    '</ChapterAtom></EditionEntry></Chapters>'
  ].join(''));
  native('mkvpropedit',[chaptered,'--chapters',chaptersXml],180_000);
  const chapterInventory=JSON.parse(native('ffprobe',[
   '-v','error','-show_chapters','-of','json',chaptered
  ],180_000));
  assert.ok(chapterInventory.chapters?.length>=1,
   'native chapter negative fixture must contain an actual ChapterAtom');
  await page.locator('#source').setInputFiles(chaptered,{timeout:180_000});
  const chapterSwitch=await page.evaluate(()=>window.__s12WasmReattach);
  assert.equal(chapterSwitch.evidence,null);
  assert.equal(chapterSwitch.downloadable,false);
  assert.equal(chapterSwitch.wasmExitCode,null);
  await page.locator('#execute').click();
  await page.waitForFunction(()=>window.__s12WasmReattach?.phase==='failed',
   null,{timeout:45_000});
  const chapterRefusal=await page.evaluate(()=>({
   error:window.__s12WasmReattach.error,
   wasmExitCode:window.__s12WasmReattach.wasmExitCode,
   evidence:window.__s12WasmReattach.evidence,
   preflight:window.__s12WasmReattach.preflight,
   downloadable:window.__s12WasmReattach.downloadable,
  }));
  assert.match(chapterRefusal.error||'',/SOURCE_TAGS_OR_CHAPTERS_NOT_REATTACHABLE/);
  assert.equal(chapterRefusal.wasmExitCode,null,
   'real source Chapters must fail before FFmpeg.wasm execution');
  assert.equal(chapterRefusal.evidence,null);
  assert.equal(chapterRefusal.preflight,null);
  assert.equal(chapterRefusal.downloadable,false,
   'chapter refusal must not preserve a prior source download URL');
  report.realChapteredSourceNegative={
   status:'REJECTED_BEFORE_WASM_EXEC',
   actualNativeChapterAtoms:chapterInventory.chapters.length,
   reason:chapterRefusal.error,
  };

  // Deterministic IN-FLIGHT source identity check with a *real completed*
  // ffmpeg.wasm media-only mux: pause exactly after its exec resolves and
  // before the output is authorized, select a different real File, and
  // prove the old task cannot emit a candidate for the new source.
  await stage('post-real-wasm-inflight-source-swap-refused');
  await page.evaluate(()=>{
   window.__s12ResearchAfterExecBarrier=()=>new Promise(resolve=>{
    window.__s12ResearchReleaseAfterExec=resolve;
   });
  });
  await page.locator('#source').setInputFiles(source,{timeout:180_000});
  let unauthorizedDownloads=0;
  const trackUnauthorized=()=>{unauthorizedDownloads++};
  page.on('download',trackUnauthorized);
  await page.locator('#execute').click();
  await page.waitForFunction(()=>window.__s12WasmReattach?.researchBarrierReached===true,
   null,{timeout:180_000});
  const wasExecuted=await page.evaluate(()=>window.__s12WasmReattach?.execArgs);
  assert.deepEqual(wasExecuted.flatMap((arg,i,args)=>arg==='-map'?[args[i+1]]:[]),
   ['0:v:0','0:a:0','1:s:0']);
  await page.locator('#source').setInputFiles(chaptered,{timeout:180_000});
  const changedWhileHeld=await page.evaluate(()=>window.__s12WasmReattach);
  assert.equal(changedWhileHeld.evidence,null);
  assert.equal(changedWhileHeld.downloadable,false);
  await page.evaluate(()=>window.__s12ResearchReleaseAfterExec?.());
  await page.waitForFunction(()=>window.__s12WasmReattach?.phase==='failed',
   null,{timeout:45_000});
  const staleRefusal=await page.evaluate(()=>({
   reason:window.__s12WasmReattach.error,
   evidence:window.__s12WasmReattach.evidence,
   downloadable:window.__s12WasmReattach.downloadable,
   wasmExitCode:window.__s12WasmReattach.wasmExitCode,
  }));
  assert.match(staleRefusal.reason||'',/S12_SOURCE_FILE_CHANGED_DURING_EXECUTION/);
  assert.equal(staleRefusal.evidence,null);
  assert.equal(staleRefusal.downloadable,false);
  assert.equal(staleRefusal.wasmExitCode,null,
   'completed FFmpeg.wasm output may not be accepted after a source File change');
  assert.equal(unauthorizedDownloads,0,
   'in-flight old-source mux must dispatch no download after a File change');
  page.off('download',trackUnauthorized);
  await page.evaluate(()=>{
   delete window.__s12ResearchAfterExecBarrier;
   delete window.__s12ResearchReleaseAfterExec;
  });
  report.inFlightSourceReplacement={
   status:'REJECTED_AFTER_REAL_WASM_EXEC_BEFORE_OUTPUT',
   oldMediaMuxExecuted:true,downloadCount:unauthorizedDownloads,
   exactFileEpochGuard:true,reason:staleRefusal.reason,
  };
  await fs.rm(chaptered);
 }
 report.sourceSha256=fixture.sourceSha256;
 report.outputSha256=await sha(output);
 report.nativeFinalStreamKinds=nativeOutput.streams.map(x=>x.codec_type);
 report.status='PASS_BROWSER_FFMPEG_WASM_MEDIA_ONLY_PLUS_ATTACHMENT_BLOB_NATIVE_AUDIT_ONLY';
 report.completedAt=new Date().toISOString();
 await stage('done');
 console.log('S12 BROWSER TRUE FFMPEG WASM + ORIGINAL ATTACHMENT BLOB SHA PASS',JSON.stringify({
  tier,chunkMiB,shadowMode,outputBytes:report.outputBytes,attachments:fixture.attachmentParts.length
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
