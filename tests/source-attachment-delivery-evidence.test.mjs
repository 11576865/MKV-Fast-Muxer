import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSourceAttachmentDelivery } from '../src/source-attachment-delivery-evidence.js';

const rows=()=>[
  {index:3,originalFilename:'original.ttf',filename:'renamed.ttf',
   originalMimetype:'font/ttf',mimetype:'font/ttf',include:true},
  {index:4,originalFilename:'notes.txt',filename:'notes.txt',
   originalMimetype:'text/plain',mimetype:'text/plain',include:false},
];
const probe=(names=['renamed.ttf'])=>({streams:names.map((name,index)=>({
  index,codec_type:'attachment',tags:{filename:name,mimetype:'font/ttf'},
}))});
const payload=(observations=[{
  sourceFilename:'original.ttf',outputFilename:'renamed.ttf',
  sha256:'a'.repeat(64),byteLength:64,uidRetained:false,
}])=>({status:'pass',verified:observations.length,observations});
const inspect=(changes={})=>auditSourceAttachmentDelivery({
  sourceRows:rows(),outputProbe:probe(),payloadAudit:payload(),
  ffprobeStatus:'pass',...changes,
});

test('rename+preserve requires independent output FileData SHA while exclusion requires passing ffprobe inventory',()=>{
  const out=inspect();
  assert.deepEqual(out.entries.map(x=>x.status),['filedata-verified','absent-in-probe']);
  assert.equal(out.verifiedFileData,1);
  assert.equal(out.observedAbsent,1);
  assert.equal(out.unresolved,0);
  assert.equal(out.entries[0].intent,'modify');
  assert.equal(out.entries[1].intent,'exclude');
  assert.equal(out.entries[0].uidRelationsVerified,false);
  assert.equal(out.entries[0].savedToDiskVerified,false);
  assert.ok(Object.isFrozen(out.entries[0]));
});

test('ffprobe pass cannot impersonate independently verified preserved bytes',()=>{
  const out=inspect({payloadAudit:payload([])});
  assert.equal(out.entries[0].status,'unavailable');
  assert.equal(out.entries[1].status,'absent-in-probe');
});

test('unknown output probe and failing audit never infer excluded attachment absence',()=>{
  const unknown=inspect({outputProbe:null});
  assert.deepEqual(unknown.entries.map(x=>x.status),['unavailable','unavailable']);
  assert.equal(inspect({ffprobeStatus:'warning'}).entries[1].status,'unavailable');
  assert.equal(inspect({outputProbe:probe(['renamed.ttf','notes.txt'])}).entries[1].status,'unavailable');
});

test('identical original names or ambiguous output names fail closed',()=>{
  const duplicate=rows();duplicate[1].originalFilename='original.ttf';
  assert.equal(inspect({sourceRows:duplicate}).entries[0].status,'unavailable');
  assert.equal(inspect({outputProbe:probe(['renamed.ttf','renamed.ttf'])}).entries[0].status,'unavailable');
  const collision=rows();collision[1].include=true;collision[1].filename='renamed.ttf';
  assert.equal(inspect({sourceRows:collision}).entries[0].status,'unavailable');
});

test('per-row source identity and incomplete observations are not invented',()=>{
  assert.equal(inspect({sourceRows:rows().map((x,i)=>i?x:{...x,index:-1})}).entries[0].status,'unavailable');
  assert.equal(inspect({payloadAudit:payload([{sourceFilename:'original.ttf',outputFilename:'renamed.ttf',sha256:'',byteLength:64}])}).entries[0].status,'unavailable');
  assert.deepEqual(auditSourceAttachmentDelivery().entries,[]);
});
