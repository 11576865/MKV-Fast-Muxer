import assert from 'node:assert/strict';
import test from 'node:test';
import {
 SOURCE_WORKERFS_MIN_BYTES,stageBrowserPrimarySource
} from '../src/ffmpeg-browser-source-staging.js';

function fakeFFmpeg(){
 const calls=[];
 return {calls,
  writeFile:async(...args)=>{calls.push(['writeFile',...args]);},
  deleteFile:async(...args)=>{calls.push(['deleteFile',...args]);},
  createDir:async(...args)=>{calls.push(['createDir',...args]);},
  mount:async(...args)=>{calls.push(['mount',...args]);},
  unmount:async(...args)=>{calls.push(['unmount',...args]);},
  deleteDir:async(...args)=>{calls.push(['deleteDir',...args]);}
 };
}

test('small source retains historical MEMFS bytes and cleanup',async()=>{
 const ffmpeg=fakeFFmpeg();
 const file={name:'small.mkv',size:SOURCE_WORKERFS_MIN_BYTES-1};
 let loaded=0;
 const staged=await stageBrowserPrimarySource({
  ffmpeg,file,prefix:'t1',fallbackPath:'/t1.mkv',
  workerFsType:'WORKERFS',
  loadBytes:async input=>{
   assert.strictEqual(input,file);loaded++;return new Uint8Array([1,2,3]);
  }
 });
 assert.equal(staged.path,'/t1.mkv');
 assert.equal(staged.kind,'memfs');
 assert.equal(loaded,1);
 assert.equal(ffmpeg.calls.some(x=>x[0]==='mount'),false);
 assert.equal(ffmpeg.calls.find(x=>x[0]==='writeFile')[2].length,3);
 await staged.cleanup();
 assert.deepEqual(ffmpeg.calls.at(-1),['deleteFile','/t1.mkv']);
});

test('large source is mounted as the exact original File, no whole-byte fetch',async()=>{
 const ffmpeg=fakeFFmpeg();
 const file={name:'different name ü.mkv',size:1_200_000_000,lastModified:1700000000};
 let fetched=0;
 const staged=await stageBrowserPrimarySource({
  ffmpeg,file,prefix:'task-safe',fallbackPath:'/task-safe-input.mkv',
  workerFsType:'WORKERFS',
  loadBytes:async()=>{fetched++;throw Error('source should not be eagerly fetched');}
 });
 assert.equal(staged.kind,'workerfs');
 assert.equal(staged.path,'/task-safe-large-original/different name ü.mkv');
 assert.equal(fetched,0);
 assert.equal(ffmpeg.calls.some(x=>x[0]==='writeFile'),false);
 const mounted=ffmpeg.calls.find(x=>x[0]==='mount');
 assert.equal(mounted[1],'WORKERFS');
 assert.strictEqual(mounted[2].files[0],file);
 assert.equal(mounted[3],'/task-safe-large-original');
 await staged.cleanup();
 assert.deepEqual(ffmpeg.calls.slice(-2),[
  ['unmount','/task-safe-large-original'],
  ['deleteDir','/task-safe-large-original']
 ]);
});

test('different File with identical name/size/mtime is not conflated',async()=>{
 const ffmpeg=fakeFFmpeg();
 const files=[
  {name:'same.mkv',size:2e8,lastModified:1},
  {name:'same.mkv',size:2e8,lastModified:1},
 ];
 for(let i=0;i<2;i++){
  const s=await stageBrowserPrimarySource({
   ffmpeg,file:files[i],prefix:'t'+i,fallbackPath:'input'+i,
   workerFsType:'WORKERFS',loadBytes:async()=>{throw Error('unexpected fetch');}
  });
  assert.strictEqual(ffmpeg.calls.filter(x=>x[0]==='mount')[i][2].files[0],files[i]);
  await s.cleanup();
 }
 assert.notStrictEqual(files[0],files[1]);
});

test('large source unsafe pathname and mount errors fail closed',async()=>{
 const ffmpeg=fakeFFmpeg();
 await assert.rejects(stageBrowserPrimarySource({
  ffmpeg,file:{name:'../escape.mkv',size:2e8},
  prefix:'t',fallbackPath:'t-input',
  workerFsType:'WORKERFS',loadBytes:async()=>new Uint8Array(0)
 }),/PRIMARY_SOURCE_WORKERFS_NAME_UNSAFE/);
 const failing=fakeFFmpeg();
 failing.mount=async()=>{throw Error('TEST_MOUNT_DENIED');};
 await assert.rejects(stageBrowserPrimarySource({
  ffmpeg:failing,file:{name:'valid.mkv',size:2e8},
  prefix:'t',fallbackPath:'t-input',
  workerFsType:'WORKERFS',loadBytes:async()=>new Uint8Array(0)
 }),/TEST_MOUNT_DENIED/);
 assert.deepEqual(failing.calls.slice(-2),[
  ['createDir','/t-large-original'],['deleteDir','/t-large-original']
 ]);
});
