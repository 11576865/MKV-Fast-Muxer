import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EMBEDDED_SUBRIP_BYTES,secondarySubripEligibility,
  createSecondarySubripEntry,pruneSecondarySubtitlesForSource,
} from '../src/embedded-subtitle-composition.js';

const sourceA=Object.assign(new Blob(['mkv A']),{name:'A.mkv',lastModified:123});
const sourceB=Object.assign(new Blob(['mkv B']),{name:'B.mkv',lastModified:124});
const row={kind:'container',key:'source-a',file:sourceA};
const stream={index:3,codec_type:'subtitle',codec_name:'subrip',
  tags:{language:'eng',title:'Meaningful captions'}};
const bytes=new TextEncoder().encode('1\n00:00:02,000 --> 00:00:04,000\nHello, B.\n');
const makeFile=(parts,name,options)=>Object.assign(new Blob(parts,{type:options.type}),{
  name,lastModified:options.lastModified,
});

test('P3 original SubRip track becomes a normal included SRT with exact byte and source provenance',async()=>{
  const entry=createSecondarySubripEntry({sourceEntry:row,stream,bytes,createFile:makeFile});
  assert.equal(entry.kind,'subtitle');
  assert.equal(entry.status,'recognized');
  assert.equal(entry.embeddedOrigin.sourceFile,sourceA);
  assert.equal(entry.embeddedOrigin.sourceKey,'source-a');
  assert.equal(entry.embeddedOrigin.streamIndex,3);
  assert.equal(entry.embeddedOrigin.language,'eng');
  assert.match(entry.file.name,/stream-3\.eng\.srt$/);
  assert.deepEqual(new Uint8Array(await entry.file.arrayBuffer()),bytes);
  assert.equal(secondarySubripEligibility(stream,[entry],sourceA).allowed,false);
  assert.equal(secondarySubripEligibility(stream,[entry],sourceB).allowed,true,
    'another source with same track index does not collide with A');
  assert.deepEqual(pruneSecondarySubtitlesForSource([row,entry,{file:sourceB}],sourceA),
    [row,{file:sourceB}]);
});

test('P3 refuses codec mismatches, unknown stream index and an embedded ASS without proven font closure',()=>{
  for(const bad of [
    {...stream,codec_name:'ass'}, {...stream,codec_type:'audio'},
    {...stream,index:-1},{...stream,index:1.5},
  ]) assert.equal(secondarySubripEligibility(bad,[],sourceA).allowed,false);
});

test('P3 fails closed for wrong source, missing content or unrecognized subtitle bytes',()=>{
  const base={sourceEntry:row,stream,bytes,createFile:makeFile};
  assert.throws(()=>createSecondarySubripEntry({...base,sourceEntry:{...row,kind:'unknown'}}),
    /SOURCE_INVALID/);
  assert.throws(()=>createSecondarySubripEntry({...base,bytes:new Uint8Array()}),
    /SIZE_OUT_OF_BOUNDS/);
  assert.throws(()=>createSecondarySubripEntry({...base,bytes:Uint8Array.of(0,1,2)}),
    /CONTENT_NOT_SUBRIP/);
  assert.throws(()=>createSecondarySubripEntry({...base,
    existingEntries:[createSecondarySubripEntry(base)]}),/NOT_ELIGIBLE/);
  assert.ok(MAX_EMBEDDED_SUBRIP_BYTES>0);
  assert.throws(()=>createSecondarySubripEntry({...base,bytes:new Uint8Array(MAX_EMBEDDED_SUBRIP_BYTES+1)}),
    /SIZE_OUT_OF_BOUNDS/);
});
