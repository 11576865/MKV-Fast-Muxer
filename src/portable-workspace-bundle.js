/**
 * Single portable, INERT package for the two existing independently
 * authoritative S09 recovery scopes. No source File, Blob, permissions,
 * live model or writer state survives the roundtrip.
 *
 * This is packaging, not a new domain store or an atomic two-domain replay:
 * existing source and external recovery screens retain individual SHA-256
 * rebind and explicit per-domain consent.
 */
import {parseContainerProjectDraft} from './container-project-import.js';
import {parseExternalMetadataCheckpoint} from './portable-external-project-recovery.js';

export const PORTABLE_WORKSPACE_BUNDLE_SCHEMA='softmux-workspace-recovery-bundle-v1';
export const PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES=2*1024*1024;
const fail=code=>{throw Error('WORKSPACE_BUNDLE_'+code)};
const plain=x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null));
const exact=(x,keys)=>plain(x)&&
  Object.keys(x).length===keys.length&&keys.every(key=>Object.hasOwn(x,key));
const validateComponents=obj=>{
  if(!exact(obj,['schema','sourceDraft','externalCheckpoint'])||
      obj.schema!==PORTABLE_WORKSPACE_BUNDLE_SCHEMA||
      !plain(obj.sourceDraft)||
      !(obj.externalCheckpoint===null||plain(obj.externalCheckpoint)))
    fail('SCHEMA');
  // Delegate ALL source-intent and external asset field validation to the
  // already accepted individual checkpoint readers.
  const sourceDraft=parseContainerProjectDraft(JSON.stringify(obj.sourceDraft));
  const externalCheckpoint=obj.externalCheckpoint===null?null:
    parseExternalMetadataCheckpoint(JSON.stringify(obj.externalCheckpoint));
  return Object.freeze({
    schema:PORTABLE_WORKSPACE_BUNDLE_SCHEMA,
    sourceDraft,externalCheckpoint,
    requiresCurrentFiles:true,
    requiresSeparateVerification:true,
    requiresSeparateExplicitApproval:true,
    canAutoApply:false,
    writerAuthorized:false,
  });
};

export function serializePortableWorkspaceBundle({
  sourceDraftJson,externalCheckpointJson=null,
}={}){
  if(typeof sourceDraftJson!=='string'||
      (externalCheckpointJson!==null&&typeof externalCheckpointJson!=='string'))
    fail('COMPONENT_INPUT');
  let sourceDraft,externalCheckpoint;
  try {
    sourceDraft=JSON.parse(sourceDraftJson);
    externalCheckpoint=externalCheckpointJson===null?null:
      JSON.parse(externalCheckpointJson);
  } catch {fail('COMPONENT_JSON')}
  const serialized=JSON.stringify({
    schema:PORTABLE_WORKSPACE_BUNDLE_SCHEMA,
    sourceDraft,externalCheckpoint,
  },null,2)+'\n';
  if(new TextEncoder().encode(serialized).length>PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES)
    fail('TOO_LARGE');
  validateComponents({schema:PORTABLE_WORKSPACE_BUNDLE_SCHEMA,
    sourceDraft,externalCheckpoint});
  return serialized;
}

export function parsePortableWorkspaceBundle(text){
  if(typeof text!=='string'||
      new TextEncoder().encode(text).length>PORTABLE_WORKSPACE_BUNDLE_MAX_BYTES)
    fail('TOO_LARGE');
  let obj;try{obj=JSON.parse(text)}catch{fail('INVALID_JSON')}
  return validateComponents(obj);
}
