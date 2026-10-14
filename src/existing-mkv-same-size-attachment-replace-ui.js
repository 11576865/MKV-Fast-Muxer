import { createMatroskaAttachmentReader } from './matroska-attachment-reader.js';
import {
  prepareSameSizeAttachmentReplacement, executeSameSizeAttachmentReplacement,
} from './existing-mkv-same-size-attachment-replace.js';

/**
 * A separate reviewed P0/P2 research tool, never a fallback for the
 * video-rooted FFmpeg muxer. The source is never written or overwritten.
 */
export function setupExistingMkvSameSizeAttachmentReplaceUI({
  sourceInput,replacementInput,targetSelect,review,prepareButton,saveButton,
  status,evidence,inventory,
}={}) {
  if (![sourceInput,replacementInput,targetSelect,review,prepareButton,
    saveButton,status,evidence,inventory].every(Boolean)) return;
  let epoch=0, busy=false, inspected=null, prepared=null, url=null;
  let sourceSelection=null, sourceFile=null, replacementSelection=null, replacementFile=null;
  function invalidate() {
    epoch++; prepared=null; saveButton.disabled=true;
    if(url)URL.revokeObjectURL(url);
    url=null; evidence.textContent='';
  }
  function report(message,state='idle') {
    status.textContent=message;
    status.dataset.state=state;
  }
  function exactCurrent(source,replacement,token,targetUid) {
    return token===epoch && review.checked && inspected?.source===source &&
      sourceSelection===sourceInput.files && sourceInput.files?.[0]===source &&
      replacementSelection===replacementInput.files &&
      replacementInput.files?.[0]===replacement &&
      targetSelect.value===targetUid;
  }
  function selectedItem() {
    return inspected?.inventory?.attachments?.find(item=>item.fileUid===targetSelect.value);
  }
  function updateControls() {
    const target=selectedItem(), replacement=replacementFile;
    prepareButton.disabled=busy || !review.checked || !target ||
      inspected?.blockedTargets?.has(target.fileUid) ||
      !replacement?.size || replacement.size!==target.byteLength ||
      !exactCurrent(sourceFile,replacementFile,epoch,target.fileUid);
  }
  sourceInput.addEventListener('change',async()=>{
    invalidate(); review.checked=false;
    sourceSelection=sourceInput.files;
    sourceFile=sourceSelection?.[0]||null;
    targetSelect.replaceChildren();
    inventory.textContent='';
    inspected=null;
    updateControls();
    if(!sourceFile){ report('请选择包含已有附件的 Matroska。'); return; }
    const source=sourceFile, token=epoch;
    report('正在检查已有附件、FileUID 和 TagAttachmentUID 引用……','checking');
    try{
      if(source.size>60*1024*1024)throw Error('SOURCE_OVER_60_MIB_RESEARCH_LIMIT');
      const reader=createMatroskaAttachmentReader(source);
      const stock=await reader.inspect();
      if(stock.state!=='inspected' || !reader.isCurrentInspection(stock))
        throw Error(stock.diagnostic?.code||'SOURCE_INSPECTION_UNVERIFIED');
      const graph=await reader.inspectRelations(stock);
      if(graph.state!=='inspected' ||
          graph.coverage.tagTargets!=='known-targets-enumerated')
        throw Error('TARGET_REFERENCE_GRAPH_UNVERIFIED');
      if(token!==epoch||sourceSelection!==sourceInput.files||sourceInput.files?.[0]!==source)
        return;
      const blockedTargets=new Set(graph.edges.filter(edge=>
        edge.targetKind==='attachment').map(edge=>edge.targetUid));
      inspected={source,inventory:stock,blockedTargets};
      for(const item of stock.attachments) {
        const option=document.createElement('option');
        option.value=item.fileUid;
        option.textContent=item.filename+' · UID '+item.fileUid+
          ' · '+item.byteLength+' bytes'+
          (blockedTargets.has(item.fileUid)?' · 已被 Tag 引用，不可替换':'');
        option.disabled=blockedTargets.has(item.fileUid);
        targetSelect.append(option);
      }
      const selectable=stock.attachments.find(item=>!blockedTargets.has(item.fileUid));
      if(selectable)targetSelect.value=selectable.fileUid;
      else targetSelect.selectedIndex=-1;
      inventory.textContent=stock.attachments.length
        ? '检测到 '+stock.attachments.length+' 个已有附件；其中 '+
          blockedTargets.size+' 个 UID 已被标签引用。只能选择未被引用且新旧 FileData 大小完全一致的附件。'
        : '该 MKV 没有可替换的已有附件。';
      report(selectable?'请选择等长的替换文件，明确确认后生成新副本。':
        '没有符合本工具条件的附件；不允许按名称猜测 UID。',
        selectable?'ready':'blocked');
    }catch(error){
      if(token!==epoch)return;
      report('来源检查拒绝：'+(error?.message||String(error)),'blocked');
    }finally {if(token===epoch)updateControls();}
  });
  replacementInput.addEventListener('change',()=>{
    invalidate(); review.checked=false;
    replacementSelection=replacementInput.files;
    replacementFile=replacementSelection?.[0]||null;
    const target=selectedItem();
    if(target&&replacementFile?.size!==target.byteLength)
      report('已拒绝：新文件必须恰好 '+target.byteLength+' bytes；不同长度会改变 EBML 偏移。','blocked');
    else report('替换来源已变化。请核对目标 UID 并重新确认。');
    updateControls();
  });
  targetSelect.addEventListener('change',()=>{
    invalidate();review.checked=false;
    report('目标 FileUID 已变化。需重新确认，不接受旧的生成权限。');
    updateControls();
  });
  review.addEventListener('change',()=>{
    invalidate();
    report(review.checked?'已确认等长替换风险，可申请本地验证。':'尚未确认此实验性修改。');
    updateControls();
  });
  prepareButton.addEventListener('click',async()=>{
    const source=sourceFile,replacement=replacementFile,targetUid=targetSelect.value;
    if(busy||prepareButton.disabled||!exactCurrent(source,replacement,epoch,targetUid))return;
    invalidate();const token=epoch;
    busy=true;updateControls();
    report('正在验证源结构、UID 引用、目标字节范围与成品附件 SHA-256……','checking');
    try{
      const plan=await prepareSameSizeAttachmentReplacement({
        source,replacement,targetFileUid:targetUid,acknowledgeContentReplacement:true,
      });
      if(!exactCurrent(source,replacement,token,targetUid))return;
      const value=await executeSameSizeAttachmentReplacement(plan);
      if(!exactCurrent(source,replacement,token,targetUid))return;
      prepared={value,source,replacement,targetUid,token};
      evidence.textContent='来源 SHA-256：'+value.evidence.sourceSha256+
        '；成品 SHA-256：'+value.evidence.outputSha256+
        '；原附件 SHA-256：'+value.evidence.priorFileDataSha256+
        '；替换后 SHA-256：'+value.evidence.replacementSha256+
        '。所有原非附件顶层 EBML 原始字节、偏移，其他附件 FileData、原附件 UID/名称/MIME 均已通过本地验证；外部播放器兼容仍需另行证明。';
      saveButton.disabled=false;
      report('本地受限等长替换校验通过，可手动下载独立副本；源文件未被写入。','prepared');
    }catch(error){
      if(token===epoch)report('拒绝生成：'+(error?.message||String(error))+
        '。没有执行 FFmpeg 降级重封装。','blocked');
    }finally{busy=false;updateControls();}
  });
  saveButton.addEventListener('click',()=>{
    const p=prepared;
    if(!p||!exactCurrent(p.source,p.replacement,p.token,p.targetUid)||
        status.dataset.state!=='prepared'){
      invalidate();updateControls();
      report('来源、审核或目标失效；已撤销下载。','blocked');
      return;
    }
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(p.value.output);
    const a=document.createElement('a');
    a.href=url;a.download=p.value.filename;a.hidden=true;a.rel='noopener';
    document.body.append(a);
    try{a.click();report('已请求下载经本地验证的独立实验性副本。源文件未修改。','prepared');}
    finally{a.remove();}
  });
  window.addEventListener('pagehide',invalidate);
  report('请选择已有附件的 MKV。仅支持 60 MiB 以内、未被标签关联的等长 FileData 单附件替换。');
  updateControls();
}
