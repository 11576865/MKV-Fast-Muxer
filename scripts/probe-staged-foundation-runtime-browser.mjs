/**
 * Run the exact LICENSE + JS + WASM + Worker bundle copied into Vite dist.
 * Distinct from the research runner that serves in-memory temp build files.
 * A green result demonstrates deployability of this staged read-only runtime,
 * not product UI activation or broad media compatibility.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {parseMkvmergeJsonWithExactUids,exactPositiveUid}
  from '../src/mkvmerge-exact-uid-json.js';

const root=path.resolve('dist/vendor/matroska-foundation');
const output=path.resolve('.e2e/output/foundation-staged-runtime-chromium.json');
const source=path.resolve('.e2e/fixtures/p0-independent-mkvtoolnix.mkv');
const large=path.resolve('.e2e/fixtures/foundation-large-attachment.mkv');
const types={'js':'text/javascript','wasm':'application/wasm',
  'json':'application/json','txt':'text/plain'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={
  schema:'foundation-staged-runtime-chromium-v1',
  result:'NOT_RUN',productUIActivated:false,writerEnabled:false,
};
await fs.mkdir(path.dirname(output),{recursive:true});
let server,browser;
try {
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json')));
  if(manifest.schema!=='softmux-foundation-matroska-runtime-v1'||
     manifest.bridgeAbiVersion!==1||!manifest.readOnly||
     manifest.productionActivation!=='disabled-by-default')
    throw Error('DIST_RUNTIME_MANIFEST_INVALID');
  for(const [name,entry] of Object.entries(manifest.files)){
    const bytes=await fs.readFile(path.join(root,name));
    if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)
      throw Error('DIST_RUNTIME_SHA256_MISMATCH_'+name);
  }
  if(!manifest.files.LICENSE)throw Error('DIST_RUNTIME_LICENSE_MISSING');
  const baseline=await fs.readFile(source);
  const originalSha=sha(baseline);
  const native=parseMkvmergeJsonWithExactUids(
    await fs.readFile('.e2e/output/foundation-reference-mkvmerge.json','utf8'));
  const candidates=new Set([
    'foundation_json_probe.js','foundation_json_probe.wasm',
    'foundation-worker.js','foundation-wasm-json-abi.js',
    'foundation-runtime-worker-factory.js','manifest.json','LICENSE',
  ]);
  server=createServer(async(req,res)=>{
    const reqPath=req.url||'/';
    if(reqPath==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><meta charset="utf-8"><input id="mk" type="file">');
      return;
    }
    const prefix='/vendor/matroska-foundation/';
    const name=reqPath.startsWith(prefix)?reqPath.slice(prefix.length):'';
    if(!candidates.has(name)){res.writeHead(404);res.end();return;}
    try {
      const bytes=await fs.readFile(path.join(root,name));
      res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)]||
        'application/octet-stream','Cache-Control':'no-store'});
      res.end(bytes);
    } catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  const executablePath=process.env.FOUNDATION_CHROMIUM_EXECUTABLE||undefined;
  browser=await chromium.launch({headless:true,executablePath,
    args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/');
  const probe=()=>page.evaluate(async()=>{
    const {createPackagedFoundationWorkerFactory}=await import(
      '/vendor/matroska-foundation/foundation-runtime-worker-factory.js');
    const file=document.querySelector('#mk')?.files?.[0];
    if(!file)throw Error('DIST_BROWSER_FILE_MISSING');
    const makeWorker=createPackagedFoundationWorkerFactory({
      baseUrl:'/',origin:location.origin,WorkerCtor:Worker,
    });
    return new Promise((resolve,reject)=>{
    const worker=makeWorker();
    let finished=false;
    const settle=(cb,val)=>{
      if(finished)return;finished=true;clearTimeout(timer);worker.terminate();cb(val);
    };
    const timer=setTimeout(()=>
      settle(reject,Error('DIST_WORKER_TIMEOUT')),45000);
    worker.onerror=e=>settle(reject,Error('DIST_WORKER_RUNTIME_'+e.message));
    worker.onmessage=e=>{
      if(e.data?.ok===true)settle(resolve,e.data);
      else settle(reject,Error('DIST_WORKER_RESULT_'+e.data?.error));
    };
    worker.postMessage({type:'probe',file});
    });
  });
  await page.locator('#mk').setInputFiles({
    name:'发行测试 中文.mkv',mimeType:'video/x-matroska',buffer:baseline,
  });
  const small=await probe();
  const nodes=small.structured.nodes;
  const uids=name=>nodes.filter(n=>n.name===name)
    .map(n=>exactPositiveUid(n.uintValue)).sort();
  if(!nodes.length||
     JSON.stringify(uids('TrackUID'))!==JSON.stringify(
       (native.tracks||[]).map(t=>exactPositiveUid(t.properties?.uid)).sort())||
     JSON.stringify(uids('FileUID'))!==JSON.stringify(
       (native.attachments||[]).map(a=>exactPositiveUid(a.properties?.uid)).sort()))
    throw Error('DIST_RUNTIME_NATIVE_UID_MISMATCH');
  if(!small.workerStats.usedWorkerFS||
     small.workerStats.stagedEntireFileInMemfs)
    throw Error('DIST_WORKERFS_NOT_USED');
  await page.locator('#mk').setInputFiles(large);
  const big=await probe();
  if(big.workerStats.fileBytes<100000000||
     big.workerStats.bytesRequested>=big.workerStats.fileBytes/100||
     !big.structured.nodes.length)
    throw Error('DIST_RUNTIME_LARGE_FILE_NOT_LAZY');
  if(errors.length)throw Error('DIST_RUNTIME_PAGE_ERRORS_'+errors.join(';'));
  if(sha(await fs.readFile(source))!==originalSha)
    throw Error('DIST_RUNTIME_ORIGINAL_SOURCE_CHANGED');
  report.result='PACKAGED_FOUNDATION_WASM_CHROMIUM_READ_PASS';
  report.explicitProductWorkerFactoryPassed=true;
  report.manifestSha256=sha(await fs.readFile(path.join(root,'manifest.json')));
  report.stagedFiles=Object.keys(manifest.files);
  report.small={nodeCount:nodes.length,exactTrackUidCount:uids('TrackUID').length,
    exactFileUidCount:uids('FileUID').length};
  report.large={bytes:big.workerStats.fileBytes,
    readBytes:big.workerStats.bytesRequested,
    readCalls:big.workerStats.fileReaderSyncCalls,
    nodeCount:big.structured.nodes.length};
  report.browserErrors=errors.length;
  report.sourceUnmodified=true;
}catch(error){
  report.result='FAILED';
  report.error=error?.stack||String(error);
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,report:output,
    error:report.error||null}));
}
if(report.result!=='PACKAGED_FOUNDATION_WASM_CHROMIUM_READ_PASS')
  process.exitCode=1;
