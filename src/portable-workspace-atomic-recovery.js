/**
 * S09 narrowly bounded cross-domain metadata replay. This is one synchronous
 * commit over the existing shared ContainerProject and actual executor rows.
 *
 * Two independent byte proofs are mandatory. The same live source File and
 * external File/sidecar references must remain bound through preparation.
 * No File grants, writer permission, mux, output or untrusted JSON can commit.
 */
import {prepareVerifiedTrackReplay,applyPreparedTrackReplay}
  from './container-project-restore.js';
import {prepareExternalMetadataRecovery}
  from './portable-external-project-recovery.js';
import {inspectLiveWorkspaceAuthority} from './live-container-workspace-authority.js';
import {applyContainerProjectEdit} from './container-project.js';

export const ATOMIC_WORKSPACE_REPLAY_SCHEMA='atomic-workspace-replay-v1';
const SOURCE_FIELDS=['include','title','language','default','forced',
  'original','commentary','hearingImpaired'];
const ATTACH_FIELDS=['include','filename','mimetype'];
const fail=s=>{throw Error('WORKSPACE_ATOMIC_'+s)};
const rowsOf=context=>[
  ...(context.audioRows||[]).map((row,index)=>({kind:'audio',index,row})),
  ...(context.subtitleRows||[]).map((row,index)=>({kind:'subtitle',index,row})),
];
const valueOf=(obj,field)=>field==='include'?obj.included:obj.attributes[field];
const fieldEdit=(field)=>field==='include'?'include':'set-attribute';
function setSemantic(current,id,field,value){
  const obj=current.objects.find(x=>x.id===id);
  if(!obj)fail('PROJECT_OBJECT_MISSING');
  const from=valueOf(obj,field);
  if(from===value)return current;
  return applyContainerProjectEdit(current,{
    type:fieldEdit(field),objectId:id,
    ...(field==='include'?{}:{field}),
    value,
  });
}
function witnessExternal(prepared,context){
  const now=rowsOf(context),refs=prepared.external.references;
  if(now.length!==refs.length)fail('EXTERNAL_INVENTORY_CHANGED');
  for(let i=0;i<now.length;i++){
    const row=now[i],ref=refs[i];
    if(row.kind!==ref.kind||row.index!==ref.index||
       row.row.file!==ref.file||
       (row.row.sidecarFile??null)!==ref.sidecar||
       row.row.format!==ref.format||row.row.identity!==ref.identity)
      fail('EXTERNAL_IDENTITY_CHANGED');
  }
  return now;
}
function assertCurrent(prepared,workspace,context){
  if(prepared?.schema!==ATOMIC_WORKSPACE_REPLAY_SCHEMA||
     !workspace||workspace!==prepared.workspace||
     context?.source!==prepared.source||
     context.trackState!==prepared.trackState||
     workspace.project!==prepared.project||
     workspace.generation!==prepared.generation||
     workspace.sourceSession?.trackState!==prepared.trackState||
     workspace.sourceSession?.source!==prepared.source||
     prepared.external.project!==workspace.project||
     prepared.external.generation!==workspace.generation)
    fail('PREPARED_STALE');
  inspectLiveWorkspaceAuthority(workspace,context);
  return witnessExternal(prepared,context);
}
function validateEditorReplay(plan,trackState){
  // Existing source replay validates *every* track and attachment against
  // the precise current stream before it mutates. Run it on independent
  // shallow executor shadows with their original stream identity intact.
  const shadow={...trackState,
    tracks:trackState.tracks.map(row=>({...row})),
    attachments:trackState.attachments.map(row=>({...row})),
  };
  applyPreparedTrackReplay(plan,shadow);
}
function compile(prepared,workspace,context,direction='forward'){
  const undo=direction==='undo';
  const source=workspace.sourceSession;
  const external=workspace.externalSession;
  const project=workspace.project;
  let next=project;
  const assignments=[];
  const schedule=(row,field,value)=>{
    if(!row||!Object.hasOwn(row,field)||typeof value!==typeof row[field])
      fail('EDITOR_ASSIGNMENT_INVALID');
    const d=Object.getOwnPropertyDescriptor(row,field);
    if(d&&!d.writable&&!d.set)fail('EDITOR_READONLY');
    if(row[field]!==value)assignments.push({row,field,before:row[field],after:value});
  };
  const patches=prepared.sourcePlan.tracks;
  for(const patch of patches){
    const id=source.targets.get(patch.kind+':'+patch.index);
    const row=context.trackState.tracks.find(r=>r.index===patch.index&&r.type===patch.kind);
    if(!id||!row)fail('SOURCE_OBJECT_CHANGED');
    const before=undo?patch.after:patch.before;
    const after=undo?patch.before:patch.after;
    const current=project.objects.find(o=>o.id===id);
    if(!current||SOURCE_FIELDS.some(f=>valueOf(current,f)!==before[f]))
      fail('SOURCE_SEMANTIC_DRIFT');
    for(const field of SOURCE_FIELDS){
      next=setSemantic(next,id,field,after[field]);
      schedule(row,field,after[field]);
    }
  }
  for(const patch of prepared.sourcePlan.attachments||[]){
    const id=source.attachmentTargets.get('attachment:'+patch.index);
    const row=context.trackState.attachments.find(r=>r.index===patch.index);
    if(!id||!row)fail('ATTACHMENT_OBJECT_CHANGED');
    const before=undo?patch.after:patch.before;
    const after=undo?patch.before:patch.after;
    const old=project.objects.find(o=>o.id===id);
    if(!old||old.included!==before.include||
       old.attributes.name!==before.filename||
       old.attributes.mime!==before.mimetype)
      fail('ATTACHMENT_SEMANTIC_DRIFT');
    for(const [rowField,domainField] of [
      ['include','include'],['filename','name'],['mimetype','mime']]){
      next=setSemantic(next,id,domainField,after[rowField]);
      schedule(row,rowField,after[rowField]);
    }
  }
  // Order is a cohort permutation, not an independent FFmpeg ordinal.
  for(const kind of ['audio','subtitle']){
    const cohort=context.trackState.tracks.filter(r=>r.type===kind);
    if(!cohort.some(row=>patches.some(p=>p.index===row.index&&
        p.kind===kind&&p.before.order!==p.after.order)))continue;
    const members=cohort.map(row=>{
      const id=source.targets.get(kind+':'+row.index);
      const obj=project.objects.find(o=>o.id===id);
      const patch=patches.find(p=>p.kind===kind&&p.index===row.index);
      if(!obj||!id)fail('ORDER_MEMBER_UNBOUND');
      return {row,id,domainOrder:obj.order,
        targetOrder:(undo?patch?.before.order:patch?.after.order)??row.order};
    });
    const slots=members.map(x=>x.domainOrder).sort((a,b)=>a-b);
    const ordinals=members.map(x=>x.targetOrder);
    if(new Set(ordinals).size!==members.length||
       new Set(slots).size!==members.length)fail('ORDER_PERMUTATION_INVALID');
    const sorted=[...members].sort((a,b)=>a.targetOrder-b.targetOrder);
    for(let i=0;i<sorted.length;i++){
      const item=sorted[i];
      const original=project.objects.find(o=>o.id===item.id);
      if(original.order!==item.domainOrder)fail('ORDER_PROJECT_DRIFT');
      if(original.order!==slots[i]){
        next=applyContainerProjectEdit(next,{type:'reorder',
          objectId:item.id,value:slots[i]});
      }
    }
    for(const patch of patches.filter(p=>p.kind===kind&&
        p.before.order!==p.after.order)){
      const row=cohort.find(r=>r.index===patch.index);
      schedule(row,'order',undo?patch.before.order:patch.after.order);
    }
  }

  const currentExternal=rowsOf(context);
  for(const change of prepared.external.changes){
    const ref=prepared.external.references.find(r=>r.kind===change.kind&&
      r.index===change.index);
    const entry=currentExternal.find(r=>r.kind===change.kind&&
      r.index===change.index);
    const id=external.keys.get(change.kind+':'+change.index);
    const obj=project.objects.find(o=>o.id===id);
    if(!ref||!entry||!id||!obj)fail('EXTERNAL_OBJECT_CHANGED');
    const initial=entry.row[change.field];
    const value=undo?prepared.externalBefore.find(c=>c.kind===change.kind&&
      c.index===change.index&&c.field===change.field)?.value:change.value;
    if(value===undefined||obj.attributes[change.field]!==initial)
      fail('EXTERNAL_SEMANTIC_DRIFT');
    next=setSemantic(next,id,change.field,value);
    schedule(entry.row,change.field,value);
  }
  if(next===project)fail('NO_CHANGES');
  return {project:next,assignments};
}
function publish(workspace,result){
  // Pure semantic construction and all row/identity checks have already
  // succeeded. No awaits, File I/O or user-defined plugin callbacks here.
  for(const change of result.assignments)change.row[change.field]=change.after;
  workspace.project=result.project;
  if(workspace.sourceSession) {
    workspace.sourceSession.project=result.project;
    workspace.sourceSession.generation++;
  }
  if(workspace.externalSession){
    workspace.externalSession.project=result.project;
    workspace.externalSession.generation++;
  }
  workspace.generation++;
}

export async function prepareAtomicWorkspaceRecovery({
  workspace,context,sourceDraft,sourceProof,liveProjection,
  externalCheckpoint,appendMode=false,hashOptions={},
}={}){
  if(!workspace?.sourceSession||!workspace?.externalSession||
     !sourceDraft||!externalCheckpoint||!sourceProof?.matched||
     sourceProof.state!=='digest-matches-draft'||!context?.source||
     workspace.sourceSession.source!==context.source)
    fail('DUAL_VERIFIED_SOURCES_REQUIRED');
  inspectLiveWorkspaceAuthority(workspace,context);
  const project=workspace.project,generation=workspace.generation;
  const sourcePlan=prepareVerifiedTrackReplay({
    draft:sourceDraft,liveProjection,sourceProof,
    trackState:context.trackState,appendMode,
  });
  const external=await prepareExternalMetadataRecovery(
    workspace,context,externalCheckpoint,{hashOptions});
  if(workspace.project!==project||workspace.generation!==generation||
     workspace.sourceSession.source!==context.source||
     workspace.sourceSession.trackState!==context.trackState)
    fail('CHANGED_DURING_HASH');
  if(!sourcePlan.tracks.length&&!sourcePlan.attachments.length)
    fail('SOURCE_HAS_NO_EDIT_DELTA');
  if(!external.changes.length)fail('EXTERNAL_HAS_NO_EDIT_DELTA');
  const prepared=Object.freeze({
    schema:ATOMIC_WORKSPACE_REPLAY_SCHEMA,
    workspace,source:context.source,trackState:context.trackState,
    sourcePlan,external,project,generation,
    externalBefore:Object.freeze(external.changes.map(c=>Object.freeze({
      ...c,value:rowsOf(context).find(r=>r.kind===c.kind&&r.index===c.index).row[c.field],
    }))),
    executionAuthorized:false,writerAuthorized:false,
  });
  assertCurrent(prepared,workspace,context);
  validateEditorReplay(sourcePlan,context.trackState);
  // Complete pure dry run catches invalid projections and history budgets
  // BEFORE presenting the final explicit consent checkbox.
  compile(prepared,workspace,context);
  return prepared;
}
export function applyAtomicWorkspaceRecovery(workspace,context,prepared,{confirmed=false}={}){
  if(!confirmed)fail('EXPLICIT_CONFIRMATION_REQUIRED');
  assertCurrent(prepared,workspace,context);
  validateEditorReplay(prepared.sourcePlan,context.trackState);
  const staged=compile(prepared,workspace,context);
  publish(workspace,staged);
  return Object.freeze({
    status:'committed-both-domains',
    sourceFields:prepared.sourcePlan.proposedCount,
    externalFields:prepared.external.changes.length,
    sourceTracks:prepared.sourcePlan.tracks.length,
    sourceAttachments:prepared.sourcePlan.attachments.length,
    writerAuthorized:false,fileWritten:false,muxStarted:false,
    undo:Object.freeze({schema:'atomic-workspace-undo-v1',
      prepared,afterProject:workspace.project,afterGeneration:workspace.generation,
      assigned:Object.freeze(staged.assignments.map(change=>Object.freeze({
        ...change,
      }))),
    }),
  });
}
export function undoAtomicWorkspaceRecovery(workspace,context,receipt){
  if(receipt?.schema!=='atomic-workspace-undo-v1'||
     !receipt.prepared||workspace.project!==receipt.afterProject||
     workspace.generation!==receipt.afterGeneration)
    fail('UNDO_STALE');
  const prepared=receipt.prepared;
  if(workspace!==prepared.workspace||context.source!==prepared.source||
     context.trackState!==prepared.trackState)fail('UNDO_SOURCE_CHANGED');
  inspectLiveWorkspaceAuthority(workspace,context);
  witnessExternal(prepared,context);
  if(receipt.assigned.some(x=>x.row[x.field]!==x.after))fail('UNDO_EDITOR_CHANGED');
  // Reverse the same stable slots, but against the exact accepted project.
  const reversed={
    ...prepared,project:workspace.project,generation:workspace.generation,
    external:{...prepared.external,project:workspace.project,
      generation:workspace.generation},
  };
  const staged=compile(reversed,workspace,context,'undo');
  publish(workspace,staged);
  return Object.freeze({status:'reverted-both-domains',
    writerAuthorized:false,fileWritten:false,muxStarted:false});
}
