import {createMatroskaAttachmentReader} from './matroska-attachment-reader.js';
import {sanitizeAttachmentFilename,planAttachmentExportNames} from './attachment-export-policy.js';
import {MAX_ATTACHED_FILES,MAX_SINGLE_ATTACHMENT_BYTES,MAX_TOTAL_ATTACHMENT_BYTES} from './multi-attachment-only-job-plan.js';
import {auditProducedAttachments} from './output-attachment-payload-audit.js';

export function planMediaAttachments(entries = [], reservedNames = []) {
  if(!Array.isArray(entries))throw Error('普通附件交付：附件清单无效。');
  const selected=entries.filter(entry=>entry.include!==false);
  if(selected.length>MAX_ATTACHED_FILES)throw Error('普通附件交付：最多选择8个普通附件。');
  let total=0;const files=new Set();
  for(const row of selected){
    const file=row.file;
    if(row.kind!=='attachment'||!file?.slice||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_SINGLE_ATTACHMENT_BYTES)
      throw Error('普通附件交付：每个普通附件必须非空且不超过16MiB。');
    if(files.has(file))throw Error('普通附件交付：不能重复加入同一个文件引用。');
    files.add(file);total+=file.size;
    if(total>MAX_TOTAL_ATTACHMENT_BYTES)throw Error('普通附件交付：普通附件合计不能超过32MiB。');
    if(sanitizeAttachmentFilename(file.name).transformed)throw Error('普通附件交付：名称含路径或不安全字符，请重命名后重新导入。');
    if(typeof row.mimeType!=='string'||row.mimeType.length>100||! /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(row.mimeType))
      throw Error('普通附件交付：MIME声明无效。');
  }
  const names=planAttachmentExportNames(selected.map((row,index)=>({id:String(index),filename:row.file.name,mimeType:row.mimeType})),{existingNames:reservedNames});
  return Object.freeze(selected.map((row,index)=>Object.freeze({file:row.file,filename:names.entries[index].proposedSaveName,
    originalName:row.file.name,mimeType:row.mimeType.toLowerCase(),sizeBytes:row.file.size,
    renamed:names.entries[index].proposedSaveName!==row.file.name})));
}
export function mediaAttachmentReadiness(entries){
  try{return Object.freeze({ready:true,count:planMediaAttachments(entries).length,reason:''});}
  catch(error){return Object.freeze({ready:false,reason:error.message});}
}
export async function verifyMediaAttachments(output,claims){
  const audit=await auditProducedAttachments(output,claims,{maxPerAttachmentBytes:MAX_SINGLE_ATTACHMENT_BYTES,
    maxTotalBytes:MAX_TOTAL_ATTACHMENT_BYTES,label:'新增普通附件'});
  if(audit.status!=='pass'&&!(audit.status==='not-requested'&&claims.length===0))
    throw Error('普通附件交付：成品附件完整SHA-256回读未通过：'+audit.issues.join('；'));
  return audit;
}


// Matroska image AttachedFile objects are exposed by FFprobe as attached_pic
// video streams. Keep their raw index for explicit negative mapping, but model
// them as attachments. This does not reinterpret MP4 cover-art streams.
export function normalizeMatroskaAttachmentPictures(probe){
  if(!String(probe?.format?.format_name||'').split(',').includes('matroska'))return probe;
  return {...probe,streams:(probe.streams||[]).map(stream=>
    stream.codec_type==='video'&&Number(stream.disposition?.attached_pic)===1&&
      stream.tags?.filename&&/^image\//i.test(stream.tags?.mimetype||'')
      ? {...stream,codec_type:'attachment',matroskaImageAttachment:true}:stream)};
}
export async function readSourceImageAttachments(source,rows){
  if(!rows.length)return [];
  const reader=createMatroskaAttachmentReader(source),inventory=await reader.inspect();
  if(inventory.state!=='inspected')throw Error('普通附件交付：无法读取来源图片附件的原始FileData。');
  let total=0;const result=[];
  for(const row of rows){
    const originalName=row.originalFilename||row.stream?.tags?.filename;
    const originalMime=row.originalMimetype||row.stream?.tags?.mimetype;
    const found=inventory.attachments.filter(item=>item.filename===originalName&&item.mimeType===originalMime);
    if(found.length!==1||found[0].byteLength<1||found[0].byteLength>MAX_SINGLE_ATTACHMENT_BYTES||
       (total+=found[0].byteLength)>MAX_TOTAL_ATTACHMENT_BYTES)
      throw Error('普通附件交付：来源图片附件无法唯一绑定或超过16MiB/合计32MiB回附范围。');
    const file=reader.openAttachment(found[0].id).data;
    result.push({file,filename:row.filename??originalName,mimeType:row.mimetype??originalMime,sourceStreamIndex:row.index});
  }
  return result;
}
