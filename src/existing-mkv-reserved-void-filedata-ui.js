import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import {
  prepareReservedVoidFileDataReplacement,
  executeReservedVoidFileDataReplacement,
} from './existing-mkv-reserved-void-filedata-replace.js';

/**
 * Separate opt-in proof boundary for variable-sized FileData where the source
 * already owns adjacent padding. Never fallback to FFmpeg or overwrite input.
 */
export function setupReservedVoidFileDataUI({
  sourceInput,targetSelect,replacementInput,review,prepareButton,saveButton,
  inventory,status,evidence,
}={}) {
  if(![sourceInput,targetSelect,replacementInput,review,prepareButton,
    saveButton,inventory,status,evidence].every(Boolean)) return;
  let epoch=0,busy=false,source=null,sourceList=null,substitute=null,substituteList=null,
    inspection=null,prepared=null,url=null;
  function invalidate(){
    epoch++;prepared=null;saveButton.disabled=true;evidence.textContent='';
    if(url){URL.revokeObjectURL(url);url=null;}
  }
  function announce(message,state='idle'){
    status.textContent=message;status.dataset.state=state;
  }
  function current(sourceFile,newFile,target,token) {
    // The File grants come ONLY from the original picker change events.
    // Browser FileList wrappers can change between reads, so object-identity
    // comparisons against fresh input.files reads are not an authority check.
    // Every picker change invalidates epoch/review, while a separate async
    // full-SHA check compares current picker bytes with BOTH captured grants
    // immediately before preparing a write and again before downloading.
    return token===epoch&&inspection?.source===sourceFile&&review.checked&&
      source===sourceFile&&substitute===newFile&&
      sourceInput.files?.length===1&&replacementInput.files?.length===1&&
      targetSelect.value===target;
  }
  async function selectedBytesStillIdentical(old,newFile,target,token) {
    if(!current(old,newFile,target,token))return false;
    const actualSource=sourceInput.files?.[0],actualReplacement=replacementInput.files?.[0];
    if(!actualSource||!actualReplacement||
        actualSource.size!==old.size||actualReplacement.size!==newFile.size)return false;
    if(!globalThis.crypto?.subtle)return false;
    const hash=async file=>new Uint8Array(
      await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
    const digests=await Promise.all([
      hash(old),hash(actualSource),hash(newFile),hash(actualReplacement),
    ]);
    const equals=(a,b)=>a.length===b.length&&a.every((byte,i)=>byte===b[i]);
    return current(old,newFile,target,token)&&
      equals(digests[0],digests[1])&&equals(digests[2],digests[3]);
  }
  function selected(){
    return inspection?.items.find(x=>x.fileUid===targetSelect.value);
  }
  function refresh(){
    const row=selected(), reasons=[];
    if(busy)reasons.push('BUSY');
    if(!review.checked)reasons.push('EXPLICIT_REVIEW_REQUIRED');
    if(!source)reasons.push('SOURCE_REQUIRED');
    if(!substitute)reasons.push('REPLACEMENT_REQUIRED');
    if(!row)reasons.push('CURRENT_UID_INVENTORY_REQUIRED');
    if(row&&inspection.references.has(row.fileUid))reasons.push('TARGETED_UID_BLOCKED');
    if(row&&substitute&&substitute.size===row.byteLength)
      reasons.push('REPLACEMENT_LENGTH_UNCHANGED');
    if(substitute&&(substitute.size<1||substitute.size>4*1024*1024))
      reasons.push('REPLACEMENT_BUDGET');
    if(row&&source&&substitute){
      const flags={
        selectionEpoch:epoch,
        inspectionSourceMatches:inspection?.source===source,
        userReviewed:review.checked,
        sourcePickerHasOne:sourceInput.files?.length===1,
        replacementPickerHasOne:replacementInput.files?.length===1,
        targetUidExact:targetSelect.value===row.fileUid,
        originalFileCaptured:Boolean(source),
        replacementFileCaptured:Boolean(substitute),
        sourceByteLength:source?.size,
        replacementByteLength:substitute?.size,
        currentRowLength:row?.byteLength,
      };
      prepareButton.dataset.guardDiagnostic=JSON.stringify(flags);
      if(!current(source,substitute,row.fileUid,epoch))
        reasons.push('EXACT_FILE_OR_SELECTION_EPOCH_CHANGED');
    }
    prepareButton.dataset.blockReason=reasons.join(',')||'READY_FOR_STRICT_WRITER_CHECK';
    prepareButton.disabled=reasons.length>0;
  }
  sourceInput.addEventListener('change',async()=>{
    invalidate();review.checked=false;
    sourceList=sourceInput.files;source=sourceList?.[0]||null;
    inspection=null;targetSelect.replaceChildren();
    inventory.textContent='';refresh();
    if(!source){announce('请选择包含已有附件的 Matroska。');return;}
    if(source.size>60*1024*1024){
      announce('本实验只允许 60 MiB 以内的来源。','blocked');return;
    }
    const value=source,token=epoch;
    announce('正在核对来源附件 FileUID 与 TagAttachmentUID 指向……','checking');
    try{
      const reader=createMatroskaAttachmentReader(value);
      const inventoryData=await reader.inspect();
      if(inventoryData.state!=='inspected')
        throw Error(inventoryData.diagnostic?.code||'INVENTORY_NOT_VERIFIED');
      const graph=await reader.inspectRelations(inventoryData);
      if(graph.state!=='inspected'||
          graph.coverage.tagTargets!=='known-targets-enumerated')
        throw Error('TAG_UID_REFERENCE_GRAPH_INCOMPLETE');
      if(token!==epoch||sourceList!==sourceInput.files||sourceInput.files?.[0]!==value)
        return;
      const references=new Set(graph.edges.filter(x=>x.targetKind==='attachment')
        .map(x=>x.targetUid));
      inspection={source:value,items:inventoryData.attachments,references};
      for(const item of inventoryData.attachments){
        const o=document.createElement('option');o.value=item.fileUid;
        o.disabled=references.has(item.fileUid);
        o.textContent=item.filename+' · FileUID '+item.fileUid+
          ' · 当前 '+item.byteLength+' 字节'+
          (o.disabled?' · 被 Tag 引用，不能替换':'');
        targetSelect.append(o);
      }
      const first=inventoryData.attachments.find(x=>!references.has(x.fileUid));
      if(first)targetSelect.value=first.fileUid;
      else targetSelect.selectedIndex=-1;
      inventory.textContent='扫描到 '+inventoryData.attachments.length+
        ' 个附件；其中 '+references.size+
        ' 个 UID 存在标签引用。变长修改还必须拥有紧邻 FileData 的原始 Void。';
      announce(first?'请选择目标和不同长度的新文件；如无相邻 Void 将拒绝写入。':
        '所有附件均被标签引用或没有附件，拒绝变长写入。',
        first?'ready':'blocked');
    }catch(error){
      if(token===epoch)announce('源文件未获得写入资格：'+(error?.message||String(error)),'blocked');
    }finally{if(token===epoch)refresh();}
  });
  replacementInput.addEventListener('change',()=>{
    invalidate();review.checked=false;
    substituteList=replacementInput.files;
    substitute=substituteList?.[0]||null;
    announce('候选数据已变化。大小不同还需要原始 Void 空间；请重新审核。');
    refresh();
  });
  targetSelect.addEventListener('change',()=>{
    invalidate();review.checked=false;
    announce('原始 FileUID 已更换；旧权限和候选副本失效。');
    refresh();
  });
  review.addEventListener('change',()=>{
    invalidate();
    announce(review.checked?'已明确确认变长 FileData 与预留 Void 使用范围。':
      '尚未授权生成新的实验性 MKV。');
    refresh();
  });
  prepareButton.addEventListener('click',async()=>{
    const old=source,newFile=substitute,target=targetSelect.value;
    if(prepareButton.disabled||busy||!current(old,newFile,target,epoch))return;
    invalidate();const token=epoch;
    busy=true;refresh();
    announce('检查紧邻 Void、全部 EBML 原始对象、UID 引用以及 SHA-256……','checking');
    try{
      if(!await selectedBytesStillIdentical(old,newFile,target,token))
        throw Error('CURRENT_PICKER_FILE_BYTES_OR_EPOCH_CHANGED');
      const plan=await prepareReservedVoidFileDataReplacement({
        source:old,replacement:newFile,targetFileUid:target,approveVariableLength:true,
      });
      if(!current(old,newFile,target,token))return;
      const result=await executeReservedVoidFileDataReplacement(plan);
      if(!current(old,newFile,target,token))return;
      prepared={result,source:old,substitute:newFile,target,token};
      saveButton.disabled=false;
      evidence.textContent='原始数据 '+result.evidence.oldDataLength+
        ' 字节 → 新数据 '+result.evidence.newDataLength+' 字节。来源 SHA-256：'+
        result.evidence.sourceSha256+'；新副本 SHA-256：'+
        result.evidence.outputSha256+'；FileData SHA-256：'+
        result.evidence.newFileDataSha256+
        '。原容器总长度、非附件对象字节及偏移、其他附件 FileData 均通过本地验证。外部播放器兼容需要单独检测。';
      announce('预留 Void 内变长替换本地字节验证通过，可下载独立实验副本。','prepared');
    }catch(error){
      if(token===epoch)announce('拒绝：'+(error?.message||String(error))+
        '。未使用 FFmpeg 回退，也没有修改原文件。','blocked');
    }finally{busy=false;refresh();}
  });
  saveButton.addEventListener('click',async()=>{
    const p=prepared;
    if(!p||!current(p.source,p.substitute,p.target,p.token)||
        status.dataset.state!=='prepared'){
      invalidate();refresh();
      announce('来源、FileUID 或确认过期。请重新进行保护审计。','blocked');return;
    }
    saveButton.disabled=true;
    let verified=false;
    try{verified=await selectedBytesStillIdentical(p.source,p.substitute,p.target,p.token);}
    catch{verified=false;}
    if(!verified||prepared!==p||status.dataset.state!=='prepared'){
      invalidate();refresh();
      announce('当前文件选择的来源/替换数据哈希或审核代际失效；已拒绝下载。','blocked');
      return;
    }
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(p.result.output);
    const link=document.createElement('a');
    link.href=url;link.download=p.result.filename;link.rel='noopener';link.hidden=true;
    document.body.append(link);
    try{
      link.click();announce('已请求浏览器下载新的实验性副本；来源原始 MKV 未覆盖。','prepared');
    }finally{
      link.remove();
      if(prepared===p&&current(p.source,p.substitute,p.target,p.token))
        saveButton.disabled=false;
    }
  });
  window.addEventListener('pagehide',invalidate);
  announce('仅支持既有附件 FileData 紧邻预留 Void 的严格变长场景。');
  refresh();
}
