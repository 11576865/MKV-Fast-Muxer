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
  const [jsBytes,wasmBytes,sourceBytes]=await Promise.all([
    fs.readFile(js),fs.readFile(wasm),fs.readFile(fixture),
  ]);
  const sourceSha=sha(sourceBytes);
  report.sourceSha256=sourceSha;
  report.wasmSha256=sha(wasmBytes);
  report.sourceBytes=sourceBytes.length;

  const serve={
    '/mkvtree.js':{data:jsBytes,type:'text/javascript'},
    '/mkvtree.wasm':{data:wasmBytes,type:'application/wasm'},
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
  report.browserExecuted=true;

  const result=await page.evaluate(async base64=>{
    if(typeof window.createFoundationMkvtree!=='function')
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
    return {
      exitCode:status??0,
      elapsedMs:Math.round(performance.now()-start),
      output:text,
      stderr:stderr.join('\n'),
      browserUserAgent:navigator.userAgent,
      sourceBufferLength:source.byteLength,
    };
  },sourceBytes.toString('base64'));
  const families={
    ebml:/ebml/i,segment:/segment/i,tracks:/tracks?/i,
    attachments:/attachments?/i,chapters:/chapters?/i,tags:/tags?/i,
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
