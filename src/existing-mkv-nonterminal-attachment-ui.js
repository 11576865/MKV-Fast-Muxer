import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import { prepareNonterminalAttachmentRelay, executeNonterminalAttachmentRelay } from './existing-mkv-nonterminal-attachment-relay.js';

/**
 * An opt-in, bounded source-owned operation. Call-sites use NAMED guard fields
 * to prevent targetUid/epoch argument inversion. Exact file-picker contents
 * are SHA-verified again before both writer execution and manual download.
 */
export function setupNonterminalAttachmentRelayUI({
  sourceInput,replacementInput,targetSelect,review,prepareButton,saveButton,
  status,inventory,evidence,
}={}){
  if(![sourceInput,replacementInput,targetSelect,review,prepareButton,saveButton,
    status,inventory,evidence].every(Boolean))return;
  let epoch=0,original=null,changed=null,inspection=null,prepared=null,busy=false,url=null;
  const report=(message,state='idle')=>{
    status.textContent=message;status.dataset.state=state;
  };
  function expire(){
    epoch++;prepared=null;saveButton.disabled=true;evidence.textContent='';
    if(url){URL.revokeObjectURL(url);url=null;}
  }
  function eligible({source,replacement,uid,token}){
    return token===epoch&&review.checked&&inspection?.source===source&&
      source===original&&replacement===changed&&
      sourceInput.files?.length===1&&replacementInput.files?.length===1&&
      targetSelect.value===uid;
  }
  async function sameCurrentBytes({source,replacement,uid,token}){
    if(!eligible({source,replacement,uid,token})||
        !crypto?.subtle)return false;
    const a=sourceInput.files?.[0],b=replacementInput.files?.[0];
    if(!a||!b||a.size!==source.size||b.size!==replacement.size)return false;
    const hash=async file=>new Uint8Array(await crypto.subtle.digest(
      'SHA-256',await file.arrayBuffer()));
    const [x,y,p,q]=await Promise.all([hash(source),hash(a),hash(replacement),hash(b)]);
    return eligible({source,replacement,uid,token})&&
      x.every((v,i)=>v===y[i])&&p.every((v,i)=>v===q[i]);
  }
  function chosen(){return inspection?.rows.find(x=>x.fileUid===targetSelect.value);}
  function controls(){
    const row=chosen(),reasons=[];
    if(busy)reasons.push('BUSY');
    if(!review.checked)reasons.push('REVIEW_REQUIRED');
    if(!original||!changed)reasons.push('FILES_REQUIRED');
    if(!row)reasons.push('ORIGINAL_UID_NOT_FOUND');
    if(row&&inspection.targets.has(row.fileUid))reasons.push('TAG_REFERENCED_TARGET');
    if(row&&changed?.size===row.byteLength)reasons.push('SAME_LENGTH_USE_EXISTING_WRITER');
    if(changed&&(changed.size<=0||changed.size>4*1024*1024))
      reasons.push('REPLACEMENT_BUDGET');
    if(row&&original&&changed&&!eligible({
      source:original,replacement:changed,uid:row.fileUid,token:epoch,
    }))reasons.push('CURRENT_SELECTION_OR_REVIEW_INVALID');
    prepareButton.dataset.blockReason=reasons.join(',')||'READY';
    prepareButton.disabled=reasons.length>0;
  }
  sourceInput.addEventListener('change',async()=>{
    expire();review.checked=false;inspection=null;original=sourceInput.files?.[0]||null;
    targetSelect.replaceChildren();inventory.textContent='';controls();
    if(!original){report('请选择已有附件的 Matroska。');return;}
    const file=original,token=epoch;
    if(file.size>60*1024*1024){report('来源超过 60 MiB 实验上限。','blocked');return;}
    report('检查原附件 UID 与定向标签关系……','checking');
    try{
      const reader=createMatroskaAttachmentReader(file);
      const r=await reader.inspect();
      if(r.state!=='inspected'||r.structure.attachmentElements!==1)
        throw Error(r.diagnostic?.code||'ATTACHMENT_INVENTORY_INVALID');
      const graph=await reader.inspectRelations(r);
      if(graph.state!=='inspected'||
          graph.coverage.tagTargets!=='known-targets-enumerated')
        throw Error('UID_REFERENCE_GRAPH_INCOMPLETE');
      if(token!==epoch||file!==original||sourceInput.files?.length!==1)return;
      const targets=new Set(graph.edges.filter(e=>e.targetKind==='attachment')
        .map(e=>e.targetUid));
      inspection={source:file,rows:r.attachments,targets};
      for(const row of r.attachments){
        const option=document.createElement('option');
        option.value=row.fileUid;
        option.disabled=targets.has(row.fileUid);
        option.textContent=row.filename+' · FileUID '+row.fileUid+
          ' · '+row.byteLength+' bytes'+
          (option.disabled?' · 被 Tag 引用，不可修改':'');
        targetSelect.append(option);
      }
      const first=r.attachments.find(x=>!targets.has(x.fileUid));
      if(first)targetSelect.value=first.fileUid;
      else targetSelect.selectedIndex=-1;
      inventory.textContent='共 '+r.attachments.length+
        ' 个原始附件；'+targets.size+' 个 UID 已被 Tag 引用。此工具仅接受非末尾、已有正确 SeekHead 索引的 Attachments；严格来源布局由写入器复核。';
      report(first?'请选择不同长度的新文件并明确确认；缺少原附件 SeekHead 索引或原位置不能放置中继时将拒绝。':
        '没有可修改的未关联附件。',first?'ready':'blocked');
    }catch(error){
      if(token===epoch)report('来源检查拒绝：'+(error?.message||String(error)),'blocked');
    }finally{if(token===epoch)controls();}
  });
  replacementInput.addEventListener('change',()=>{
    expire();review.checked=false;changed=replacementInput.files?.[0]||null;
    report('文件已更换；需重新确认 FileUID 与变长操作。');controls();
  });
  targetSelect.addEventListener('change',()=>{
    expire();review.checked=false;report('目标 FileUID 已变化；旧授权已撤销。');controls();
  });
  review.addEventListener('change',()=>{
    expire();report(review.checked?'已确认；仍须复核 SeekHead、FileUID、原位置中继容量和尺寸字段。':
      '尚未确认本次结构重写。');controls();
  });
  prepareButton.addEventListener('click',async()=>{
    const selection={source:original,replacement:changed,uid:targetSelect.value,token:epoch};
    if(busy||prepareButton.disabled||!eligible(selection))return;
    expire();selection.token=epoch;busy=true;controls();
    report('验证非末尾 Attachments、原始 SeekHead 索引、中继容量与原始受保护字节……','checking');
    try{
      if(!await sameCurrentBytes(selection))throw Error('RELAY_UI_PICKER_BYTES_CHANGED');
      const plan=await prepareNonterminalAttachmentRelay({
        source:selection.source,replacement:selection.replacement,
        targetFileUid:selection.uid,approveRelocation:true,
      });
      if(!eligible(selection))return;
      const value=await executeNonterminalAttachmentRelay(plan);
      if(!eligible(selection))return;
      prepared={selection,value};saveButton.disabled=false;
      evidence.textContent='原始 FileData '+plan.target.originalLength+
        ' bytes → '+plan.target.newLength+
        ' bytes；变化 '+plan.geometry.delta+
        ' bytes。将修改后的 Attachments 追加到 Segment 末尾；旧位置换成等长 SeekHead 中继，并更新原索引 SeekID。来源 SHA-256：'+
        value.evidence.sourceSha256+'，成品 SHA-256：'+
        value.evidence.outputSha256+
        '。原有章节、标签、媒体轨与 Cues 原始字节及偏移不变；SeekHead 仅做有依据的重定向；播放器兼容仍需单独验收。';
      report('本地源、UID、结构和字节保真验证通过，可手动下载实验性独立副本。','prepared');
    }catch(error){
      if(selection.token===epoch)report('拒绝写入：'+(error?.message||String(error))+
        '。不会使用 FFmpeg 回退，也不会覆盖来源。','blocked');
    }finally{busy=false;controls();}
  });
  saveButton.addEventListener('click',async()=>{
    const p=prepared;
    if(!p||!eligible(p.selection)||status.dataset.state!=='prepared'){
      expire();controls();report('已拒绝过期下载权限。','blocked');return;
    }
    saveButton.disabled=true;
    let same=false;
    try{same=await sameCurrentBytes(p.selection);}catch{same=false;}
    if(!same||prepared!==p||status.dataset.state!=='prepared'){
      expire();controls();report('当前文件选择已更换或 SHA-256 不一致；撤销下载。','blocked');
      return;
    }
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(p.value.output);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=p.value.filename;anchor.hidden=true;anchor.rel='noopener';
    document.body.append(anchor);
    try{
      anchor.click();report('已申请下载独立新 MKV；原始文件未修改。','prepared');
    }finally{
      anchor.remove();
      if(prepared===p&&eligible(p.selection))saveButton.disabled=false;
    }
  });
  window.addEventListener('pagehide',expire);
  report('选择含已有附件的 MKV。仅支持非末尾、可从原始 SeekHead 索引发现的 Attachments，且目标是最后一个未引用 AttachedFile。');
  controls();
}
