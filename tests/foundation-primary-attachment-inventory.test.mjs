import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatroskaAttachmentReader} from '../src/matroska-attachment-reader.js';

const enc=new TextEncoder();
const id={ebml:'1a45dfa3',doc:'4282',segment:'18538067',
  attachments:'1941a469',attached:'61a7',fileName:'466e',
  mime:'4660',description:'467e',data:'465c',uid:'46ae',
  tracks:'1654ae6b'};
function element(hex,name,bytes,children=null,uid=null){
  const idBytes=Buffer.from(hex,'hex');
  const data=children?Buffer.concat(children.map(x=>x.raw)):Buffer.from(bytes||[]);
  assert.ok(data.length<0x0fffffff);
  const size=Buffer.from([0x10|((data.length>>>24)&0xf),
    (data.length>>>16)&255,(data.length>>>8)&255,data.length&255]);
  const raw=Buffer.concat([idBytes,size,data]);
  return {hex,name,raw,header:idBytes.length+4,children,uid};
}
const leaf=(hex,name,value,uid=null)=>element(hex,name,value,null,uid);
const master=(hex,name,children)=>element(hex,name,[],children);
function mkv(attachmentBytes=Buffer.from([15,16,17,18])){
  const name=leaf(id.fileName,'FileName',enc.encode('档案 manifest.json'));
  const mime=leaf(id.mime,'FileMediaType',enc.encode('application/json'));
  const description=leaf(id.description,'FileDescription',enc.encode('说明测试'));
  const data=leaf(id.data,'FileData',attachmentBytes);
  const uid=leaf(id.uid,'FileUID',
    Buffer.from('ed123456789abcde','hex'),'17082773882564951262');
  const attached=master(id.attached,'AttachedFile',[
    name,mime,uid,description,data,
  ]);
  const ebml=master(id.ebml,'EBMLHead',[
    leaf(id.doc,'EBMLDocType',enc.encode('matroska')),
  ]);
  const segment=master(id.segment,'Segment',[
    master(id.tracks,'Tracks',[]),
    master(id.attachments,'Attachments',[attached]),
  ]);
  const fileBytes=Buffer.concat([ebml.raw,segment.raw]);
  const nodes=[];
  function collect(el,offset,depth){
    const end=offset+el.raw.length;
    const node={
      id:'0x'+el.hex.padStart(8,'0'),
      name:el.name,
      depth,offset:String(offset),endOffset:String(end),
      dataBytes:String(el.raw.length-el.header),
      master:el.children!==null,finite:true,
      ...(el.uid?{uintValue:el.uid}:{}),
    };
    nodes.push(node);
    let at=offset+el.header;
    for(const child of el.children||[]){
      collect(child,at,depth+1);
      at+=child.raw.length;
    }
  }
  collect(ebml,0,0);collect(segment,ebml.raw.length,0);
  const blob=new Blob([fileBytes]);
  const reads=[];
  const file={name:'档案.mkv',size:blob.size,lastModified:2,
    slice(start,end,type){reads.push({start,end});
      return blob.slice(start,end,type);}};
  return {file,nodes,reads,attachmentBytes,dataNode:nodes.find(x=>x.name==='FileData')};
}
class Worker {
  constructor(result,autodeliver=true){
    this.result=result;this.autodeliver=autodeliver;this.terminated=false;
  }
  postMessage(message){
    if(this.autodeliver)queueMicrotask(()=>this.onmessage?.({data:this.result}));
  }
  terminate(){this.terminated=true;}
}
const response=(file,nodes)=>({
  ok:true,structured:{schema:'foundation-matroska-structured-tree-v0',
    nodes,nodeCount:nodes.length},
  workerStats:{usedWorkerFS:true,stagedEntireFileInMemfs:false,
    fileBytes:file.size,fileReaderSyncCalls:5,bytesRequested:50,
    largestSliceBytes:8},
});
const summary=inventory=>inventory.attachments.map(x=>({
  id:x.id,ordinal:x.ordinal,filename:x.filename,mimeType:x.mimeType,
  description:x.description,fileUid:x.fileUid,byteLength:x.byteLength,
  dataRange:x.dataRange,
}));
test('Foundation-primary replaces the JS EBML scanner and returns exact legacy attachment fields',async()=>{
  const {file,nodes,reads,attachmentBytes,dataNode}=mkv();
  const legacyReader=createMatroskaAttachmentReader(file);
  const legacy=await legacyReader.inspect();
  assert.equal(legacy.state,'inspected');
  reads.length=0;
  const worker=new Worker(response(file,nodes));
  const primaryReader=createMatroskaAttachmentReader(file,{
    inspectionBackend:'foundation-primary',foundationWorkerFactory:()=>worker,
  });
  const primary=await primaryReader.inspect();
  assert.equal(primary.state,'inspected',primary.diagnostic?.code);
  assert.deepEqual(summary(primary),summary(legacy));
  assert.deepEqual(primary.structure,legacy.structure);
  assert.equal(primary.scanning.structureBackend,'foundation-libmatroska-c-wasm');
  assert.equal(primary.scanning.headerCount,0);
  assert.equal(primary.scanning.fileDataBytesRead,0);
  assert.ok(reads.length>0);
  // Only UTF-8 metadata bytes, no EBML header reads or attachment FileData.
  const payloadStart=Number(dataNode.endOffset)-Number(dataNode.dataBytes);
  assert.equal(reads.some(r=>r.start===payloadStart),false);
  assert.ok(reads.every(r=>r.end-r.start<=4096));
  assert.equal(worker.terminated,true);
  const id=primary.attachments[0].id;
  assert.deepEqual(Buffer.from(await primaryReader.openAttachment(id).data.arrayBuffer()),
    attachmentBytes);
});

test('Foundation-primary never silently falls back when runtime is missing',async()=>{
  const {file}=mkv();
  const reader=createMatroskaAttachmentReader(file,{
    inspectionBackend:'foundation-primary',
  });
  const result=await reader.inspect();
  assert.equal(result.state,'unverified');
  assert.equal(result.diagnostic.code,'FOUNDATION_WORKER_RUNTIME_NOT_CONFIGURED');
  assert.throws(()=>reader.openAttachment('attachment:0:uid:1'),
    /ATTACHMENT_INSPECTION_REQUIRED/);
});

test('Foundation-primary rejects duplicated critical fields and invalid typed byte spans',async()=>{
  const builders=[
    nodes=>{const x=nodes.find(n=>n.name==='FileData');
      const at=nodes.indexOf(x);nodes.splice(at,0,{...x});},
    nodes=>{nodes.find(n=>n.name==='FileUID').uintValue=undefined;},
    nodes=>{nodes.find(n=>n.name==='FileData').dataBytes='999999999';},
    nodes=>{nodes.find(n=>n.name==='EBMLDocType').id='0x00004283';},
  ];
  for(const edit of builders){
    const {file,nodes}=mkv();
    edit(nodes);
    const reader=createMatroskaAttachmentReader(file,{
      inspectionBackend:'foundation-primary',
      foundationWorkerFactory:()=>new Worker(response(file,nodes)),
    });
    const result=await reader.inspect();
    assert.equal(result.state,'unverified');
    assert.deepEqual(result.attachments,[]);
  }
});

test('Foundation-primary invalidates current inventory and terminates pending Worker on reinspection',async()=>{
  const {file,nodes}=mkv();let worker;
  const reader=createMatroskaAttachmentReader(file,{
    inspectionBackend:'foundation-primary',
    foundationWorkerFactory:()=>{worker=new Worker(response(file,nodes),false);return worker;},
  });
  const first=reader.inspect();
  const second=reader.inspect();
  const firstResult=await first;
  assert.equal(firstResult.state,'unverified');
  assert.equal(worker.terminated,false); // second call owns the current Worker
  reader.cancelFoundationInspection();
  const secondResult=await second;
  assert.equal(secondResult.state,'unverified');
  assert.equal(worker.terminated,true);
});
