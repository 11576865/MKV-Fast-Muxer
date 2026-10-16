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
}])=>({
  status:'pass', verified:observations.length, total:observations.length,
  evidence:'source-vs-final-mkv-ebml-filedata-sha256-v1',
  scope:'original-attachment-filedata-only', observations,
});
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

test('finished attachment missing from ffprobe inventory is diagnosed before SHA proof',()=>{
  const out=inspect({outputProbe:probe([])});
  assert.equal(out.entries[0].status,'unavailable');
  assert.equal(out.entries[0].reasonCode,'OUTPUT_ATTACHMENT_MISSING');
  assert.match(out.entries[0].message,/最终 MKV/);
  assert.equal(out.entries[0].savedToDiskVerified,false);
});

test('MIME mismatch and duplicate output identity are explicit failures even with a passing byte audit',()=>{
  const actual=probe();
  actual.streams[0].tags.mimetype='application/octet-stream';
  const changed=inspect({outputProbe:actual});
  assert.equal(changed.entries[0].status,'unavailable');
  assert.equal(changed.entries[0].reasonCode,'OUTPUT_MIME_MISMATCH');
  const missingMime=probe();
  delete missingMime.streams[0].tags.mimetype;
  assert.equal(inspect({outputProbe:missingMime}).entries[0].reasonCode,'OUTPUT_MIME_MISMATCH');
  const duplicated=inspect({outputProbe:probe(['renamed.ttf','renamed.ttf'])});
  assert.equal(duplicated.entries[0].reasonCode,'OUTPUT_NAME_AMBIGUOUS');
});

test('structurally present attachment with no trusted FileData proof stays unverified',()=>{
  const report=inspect({payloadAudit:payload([])});
  assert.equal(report.entries[0].status,'unavailable');
  assert.equal(report.entries[0].reasonCode,'FILEDATA_AUDIT_UNTRUSTED');
  assert.equal(report.entries[0].uidRelationsVerified,false);
});

test('per-row source identity and incomplete observations are not invented',()=>{
  assert.equal(inspect({sourceRows:rows().map((x,i)=>i?x:{...x,index:-1})}).entries[0].status,'unavailable');
  assert.equal(inspect({payloadAudit:payload([{sourceFilename:'original.ttf',outputFilename:'renamed.ttf',sha256:'',byteLength:64}])}).entries[0].status,'unavailable');
  assert.deepEqual(auditSourceAttachmentDelivery().entries,[]);
});

test('a forged or incomplete FileData audit cannot authorize verified delivery',()=>{
  const forged=[
    { ...payload(), evidence:'some-other-audit' },
    { ...payload(), scope:'ffprobe-stream-metadata' },
    { ...payload(), verified:2 },
    { ...payload(), total:0 },
    { ...payload(), status:'unavailable' },
    payload([{sourceFilename:'original.ttf',outputFilename:'renamed.ttf',
      sha256:'not-a-digest',byteLength:64}]),
    payload([{sourceFilename:'original.ttf',outputFilename:'renamed.ttf',
      sha256:'a'.repeat(64),byteLength:0}]),
  ];
  for(const candidate of forged){
    const out=inspect({payloadAudit:candidate});
    assert.equal(out.entries[0].status,'unavailable',
      'forged/inconsistent receipt must not claim FileData verification');
    assert.equal(out.entries[0].reasonCode,'FILEDATA_AUDIT_UNTRUSTED');
    assert.equal(out.entries[0].savedToDiskVerified,false);
  }
});

test('partially successful genuine audit can verify one observed byte match only',()=>{
  const genuine={...payload(),status:'warning',total:2};
  const out=inspect({payloadAudit:genuine});
  assert.equal(out.entries[0].status,'filedata-verified');
  assert.equal(out.entries[0].reasonCode,'VERIFIED_FILEDATA');
  assert.equal(out.entries[0].uidRelationsVerified,false);
});

test('failure reasons discriminate stale inventory, ambiguous attachment and failed ffprobe',()=>{
  const missing=inspect({outputProbe:null});
  assert.equal(missing.entries[0].reasonCode,'OUTPUT_INVENTORY_UNAVAILABLE');
  const duplicate=rows();duplicate[1].originalFilename='original.ttf';
  assert.equal(inspect({sourceRows:duplicate}).entries[0].reasonCode,'SOURCE_NAME_AMBIGUOUS');
  const renamedCollision=inspect({outputProbe:probe(['renamed.ttf','renamed.ttf'])});
  assert.equal(renamedCollision.entries[0].reasonCode,'OUTPUT_NAME_AMBIGUOUS');
  assert.equal(inspect({ffprobeStatus:'warning'}).entries[1].reasonCode,'OUTPUT_AUDIT_NOT_PASS');
  assert.equal(inspect({outputProbe:probe(['renamed.ttf','notes.txt'])}).entries[1].reasonCode,
    'EXCLUDED_IDENTITY_AMBIGUOUS');
});
