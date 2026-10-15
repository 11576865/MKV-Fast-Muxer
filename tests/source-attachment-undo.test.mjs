import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureSourceAttachmentUndo, sealSourceAttachmentUndo, planSourceAttachmentUndo,
} from '../src/source-attachment-undo.js';

const attachment = () => ({index:3,include:true,filename:'old.ttf',mimetype:'font/ttf'});
const fixture = () => {
  const source={name:'movie.mkv',size:200,lastModified:1};
  const trackState={attachments:[attachment()]};
  return {source,trackState};
};
const checkpoint = (f, changes, revision=4) => {
  const cap=captureSourceAttachmentUndo({...f,changes});
  for(const c of changes)f.trackState.attachments[0][c.field]=c.value;
  return sealSourceAttachmentUndo(cap,revision);
};
const context = (f,revision=4) => ({...f,revision});

test('undo proposal is an inverse edit for the same immutable domain owner', () => {
  const f=fixture(), p=checkpoint(f,[{index:3,field:'filename',value:'new.ttf'}]);
  assert.equal(Object.isFrozen(p),true);
  assert.deepEqual(planSourceAttachmentUndo(p,context(f)),[
    {index:3,field:'filename',value:'old.ttf'},
  ]);
  assert.equal(f.trackState.attachments[0].filename,'new.ttf',
    'the receipt itself never edits writer-facing rows');
});

test('unrelated project edits and File or scan rebinding invalidate stale undo', () => {
  const f=fixture(),p=checkpoint(f,[{index:3,field:'include',value:false}]);
  assert.equal(planSourceAttachmentUndo(p,context(f,5)),null);
  assert.equal(planSourceAttachmentUndo(p,{...context(f),source:{...f.source}}),null);
  assert.equal(planSourceAttachmentUndo(p,{...context(f),trackState:{...f.trackState}}),null);
  assert.equal(planSourceAttachmentUndo(p,{...context(f),appendMode:true}),null);
  f.trackState.attachments[0].include=true;
  assert.equal(planSourceAttachmentUndo(p,context(f)),null,
    'external mutation must not be silently erased');
});

test('compound inverse that would edit excluded metadata is explicitly unavailable', () => {
  const f=fixture();
  f.trackState.attachments[0].include=false;
  const p=checkpoint(f,[
    {index:3,field:'include',value:true},
    {index:3,field:'filename',value:'included.ttf'},
  ]);
  assert.equal(planSourceAttachmentUndo(p,context(f)),null,
    'one-step undo may not bypass existing excluded-metadata transaction constraints');
});

test('include-only and metadata-only edits remain fully reversible', () => {
  const f=fixture();
  const p=checkpoint(f,[{index:3,field:'include',value:false}]);
  assert.deepEqual(planSourceAttachmentUndo(p,context(f)),[
    {index:3,field:'include',value:true},
  ]);
});

test('empty and no-op changes do not fabricate undo history', () => {
  const f=fixture();
  assert.equal(captureSourceAttachmentUndo({...f,changes:[]}),null);
  assert.equal(captureSourceAttachmentUndo({...f,changes:[{index:9,field:'include',value:false}]}),null);
  const original=captureSourceAttachmentUndo({...f,changes:[{index:3,field:'include',value:true}]});
  assert.equal(sealSourceAttachmentUndo(original,1),null);
});
