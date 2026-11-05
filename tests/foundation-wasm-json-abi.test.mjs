import test from 'node:test';
import assert from 'node:assert/strict';
import {readFoundationWasmStructure,
  FOUNDATION_WASM_ABI_VERSION,FOUNDATION_JSON_MAX_BYTES}
  from '../src/foundation-wasm-json-abi.js';

const tree={
  schema:'foundation-matroska-structured-tree-v0',
  nodes:[{name:'EBMLHead'},{name:'Segment'},{name:'Attachments'}],
};
function mock({version=FOUNDATION_WASM_ABI_VERSION,rc=0,body=JSON.stringify(tree),
  length=null,throwJson=false}={}){
  const calls=[];
  let current='';
  const module={
    ccall(name,_type,_types,args){
      calls.push(name);
      switch(name){
        case 'foundation_abi_version':return version;
        case 'foundation_probe':
          assert.equal(args[0],'/source/example.mkv');
          current=rc===0?body:'';
          return rc;
        case 'foundation_json_length':return length??new TextEncoder().encode(current).length;
        case 'foundation_json':
          if(throwJson)throw Error('MALFORMED_UTF8_RESULT');
          return current;
        case 'foundation_release':current='';return;
        default:throw Error('UNKNOWN_C_SYMBOL_'+name);
      }
    },
  };
  return {module,calls,read:()=>current};
}
test('ABI accepts the versioned schema and always releases the native buffer',()=>{
  const x=mock();
  const value=readFoundationWasmStructure(x.module,'/source/example.mkv');
  assert.deepEqual(value,tree);
  assert.deepEqual(x.calls,[
    'foundation_abi_version','foundation_probe','foundation_json_length',
    'foundation_json','foundation_release',
  ]);
  assert.equal(x.read(),'');
});
test('a native parse error does not retain previous output or claim success',()=>{
  const x=mock({rc:13});
  assert.throws(()=>readFoundationWasmStructure(x.module,'/source/example.mkv'),
    /FOUNDATION_ABI_PROBE_FAILED_13/);
  assert.deepEqual(x.calls,[
    'foundation_abi_version','foundation_probe','foundation_release',
  ]);
  assert.equal(x.read(),'');
});
test('ABI mismatches fail closed before invoking native parser',()=>{
  const x=mock({version:FOUNDATION_WASM_ABI_VERSION+1});
  assert.throws(()=>readFoundationWasmStructure(x.module,'/source/example.mkv'),
    /FOUNDATION_ABI_VERSION_MISMATCH/);
  assert.deepEqual(x.calls,['foundation_abi_version']);
});
test('truncated/oversized JSON payloads and invalid JSON release the C allocation',()=>{
  for(const opts of [
    {length:FOUNDATION_JSON_MAX_BYTES+1},
    {length:0},
    {length:25},
    {body:'{not-json}'},
    {throwJson:true},
  ]){
    const x=mock(opts);
    assert.throws(()=>readFoundationWasmStructure(x.module,'/source/example.mkv'));
    assert.equal(x.calls.at(-1),'foundation_release');
    assert.equal(x.read(),'');
  }
});
test('UTF-8 byte length is verified rather than JS string length',()=>{
  const payload=JSON.stringify({...tree,label:'章节'});
  const x=mock({body:payload});
  assert.deepEqual(readFoundationWasmStructure(x.module,'/source/example.mkv').label,
    '章节');
  assert.equal(x.calls.at(-1),'foundation_release');
});
test('invalid arguments never enter the C ABI',()=>{
  const x=mock();
  for(const file of ['/wrong\u0000path','../example.mkv','']){
    assert.throws(()=>readFoundationWasmStructure(x.module,file),
      /FOUNDATION_ABI_CALL_INVALID/);
  }
  assert.equal(x.calls.length,0);
});
