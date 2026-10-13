import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContainerProject, applyContainerProjectEdit,
  undoContainerProjectEdit, serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import { auditDetachedContainerProjectIntentChain } from '../src/container-project-intent-audit.js';

function initial() {
  return createContainerProject({
    documentId: 'unbound:test', sources: [{ id:'source:one', name:'clip.mkv' }],
    objects: [
      { id:'subtitle:1', kind:'subtitle', sourceId:'source:one',
        attributes:{ title:'Original',language:'zho' }, order:0 },
      { id:'attachment:2', kind:'attachment', sourceId:'source:one',
        attributes:{ name:'Embedded.ttf',mime:'font/ttf' }, order:1 },
    ],
  });
}
const parsed = project => parseContainerProjectDraft(serializeContainerProject(project));
const altered = (project, fn) => {
  const value = JSON.parse(serializeContainerProject(project));
  fn(value);
  return JSON.stringify(value);
};
test('P1 valid two-step same-field chain remains importable and internally coherent only', () => {
  const a=applyContainerProjectEdit(initial(),{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'First',
  });
  const b=applyContainerProjectEdit(a,{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Second',
  });
  const loaded=parsed(b);
  const check=auditDetachedContainerProjectIntentChain(loaded);
  assert.equal(check.state,'internally-coherent');
  assert.equal(check.intentCount,2);
  assert.equal(check.preview[0].from,'Original');
  assert.equal(check.preview[1].to,'Second');
  assert.equal(loaded.objects[0].attributes.title,'Second');
  assert.equal(check.authorshipProven,false);
  assert.equal(check.originalEditOccurrenceProven,false);
  assert.equal(check.executionAuthorized,false);
  assert.equal(check.changesApplied,false);
});
test('P1 edited final object cannot silently disagree with the final intent', () => {
  const draft=applyContainerProjectEdit(initial(),{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Edited',
  });
  assert.throws(()=>parseContainerProjectDraft(altered(draft, json => {
    json.objects[0].attributes.title='Tampered';
  })),/PROJECT_INTENT_CHAIN_INVALID:TO_STATE_CONTRADICTION/);
});
test('P1 intermediate from value must agree with earlier to value', () => {
  const a=applyContainerProjectEdit(initial(),{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Stage1',
  });
  const b=applyContainerProjectEdit(a,{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Stage2',
  });
  assert.throws(()=>parseContainerProjectDraft(altered(b,json=>{
    json.editIntents[1].from='Invented';
  })),/PROJECT_INTENT_CHAIN_INVALID:TO_STATE_CONTRADICTION/);
  assert.throws(()=>parseContainerProjectDraft(altered(b,json=>{
    const temp=json.editIntents[0].revision;
    json.editIntents[0].revision=json.editIntents[1].revision;
    json.editIntents[1].revision=temp;
  })),/PROJECT_INTENT_CHAIN_INVALID:REVISION_ORDER/);
});
test('P1 no-op and wrong type/field cannot be laundered through a JSON draft', () => {
  const original=applyContainerProjectEdit(initial(),{
    type:'include',objectId:'attachment:2',value:false,
  });
  assert.throws(()=>parseContainerProjectDraft(altered(original,j=>{
    j.editIntents[0].from=false;
  })),/PROJECT_INTENT_CHAIN_INVALID:NOOP_INTENT/);
  assert.throws(()=>parseContainerProjectDraft(altered(original,j=>{
    j.editIntents[0].from='true';
  })),/PROJECT_INTENT_CHAIN_INVALID:INVALID_INCLUDE_VALUE/);
  assert.throws(()=>parseContainerProjectDraft(altered(original,j=>{
    j.editIntents[0].field='title';
  })),/PROJECT_INTENT_CHAIN_INVALID:INAPPLICABLE_FIELD/);
});
test('P1 independent include/reorder/typed attribute edits are internally coherent', () => {
  let x=initial();
  x=applyContainerProjectEdit(x,{type:'include',objectId:'subtitle:1',value:false});
  x=applyContainerProjectEdit(x,{type:'reorder',objectId:'subtitle:1',value:1});
  x=applyContainerProjectEdit(x,{type:'set-attribute',objectId:'attachment:2',field:'mime',value:'application/x-font-ttf'});
  const read=parsed(x),result=auditDetachedContainerProjectIntentChain(read);
  assert.equal(result.intentCount,3);
  assert.equal(read.objects[0].included,false);
  assert.equal(read.objects[0].order,1);
  assert.equal(result.writerEligible,false);
});
test('P1 honest undo revision gaps, no-intent snapshot and old drafts are accepted without proof claims', () => {
  let draft=applyContainerProjectEdit(initial(),{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Discarded',
  });
  draft=undoContainerProjectEdit(draft);
  assert.equal(auditDetachedContainerProjectIntentChain(parsed(draft)).state,'no-recorded-intents');
  draft=applyContainerProjectEdit(draft,{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'After undo',
  });
  const imported=parsed(draft);
  assert.equal(imported.revision,3);
  assert.equal(imported.editIntents[0].revision,3);
  assert.equal(auditDetachedContainerProjectIntentChain(imported).intentCount,1);
});
test('P1 retained audit preview is bounded and never creates execution authorization', () => {
  let project=initial();
  for(let i=0;i<18;i++)project=applyContainerProjectEdit(project,{
    type:'set-attribute',objectId:'subtitle:1',field:'title',value:'Name '+i,
  });
  const result=auditDetachedContainerProjectIntentChain(parsed(project));
  assert.equal(result.intentCount,18);
  assert.equal(result.preview.length,12);
  assert.equal(result.authorshipProven,false);
  assert.equal(result.sourceByteIdentityProven,false);
});
