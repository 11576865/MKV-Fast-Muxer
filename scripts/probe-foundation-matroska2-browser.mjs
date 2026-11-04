/**
 * Real Chromium experiment for the pinned Matroska Foundation C libraries.
 * Runs their actual mkvtree.wasm in a browser's WASM VM/virtual FS against
 * an independent MKV, NOT in Node's Emscripten runtime.
 * No production application code, UI, or third-party binary is modified.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {parseMkvmergeJsonWithExactUids,exactPositiveUid} from '../src/mkvmerge-exact-uid-json.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaFile=async file=>{
  const hasher=createHash('sha256');
  for await(const chunk of createReadStream(file))hasher.update(chunk);
  return hasher.digest('hex');
};
const js=path.resolve(process.env.FOUNDATION_WASM_JS||
  '.e2e/foundation-build/libmatroska2/mkvtree.js');
const wasm=path.join(path.dirname(js),'mkvtree.wasm');
const structuredJs=path.resolve(process.env.FOUNDATION_STRUCTURED_WASM_JS||
  '.e2e/foundation-build/libmatroska2/foundation_json_probe.js');
const structuredWasm=path.join(path.dirname(structuredJs),'foundation_json_probe.wasm');
const fixture=path.resolve(process.env.FOUNDATION_FIXTURE||
  '.e2e/fixtures/p0-independent-mkvtoolnix.mkv');
const largeFixture=path.resolve(process.env.FOUNDATION_LARGE_FIXTURE||
  '.e2e/fixtures/foundation-large-attachment.mkv');
const reportFile=path.resolve(process.env.FOUNDATION_BROWSER_REPORT||
  '.e2e/output/foundation-matroska2-chromium-probe.json');
const report={
  schema:'matroska-foundation-libmatroska2-real-chromium-read-v1',
  result:'NOT_RUN',browserExecuted:false,productRuntimeIntegrated:false,
  sourceModified:false,thirdPartyRuntimeShipped:false,
};
await fs.mkdir(path.dirname(reportFile),{recursive:true});
let server=null,browser=null;
try {
  const [jsBytes,wasmBytes,sourceBytes,structuredJsBytes,
    structuredWasmBytes,independentInfo,workerJsBytes,observerJsBytes]=await Promise.all([
    fs.readFile(js),fs.readFile(wasm),fs.readFile(fixture),
    fs.readFile(structuredJs),fs.readFile(structuredWasm),
    fs.readFile('.e2e/output/foundation-reference-mkvmerge.json','utf8')
      .then(parseMkvmergeJsonWithExactUids),
    fs.readFile('scripts/workers/foundation-matroska-worker.js'),
    fs.readFile('src/foundation-structure-observation.js'),
  ]);
  const sourceSha=sha(sourceBytes);
  report.sourceSha256=sourceSha;
  report.wasmSha256=sha(wasmBytes);
  report.structuredWasmSha256=sha(structuredWasmBytes);
  report.sourceBytes=sourceBytes.length;

  const serve={
    '/mkvtree.js':{data:jsBytes,type:'text/javascript'},
    '/mkvtree.wasm':{data:wasmBytes,type:'application/wasm'},
    '/foundation-json.js':{data:structuredJsBytes,type:'text/javascript'},
    '/foundation_json_probe.wasm':{data:structuredWasmBytes,type:'application/wasm'},
    '/foundation-worker.js':{data:workerJsBytes,type:'text/javascript'},
    '/foundation-structure-observation.js':{data:observerJsBytes,type:'text/javascript'},
    '/':{data:Buffer.from('<!doctype html><meta charset="utf-8"><title>Foundation WASM read audit</title><input id="source" type="file">'),
      type:'text/html; charset=utf-8'},
  };
  // Serve the actual existing product reader with its normal module
  // imports; the browser test must cross the integration seam rather than
  // succeed through a standalone observer-only demonstration.
  for(const name of [
    'matroska-attachment-reader','foundation-structure-observation',
    'foundation-wasm-json-abi','foundation-attachment-inventory',
    'source-asset-session','output-composition','container-tree',
    'preservation-preflight','matroska-attachment-relation-graph',
  ]){
    serve['/src/'+name+'.js']={
      data:await fs.readFile('src/'+name+'.js'),
      type:'text/javascript',
    };
  }
  server=createServer((req,res)=>{
    const row=serve[req.url||''];
    if(!row){res.writeHead(404);res.end();return;}
    res.writeHead(200,{
      'Content-Type':row.type,'Cache-Control':'no-store',
      'Cross-Origin-Resource-Policy':'same-origin',
    });
    res.end(row.data);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const addr=server.address();
  assert.ok(addr && typeof addr==='object');
  const origin='http://127.0.0.1:'+addr.port;
  const executablePath=process.env.FOUNDATION_CHROMIUM_EXECUTABLE||undefined;
  browser=await chromium.launch({
    headless:true,executablePath,args:['--no-sandbox'],
  });
  // Extract the attachment using the independent native MKVToolNix binary,
  // never through either JS inspector. Its SHA is the external byte oracle.
  const attachmentRef=independentInfo.attachments?.[0];
  if(!attachmentRef||!Number.isSafeInteger(attachmentRef.id) ||
     attachmentRef.id<1)throw Error('NATIVE_ATTACHMENT_REFERENCE_MISSING');
  const nativeExtracted=path.resolve(
    '.e2e/output/foundation-independent-native-extracted.bin');
  execFileSync('mkvextract',['attachments',fixture,
    String(attachmentRef.id)+':'+nativeExtracted],{timeout:30000});
  const nativeExtractedBytes=await fs.readFile(nativeExtracted);
  if(nativeExtractedBytes.length!==attachmentRef.size)
    throw Error('NATIVE_ATTACHMENT_OUTPUT_SIZE_MISMATCH');
  const nativeAttachmentSha=sha(nativeExtractedBytes);
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(origin+'/');
  // A real Chromium File is passed to the Worker by structured clone;
  // unlike the legacy MEMFS baseline below, it is not base64-decoded
  // or fully transferred through JS to the native WASM heap.
  await page.locator('#source').setInputFiles({
    name:'independent.mkv',
    mimeType:'video/x-matroska',
    buffer:sourceBytes,
  });
  await page.addScriptTag({url:origin+'/mkvtree.js'});
  await page.addScriptTag({url:origin+'/foundation-json.js'});
  report.browserExecuted=true;

  const result=await page.evaluate(async base64=>{
    if(typeof window.createFoundationMkvtree!=='function'||
       typeof window.createFoundationJSON!=='function')
      throw Error('NO_BROWSER_EMSCRIPTEN_FACTORY');
    const stdout=[],stderr=[];
    const createModule=window.createFoundationMkvtree;
    const start=performance.now();
    const m=await createModule({
      locateFile:name=>new URL('/'+name,location.origin).href,
      print:s=>stdout.push(String(s)),
      printErr:s=>stderr.push(String(s)),
      noInitialRun:true,
    });
    if(typeof m.callMain!=='function'||!m.FS?.writeFile)
      throw Error('BROWSER_WASM_EXPORTS_MISSING');
    const source=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    m.FS.writeFile('/independent.mkv',source);
    const original=m.FS.readFile('/independent.mkv');
    if(original.byteLength!==source.byteLength ||
       original.some((b,i)=>b!==source[i]))
      throw Error('BROWSER_WASM_VIRTUAL_FS_DID_NOT_RETAIN_INPUT');
    const status=m.callMain(['/independent.mkv']);
    const text=stdout.join('\n');
    const structuredModule=await window.createFoundationJSON({
      locateFile:name=>new URL('/'+name,location.origin).href,
      noInitialRun:true,
    });
    if(!structuredModule.FS?.writeFile||!structuredModule.ccall)
      throw Error('BROWSER_STRUCTURED_C_ABI_MISSING');
    structuredModule.FS.writeFile('/independent.mkv',source);
    const {readFoundationWasmStructure}=await import(
      '/src/foundation-wasm-json-abi.js');
    const structured=readFoundationWasmStructure(
      structuredModule,'/independent.mkv');
    // A completed call has no retained C JSON. Failures cannot expose the
    // previous result, and the same Module can recover for the next call.
    const empty=structuredModule.ccall('foundation_json_length','number',[],[]);
    if(empty!==0||structuredModule.ccall('foundation_json','string',[],[])!=='')
      throw Error('FOUNDATION_NATIVE_JSON_NOT_RELEASED');
    try {
      readFoundationWasmStructure(structuredModule,'/source-does-not-exist.mkv');
      throw Error('FOUNDATION_ABI_BROKEN_INPUT_WAS_ACCEPTED');
    } catch(error) {
      if(error.message!=='FOUNDATION_ABI_PROBE_FAILED_13')throw error;
    }
    if(structuredModule.ccall('foundation_json_length','number',[],[])!==0)
      throw Error('FOUNDATION_ABI_FAILED_CALL_LEAKED_RESULT');
    const second=readFoundationWasmStructure(
      structuredModule,'/independent.mkv');
    if(JSON.stringify(second)!==JSON.stringify(structured))
      throw Error('FOUNDATION_ABI_REPEATED_RESULT_CHANGED');
    if(structured.schema!=='foundation-matroska-structured-tree-v0'||
       !Array.isArray(structured.nodes)||!structured.nodes.length)
      throw Error('FOUNDATION_STRUCTURED_SCHEMA_INVALID');
    return {
      exitCode:status??0,
      elapsedMs:Math.round(performance.now()-start),
      output:text,
      stderr:stderr.join('\n'),
      browserUserAgent:navigator.userAgent,
      sourceBufferLength:source.byteLength,
      structured,
    };
  },sourceBytes.toString('base64'));
  // Proof of the intended production I/O shape: the official C parser
  // mounts the browser's File as WORKERFS inside a genuine dedicated Worker,
  // and synchronously fetches only the Blob slices requested by native I/O.
  const probeWorker=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const file=document.querySelector('#source')?.files?.[0];
    if(!file){reject(Error('FILE_INPUT_NOT_FOUND'));return;}
    const worker=new Worker('/foundation-worker.js');
    let finished=false;
    const complete=(callback,value)=>{
      if(finished)return;
      finished=true;clearTimeout(timeout);worker.terminate();callback(value);
    };
    const timeout=setTimeout(()=>
      complete(reject,Error('WORKERFS_PROBE_TIMEOUT')),60000);
    worker.onerror=event=>
      complete(reject,Error('WORKERFS_FATAL_'+event.message));
    worker.onmessage=event=>{
      const result=event.data;
      if(!result?.ok)
        complete(reject,Error('WORKERFS_READ_FAILED_'+result?.error));
      else complete(resolve,result);
    };
    worker.postMessage({type:'probe',file});
  }));
  const lazy=await probeWorker();
  if(JSON.stringify(lazy.structured)!==JSON.stringify(result.structured))
    throw Error('WORKERFS_VS_MEMFS_STRUCTURED_TREE_MISMATCH');
  if(!lazy.workerStats.usedWorkerFS||
     lazy.workerStats.stagedEntireFileInMemfs||
     lazy.workerStats.fileBytes!==sourceBytes.length||
     lazy.workerStats.fileReaderSyncCalls<1)
    throw Error('WORKERFS_LAZY_FILE_ACCESS_NOT_PROVEN');
  report.workerFSReadOnly=true;
  report.workerFSStructuredParity=true;
  report.workerFSAccess=lazy.workerStats;

  // Cross the production adapter, not only the stand-alone research Worker.
  // The same real browser File and already-tested C/WASM Worker are used,
  // while the product's source-bound observer owns termination and contracts.
  const productBridge=await page.evaluate(async()=>{
    const {createFoundationStructureObserver}=await import(
      '/foundation-structure-observation.js');
    const file=document.querySelector('#source')?.files?.[0];
    if(!file)throw Error('PRODUCT_ADAPTER_FILE_INPUT_MISSING');
    const bridge=createFoundationStructureObserver({
      file,source:{id:'browser-current-source'},
      workerFactory:()=>new Worker('/foundation-worker.js'),
      isCurrent:()=>document.querySelector('#source')?.files?.[0]===file,
    });
    try {
      const observation=await bridge.inspect();
      return {
        nodes:observation.nodes,uids:observation.uids,
        writerAuthorization:observation.claims.writerAuthorization,
        sourceBytes:observation.workerFS.sourceBytes,
      };
    } finally { bridge.dispose(); }
  });
  assert.deepEqual(productBridge.nodes,result.structured.nodes,
    'PRODUCT_ADAPTER_STRUCTURED_OUTPUT_MISMATCH');
  if(productBridge.writerAuthorization!==false||
     productBridge.sourceBytes!==sourceBytes.length)
    throw Error('PRODUCT_ADAPTER_CLAIM_OR_SOURCE_IDENTITY_INVALID');
  report.structuredCAbiVersioned=true;
  report.structuredCAbiReleaseChecked=true;
  report.structuredCAbiFailureRecoveryChecked=true;
  report.productAdapterInvokedInChromium=true;
  report.productAdapterConsistentWithNative=true;
  const existingReader=await page.evaluate(async()=>{
    const {createMatroskaAttachmentReader}=await import(
      '/src/matroska-attachment-reader.js');
    const file=document.querySelector('#source')?.files?.[0];
    if(!file)throw Error('EXISTING_READER_INPUT_MISSING');
    const reader=createMatroskaAttachmentReader(file,{
      foundationWorkerFactory:()=>new Worker('/foundation-worker.js'),
    });
    const inventory=await reader.inspect();
    if(inventory.state!=='inspected')
      throw Error('EXISTING_READER_REFUSED_'+inventory.diagnostic?.code);
    const observed=await reader.inspectFoundationStructure(inventory,{
      isCurrent:()=>document.querySelector('#source')?.files?.[0]===file,
    });
    if(!reader.isCurrentInspection(inventory)||
       observed.source!==reader.source||
       observed.claims.writerAuthorization!==false)
      throw Error('EXISTING_READER_IDENTITY_OR_READ_ONLY_CONTRACT_VIOLATED');
    return {attachmentUids:inventory.attachments.map(a=>a.fileUid),
      officialAttachmentUids:observed.uids.FileUID||[],
      nodeCount:observed.nodeCount,sourceId:observed.source.id};
  });
  if(existingReader.nodeCount!==result.structured.nodes.length||
     !existingReader.attachmentUids.length||
     JSON.stringify(existingReader.attachmentUids.slice().sort())!==
       JSON.stringify(existingReader.officialAttachmentUids.slice().sort()))
    throw Error('EXISTING_READER_VS_OFFICIAL_WASM_FILEUID_MISMATCH');
  report.existingProductReaderFoundationIntegrationPassed=true;
  report.existingProductReaderAttachmentCount=existingReader.attachmentUids.length;
  // This is a genuine *alternative production read backend*, not an extra
  // verification step. It must create the same attachment list and raw Blob
  // extraction ranges without the product's legacy EBML header traversal.
  const primaryParity=await page.evaluate(async(nativeSha)=>{
    const {createMatroskaAttachmentReader}=await import(
      '/src/matroska-attachment-reader.js');
    const file=document.querySelector('#source')?.files?.[0];
    const make=()=>new Worker('/foundation-worker.js');
    const legacyReader=createMatroskaAttachmentReader(file);
    const primaryReader=createMatroskaAttachmentReader(file,{
      inspectionBackend:'foundation-primary',
      foundationWorkerFactory:make,
    });
    const legacy=await legacyReader.inspect();
    const primary=await primaryReader.inspect();
    if(legacy.state!=='inspected'||primary.state!=='inspected')
      throw Error('PRIMARY_INVENTORY_UNVERIFIED_'+primary.diagnostic?.code+
        '_LEGACY_'+legacy.diagnostic?.code);
    const normalize=x=>x.attachments.map(a=>({
      id:a.id,ordinal:a.ordinal,filename:a.filename,mimeType:a.mimeType,
      description:a.description,fileUid:a.fileUid,byteLength:a.byteLength,
      dataRange:a.dataRange,
    }));
    if(JSON.stringify(normalize(legacy))!==JSON.stringify(normalize(primary)))
      throw Error('PRIMARY_VS_LEGACY_ATTACHMENT_FIELDS_DIFFER');
    if(JSON.stringify(legacy.structure)!==JSON.stringify(primary.structure))
      throw Error('PRIMARY_VS_LEGACY_STRUCTURE_DIFFER');
    for(const [i,attachment] of primary.attachments.entries()){
      const nativeBytes=new Uint8Array(await primaryReader.openAttachment(
        attachment.id).data.arrayBuffer());
      const legacyBytes=new Uint8Array(await legacyReader.openAttachment(
        legacy.attachments[i].id).data.arrayBuffer());
      if(i===0){
        const hex=Array.from(new Uint8Array(await crypto.subtle.digest(
          'SHA-256',nativeBytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
        if(hex!==nativeSha)
          throw Error('FOUNDATION_EXTRACTED_ATTACHMENT_NOT_NATIVE_MKVEXTRACT');
      }
      if(nativeBytes.length!==legacyBytes.length ||
         nativeBytes.some((value,k)=>value!==legacyBytes[k]))
        throw Error('PRIMARY_VS_LEGACY_EXTRACTED_FILEDATA_DIFFER');
    }
    if(primary.scanning.structureBackend!=='foundation-libmatroska-c-wasm'||
       primary.scanning.fileDataBytesRead!==0||
       primary.scanning.headerCount!==0)
      throw Error('PRIMARY_PATH_NOT_ACTUALLY_SELECTED');
    return {attachmentCount:primary.attachments.length,
      independentlyExtractedSha256:nativeSha,
      exactFileUids:primary.attachments.map(a=>a.fileUid),
      sourceIdentityMatches:primaryReader.isCurrentInspection(primary),
      byteRangeParity:true,
      legacyScannerHeaderCalls:legacy.scanning.headerCount,
      primaryScannerHeaderCalls:primary.scanning.headerCount};
  },nativeAttachmentSha);
  if(!primaryParity.sourceIdentityMatches||
     primaryParity.attachmentCount!==existingReader.attachmentUids.length||
     primaryParity.legacyScannerHeaderCalls<1)
    throw Error('PRIMARY_INVENTORY_AUTHORITY_OR_DIFF_INVALID');
  report.foundationPrimaryInventoryAgainstLegacy=primaryParity;
  report.foundationPrimaryAttachmentReadBackendPassed=true;
  report.foundationPrimaryIndependentMkvextractSha256=nativeAttachmentSha;


  // File names belong to users, not to the parser: a valid selected
  // Matroska with spaces/non-ASCII names must work without rewriting source
  // identity or enabling any path traversal.
  await page.locator('#source').setInputFiles({
    name:'作品 第1话 中文字幕.mkv',
    mimeType:'video/x-matroska',
    buffer:sourceBytes,
  });
  const internationalName=await probeWorker();
  assert.deepEqual(internationalName.structured,result.structured,
    'WORKERFS_UNICODE_FILENAME_CHANGED_PARSE_SEMANTICS');
  report.workerFSUnicodeFilenamePassed=true;

  // Independent high-volume MKV stress test: upload a real >96 MiB
  // Matroska File from disk directly into Chromium's file picker. The JS
  // harness never fs.readFile()s the large source, and the browser Worker
  // mounts the File via read-only WORKERFS. This proves bounded *observed*
  // reads for one large attachment; it does not prove all large MKVs.
  const beforeLarge=await fs.stat(largeFixture);
  const largeSha=await shaFile(largeFixture);
  const largeReference=parseMkvmergeJsonWithExactUids(
    await fs.readFile('.e2e/output/foundation-large-reference-mkvmerge.json','utf8'));
  if(beforeLarge.size<100000000)
    throw Error('LARGE_MKV_FIXTURE_TOO_SMALL');
  await page.locator('#source').setInputFiles(largeFixture);
  const large=await probeWorker();
  const largePrimaryParity=await page.evaluate(async()=>{
    const {createMatroskaAttachmentReader}=await import(
      '/src/matroska-attachment-reader.js');
    const file=document.querySelector('#source')?.files?.[0];
    const old=createMatroskaAttachmentReader(file);
    const modern=createMatroskaAttachmentReader(file,{
      inspectionBackend:'foundation-primary',
      foundationWorkerFactory:()=>new Worker('/foundation-worker.js'),
    });
    const legacy=await old.inspect(),primary=await modern.inspect();
    if(legacy.state!=='inspected'||primary.state!=='inspected')
      throw Error('LARGE_PRIMARY_UNVERIFIED_'+primary.diagnostic?.code);
    const key=x=>x.attachments.map(a=>[
      a.id,a.fileUid,a.filename,a.mimeType,a.description,
      a.byteLength,a.dataRange.offset,a.dataRange.length,
    ]);
    if(JSON.stringify(key(primary))!==JSON.stringify(key(legacy)))
      throw Error('LARGE_PRIMARY_ATTACHMENT_BYTES_OR_UID_NOT_EQUAL');
    // Do not load the >96MiB attachment; even extract parity only reads
    // a 32-byte head slice in addition to the native structural scans.
    for(const [i,a] of primary.attachments.entries()){
      const modernHead=await modern.openAttachment(a.id).data.slice(
        0,32).arrayBuffer();
      const legacyHead=await old.openAttachment(
        legacy.attachments[i].id).data.slice(0,32).arrayBuffer();
      if(JSON.stringify([...new Uint8Array(modernHead)])!==
         JSON.stringify([...new Uint8Array(legacyHead)]))
        throw Error('LARGE_PRIMARY_FILEDATA_PREFIX_MISMATCH');
    }
    return {attachments:primary.attachments.length,
      backend:primary.scanning.structureBackend,parity:true};
  });
  if(!largePrimaryParity.parity||
     largePrimaryParity.backend!=='foundation-libmatroska-c-wasm')
    throw Error('LARGE_PRIMARY_NOT_OFFICIAL');
  report.foundationPrimaryLargeFileParity=largePrimaryParity;

  const largeNames=large.structured.nodes.map(node=>node.name);
  const largeTracks=largeNames.filter(name=>name==='TrackEntry').length;
  const largeAttachments=largeNames.filter(name=>name==='AttachedFile').length;
  if(largeTracks!==(largeReference.tracks||[]).length||
     largeAttachments!==(largeReference.attachments||[]).length)
    throw Error('LARGE_WORKERFS_VS_MKVMERGE_OBJECT_COUNT_MISMATCH');
  if(!large.workerStats.usedWorkerFS||
     large.workerStats.stagedEntireFileInMemfs||
     large.workerStats.fileBytes!==beforeLarge.size||
     large.workerStats.fileReaderSyncCalls<1||
     large.workerStats.bytesRequested>=beforeLarge.size/100||
     large.workerStats.largestSliceBytes>=beforeLarge.size/100)
    throw Error('LARGE_WORKERFS_ACCESS_NOT_BOUNDED');
  const afterLarge=await fs.stat(largeFixture);
  if(afterLarge.size!==beforeLarge.size||
     await shaFile(largeFixture)!==largeSha)
    throw Error('LARGE_WORKERFS_SOURCE_MODIFIED');
  report.workerFSLargeFile={
    fileBytes:beforeLarge.size,
    sourceSha256:largeSha,
    parsedNodes:large.structured.nodes.length,
    trackCount:largeTracks,
    attachmentCount:largeAttachments,
    fileReaderSyncCalls:large.workerStats.fileReaderSyncCalls,
    bytesRequested:large.workerStats.bytesRequested,
    largestSliceBytes:large.workerStats.largestSliceBytes,
    sourceUnmodified:true,
    stagedEntireFileInMemfs:false,
  };

  const families={
    ebml:/ebml/i,segment:/segment/i,tracks:/tracks?/i,
    attachments:/attachments?/i,chapters:/chapters?/i,tags:/tags?/i,
  };
  const nodes=result.structured.nodes;
  if(result.structured.nodeCount!==nodes.length||
     nodes.length>8192||
     nodes.some(node=>typeof node.name!=='string'||
       typeof node.id!=='string'||
       !Number.isInteger(node.depth)||node.depth<0||
       typeof node.offset!=='string'||
       typeof node.endOffset!=='string'||
       typeof node.dataBytes!=='string'))
    throw Error('FOUNDATION_STRUCTURED_NODES_NOT_WELL_FORMED');
  // This is the graph-consistency gate missing from the initial prototype.
  // Every child must be physically contained in the parent identified by its
  // depth; a negative or stale CLI indentation must fail the test.
  const parents=[];
  let previousOffset=-1n,maxDepth=0;
  for(const node of nodes){
    if(!/^-?\d+$/.test(node.offset)||
       !/^-?\d+$/.test(node.endOffset))
      throw Error('STRUCTURED_WASM_OFFSET_NOT_DECIMAL');
    const start=BigInt(node.offset),end=BigInt(node.endOffset);
    if(start<0n||end<start||start<previousOffset||
       node.depth>parents.length)
      throw Error('STRUCTURED_WASM_FILE_ORDER_OR_DEPTH_INVALID');
    while(parents.length>node.depth)parents.pop();
    if(node.depth!==parents.length)
      throw Error('STRUCTURED_WASM_PARENT_MISSING');
    if(parents.length){
      const parent=parents.at(-1);
      if(start<parent.start||end>parent.end)
        throw Error('STRUCTURED_WASM_CHILD_OUTSIDE_PARENT');
    }
    previousOffset=start;
    maxDepth=Math.max(maxDepth,node.depth);
    if(node.master)parents.push({start,end});
  }
  if(maxDepth<3)
    throw Error('STRUCTURED_WASM_NESTED_CHAPTER_STRUCTURE_NOT_SEEN');
  report.structuredMaxDepth=maxDepth;
  report.structuredParentRangesValidated=true;
  report.structuredNameCounts=Object.fromEntries(
    [...new Set(nodes.map(node=>node.name))].map(name=>
      [name,nodes.filter(node=>node.name===name).length]));
  const expectedTypes=['EBMLHead','Segment','Tracks','Attachments',
    'Chapters','Tags','TrackEntry','AttachedFile'];
  for(const name of expectedTypes)
    if(!report.structuredNameCounts[name])
      throw Error('STRUCTURED_WASM_MISSING_'+name);
  if(report.structuredNameCounts.TrackEntry!==(independentInfo.tracks||[]).length||
     report.structuredNameCounts.AttachedFile!==(independentInfo.attachments||[]).length)
    throw Error('INDEPENDENT_MKVMERGE_NODE_COUNT_MISMATCH');
  // Full 64-bit identities must match the independent native mkvmerge JSON.
  // JSON.parse of raw UID numbers is unsafe; use the product's exact decimal
  // parser, then compare text IDs without a Number conversion.
  const values=name=>nodes.filter(node=>node.name===name)
    .map(node=>exactPositiveUid(node.uintValue));
  const sameUids=(left,right)=>
    JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
  const nativeTrackUids=(independentInfo.tracks||[])
    .map(track=>exactPositiveUid(track.properties?.uid));
  const nativeAttachmentUids=(independentInfo.attachments||[])
    .map(attachment=>exactPositiveUid(attachment.properties?.uid));
  const typedTracks=values('TrackUID');
  const typedAttachments=values('FileUID');
  const chapterUids=values('ChapterUID');
  const tagChapterUids=values('TagChapterUID');
  if(!sameUids(typedTracks,nativeTrackUids)||
     !sameUids(typedAttachments,nativeAttachmentUids)||
     typedTracks.length!==(independentInfo.tracks||[]).length||
     typedAttachments.length!==(independentInfo.attachments||[]).length)
    throw Error('STRUCTURED_WASM_LOSSLESS_UID_ORACLE_MISMATCH');
  if(chapterUids.length<2||!tagChapterUids.length||
     !tagChapterUids.every(uid=>chapterUids.includes(uid)))
    throw Error('STRUCTURED_WASM_CHAPTER_UID_TARGET_UNRESOLVED');
  report.structuredExactUidEvidence={
    trackUids:typedTracks,
    fileUids:typedAttachments,
    chapterUidCount:chapterUids.length,
    tagChapterUidCount:tagChapterUids.length,
    linkedChapterTargetsPreserved:true,
  };
  report.structuredNodeCount=nodes.length;
  report.structuredSamples=nodes.filter(node=>expectedTypes.includes(node.name))
    .slice(0,20);
  report.independentReference={
    trackCount:(independentInfo.tracks||[]).length,
    attachmentCount:(independentInfo.attachments||[]).length,
  };
  report.families=Object.fromEntries(Object.entries(families)
    .map(([name,regex])=>[name,regex.test(result.output)]));
  if(Object.values(report.families).some(value=>!value))
    throw Error('BROWSER_WASM_OBJECT_TREE_INCOMPLETE: '+JSON.stringify(report.families));
  if(result.exitCode!==0)throw Error('BROWSER_MKVTREE_NONZERO_EXIT_'+result.exitCode);
  if(pageErrors.length)throw Error('BROWSER_PAGE_RUNTIME_ERRORS: '+pageErrors.join(' | '));
  report.browserUserAgent=result.browserUserAgent;
  report.elapsedMs=result.elapsedMs;
  report.stdoutSha256=sha(Buffer.from(result.output));
  report.stdoutPreview=result.output.slice(0,1600);
  report.stderrPreview=result.stderr.slice(0,1200);
  report.browserErrorCount=pageErrors.length;
  report.sourceUnmodified=sha(await fs.readFile(fixture))===sourceSha;
  assert.equal(report.sourceUnmodified,true,'ORIGINAL_SOURCE_MODIFIED');
  report.result='UPSTREAM_C_MATROSKA_REAL_CHROMIUM_READ_PASS';
}catch(error){
  report.result='FAILED';
  report.error=error?.stack||String(error);
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,
    families:report.families||null,reportFile,error:report.error||null}));
}
if(report.result!=='UPSTREAM_C_MATROSKA_REAL_CHROMIUM_READ_PASS')
  process.exitCode=1;
