/**
 * P1 portable EXTERNAL asset metadata checkpoint.
 *
 * A JSON checkpoint is inert data, never File authority or writer consent.
 * Binding needs fresh current exact File references, complete content SHA-256,
 * full domain projection validation, then a separate explicit user approval.
 * This is scoped to external audio/subtitle metadata. Existing source-MKV
 * detached-project replay remains a separate separately authorized operation.
 */
import { hashBoundedProjectSource } from './container-project-source-proof.js';
import { inspectLiveWorkspaceAuthority, commitLiveWorkspaceChange } from './live-container-workspace-authority.js';

export const EXTERNAL_CHECKPOINT_SCHEMA = 'mkv-external-metadata-checkpoint-v1';
export const EXTERNAL_CHECKPOINT_MAX_BYTES = 1024 * 1024;
const audioFields=['title','language','default','original','commentary','hearingImpaired'];
const subtitleFields=['title','language','default','forced','original','commentary','hearingImpaired'];
const fieldsFor=kind=>kind==='audio'?audioFields:subtitleFields;
const isPlain=x=>x!==null && typeof x==='object' && (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exactKeys=(o,keys)=>isPlain(o)&&Object.keys(o).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(o,k));
const digestOK=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const textOK=x=>typeof x==='string'&&x.length<=512&&!/[\u0000-\u001f\u007f]/.test(x);
const frozen=x=>Object.freeze(x);
const fail=code=>{throw Error('EXTERNAL_CHECKPOINT_'+code)};
const rowsOf=ctx=>[
  ...(ctx.audioRows||[]).map((row,index)=>({kind:'audio',index,row})),
  ...(ctx.subtitleRows||[]).map((row,index)=>({kind:'subtitle',index,row})),
];
function exactInventory(workspace,ctx) {
  inspectLiveWorkspaceAuthority(workspace,ctx);
  if (!workspace.externalSession) fail('EXTERNAL_OWNER_REQUIRED');
  return rowsOf(ctx);
}
function signature(entry) {
  return {kind:entry.kind,index:entry.index,name:entry.row.file.name,
    size:entry.row.file.size,sidecarName:entry.row.sidecarFile?.name??null,
    sidecarSize:entry.row.sidecarFile?.size??null};
}
function canonicalAttributes(entry) {
  return Object.fromEntries(fieldsFor(entry.kind).map(f=>[f,entry.row[f]]));
}
function validateCheckpoint(input) {
  if (!exactKeys(input,['schema','rows'])||
      input.schema!==EXTERNAL_CHECKPOINT_SCHEMA||
      !Array.isArray(input.rows)||input.rows.length>160) fail('SCHEMA');
  const seen=new Set();
  for(const entry of input.rows) {
    if(!exactKeys(entry,['kind','index','name','size','sha256','sidecarName','sidecarSize','sidecarSha256','attributes'])||
        !['audio','subtitle'].includes(entry.kind)||
        !Number.isSafeInteger(entry.index)||entry.index<0||
        !textOK(entry.name)||!Number.isSafeInteger(entry.size)||entry.size<0||
        !digestOK(entry.sha256)||
        !isPlain(entry.attributes)||
        Object.keys(entry.attributes).length!==fieldsFor(entry.kind).length||
        !fieldsFor(entry.kind).every(k=>Object.hasOwn(entry.attributes,k)))fail('ENTRY');
    const key=entry.kind+':'+entry.index;
    if(seen.has(key))fail('DUPLICATE');
    seen.add(key);
    if((entry.sidecarName===null)!==(entry.sidecarSize===null)||
        (entry.sidecarName===null)!==(entry.sidecarSha256===null)||
        (entry.sidecarName!==null && (!textOK(entry.sidecarName)||
          !Number.isSafeInteger(entry.sidecarSize)||entry.sidecarSize<0||
          !digestOK(entry.sidecarSha256))))fail('SIDECAR');
    for(const field of fieldsFor(entry.kind)) {
      const value=entry.attributes[field];
      if(['title','language'].includes(field)){
        if(typeof value!=='string'||value.length>(field==='title'?160:35)||
          /[\u0000-\u001f\u007f]/.test(value)||
          field==='language'&&!/^[A-Za-z0-9_-]{2,35}$/.test(value))fail('ATTRIBUTES');
      } else if(typeof value!=='boolean')fail('ATTRIBUTES');
    }
  }
  return input;
}
function fileStillCurrent(entry,current) {
  return entry.kind===current.kind && entry.index===current.index &&
    entry.row.file===current.file &&
    (entry.row.sidecarFile??null)===current.sidecar &&
    entry.row.format===current.format &&
    entry.row.identity===current.identity;
}
function witness(inventory) {
  return inventory.map(entry=>({
    kind:entry.kind,index:entry.index,
    file:entry.row.file,sidecar:entry.row.sidecarFile??null,
    format:entry.row.format,identity:entry.row.identity,
  }));
}
function assertWitness(locked,ctx,workspace) {
  const current=exactInventory(workspace,ctx);
  if(current.length!==locked.length||current.some((entry,i)=>
    !fileStillCurrent(entry,locked[i])))fail('INVENTORY_CHANGED');
  return current;
}
async function digestFile(file,options) {
  return await hashBoundedProjectSource(file,options);
}
export async function exportExternalMetadataCheckpoint(workspace,ctx,{hashOptions={}}={}) {
  const inventory=exactInventory(workspace,ctx);
  const locked=witness(inventory),generation=workspace.generation;
  const rows=[];
  for(const entry of inventory) {
    const snap=signature(entry);
    const attrs=canonicalAttributes(entry);
    const sha256=await digestFile(entry.row.file,hashOptions);
    const sidecarSha256=entry.row.sidecarFile?
      await digestFile(entry.row.sidecarFile,hashOptions):null;
    assertWitness(locked,ctx,workspace);
    if(workspace.generation!==generation)fail('DRAFT_CHANGED_DURING_HASH');
    rows.push({...snap,sha256,sidecarSha256,attributes:attrs});
  }
  assertWitness(locked,ctx,workspace);
  if(workspace.generation!==generation)fail('DRAFT_CHANGED_DURING_HASH');
  return JSON.stringify(validateCheckpoint({
    schema:EXTERNAL_CHECKPOINT_SCHEMA,rows,
  }),null,2)+'\n';
}
export function parseExternalMetadataCheckpoint(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>
      EXTERNAL_CHECKPOINT_MAX_BYTES)fail('TOO_LARGE');
  let parsed;try{parsed=JSON.parse(text)}catch{fail('INVALID_JSON')}
  validateCheckpoint(parsed);
  // The result must not be treated as a grant: imported JSON is attacker editable.
  return frozen({schema:parsed.schema,rows:frozen(parsed.rows.map(r=>
    frozen({...r,attributes:frozen({...r.attributes})}))),authorization:'requires-current-file-rebind'});
}

/**
 * Explicitly stage a checkpoint only after all current File/sidecar bytes have
 * been checked. Recheck original File refs and all domain fields after each
 * await; any concurrent UI change invalidates the stage.
 */
export async function prepareExternalMetadataRecovery(workspace,ctx,checkpoint,{hashOptions={}}={}) {
  if(checkpoint?.authorization!=='requires-current-file-rebind')
    fail('IMPORTED_DRAFT_REQUIRED');
  const entries=validateCheckpoint({schema:checkpoint.schema,rows:checkpoint.rows});
  const inventory=exactInventory(workspace,ctx),locked=witness(inventory);
  const owner=workspace.project,generation=workspace.generation;
  if(inventory.length!==entries.rows.length)fail('RESOURCE_COUNT_CHANGED');
  const changes=[];
  for(let i=0;i<inventory.length;i++){
    const row=inventory[i],saved=entries.rows[i],s=signature(row);
    if(saved.kind!==s.kind||saved.index!==s.index||saved.name!==s.name||
        saved.size!==s.size||saved.sidecarName!==s.sidecarName||
        saved.sidecarSize!==s.sidecarSize)fail('RESOURCE_IDENTITY_MISMATCH');
    if(await digestFile(row.row.file,hashOptions)!==saved.sha256)
      fail('RESOURCE_DIGEST_MISMATCH');
    if(saved.sidecarSha256!==null&&
        await digestFile(row.row.sidecarFile,hashOptions)!==saved.sidecarSha256)
      fail('SIDECAR_DIGEST_MISMATCH');
    assertWitness(locked,ctx,workspace);
    if(workspace.project!==owner||workspace.generation!==generation)
      fail('DRAFT_CHANGED_DURING_HASH');
    for(const field of fieldsFor(row.kind))
      if(row.row[field]!==saved.attributes[field])changes.push({
        kind:row.kind,index:row.index,field,value:saved.attributes[field],
      });
  }
  return frozen({
    schema:'prepared-external-recovery-v1',
    changes:frozen(changes.map(c=>frozen(c))),
    references:frozen(locked.map(frozen)),
    project:owner,generation,checkpoint,
    approved:false,writerAuthorized:false,
  });
}
/**
 * Called ONLY from a separate real consent action. Atomic across all external
 * metadata rows. Undo is a compare-and-swap of the EXACT accepted revision;
 * a later edit or File switch invalidates the undo receipt.
 */
export function applyPreparedExternalRecovery(workspace,ctx,prepared,{confirmed=false}={}) {
  if(!confirmed)fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if(prepared?.schema!=='prepared-external-recovery-v1'||
      prepared.approved||prepared.project!==workspace.project||
      prepared.generation!==workspace.generation)fail('STALE_PREPARED_RECOVERY');
  assertWitness(prepared.references,ctx,workspace);
  const changes=prepared.changes;
  if(!changes.length)return frozen({status:'no-change',undo:null,writerAuthorized:false});
  const previous=changes.map(change=>({
    ...change,value:rowsOf(ctx).find(r=>r.kind===change.kind&&r.index===change.index).row[change.field],
  }));
  const before=workspace.project;
  const result=commitLiveWorkspaceChange(workspace,{
    ...ctx,kind:'external-tracks',changes,
  });
  return frozen({
    status:result.status,applied:changes.length,writerAuthorized:false,
    undo:frozen({schema:'external-metadata-recovery-undo-v1',
      project:workspace.project,sourceBefore:before,
      references:prepared.references,changes:frozen(previous.map(frozen))}),
  });
}
export function undoAppliedExternalRecovery(workspace,ctx,receipt) {
  if(receipt?.schema!=='external-metadata-recovery-undo-v1'||
      workspace.project!==receipt.project)fail('UNDO_STALE_REVISION');
  assertWitness(receipt.references,ctx,workspace);
  return commitLiveWorkspaceChange(workspace,{
    ...ctx,kind:'external-tracks',changes:receipt.changes,
  });
}
