/**
 * Reproducible, explicitly opt-in packaging of the BSD Matroska C/WASM
 * structured read-only runtime. No binaries are committed and no default
 * product build fetches upstream code or silently ships a third-party module.
 *
 * Usage: node scripts/stage-foundation-wasm-runtime.mjs
 *   --build .e2e/foundation-build/libmatroska2
 *   --upstream .e2e/foundation-upstream
 *   --out public/vendor/matroska-foundation
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FOUNDATION_WASM_ABI_VERSION } from '../src/foundation-wasm-json-abi.js';

const SOURCE_COMMIT='d69761114b79c1dfcb2226ceca84452835e745c3';
const names={
  'foundation_json_probe.js':'text/javascript',
  'foundation_json_probe.wasm':'application/wasm',
  'foundation-worker.js':'text/javascript',
  'foundation-wasm-json-abi.js':'text/javascript',
  'LICENSE':'text/plain',
};
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  if(!['--build','--upstream','--out'].includes(key) || !value ||
     args.has(key))
    throw Error('FOUNDATION_STAGE_ARGUMENTS_INVALID');
  args.set(key,value);
}
if(args.size!==3)throw Error('FOUNDATION_STAGE_ARGUMENTS_REQUIRED');

const root=process.cwd();
const inside=value=>{
  const dest=path.resolve(root,value);
  const rel=path.relative(root,dest);
  if(!rel||rel==='.'||rel.startsWith('..'+path.sep)||
     path.isAbsolute(rel))throw Error('FOUNDATION_STAGE_PATH_OUTSIDE_PROJECT');
  return dest;
};
const source=inside(args.get('--build'));
const upstream=inside(args.get('--upstream'));
const output=inside(args.get('--out'));
if(output===source||output===upstream)throw Error('FOUNDATION_STAGE_OUTPUT_IS_INPUT');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const head=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{
  encoding:'utf8',timeout:10000,
}).trim();
if(head!==SOURCE_COMMIT)
  throw Error('FOUNDATION_STAGE_UPSTREAM_COMMIT_MISMATCH');

const [generatedJs,generatedWasm,originalWorker,abiJs,license]=await Promise.all([
  fs.readFile(path.join(source,'foundation_json_probe.js')),
  fs.readFile(path.join(source,'foundation_json_probe.wasm')),
  fs.readFile('scripts/workers/foundation-matroska-worker.js','utf8'),
  fs.readFile('src/foundation-wasm-json-abi.js'),
  fs.readFile(path.join(upstream,'LICENSE')),
]);
// The product runtime is served under its own directory (including on
// GitHub Pages subpaths). Resolve assets relative to the Worker URL.
const edits=[
  ["importScripts('/foundation-json.js');",
   "importScripts('./foundation_json_probe.js');"],
  ["'/src/foundation-wasm-json-abi.js'",
   "'./foundation-wasm-json-abi.js'"],
  ["new URL('/'+name,self.location.origin).href",
   "new URL('./'+name,self.location.href).href"],
];
let stagedWorker=originalWorker;
for(const [from,to] of edits){
  if(!stagedWorker.includes(from))
    throw Error('FOUNDATION_STAGE_WORKER_SOURCE_CHANGED');
  stagedWorker=stagedWorker.replace(from,to);
}
const artifacts=[
  generatedJs,generatedWasm,Buffer.from(stagedWorker,'utf8'),abiJs,license,
];
if(artifacts.some(bytes=>bytes.length===0) ||
   artifacts[1].subarray(0,4).toString('hex')!=='0061736d' ||
   !artifacts[0].includes(Buffer.from('createFoundationJSON')) ||
   !artifacts[2].includes(Buffer.from('foundation_json_probe.js')) ||
   !artifacts[3].includes(Buffer.from('FOUNDATION_WASM_ABI_VERSION')) ||
   !artifacts[4].includes(Buffer.from('BSD')))
  throw Error('FOUNDATION_STAGE_INVALID_SOURCE_ARTIFACT');
const files=Object.fromEntries(Object.keys(names).map((name,i)=>
  [name,Object.freeze({
    sha256:sha(artifacts[i]),bytes:artifacts[i].length,
    mediaType:names[name],
  })]));
const manifest={
  schema:'softmux-foundation-matroska-runtime-v1',
  status:'experimental-explicit-opt-in',
  upstream:'Matroska-Org/foundation-source',
  upstreamCommit:SOURCE_COMMIT,
  upstreamLicense:'BSD-3-Clause',
  buildCompatibility:['emscripten-3.1.68','corec-posix-guard-adapter',
    'EMULATE_FUNCTION_POINTER_CASTS','WORKERFS'],
  bridgeAbiVersion:FOUNDATION_WASM_ABI_VERSION,
  readOnly:true,
  workerScript:'foundation-worker.js',
  productionActivation:'disabled-by-default',
  files,
};
await fs.mkdir(path.dirname(output),{recursive:true});
try {
  await fs.access(output);
  throw Error('FOUNDATION_STAGE_REFUSES_OVERWRITE');
} catch(e) {
  if(e.code!=='ENOENT')throw e;
}
const temporary=output+'.tmp';
try{
  await fs.access(temporary);
  throw Error('FOUNDATION_STAGE_TEMPORARY_EXISTS');
}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(temporary,{recursive:false});
let renamed=false;
try{
  const entries=Object.keys(names);
  await Promise.all(entries.map((name,i)=>
    fs.writeFile(path.join(temporary,name),artifacts[i])));
  await fs.writeFile(path.join(temporary,'manifest.json'),
    JSON.stringify(manifest,null,2)+'\n');
  for(const [name,entry] of Object.entries(files)){
    if(sha(await fs.readFile(path.join(temporary,name)))!==entry.sha256)
      throw Error('FOUNDATION_STAGE_COPY_VERIFICATION_FAILED');
  }
  await fs.rename(temporary,output);
  renamed=true;
} finally {
  if(!renamed)await fs.rm(temporary,{recursive:true,force:true});
}
console.log(JSON.stringify({
  status:'FOUNDATION_EXPERIMENTAL_RUNTIME_STAGED',
  output:path.relative(root,output),abi:FOUNDATION_WASM_ABI_VERSION,
  files:Object.keys(names),
  licenseIncluded:true,
}));
