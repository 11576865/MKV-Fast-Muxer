import test from 'node:test';
import assert from 'node:assert/strict';
import {createV3TargetAuthority} from '../src/softmux-v3-intent.js';

const file=(name)=>Object.freeze({name,size:64,lastModified:111});
const source=(key,instance)=>({key,kind:'container',file:instance});
test('exact File-bound target: opening A/B, viewing A, confirmation B only',()=>{
  const a=file('A.mkv'),b=file('B.mkv');
  const entries=[source('a',a),source('b',b)];
  const gate=createV3TargetAuthority();
  assert.equal(gate.current({entries,activeFile:b}),null);
  assert.equal(gate.confirm({baseKey:'b',baseFile:b,entries,activeFile:a}).accepted,false);
  assert.equal(gate.current({entries,activeFile:a}),null);
  assert.equal(gate.confirm({baseKey:'b',baseFile:b,entries,activeFile:b}).accepted,true);
  assert.equal(gate.current({entries,activeFile:b}).baseFile,b);
  assert.equal(gate.current({entries,activeFile:a}),null,'adapter rebind revokes authorization');
});
test('same metadata must never transfer authorization to a different File instance',()=>{
  const first=file('same.mkv'),impostor=file('same.mkv');
  const gate=createV3TargetAuthority();
  assert.equal(gate.confirm({baseKey:'first',baseFile:first,entries:[source('first',first)],activeFile:first}).accepted,true);
  assert.equal(gate.current({entries:[source('first',impostor)],activeFile:impostor}),null);
  assert.equal(gate.confirm({baseKey:'first',baseFile:first,entries:[source('first',impostor)],activeFile:impostor}).accepted,false);
});
test('removing target or a changed resource key invalidates the intent',()=>{
  const a=file('A.mkv'),b=file('B.mkv');
  const entries=[source('a',a),source('b',b)];
  const gate=createV3TargetAuthority();
  assert.equal(gate.confirm({baseKey:'b',baseFile:b,entries,activeFile:b}).accepted,true);
  assert.equal(gate.current({entries:[source('a',a)],activeFile:b}),null);
  assert.equal(gate.confirm({baseKey:'b',baseFile:b,entries,activeFile:b}).accepted,true);
  assert.equal(gate.current({entries:[source('other-key',b)],activeFile:b}),null);
});
test('non-container, forged key and empty target all fail closed',()=>{
  const f=file('fake.srt');
  const gate=createV3TargetAuthority();
  for(const {baseKey,baseFile,entries} of [
    {baseKey:'s',baseFile:f,entries:[{kind:'subtitle',key:'s',file:f}]},
    {baseKey:'missing',baseFile:f,entries:[source('s',f)]},
    {baseKey:'s',baseFile:null,entries:[source('s',f)]},
  ])assert.equal(gate.confirm({baseKey,baseFile,entries,activeFile:f}).accepted,false);
  assert.equal(gate.current({entries:[],activeFile:null}),null);
});
