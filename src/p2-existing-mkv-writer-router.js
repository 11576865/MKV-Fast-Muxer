/**
 * P2: one bounded operation selector for four ALREADY independently
 * implemented existing-MKV attachment FileData writers.
 *
 * Routes are capabilities, not user-provided writer names. Preparing a route
 * does not execute a writer, grant filesystem permissions or certify a player.
 * A candidate produced by an accepted writer receives an additional common
 * output audit; no FFmpeg remux/overwrite fallback is allowed.
 */
import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { inspectRawSegmentPreservation } from './matroska-raw-preservation-contract.js';
import {
  prepareSameSizeAttachmentReplacement,executeSameSizeAttachmentReplacement,
} from './existing-mkv-same-size-attachment-replace.js';
import {
  prepareReservedVoidFileDataReplacement,executeReservedVoidFileDataReplacement,
} from './existing-mkv-reserved-void-filedata-replace.js';
import {
  prepareTailAttachmentResize,executeTailAttachmentResize,
} from './existing-mkv-tail-attachment-resize.js';
import {
  prepareNonterminalAttachmentRelay,executeNonterminalAttachmentRelay,
} from './existing-mkv-nonterminal-attachment-relay.js';

export const ROUTED_ATTACHMENT_PLAN_SCHEMA='bounded-existing-mkv-attachment-route-v1';
const permits=new WeakMap();
const ROUTES=Object.freeze({
  'same-size':{
    prepare:(source,replacement,targetFileUid)=>
      prepareSameSizeAttachmentReplacement({
        source,replacement,targetFileUid,acknowledgeContentReplacement:true,
      }),
    execute:executeSameSizeAttachmentReplacement,
  },
  'adjacent-void':{
    prepare:(source,replacement,targetFileUid)=>
      prepareReservedVoidFileDataReplacement({
        source,replacement,targetFileUid,approveVariableLength:true,
      }),
    execute:executeReservedVoidFileDataReplacement,
  },
  'tail-resize':{
    prepare:(source,replacement,targetFileUid)=>
      prepareTailAttachmentResize({
        source,replacement,targetFileUid,approveTailResize:true,
      }),
    execute:executeTailAttachmentResize,
  },
  'seekhead-relay':{
    prepare:(source,replacement,targetFileUid)=>
      prepareNonterminalAttachmentRelay({
        source,replacement,targetFileUid,approveRelocation:true,
      }),
    execute:executeNonterminalAttachmentRelay,
  },
});
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
const hash=async blob=>{
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)throw Error('P2_ROUTE_WEBCRYPTO_REQUIRED');
  const digest=await subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
};
const safeCode=message=>/^[A-Z][A-Z0-9_]{4,120}$/.test(message||'')?
  message:'P2_ROUTE_UNCLASSIFIED_PREPARATION_ERROR';

async function originalFacts(source,targetFileUid){
  const raw=await inspectRawSegmentPreservation(source);
  if(raw.state!=='inspected'||raw.segmentUnknownLength||
     raw.coverage.unknownTopElementIds.length)
    throw Error('P2_ROUTE_ORIGINAL_RAW_UNVERIFIED');
  const reader=createMatroskaAttachmentReader(source);
  const inventory=await reader.inspect();
  if(inventory.state!=='inspected')throw Error('P2_ROUTE_INVENTORY_UNVERIFIED');
  const target=inventory.attachments.filter(a=>a.fileUid===targetFileUid);
  if(target.length!==1||
     new Set(inventory.attachments.map(a=>a.fileUid)).size!==inventory.attachments.length)
    throw Error('P2_ROUTE_TARGET_UID_NOT_UNIQUE');
  const graph=await reader.inspectRelations(inventory);
  if(!reader.isCurrentInspection(inventory)||graph.state!=='inspected'||
      graph.coverage.tagTargets!=='known-targets-enumerated')
    throw Error('P2_ROUTE_GRAPH_UNVERIFIED');
  if(graph.edges.some(e=>e.targetKind==='attachment'&&e.targetUid===targetFileUid))
    throw Error('P2_ROUTE_TAG_REFERENCED_UID');
  return {raw,reader,inventory,target:target[0],graph};
}

/** A successful plan is opaque: only this module may execute its backend. */
export async function prepareRoutedAttachmentReplacement({
  source,replacement,targetFileUid,approveSourceModification=false,
}={}){
  if(!approveSourceModification)throw Error('P2_ROUTE_EXPLICIT_REVIEW_REQUIRED');
  if(!source?.slice||!replacement?.slice||
     !Number.isSafeInteger(source.size)||source.size<1||
     source.size>60*1024*1024||
     !Number.isSafeInteger(replacement.size)||replacement.size<1||
     replacement.size>4*1024*1024)
    throw Error('P2_ROUTE_SOURCE_OR_DATA_BUDGET');
  if(typeof targetFileUid!=='string'||!/^[1-9][0-9]{0,19}$/.test(targetFileUid))
    throw Error('P2_ROUTE_UID_REQUIRED');
  const facts=await originalFacts(source,targetFileUid);
  const sourceSha256=await hash(source),payloadSha256=await hash(replacement);
  const preferred=facts.target.byteLength===replacement.size?
    ['same-size']:
    ['adjacent-void','tail-resize','seekhead-relay'];
  const refusals=[];
  let selected=null,backendPlan=null;
  for(const route of preferred){
    try{
      backendPlan=await ROUTES[route].prepare(source,replacement,targetFileUid);
      selected=route;
      break;
    }catch(error){
      const code=safeCode(error?.message);
      // A non-capability failure cannot be used as permission to fall back.
      // CRC-invalid, source-changed, malformed source and missing crypto are
      // hard failures regardless of whether some later writer could accept.
      if(/CRC.*INVALID|SOURCE_CHANGED|INPUT_CHANGED|WEBCRYPTO_REQUIRED|MALFORMED|TRUNCATED|OUT_OF_BOUNDS|FORGED/.test(code))
        throw Error('P2_ROUTE_FATAL_'+code);
      refusals.push({route,code});
    }
  }
  if(!selected){
    const error=Error('P2_ROUTE_NO_VERIFIED_WRITER');
    error.refusals=freeze(refusals);
    throw error;
  }
  if(await hash(source)!==sourceSha256||
      await hash(replacement)!==payloadSha256||
      !facts.reader.isCurrentInspection(facts.inventory))
    throw Error('P2_ROUTE_INPUT_CHANGED_DURING_PREPARATION');
  const plan=freeze({
    schema:ROUTED_ATTACHMENT_PLAN_SCHEMA,
    state:'REVIEWED_BOUNDED_SOURCE_EDIT_NOT_YET_EXECUTED',
    route:selected,
    target:{fileUid:targetFileUid,name:facts.target.filename,
      oldLength:facts.target.byteLength,newLength:replacement.size},
    evidence:{sourceSha256,payloadSha256,independentNativeAudit:'pending',
      selectedBackendPlanSchema:backendPlan.schema},
    refusals,
    grants:{sourceOverwrite:false,filePermission:false,generalMatroskaWriter:false},
  });
  permits.set(plan,{source,replacement,backendPlan,sourceSha256,
    payloadSha256,facts});
  return plan;
}

/**
 * The underlying writer re-audits own geometry, SeekHead, CRC/size and offsets.
 * This additional independent reader checks UID/Tag relations and ALL other
 * original attachment FileData, plus all protected top-level element bytes.
 */
export async function executeRoutedAttachmentReplacement(plan){
  if(plan?.schema!==ROUTED_ATTACHMENT_PLAN_SCHEMA||
      !Object.isFrozen(plan)||!permits.has(plan))
    throw Error('P2_ROUTE_FORGED_OR_STALE_PLAN');
  const grant=permits.get(plan);
  // Single-use capability, not a persistent JSON authorisation.
  permits.delete(plan);
  const {source,replacement,backendPlan,sourceSha256,payloadSha256,facts}=grant;
  if(await hash(source)!==sourceSha256||
      await hash(replacement)!==payloadSha256)
    throw Error('P2_ROUTE_INPUT_CHANGED_BEFORE_EXECUTION');
  const actual=await ROUTES[plan.route].execute(backendPlan);
  if(!actual?.output?.slice||!actual?.evidence)
    throw Error('P2_ROUTE_BACKEND_OUTPUT_MISSING');
  const candidate=actual.output;
  const sourceRaw=facts.raw;
  const finalRaw=await inspectRawSegmentPreservation(candidate);
  if(finalRaw.state!=='inspected'||finalRaw.segmentUnknownLength||
      finalRaw.ebmlHeaderCommitment!==sourceRaw.ebmlHeaderCommitment)
    throw Error('P2_ROUTE_FINAL_EBML_UNVERIFIED');
  // Every non-Attachments, non-SeekHead element must keep original position
  // and exact raw bytes, including Chapters, Tags, Cues, Clusters, Tracks.
  // SeekHeads may change only under the selected backend's own strict proof.
  for(const before of sourceRaw.elements.filter(e=>
      e.family==='protected'&&e.id!=='0x114d9b74')){
    if(!finalRaw.elements.some(after=>after.id===before.id&&
        after.offset===before.offset&&
        after.byteLength===before.byteLength&&
        after.byteCommitment===before.byteCommitment))
      throw Error('P2_ROUTE_PROTECTED_ELEMENT_CHANGED');
  }
  const afterReader=createMatroskaAttachmentReader(candidate);
  const after=await afterReader.inspect();
  if(after.state!=='inspected'||
      after.attachments.length!==facts.inventory.attachments.length)
    throw Error('P2_ROUTE_FINAL_ATTACHMENT_INVENTORY_INVALID');
  const byUid=new Map(facts.inventory.attachments.map(item=>[item.fileUid,item]));
  for(const member of after.attachments){
    const original=byUid.get(member.fileUid);
    if(!original||member.filename!==original.filename||
       member.mimeType!==original.mimeType||
       member.description!==original.description)
      throw Error('P2_ROUTE_ATTACHMENT_IDENTITY_CHANGED');
    const expected=member.fileUid===plan.target.fileUid?payloadSha256:
      await hash(facts.reader.openAttachment(original.id).data);
    if(await hash(afterReader.openAttachment(member.id).data)!==expected)
      throw Error('P2_ROUTE_ATTACHMENT_FILEDATA_CHANGED');
  }
  const relation=await afterReader.inspectRelations(after);
  if(relation.state!=='inspected'||
      JSON.stringify(relation.edges)!==JSON.stringify(facts.graph.edges))
    throw Error('P2_ROUTE_TAG_RELATION_GRAPH_CHANGED');
  if(await hash(source)!==sourceSha256||
      await hash(replacement)!==payloadSha256)
    throw Error('P2_ROUTE_SOURCE_CHANGED_DURING_FINAL_AUDIT');
  return Object.freeze({
    state:'LOCAL_OUTPUT_REAUDITED_NATIVE_AUDIT_PENDING',
    route:plan.route,filename:actual.filename,output:candidate,
    evidence:freeze({sourceSha256,outputSha256:await hash(candidate),
      targetFileUid:plan.target.fileUid,
      allOriginalFileUidsAndMetadataPreserved:true,
      allUntouchedAttachmentPayloadsSha256Preserved:true,
      allOriginalProtectedNonSeekHeadBytesPreserved:true,
      tagTargetGraphPreserved:true,
      backendStatus:actual.status,backendEvidence:actual.evidence,
      generalMatroskaWriter:false,nativeExternalOraclePassed:false,
      sourceOverwrite:false,
    }),
  });
}
