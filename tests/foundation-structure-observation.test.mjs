import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatroskaAttachmentReader } from '../src/matroska-attachment-reader.js';
import { createFoundationStructureObserver }
  from '../src/foundation-structure-observation.js';

const concat = (...values) => Buffer.concat(values.map(Buffer.from));
const element = (id, payload) => {
  const bytes=Buffer.from(payload);
  assert.ok(bytes.length<127);
  return concat(Buffer.from(id,'hex'),[0x80|bytes.length],bytes);
};
const ebml = element('1a45dfa3',element('4282',Buffer.from('matroska')));
const fileUid = element('46ae',[7]);
const attachedFile = element('61a7',concat(
  element('466e',Buffer.from('sample.bin')),
  element('4660',Buffer.from('application/octet-stream')),
  fileUid,element('465c',[0x51]),
));
const attachments=element('1941a469',attachedFile);
const segment=element('18538067',attachments);
const original=concat(ebml,segment);
const source=()=>{
  const bytes=new Blob([original]);
  return {name:'test.mkv',size:bytes.size,lastModified:1,
    slice:(...args)=>bytes.slice(...args)};
};
const node=(name,depth,offset,endOffset,master=false,extra={})=>({
  name,depth,offset:String(offset),endOffset:String(endOffset),
  dataBytes:String(Math.max(0,endOffset-offset)),
  id:'0x123456',master,...extra,
});
const tree=(file,uid='7')=>{
  const ebmlEnd=ebml.length,segmentAt=ebmlEnd,
    attachmentsAt=segmentAt+5,attachedAt=attachmentsAt+5;
  const uidAt=original.indexOf(Buffer.from('46ae','hex'));
  return {
    schema:'foundation-matroska-structured-tree-v0',
    nodeCount:5,
    nodes:[
      node('EBMLHead',0,0,ebmlEnd,true),
      node('Segment',0,segmentAt,file.size,true),
      node('Attachments',1,attachmentsAt,file.size,true),
      node('AttachedFile',2,attachedAt,file.size,true),
      node('FileUID',3,uidAt,uidAt+fileUid.length,false,{uintValue:uid}),
    ],
  };
};
class FakeWorker {
  constructor(reply,auto=true){
    this.reply=reply;this.auto=auto;this.terminated=false;
    this.onmessage=null;this.onerror=null;this.sent=[];
  }
  postMessage(message){
    this.sent.push(message);
    if(this.auto)queueMicrotask(()=>this.onmessage?.({data:this.reply}));
  }
  terminate(){this.terminated=true;}
  respond(){this.onmessage?.({data:this.reply});}
}
const success=(file,uid='7')=>({
  ok:true,structured:tree(file,uid),
  workerStats:{
    usedWorkerFS:true,stagedEntireFileInMemfs:false,
    fileBytes:file.size,fileReaderSyncCalls:8,bytesRequested:20,
    largestSliceBytes:8,
  },
});

test('existing attachment reader accepts optional source-bound official WASM readback only',async()=>{
  const file=source(),created=[];
  const reader=createMatroskaAttachmentReader(file,{
    foundationWorkerFactory:()=>{let worker=new FakeWorker(success(file));created.push(worker);return worker;},
  });
  const inventory=await reader.inspect();
  assert.equal(inventory.state,'inspected');
  const observed=await reader.inspectFoundationStructure(inventory);
  assert.equal(observed.state,'inspected');
  assert.strictEqual(observed.source,reader.source);
  assert.deepEqual(observed.uids.FileUID,['7']);
  assert.equal(observed.nodeCount,5);
  assert.equal(observed.workerFS.bytesRequested,20);
  assert.equal(observed.claims.writerAuthorization,false);
  assert.equal(Object.isFrozen(observed.nodes),true);
  assert.deepEqual(created[0].sent[0],{type:'probe',file});
  assert.equal(created[0].terminated,true);
  assert.equal(reader.isCurrentInspection(inventory),true);
  assert.equal(reader.openAttachment(inventory.attachments[0].id).data.size,1);
});

test('unconfigured WASM runtime never silently substitutes a different reader',async()=>{
  const reader=createMatroskaAttachmentReader(source());
  const inventory=await reader.inspect();
  await assert.rejects(reader.inspectFoundationStructure(inventory),
    /FOUNDATION_WORKER_RUNTIME_NOT_CONFIGURED/);
  assert.equal(inventory.state,'inspected');
});

test('independent FileUID difference is a hard discrepancy, not writer admission',async()=>{
  const file=source(),reader=createMatroskaAttachmentReader(file,{
    foundationWorkerFactory:()=>new FakeWorker(success(file,'99')),
  });
  const inventory=await reader.inspect();
  await assert.rejects(reader.inspectFoundationStructure(inventory),
    /FOUNDATION_ATTACHMENT_UID_DIFFERENTIAL_MISMATCH/);
  assert.equal(reader.openAttachment(inventory.attachments[0].id).data.size,1);
});

test('new inventory cancels in-flight WASM result and terminates its Worker',async()=>{
  const file=source();let worker;
  const reader=createMatroskaAttachmentReader(file,{
    foundationWorkerFactory:()=>{worker=new FakeWorker(success(file),false);return worker;},
  });
  const before=await reader.inspect();
  const pending=reader.inspectFoundationStructure(before);
  const after=await reader.inspect();
  await assert.rejects(pending,/FOUNDATION_SOURCE_REINSPECTED/);
  assert.equal(worker.terminated,true);
  assert.equal(reader.isCurrentInspection(before),false);
  assert.equal(reader.isCurrentInspection(after),true);
});

test('AbortSignal, explicit cancellation and timeout terminate the exact worker',async()=>{
  const file=source();
  for(const method of ['abort','cancel','timeout']){
    let worker;
    const reader=createMatroskaAttachmentReader(file,{
      foundationWorkerFactory:()=>{worker=new FakeWorker(success(file),false);return worker;},
    });
    const inventory=await reader.inspect();
    const controller=new AbortController();
    const pending=reader.inspectFoundationStructure(inventory,{
      signal:controller.signal,timeoutMs:method==='timeout'?5:2000,
    });
    if(method==='abort')controller.abort();
    if(method==='cancel')reader.cancelFoundationInspection();
    await assert.rejects(pending,
      method==='timeout'?/FOUNDATION_INSPECTION_TIMEOUT/:
        method==='abort'?/FOUNDATION_INSPECTION_ABORTED/:
          /FOUNDATION_INSPECTION_CANCELLED/);
    assert.equal(worker.terminated,true);
  }
});

test('bad range, UID and fake non-WORKERFS response are rejected',async()=>{
  const file=source();
  const mutate=[
    result=>{result.structured.nodes[4].depth=-1;},
    result=>{result.structured.nodes[4].uintValue='18446744073709551616';},
    result=>{result.workerStats.usedWorkerFS=false;},
    result=>{result.structured.nodes[4].endOffset=String(file.size+10);},
  ];
  for(const alter of mutate){
    const reply=success(file);
    alter(reply);
    const reader=createMatroskaAttachmentReader(file,{
      foundationWorkerFactory:()=>new FakeWorker(reply),
    });
    await assert.rejects(reader.inspectFoundationStructure(await reader.inspect()),
      /FOUNDATION_(TREE_|WORKERFS_)/);
  }
});

test('parallel work on one reader cannot share an implicit C static output buffer',async()=>{
  const file=source();let first;
  const reader=createMatroskaAttachmentReader(file,{
    foundationWorkerFactory:()=>{const w=new FakeWorker(success(file),false);first=w;return w;},
  });
  const inventory=await reader.inspect();
  const pending=reader.inspectFoundationStructure(inventory);
  await assert.rejects(reader.inspectFoundationStructure(inventory),
    /FOUNDATION_INSPECTION_ALREADY_RUNNING/);
  first.respond();
  await pending;
  assert.equal(first.terminated,true);
});
