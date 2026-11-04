import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackagedFoundationWorkerFactory,FOUNDATION_RUNTIME_DIRECTORY}
  from '../src/foundation-runtime-worker-factory.js';

class LocalWorker {
  constructor(url,options){this.url=url;this.options=options;}
  terminate(){}
  postMessage(){}
}
test('opt-in packaged Foundation Worker honors GitHub Pages BASE_URL',()=>{
  const factory=createPackagedFoundationWorkerFactory({
    baseUrl:'/MKV-Fast-Muxer/',
    origin:'https://user.github.io',
    WorkerCtor:LocalWorker,
  });
  const worker=factory();
  assert.equal(worker.url,
    'https://user.github.io/MKV-Fast-Muxer/'+FOUNDATION_RUNTIME_DIRECTORY+
      'foundation-worker.js');
  assert.deepEqual(worker.options,{
    type:'classic',name:'foundation-matroska-read-only',
  });
});
test('local root app works without side effects before factory is called',()=>{
  let called=0;
  class CountedWorker {
    constructor(url){called++;this.url=url;}
  }
  const factory=createPackagedFoundationWorkerFactory({
    baseUrl:'/',origin:'http://localhost:5173',WorkerCtor:CountedWorker,
  });
  assert.equal(called,0);
  assert.equal(factory().url,'http://localhost:5173/'+
    FOUNDATION_RUNTIME_DIRECTORY+'foundation-worker.js');
  assert.equal(called,1);
});
test('invalid, cross-origin and traversal-like bases are refused',()=>{
  for(const baseUrl of [
    'https://evil.example/site/',
    '//evil.example/',
    '/../private/',
    '/app/not-a-directory',
    '',
  ]){
    assert.throws(()=>createPackagedFoundationWorkerFactory({
      baseUrl,origin:'https://user.github.io',WorkerCtor:LocalWorker,
    }),/FOUNDATION_RUNTIME_(BASE_URL_INVALID|FACTORY_UNAVAILABLE)/);
  }
  assert.throws(()=>createPackagedFoundationWorkerFactory({
    baseUrl:'/',origin:'https://user.github.io',WorkerCtor:null,
  }),/FOUNDATION_RUNTIME_FACTORY_UNAVAILABLE/);
});
