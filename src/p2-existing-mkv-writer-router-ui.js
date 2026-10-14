import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import {
 prepareRoutedAttachmentReplacement,executeRoutedAttachmentReplacement,
} from './p2-existing-mkv-writer-router.js';

/** One opt-in operator for verified writer families; never saves over source. */
export function setupExistingMkvRoutedEditorUI({
 sourceInput,replacementInput,targetSelect,review,prepareButton,saveButton,
 inventory,status,evidence,
}={}){
 if(![sourceInput,replacementInput,targetSelect,review,prepareButton,saveButton,
      inventory,status,evidence].every(Boolean))return;
 let epoch=0,source=null,replacement=null,reader=null,inspection=null;
 let candidate=null,busy=false,url=null;
 const report=(message,state='idle')=>{status.textContent=message;status.dataset.state=state;};
 function expire(){
  epoch++;candidate=null;saveButton.disabled=true;evidence.textContent='';
  if(url){URL.revokeObjectURL(url);url=null;}
 }
 function valid(token){
  return token===epoch && review.checked && !busy &&
    sourceInput.files?.length===1 && replacementInput.files?.length===1 &&
    sourceInput.files[0]===source && replacementInput.files[0]===replacement &&
    inspection?.state==='inspected' && reader?.isCurrentInspection(inspection)&&
    inspection.attachments.some(item=>item.fileUid===targetSelect.value);
 }
 function update(){
  const eligible=review.checked && source && replacement &&
    inspection?.state==='inspected'&&
    inspection.attachments.some(item=>item.fileUid===targetSelect.value);
  prepareButton.disabled=Boolean(!eligible||busy);
 }
 sourceInput.addEventListener('change',async()=>{
  expire();review.checked=false;
  source=sourceInput.files?.[0]||null;replacement=replacementInput.files?.[0]||null;
  reader=null;inspection=null;targetSelect.replaceChildren();
  inventory.textContent='';update();
  if(!source){report('请选择原始 Matroska。');return;}
  const token=epoch;
  try{
   reader=createMatroskaAttachmentReader(source);
   const data=await reader.inspect();
   if(token!==epoch||sourceInput.files?.[0]!==source)return;
   if(data.state!=='inspected')throw Error('P2_ROUTE_INVENTORY_UNVERIFIED');
   inspection=data;
   for(const item of data.attachments){
    const option=document.createElement('option');
    option.value=item.fileUid;
    option.textContent=item.filename+' · UID '+item.fileUid+
      ' · '+item.byteLength+' bytes';
    targetSelect.appendChild(option);
   }
   inventory.textContent='已读取 '+data.attachments.length+
     ' 个已有附件；只能选择未被标签引用且布局由写入器独立证明的 FileUID。';
   report('请选择 FileUID 和替换文件、审核并准备安全编辑。');
  }catch(err){report('无法审核来源：'+(err.message||String(err)),'blocked');}
  update();
 });
 replacementInput.addEventListener('change',()=>{
  expire();replacement=replacementInput.files?.[0]||null;review.checked=false;update();
 });
 targetSelect.addEventListener('change',()=>{expire();review.checked=false;update();});
 review.addEventListener('change',()=>{expire();update();});
 prepareButton.addEventListener('click',async()=>{
  if(busy)return;
  const token=epoch,uid=targetSelect.value;
  if(!valid(token))return;
  busy=true;update();report('正在选择受限结构路径，并进行本地原文件与成品验证…');
  try{
   const plan=await prepareRoutedAttachmentReplacement({
    source,replacement,targetFileUid:uid,approveSourceModification:true,
   });
   if(token!==epoch||!review.checked||sourceInput.files?.[0]!==source||
       replacementInput.files?.[0]!==replacement||targetSelect.value!==uid)
     throw Error('P2_ROUTE_UI_SELECTION_CHANGED');
   const result=await executeRoutedAttachmentReplacement(plan);
   if(token!==epoch||!review.checked||sourceInput.files?.[0]!==source||
       replacementInput.files?.[0]!==replacement||targetSelect.value!==uid)
     throw Error('P2_ROUTE_UI_SELECTION_CHANGED');
   candidate=result;
   saveButton.disabled=false;
   report('已生成并本地审计新副本：'+result.route+
     '。外部 MKVToolNix/播放器兼容性仍需独立验收。','ready');
   evidence.textContent='路径：'+result.route+
    '；原始 SHA-256：'+result.evidence.sourceSha256+
    '；成品 SHA-256：'+result.evidence.outputSha256+
    '；所有非目标附件字节和 UID 关联：已本地核对；一般化写入：否；原文件覆盖：否。';
  }catch(err){
   if(token===epoch){
    candidate=null;saveButton.disabled=true;
    const reasons=Array.isArray(err.refusals)?
      ' ['+err.refusals.map(x=>x.route+':'+x.code).join('；')+']':'';
    report('拒绝生成：'+(err.message||String(err))+reasons,'blocked');
   }
  }finally{busy=false;update();}
 });
 saveButton.addEventListener('click',async()=>{
  if(!candidate||busy||!review.checked||!source||
      sourceInput.files?.[0]!==source||replacementInput.files?.[0]!==replacement)
    return;
  const token=epoch;
  busy=true;saveButton.disabled=true;
  try{
   // Browser files are immutable Blob snapshots; still verify exact File
   // selection and current attachment UID at the manual download boundary.
   const result=candidate;
   if(token!==epoch||targetSelect.value!==result.evidence.targetFileUid)
    throw Error('P2_ROUTE_SAVE_STALE');
   url=URL.createObjectURL(result.output);
   const a=document.createElement('a');
   a.href=url;a.download=result.filename||'attachment-edited.experimental.mkv';
   document.body.appendChild(a);a.click();a.remove();
   report('已请求下载经过本地结构核对的新 MKV 副本；请独立检查外部播放器兼容性。','ready');
  }catch(err){report('下载拒绝：'+(err.message||String(err)),'blocked');}
  finally{busy=false;update();saveButton.disabled=!candidate;}
 });
 update();
}
