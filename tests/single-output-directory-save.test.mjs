import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSingleOutputDirectorySaveSession } from '../src/single-output-directory-save.js';

const digest=blob=>blob.arrayBuffer().then(bytes=>
  createHash('sha256').update(Buffer.from(bytes)).digest('hex'));
const fileError=(name)=>Object.assign(new Error(name),{name});
class Directory {
  constructor() {
    this.name='user-selected-dir';
    this.files=new Map();
    this.writes=new Map();
    this.failWrites=new Set();
    this.failCreates=new Set();
    this.corruptReadback=new Map();
    this.failReadback=new Set();
  }
  async *entries() {
    for(const filename of this.files.keys()) yield [filename,{kind:'file'}];
  }
  async isSameEntry(other) { return this===other; }
  async getFileHandle(filename,{create=false}={}) {
    if(create&&this.failCreates.has(filename))throw fileError('NotAllowedError');
    if(!this.files.has(filename)){
      if(!create)throw fileError('NotFoundError');
      this.files.set(filename,new Blob([]));
    }
    const directory=this;
    return {
      async getFile(){
        if(directory.failReadback.has(filename)) throw fileError('NotAllowedError');
        return directory.corruptReadback.get(filename) ?? directory.files.get(filename);
      },
      async createWritable(){
        let candidate=null;
        return {
          async write(blob){
            if(directory.failWrites.has(filename)) throw Error('injected write failure');
            candidate=blob;
          },
          async close(){
            directory.files.set(filename,candidate);
            directory.writes.set(filename,(directory.writes.get(filename)||0)+1);
          },
          async abort(){},
        };
      },
    };
  }
}
async function fixture(){
  const blob=new Blob(['real container payload']);
  const reportBlob=new Blob(['{"audit":"pass"}'],{type:'application/json'});
  return {
    blob,reportBlob,outputName:'episode.mkv',
    reportName:'episode.mux-report.json',outputSha256:await digest(blob),
  };
}
test('single delivery: exact MKV and report are both persisted and byte-readback verified',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={generation:1},dir=new Directory();
  const a=await fixture();
  s.replace(owner,a);
  const receipt=await s.save(owner,dir);
  assert.equal(receipt.savedToDirectory,true,receipt.directorySaveError);
  assert.equal(receipt.saveOnly,true);
  assert.deepEqual([...dir.files.keys()],['episode.mkv','episode.mux-report.json']);
  assert.equal(await digest(dir.files.get('episode.mkv')),a.outputSha256);
  assert.equal(await digest(dir.files.get('episode.mux-report.json')),await digest(a.reportBlob));
  assert.equal(s.receipt,receipt);
});

test('single delivery: report failure retains verified MKV and retries only report',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={},dir=new Directory(),a=await fixture();
  dir.failCreates.add(a.reportName);
  s.replace(owner,a);
  const first=await s.save(owner,dir);
  assert.equal(first.mkvSavedToDirectory,true);
  assert.equal(first.reportSavedToDirectory,false);
  assert.equal(first.savedToDirectory,false);
  assert.match(first.reportSaveError,/NotAllowedError/);
  assert.equal(dir.writes.get(a.outputName),1);
  dir.failCreates.delete(a.reportName);
  const second=await s.save(owner,dir);
  assert.equal(second.savedToDirectory,true,second.directorySaveError);
  assert.equal(dir.writes.get(a.outputName),1,'never remux or re-write successful MKV');
  assert.equal(dir.writes.get(a.reportName),1);
});

test('single delivery: report write failure with a leftover destination must not be overwritten',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={},dir=new Directory(),a=await fixture();
  dir.failWrites.add(a.reportName);
  s.replace(owner,a);
  const receipt=await s.save(owner,dir);
  assert.equal(receipt.mkvSavedToDirectory,true);
  assert.equal(receipt.reportSavedToDirectory,false);
  assert.equal(dir.files.has(a.reportName),true,'failed create/write can leave a name');
  dir.failWrites.delete(a.reportName);
  await assert.rejects(s.save(owner,dir),/已存在|残留/);
  assert.equal(dir.writes.get(a.outputName),1);
  assert.equal(dir.writes.get(a.reportName),undefined);
});

test('single delivery: normalized preexisting destination refuses overwrite',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={},dir=new Directory(),a=await fixture();
  dir.files.set('ＥＰＩＳＯＤＥ.MKV',new Blob(['OLD DATA']));
  s.replace(owner,a);
  await assert.rejects(s.save(owner,dir),/已经存在|目标已存在|已存在文件/);
  assert.equal(await dir.files.get('ＥＰＩＳＯＤＥ.MKV').text(),'OLD DATA');
  assert.equal(dir.writes.size,0);
  assert.equal(s.receipt,null);
});

test('single delivery: corrupted post-close byte readback cannot gain saved receipt',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={},dir=new Directory(),a=await fixture();
  dir.corruptReadback.set(a.outputName,new Blob(['invalid container bytes']));
  s.replace(owner,a);
  const receipt=await s.save(owner,dir);
  assert.equal(receipt.savedToDirectory,false);
  assert.equal(receipt.mkvSavedToDirectory,false);
  assert.match(receipt.mkvSaveError,/回读/);
  assert.equal(dir.writes.get(a.outputName),1);
  assert.equal(dir.files.has(a.reportName),false);
  await assert.rejects(s.save(owner,dir),/已存在|残留/);
  assert.equal(dir.writes.get(a.outputName),1,'never clobber a failed/ambiguous file');
});

test('single delivery: partial success in first directory grants no success in another',async()=>{
  const s=createSingleOutputDirectorySaveSession(),owner={},a=await fixture();
  const first=new Directory(),second=new Directory();
  first.failWrites.add(a.reportName);
  s.replace(owner,a);
  assert.equal((await s.save(owner,first)).savedToDirectory,false);
  const result=await s.save(owner,second);
  assert.equal(result.savedToDirectory,true,result.directorySaveError);
  assert.equal(second.writes.get(a.outputName),1);
  assert.equal(second.writes.get(a.reportName),1);
});

test('single delivery: only current generation owner may save; replacement and release revoke old grants',async()=>{
  const s=createSingleOutputDirectorySaveSession(),previous={},current={},dir=new Directory();
  const first=await fixture();
  s.replace(previous,first);
  assert.equal(s.has(previous),true);
  s.replace(current,first);
  assert.equal(s.has(previous),false);
  await assert.rejects(s.save(previous,dir),/授权已失效/);
  const result=await s.save(current,dir);
  assert.equal(result.savedToDirectory,true);
  s.release();
  assert.equal(s.has(current),false);
  await assert.rejects(s.save(current,dir),/授权已失效/);
});
