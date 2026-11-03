import test from 'node:test';
import assert from 'node:assert/strict';
import {
  embeddedAttachmentEligibility,createEmbeddedAttachmentOutputEntry,
  pruneEmbeddedAttachmentsForRemovedSource,
} from '../src/embedded-attachment-composition.js';

const bytes=Buffer.from('A file inside source A, preserved exactly.\n');
const source=Object.assign(new Blob(['source MKV bytes']),{
  name:'A.mkv',lastModified:1700000000000,
});
const other=Object.assign(new Blob(['another MKV']),{
  name:'B.mkv',lastModified:1700000000001,
});
const sourceEntry={file:source,key:'source-A',kind:'container'};
const attached={
  id:'attachment:0:uid:9007199254740993',
  fileUid:'9007199254740993',filename:'guide.txt',
  mimeType:'text/plain',byteLength:bytes.length,
};
const inventory={state:'inspected',attachments:[attached]};
const createFile=(parts,name,options)=>Object.assign(new Blob(parts,{type:options.type}),{
  name,lastModified:options.lastModified,
});
const reader={
  isCurrentSourceFile:value=>value===source,
  isCurrentInspection:value=>value===inventory,
  openAttachment:id=>{
    assert.equal(id,attached.id);
    return {filename:attached.filename,mimeType:attached.mimeType,
      sourceAssetId:'source-A/blob',declaredSize:bytes.length,
      data:new Blob([bytes],{type:'text/plain'})};
  },
};

test('P3 existing MKV AttachedFile becomes ordinary output member without extracting to disk',async()=>{
  const entry=createEmbeddedAttachmentOutputEntry({
    sourceEntry,reader,inventory,attachmentId:attached.id,createFile,
  });
  assert.equal(entry.kind,'attachment');
  assert.equal(entry.include,true);
  assert.equal(entry.status,'recognized');
  assert.equal(entry.file.name,'guide.txt');
  assert.equal(entry.file.size,bytes.length);
  assert.deepEqual(Buffer.from(await entry.file.arrayBuffer()),bytes);
  assert.equal(entry.embeddedOrigin.sourceFile,source);
  assert.equal(entry.embeddedOrigin.fileUid,attached.fileUid);
  assert.equal(entry.mimeType,'text/plain');
  assert.equal(entry.embeddedOrigin.sourceName,'A.mkv');
  assert.equal(embeddedAttachmentEligibility(attached,[entry],source).allowed,false);
  assert.equal(embeddedAttachmentEligibility(attached,[entry],other).allowed,true,
    'distinct source MKV File grants may contain same UID and same bytes');
  assert.deepEqual(pruneEmbeddedAttachmentsForRemovedSource([sourceEntry,entry,{file:other}],source),
    [sourceEntry,{file:other}]);
});

test('P3 refuses stale source inspection and changed underlying File identity',()=>{
  assert.throws(()=>createEmbeddedAttachmentOutputEntry({
    sourceEntry:{...sourceEntry,file:other},reader,inventory,attachmentId:attached.id,createFile,
  }),/SOURCE_CHANGED/);
  assert.throws(()=>createEmbeddedAttachmentOutputEntry({
    sourceEntry,reader,inventory:{...inventory},attachmentId:attached.id,createFile,
  }),/SOURCE_CHANGED/);
  assert.throws(()=>createEmbeddedAttachmentOutputEntry({
    sourceEntry,reader,inventory,attachmentId:'attachment:missing',createFile,
  }),/NOT_FOUND/);
});

test('P3 does not silently repurpose unsupported or unsafe source data',()=>{
  const disallowed=[
    {...attached,byteLength:0},{...attached,byteLength:16*1024*1024+1},
    {...attached,filename:'../outside.txt'},
    {...attached,filename:'CON.txt'},
    {...attached,mimeType:'not a mime'},
    {...attached,fileUid:'9007199254740993.1'},
  ];
  for(const bad of disallowed)
    assert.equal(embeddedAttachmentEligibility(bad,[],source).allowed,false,
      'unsafe source AttachedFile must not become a ready output member');
});

test('P3 fails closed when opened attachment does not match inspected FileData length',()=>{
  const badReader={...reader,openAttachment:()=>({
    filename:'guide.txt',mimeType:'text/plain',sourceAssetId:'source-A/blob',
    declaredSize:bytes.length,data:new Blob(['different length']),
  })};
  assert.throws(()=>createEmbeddedAttachmentOutputEntry({
    sourceEntry,reader:badReader,inventory,attachmentId:attached.id,createFile,
  }),/INSPECTION_STALE/);
});
