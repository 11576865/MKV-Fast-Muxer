/**
 * S12 actual Chromium + ffmpeg.wasm source/output envelope.
 * Never substitutes a sparse/truncated file, a declared size or a mock.
 * This is a DIAGNOSTIC execution whose real failure is reported as FAIL,
 * rather than silently re-labelled an accepted performance result.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream, openAsBlob } from 'node:fs';
import { auditS12FinishedIndexEvidence } from '../../src/s12-finished-index-evidence.js';
import { inspectS12CueTrackBlockEvidence } from '../../src/s12-cue-track-block-evidence.js';
import { planS12VoidResidentSeekHeadRepair } from '../../research/s12-void-resident-seekhead-repair.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const dir=path.resolve(process.env.S12_DIR||'.e2e/s12');
const tier=process.env.S12_TIER||'512m';
const manifestPath=path.join(dir,'s12-run-receipt.json');
const raw=JSON.parse(await fs.readFile(path.join(dir,'s12-fixture-receipt.json'),'utf8'));
const source=path.join(dir,raw.source);
const kind=raw.kind||'attachment';
if(!['attachment','pcm'].includes(kind))throw Error('S12_UNKNOWN_FIXTURE_KIND:'+kind);
const out=path.join(dir,'s12-'+tier+'-finished.mkv');
const reportPath=path.join(dir,'s12-'+tier+'-mux-report.json');
const memory={samples:0,maxChromiumRssKiB:0,maxHostNodeRssKiB:0,
 maxObservedTotalBrowserProcesses:0,lastBrowserRssKiB:0};
const manifest={
 schema:'softmux-s12-real-browser-envelop-v1',tier,kind,source:path.basename(source),
 sourceBytes:raw.sourceBytes,attachmentBytes:raw.payloadBytes,
 attachmentSha256:raw.payloadSha256,
 attachmentCount:raw.attachmentCount,
 fixtureKind:raw.mediaNote,
 result:'IN_PROGRESS',phase:'boot',startedAt:new Date().toISOString(),
 linux:os.release(),architecture:process.arch,platform:process.platform,
 nodeVersion:process.version,chromiumVersion:null,userAgent:null,
 stages:[],peakResourceObservation:memory,
 claimsNotMade:[
  'The attachment case stresses EBML FileData; the PCM case stresses real timed media packets; neither resembles typical compressed film bitrate/content',
  'No claim about actual tablet hardware or user machine memory',
  'No arbitrary 1 GB output size or engine success guarantee',
  'Browser process RSS samples are approximate, not hardware peak allocation',
  'No post-restart browser File grants are expected',
 ],error:null
};
const persist=async()=>fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const mark=async (phase,extra={})=>{
  manifest.phase=phase;
  manifest.stages.push({phase,timestamp:new Date().toISOString(),...extra});
  await persist();
  console.log('S12 stage '+phase,JSON.stringify(extra));
};
async function shaFile(file){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
}
function probe(file) {
 return JSON.parse(execFileSync('ffprobe',[
 '-v','error','-show_streams','-show_format','-of','json',file
 ],{encoding:'utf8',timeout:120000,maxBuffer:5*1024*1024}));
}
function sampleMemory(){
 try{
  const table=execFileSync('ps',['-eo','comm=,rss='],{encoding:'utf8',timeout:5000});
  let rss=0,processes=0;
  for(const row of table.split('\n')){
   const m=row.trim().match(/^(\S+)\s+(\d+)$/);
   if(m && /(?:chrom|chrome|headless_shell)/i.test(m[1])) {rss+=Number(m[2]);processes++;}
  }
  memory.samples++;
  memory.lastBrowserRssKiB=rss;
  memory.maxChromiumRssKiB=Math.max(memory.maxChromiumRssKiB,rss);
  memory.maxObservedTotalBrowserProcesses=Math.max(memory.maxObservedTotalBrowserProcesses,processes);
  memory.maxHostNodeRssKiB=Math.max(memory.maxHostNodeRssKiB,
    Math.round(process.memoryUsage().rss/1024));
 }catch{}
}
let sampler,browser,context,page,progressSampler;
let progressBusy=false;
const inspectBrowserProgress=async()=>{
 if(progressBusy||!page||page.isClosed())return;
 progressBusy=true;
 try{
  const live=await Promise.race([
   page.evaluate(()=>{
    const status=document.querySelector('#status')?.textContent||'';
    const log=document.querySelector('#log')?.textContent||
     document.querySelector('#logEl')?.textContent||'';
    const progress=document.querySelector('#progressBar')?.style?.width||'';
    return {status,progress,logTail:log.slice(-2200),
     heap:performance.memory?.usedJSHeapSize??null};
   }).catch(err=>({error:String(err)})),
   new Promise(resolve=>setTimeout(()=>resolve({pollTimedOut:true}),3500))
  ]);
  if(live?.pollTimedOut){manifest.browserPollTimeouts=(manifest.browserPollTimeouts||0)+1;return;}
  if(live?.error){manifest.browserPollError=live.error;return;}
  const changed=manifest.lastObservedBrowserStatus!==live.status;
  manifest.lastObservedBrowserStatus=live.status;
  manifest.lastObservedBrowserLogTail=live.logTail;
  manifest.lastObservedBrowserProgress=live.progress;
  manifest.lastObservedJsHeapBytes=live.heap;
  if(changed)console.log('S12 browser progress',JSON.stringify({
   tier,status:live.status,progress:live.progress,
   browserRssKiB:memory.lastBrowserRssKiB,heapBytes:live.heap
  }));
  await persist();
 }finally{progressBusy=false;}
};
try{
 await mark('source-identity');
 assert.ok(raw.sourceBytes>=raw.payloadBytes);
 assert.equal((await fs.stat(source)).size,raw.sourceBytes);
 manifest.inputSha256=await shaFile(source);
 const input=probe(source);
 assert.ok(input.streams.some(s=>s.codec_type==='video'));
 assert.ok(input.streams.some(s=>s.codec_type==='audio'));
 if(kind==='attachment')
   assert.ok(input.streams.some(s=>s.codec_type==='attachment'));
 else {
   assert.ok(input.streams.some(s=>s.codec_type==='audio'&&s.codec_name===raw.expectedAudioCodec),
     'long PCM control must contain the actual declared multichannel media codec');
   manifest.nativeOriginalDurationSeconds=Number(input.format?.duration);
   assert.ok(manifest.nativeOriginalDurationSeconds>=raw.mediaDurationSeconds-2,
     'genuine timed PCM source unexpectedly short');
 }
 await mark('native-input-validated',{streamKinds:input.streams.map(s=>s.codec_type),kind});
 sampler=setInterval(sampleMemory,2500);
 browser=await chromium.launch({
   headless:true,
   ...(process.env.E2E_BROWSER_EXECUTABLE ?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{})
 });
 manifest.chromiumVersion=browser.version();
 context=await browser.newContext({acceptDownloads:true});
 page=await context.newPage();
 page.setDefaultTimeout(120_000);
 page.on('crash',()=>{manifest.crashObserved=true;console.error('S12_BROWSER_RENDERER_CRASH');});
 page.on('pageerror',err=>{manifest.lastPageError=String(err);});
 const url=new URL(process.env.E2E_BASE_URL||'http://127.0.0.1:4173/');
 url.searchParams.delete('ui');
 await page.goto(url.toString(),{waitUntil:'networkidle',timeout:120_000});
 manifest.userAgent=await page.evaluate(()=>navigator.userAgent);
 await page.locator('#sf14Root').waitFor();
 const ass=path.join(dir,'s12-test-subtitle.ass');
 await fs.writeFile(ass,[
  '[Script Info]','ScriptType: v4.00+','PlayResX: 640','PlayResY: 360',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,26,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.10,0:00:01.50,Default,,0,0,0,,S12 REAL BYTES',
 ].join('\n')+'\n');
 await mark('browser-real-source-intake');
 await page.setInputFiles('#unifiedAssetInput',[source,ass],{timeout:120_000});
 await page.waitForFunction(expected=>document.querySelector('#videoInput')?.files?.[0]?.size===expected,
  raw.sourceBytes,{timeout:120_000});
 const expectedWarning=raw.sourceBytes>1_000_000_000;
 const warn=page.locator('#sf14SourceSizeWarning [data-source-size-warning]');
 await page.waitForFunction(flag=>Boolean(document.querySelector('#sf14SourceSizeWarning [data-source-size-warning]'))===flag,
  expectedWarning,{timeout:120_000});
 assert.equal(await warn.count(),expectedWarning?1:0);
 if(expectedWarning){
  await warn.locator('summary').click();
  assert.match(await warn.textContent(),/允许继续尝试封装/);
 }
 await mark('source-advisory-checked',{warned:expectedWarning});
 // Real source probe is part of the claimed path: do not skip the memory
 // cost and do not force-enable a blocked executor.
 await page.waitForFunction(()=>{
  const s=document.querySelector('#status')?.textContent||'';
  if(s.startsWith('轨道扫描完成：'))return true;
  if(s.startsWith('轨道扫描失败')||s.startsWith('失败：')||
     s.includes('没有确认任何实际轨道')||
     s.includes('SOURCE_PROBE_EMPTY_STREAMS')||
     s.startsWith('浏览器 / WebAssembly 可用内存不足')||
     s.includes('当前任务没有完成'))
    throw Error('S12_SOURCE_PROBE_TERMINAL_FAILURE: '+s);
  return false;
 },null,{timeout:360_000});
 const scanStatus=await page.locator('#status').textContent();
 const scannedCount=Number(scanStatus?.match(/轨道扫描完成：(\d+) 个流/)?.[1]??0);
 const selectedSource=await page.locator('#videoInput').evaluate(el=>({
  bytes:el.files?.[0]?.size??0,name:el.files?.[0]?.name??null,
 }));
 manifest.scannedStreamCount=scannedCount;
 manifest.sourceSelection=selectedSource;
 const sourceLog=await page.locator('#log').textContent();
 manifest.probeSourceStaging=/来源扫描输入策略：(workerfs|memfs)/.exec(sourceLog||'')?.[1]??'not-recorded';
 await mark('browser-source-probe-completed',{
  status:scanStatus,scannedStreamCount:scannedCount,
  sourceStaging:manifest.probeSourceStaging,
  preservationStatus:await page.locator('#preservationReadiness').getAttribute('data-status')
 });
 const minExpectedStreams=kind==='pcm'?2:3;
 assert.ok(scannedCount>=minExpectedStreams,
  'S12_SCAN_EMPTY_OR_INCOMPLETE: native valid '+kind+' source should have at least '+
  minExpectedStreams+' observed browser streams; got '+scannedCount+
  '. Must not treat an incomplete ffprobe inventory as a successful scan');
 // The content-bound preservation preflight runs asynchronously after the
 // source scanner. Even a 1 GB File can report "2 streams" while the
 // independent structure/attachment gate is still checking. Never bypass it
 // or count that transient disabled control as a product hard size limit.
 await page.waitForFunction(()=>{
   const gate=document.querySelector('#preservationReadiness')?.getAttribute('data-status');
   const btn=document.querySelector('#muxBtn');
   const status=document.querySelector('#status')?.textContent||'';
   if(status.startsWith('失败：')||status.includes('当前任务没有完成'))
     throw Error('S12_PRESERVATION_PREVIEW_TERMINAL_FAILURE: '+status);
   if(gate==='blocked')return true;
   return (gate==='warning'||gate==='clear') && !!btn && !btn.disabled;
 },null,{timeout:180_000});
 const gateStatus=await page.locator('#preservationReadiness').getAttribute('data-status');
 const forbidden=await page.locator('#muxBtn').isDisabled();
 manifest.preservationGateAtMuxStart=gateStatus;
 await mark('preservation-gate-settled',{gateStatus,muxDisabled:forbidden});
 assert.equal(forbidden,false,
   'S12_PRESERVATION_GATE_BLOCK: tested source must pass actual independent safety gate, never force a disabled mux');
 await mark('real-wasm-mux-start');
 progressSampler=setInterval(()=>{void inspectBrowserProgress()},10_000);
 await page.locator('#muxBtn').click();
 await inspectBrowserProgress();
 await page.waitForFunction(()=>{
  const s=document.querySelector('#status')?.textContent||'';
  if(s.startsWith('完成。'))return true;
  if(s.startsWith('失败：')||s.startsWith('媒体结构探测失败')||
     s.includes('当前任务没有完成')||s.includes('没有生成可保存的成品'))
    throw Error('S12_MUX_EXPLICIT_FAILURE: '+s);
  return false;
 },null,{timeout:480_000});
 clearInterval(progressSampler);progressSampler=null;
 await mark('browser-mux-completed',{status:await page.locator('#status').textContent()});
 const [dl]=await Promise.all([
  page.waitForEvent('download',{timeout:120_000}),
  page.locator('#downloadLink').click({timeout:120_000})
 ]);
 await dl.saveAs(out);
 assert.ok((await fs.stat(out)).size>0);
 manifest.outputBytes=(await fs.stat(out)).size;
 manifest.outputSha256=await shaFile(out);
 await mark('browser-output-downloaded',{outputBytes:manifest.outputBytes});
 const report=page.locator('#reportLink');
 if(await report.isVisible()){
  const [r]=await Promise.all([page.waitForEvent('download'),report.click()]);
  await r.saveAs(reportPath);
  manifest.reportFile=path.basename(reportPath);
 }
 const output=probe(out);
 const kinds=output.streams.map(s=>s.codec_type);
 assert.ok(kinds.includes('video'),'native final video missing');
 assert.ok(kinds.includes('audio'),'native final audio missing');
 assert.ok(kinds.includes('subtitle'),'new subtitle not delivered');
 const attachments=output.streams.filter(s=>s.codec_type==='attachment');
 if(kind==='attachment')assert.ok(attachments.length>=raw.attachmentCount,
   'native output has lost a genuine original Matroska attachment');
 if(kind==='pcm'){
   assert.ok(output.streams.some(s=>s.codec_type==='audio'&&s.codec_name===raw.expectedAudioCodec),
     'timed PCM audio codec was not delivered');
   manifest.nativeOutputDurationSeconds=Number(output.format?.duration);
   assert.ok(manifest.nativeOutputDurationSeconds>=raw.mediaDurationSeconds-2,
     'finished output lost a significant part of the true timed audio packets');
 }
 await mark('native-finished-streams-validated',{kinds,kind,
   inputDuration:manifest.nativeOriginalDurationSeconds,
   outputDuration:manifest.nativeOutputDurationSeconds});
 if(kind==='attachment'){
 const mkv=JSON.parse(execFileSync('mkvmerge',['-J',out],
   {encoding:'utf8',timeout:120_000,maxBuffer:5*1024*1024}));
 const extractArgs=['attachments',out];
 for(const part of raw.attachments){
  const att=mkv.attachments?.find(x=>x.file_name===part.name);
  assert.ok(att&&Number.isSafeInteger(att.id),
   'native mkvmerge did not locate preserved attachment '+part.name);
  extractArgs.push(String(att.id)+':'+path.join(dir,'s12-extracted-'+part.name));
 }
 // Extract all original attachments in ONE pass. Restarting mkvextract for
 // every 64 MiB element would rescan the full 1.2 GB input many times.
 execFileSync('mkvextract',extractArgs,{timeout:240_000,stdio:'ignore'});
 const joined=createHash('sha256');
 let total=0;
 manifest.extractedAttachmentChecks=[];
 for(const part of raw.attachments){
  const file=path.join(dir,'s12-extracted-'+part.name);
  const size=(await fs.stat(file)).size;
  const digest=await shaFile(file);
  assert.equal(size,part.bytes,'large source attachment byte length drift '+part.name);
  assert.equal(digest,part.sha256,'large source attachment SHA drift '+part.name);
  const input=createReadStream(file);
  for await(const bytes of input)joined.update(bytes);
  total+=size;
  manifest.extractedAttachmentChecks.push({name:part.name,bytes:size,sha256:digest});
 }
 manifest.extractedPayloadBytes=total;
 manifest.extractedPayloadSha256=joined.digest('hex');
 assert.equal(total,raw.payloadBytes,'combined original payload byte length changed');
 assert.equal(manifest.extractedPayloadSha256,raw.payloadSha256,
   'ordered aggregate original payload SHA-256 changed');
 await mark('native-extracted-attachment-full-sha256-pass');
 }
 // Independent on-disk structure validation observes actual downloaded MKV,
 // not the worker's in-memory Blob, and does not equate two relocated offsets.
 // Only a proven contradictory pointer or CRC is a hard failure; a missing
 // index / incomplete index remains explicitly UNVERIFIED and never becomes
 // a writer, packet, UID or durable-save certification.
 const [nativeInputBlob,nativeFinishedBlob]=await Promise.all([
   openAsBlob(source,{type:'video/x-matroska'}),
   openAsBlob(out,{type:'video/x-matroska'}),
 ]);
 const finishedIndexes=await auditS12FinishedIndexEvidence({
   source:nativeInputBlob,finished:nativeFinishedBlob,
 });
 const small=(e)=>e && ({
   seekStatus:e.seekStatus,cuesStatus:e.cuesStatus,
   seekReferences:e.seekReferences,seekMatched:e.seekMatched,
   cueReferences:e.cueReferences,cueMatched:e.cueMatched,
   seekComplete:e.seekComplete,cuesComplete:e.cuesComplete,
   seekReasonsCount:e.seekReasons.length,seekReasonsSample:e.seekReasons.slice(0,6),
   cueReasonsCount:e.cueReasons.length,cueReasonsSample:e.cueReasons.slice(0,6),
 });
 manifest.independentFinishedIndexEvidence={
   schema:finishedIndexes.schema,status:finishedIndexes.status,
   source:small(finishedIndexes.source),finished:small(finishedIndexes.finished),
   errors:finishedIndexes.errors,
   writerAuthorized:finishedIndexes.writerAuthorized,
   publicationAuthorized:finishedIndexes.publicationAuthorized,
   remuxEquivalenceProven:finishedIndexes.remuxEquivalenceProven,
   savedFileVerified:finishedIndexes.savedFileVerified,
 };
 await mark('native-finished-index-structure-audited',{
   status:finishedIndexes.status,
   sourceSeek:finishedIndexes.source?.seekStatus,
   finishedSeek:finishedIndexes.finished?.seekStatus,
   sourceCues:finishedIndexes.source?.cuesStatus,
   finishedCues:finishedIndexes.finished?.cuesStatus,
   finishedIndexErrors:finishedIndexes.errors,
 });
 assert.notEqual(finishedIndexes.status,'FINISHED_INDEX_CONTRADICTION',
   'S12_FINISHED_INDEX_PROVEN_INVALID: '+finishedIndexes.errors.join('; '));
 assert.notEqual(finishedIndexes.status,'FINISHED_INDEX_PROBE_FAILED',
   'S12_FINISHED_INDEX_PROBE_FAILED: '+finishedIndexes.errors.join('; '));
 assert.notEqual(finishedIndexes.status,'NOT_RUN_INVALID_FILE_AUTHORITY');
 assert.equal(finishedIndexes.writerAuthorized,false);
 assert.equal(finishedIndexes.publicationAuthorized,false);

 // RFC 9559: a CueTrack pointing to the right Cluster is not yet proof
 // that the referenced TrackNumber exists or that the Cluster has a Block
 // for it. Run an additional bounded, header-only oracle on the ORIGINAL
 // and the ACTUAL browser-downloaded file, with independent observations.
 const [sourceBlocks,outputBlocks]=await Promise.all([
   inspectS12CueTrackBlockEvidence(nativeInputBlob),
   inspectS12CueTrackBlockEvidence(nativeFinishedBlob),
 ]);
 const narrow=report=>({
   status:report.status,checked:report.checkedReferences,
   total:report.totalReferences,clusters:report.distinctReferencedClusters,
   tracks:report.trackNumbers,
   reasonCount:report.reasons.length,reasons:report.reasons.slice(0,8),
   writerAuthorized:report.writerAuthorized,
   actualPacketPayloadVerified:report.actualPacketPayloadVerified,
 });
 manifest.independentCueTrackBlockEvidence={
   source:narrow(sourceBlocks),finished:narrow(outputBlocks),
   cueTimeVerified:false,packetPayloadVerified:false,
 };
 await mark('native-cue-track-block-headers-audited',{
   source:manifest.independentCueTrackBlockEvidence.source,
   finished:manifest.independentCueTrackBlockEvidence.finished,
 });
 assert.equal(sourceBlocks.writerAuthorized,false);
 assert.equal(outputBlocks.writerAuthorized,false);
 assert.equal(sourceBlocks.actualPacketPayloadVerified,false);
 assert.equal(outputBlocks.actualPacketPayloadVerified,false);
 // These three specified genuine positive fixture classes must prove actual
 // CueTrack -> Tracks -> Cluster Block headers, not just index pointers.
 // Unknown or budget-limited results FAIL the scoped acceptance without
 // implying general Matroska corruption or a writer hard size limit.
 assert.equal(sourceBlocks.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED',
   'S12_SOURCE_CUE_TRACK_BLOCK_UNVERIFIED: '+sourceBlocks.reasons.join(';'));
 assert.equal(outputBlocks.status,'CUE_TRACK_BLOCK_HEADERS_VERIFIED',
   'S12_FINISHED_CUE_TRACK_BLOCK_UNVERIFIED: '+outputBlocks.reasons.join(';'));
 assert.equal(sourceBlocks.checkedReferences,sourceBlocks.totalReferences);
 assert.equal(outputBlocks.checkedReferences,outputBlocks.totalReferences);

 // RESEARCH-ONLY feasibility check. Refusal must NOT be mislabeled as a
 // successful repair, and a successful zero-relocation Blob must NEVER be
 // published or substituted for the actual user's downloaded MKV.
 // The repairer itself proves CRC and SeekHead coverage, unchanged Cues
 // locations, and an exactly equal total file size.
 const [sourceRepair,finishedRepair]=await Promise.all([
   planS12VoidResidentSeekHeadRepair(nativeInputBlob),
   planS12VoidResidentSeekHeadRepair(nativeFinishedBlob),
 ]);
 const boundedRepair=r=>({
   status:r.status,
   reasonCodes:r.reasons.slice(0,8),
   refusalReasonCount:r.reasons.length,
   reservedBytes:r.reservedBytes??null,
   requiredBytes:r.requiredBytes??null,
   missingBytes:r.missingBytes??null,
   remainingVoidBytes:r.remainingVoidBytes??null,
   indexedElementCount:r.indexedElementCount??null,
   sourceIndexStatus:r.sourceIndexStatus??null,
   resultIndexStatus:r.resultIndexStatus??null,
   writerAuthorized:r.writerAuthorized,
   publicationAuthorized:r.publicationAuthorized,
 });
 manifest.seekHeadVoidOnlyResearch={
   source:boundedRepair(sourceRepair),
   finished:boundedRepair(finishedRepair),
   noFileWasReplaced:true,
   noResearchBlobWasDownloaded:true,
 };
 await mark('native-void-resident-seekhead-repair-feasibility-observed',
   manifest.seekHeadVoidOnlyResearch);
 for(const r of [sourceRepair,finishedRepair]){
   assert.ok(['REFUSED','NOT_NEEDED','RESEARCH_BLOB_SCOPED_VALIDATED']
     .includes(r.status),'S12_RESEARCH_REPAIR_INVALID_STATUS: '+r.status);
   assert.equal(r.writerAuthorized,false);
   assert.equal(r.publicationAuthorized,false);
   if(r.status==='RESEARCH_BLOB_SCOPED_VALIDATED'){
     assert.equal(r.sourceSize,r.resultSize);
     assert.equal(r.resultIndexStatus,'INDEX_REFERENCES_VERIFIED');
     assert.ok(r.reservedBytes>=r.newHeadBytes);
     assert.ok(r.researchBlob instanceof Blob);
   }
 }
 assert.equal(await shaFile(source),manifest.inputSha256,
   'original large source must remain byte-identical');
 manifest.result='PASS_THIS_TIER';
 manifest.endedAt=new Date().toISOString();
 await mark('done');
 console.log('S12 REAL SOURCE + OUTPUT + NATIVE BYTES PASS '+tier);
}catch(error){
 manifest.result='FAIL_THIS_TIER';
 manifest.error={message:error?.message||String(error),stack:String(error?.stack||'')?.slice(0,5000)};
 manifest.lastBrowserStatus=page?
   await page.locator('#status').textContent().catch(()=>'(status inaccessible)'):null;
 manifest.lastBrowserLogTail=page?
   await page.locator('#log').textContent().then(s=>s?.slice(-4000)).catch(()=>'(log inaccessible)'):null;
 manifest.browserStageFailureClass=
   /Out of memory/i.test(manifest.lastBrowserLogTail||'')?'ffmpeg-wasm-internal-oom':
   /decoder context|Aborted\(\)/i.test(manifest.lastBrowserLogTail||'')?'ffmpeg-wasm-decoder-abort':
   /S12_SCAN_EMPTY_OR_INCOMPLETE|SOURCE_PROBE_EMPTY_STREAMS/.test(
      String(manifest.error?.message||'')+String(manifest.lastBrowserLogTail||''))?'empty-unverified-source-probe':
   /Timeout/.test(manifest.error?.message||'')?'deadline':
   'other';
 manifest.lastPreservationStatus=page?
   await page.locator('#preservationReadinessDescription').textContent().catch(()=>null):null;
 manifest.endedAt=new Date().toISOString();
 await persist();
 console.error('S12 REAL SOURCE TEST FAILED at '+manifest.phase,manifest.error);
 process.exitCode=1;
}finally{
 clearInterval(progressSampler);
 clearInterval(sampler);
 sampleMemory();
 await persist();
 await context?.close().catch(()=>{});
 await browser?.close().catch(()=>{});
}
