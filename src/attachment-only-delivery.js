import {prepareMultiAttachmentOnlyPlan,MAX_ATTACHED_FILES,MAX_SINGLE_ATTACHMENT_BYTES,MAX_TOTAL_ATTACHMENT_BYTES} from './multi-attachment-only-job-plan.js';
import {executeMultiAttachmentOnlyCandidate} from './multi-attachment-only-candidate-writer.js';
import {createMatroskaAttachmentReader} from './matroska-attachment-reader.js';
import {planAttachmentExportNames} from './attachment-export-policy.js';
import {hashBoundedProjectSource} from './container-project-source-proof.js';

export const attachmentOnlyRouteEligible = (entries,mediaFiles=[]) =>
 entries.length>0 && entries.every(entry=>entry.kind==='attachment') && mediaFiles.length===0;
export function attachmentOnlyReadiness(entries) {
 const selected=entries.filter(entry=>entry.include!==false);
 let reason='';
 if(!selected.length)reason='尚未选择参与输出的附件。';
 else if(selected.length>MAX_ATTACHED_FILES)reason='当前写入器最多支持 8 个附件，请排除部分文件。';
 else if(selected.some(entry=>entry.file.size<1||entry.file.size>MAX_SINGLE_ATTACHMENT_BYTES))
  reason='当前写入器只接受非空、单项不超过 16 MiB 的附件。';
 else if(selected.reduce((sum,entry)=>sum+entry.file.size,0)>MAX_TOTAL_ATTACHMENT_BYTES)
  reason='当前写入器附件总大小不能超过 32 MiB。';
 else {
  const names=planAttachmentExportNames(selected.map((entry,i)=>({id:String(i),filename:entry.file.name,mimeType:entry.mimeType})));
  if(names.entries.some((item,i)=>item.proposedSaveName!==selected[i].file.name))
   reason='附件名称含路径、保留名称或重名冲突，请重命名后重新导入。';
 }
 return Object.freeze({ready:!reason,reason,count:selected.length});
}

export const snapshotAttachmentSelection = entries => Object.freeze(entries.map(entry=>Object.freeze({
 file:entry.file,kind:entry.kind,include:entry.include!==false,mimeType:entry.mimeType,
})));
export const attachmentSelectionCurrent = (snapshot,entries) => snapshot.length===entries.length &&
 snapshot.every((row,i)=>row.file===entries[i].file && row.kind===entries[i].kind &&
 row.include===(entries[i].include!==false) && row.mimeType===entries[i].mimeType);

// A new-container delivery adapter over the existing bounded writer. It never
// opens or rewrites a source MKV; original selected files remain unchanged.
export async function generateAttachmentOnlyOutput(entries,{isCurrent=()=>true,outputName='attachments.mkv'}={}) {
 if(!Array.isArray(entries)||entries.some(entry=>entry.kind!=='attachment'))
  throw Error('ATTACHMENT_ONLY_MEDIA_MIX_UNSUPPORTED');
 const snapshot=snapshotAttachmentSelection(entries);
 const assertCurrent=()=>{
  if(!isCurrent() || !attachmentSelectionCurrent(snapshot,entries))
   throw Error('ATTACHMENT_ONLY_SELECTION_CHANGED');
 };
 assertCurrent();
 const selected=entries.filter(entry=>entry.include!==false);
 if(!selected.length)throw Error('ATTACHMENT_ONLY_SELECTION_EMPTY');
 const plan=prepareMultiAttachmentOnlyPlan({minimumCount:1,outputName,
  attachments:selected.map(entry=>({file:entry.file,mimeType:entry.mimeType,filename:entry.file.name})),
 });
 const generated=await executeMultiAttachmentOnlyCandidate(plan);assertCurrent();
 const reader=createMatroskaAttachmentReader(generated.output);
 const observed=await reader.inspect();assertCurrent();
 if(observed.state!=='inspected'||observed.structure.hasTracksElement||observed.structure.hasClusterElement||
    observed.attachments.length!==selected.length)throw Error('ATTACHMENT_ONLY_STRUCTURE_MISMATCH');
 const attachments=[];
 for(let i=0;i<selected.length;i++) {
  const actual=observed.attachments[i],expected=plan.attachments[i];
  if(actual.filename!==expected.filename||actual.mimeType!==expected.declaredMimeType||
     actual.fileUid!==expected.fileUid||actual.byteLength!==selected[i].file.size)
   throw Error('ATTACHMENT_ONLY_METADATA_MISMATCH');
  const original=await hashBoundedProjectSource(selected[i].file,{fastBytes:0});assertCurrent();
  const extracted=reader.openAttachment(actual.id).data;
  const digest=await hashBoundedProjectSource(extracted,{fastBytes:0});assertCurrent();
  if(original!==digest)throw Error('ATTACHMENT_ONLY_PAYLOAD_MISMATCH');
  attachments.push(Object.freeze({filename:actual.filename,mimeType:actual.mimeType,
   bytes:actual.byteLength,fileUid:actual.fileUid,sha256:digest}));
 }
 const outputSha256=await hashBoundedProjectSource(generated.output,{fastBytes:0});assertCurrent();
 return Object.freeze({blob:generated.output,outputName,outputSha256,selection:snapshot,
  report:Object.freeze({schema:'softmux-attachment-only-delivery-v1',kind:'attachments-only',
   output:{name:outputName,sizeBytes:generated.output.size,sha256:outputSha256},
   mediaTrackCount:0,clusterCount:0,attachments:Object.freeze(attachments),
   verification:'browser-structure-and-complete-attachment-sha256',
   physicalSaveVerified:false,contentSafetyVerified:false,playable:false}),
 });
}
