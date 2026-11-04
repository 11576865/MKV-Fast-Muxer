/**
 * Real Chromium experiment for the pinned Matroska Foundation C libraries.
 * Runs their actual mkvtree.wasm in a browser's WASM VM/virtual FS against
 * an independent MKV, NOT in Node's Emscripten runtime.
 * No production application code, UI, or third-party binary is modified.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const js=path.resolve(process.env.FOUNDATION_WASM_JS||
  '.e2e/foundation-build/libmatroska2/mkvtree.js');
const wasm=path.join(path.dirname(js),'mkvtree.wasm');
const structuredJs=path.resolve(process.env.FOUNDATION_STRUCTURED_WASM_JS||
  '.e2e/foundation-build/libmatroska2/foundation_json_probe.js');
const structuredWasm=path.join(path.dirname(structuredJs),'foundation_json_probe.wasm');
const fixture=path.resolve(process.env.FOUNDATION_FIXTURE||
  '.e2e/fixtures/p0-independent-mkvtoolnix.mkv');
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
    structuredWasmBytes,independentInfo]=await Promise.all([
    fs.readFile(js),fs.readFile(wasm),fs.readFile(fixture),
    fs.readFile(structuredJs),fs.readFile(structuredWasm),
    fs.readFile('.e2e/output/foundation-reference-mkvmerge.json','utf8')
      .then(JSON.parse),
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
    '/':{data:Buffer.from('<!doctype html><meta charset="utf-8"><title>Foundation WASM read audit</title>'),
      type:'text/html; charset=utf-8'},
  };
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
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(origin+'/');
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
    const code=structuredModule.ccall(
      'foundation_probe','number',['string'],['/independent.mkv']);
    if(code!==0)throw Error('FOUNDATION_STRUCTURED_PROBE_REJECTED_'+code);
    const jsonText=structuredModule.ccall('foundation_json','string',[],[]);
    const structured=JSON.parse(jsonText);
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
    if(!/^-?\\d+$/.test(node.offset)||
       !/^-?\\d+$/.test(node.endOffset))
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
