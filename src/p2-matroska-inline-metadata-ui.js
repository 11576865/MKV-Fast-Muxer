import {
  inspectEditableMatroskaMetadataText,prepareMatroskaTextReplacement,
  executeMatroskaTextReplacement,
} from './p2-matroska-inline-metadata-writer.js';

/** Opt-in narrow real metadata writer, NOT an FFmpeg/source project editor. */
export function setupMatroskaInlineMetadataUI({
 sourceInput,fieldSelect,newText,review,inspectStatus,prepare,save,evidence,
}={}){
 if(![sourceInput,fieldSelect,newText,review,inspectStatus,
       prepare,save,evidence].every(Boolean))return;
 let epoch=0,source=null,inventory=null,output=null,busy=false,url=null;
 function expire(){
  epoch++;output=null;save.disabled=true;evidence.textContent='';
  if(url){URL.revokeObjectURL(url);url=null;}
 }
 function report(message,state='idle'){
  inspectStatus.textContent=message;inspectStatus.dataset.state=state;
 }
 function active(){
  return !busy&&source&&sourceInput.files?.[0]===source&&
   inventory?.fields?.some(x=>x.id===fieldSelect.value)&&review.checked;
 }
 function update(){prepare.disabled=!active();}
 sourceInput.addEventListener('change',async()=>{
  expire();source=sourceInput.files?.[0]||null;inventory=null;
  review.checked=false;newText.value='';fieldSelect.replaceChildren();update();
  if(!source){report('请选择包含章节标题或标签文本的 Matroska。');return;}
  const token=epoch;
  report('正在检查已有 Matroska 的章节与标签文本…');
  try{
   const list=await inspectEditableMatroskaMetadataText(source);
   if(token!==epoch||sourceInput.files?.[0]!==source)return;
   inventory=list;
   for(const field of list.fields){
    const opt=document.createElement('option');
    opt.value=field.id;
    opt.textContent=(field.kind==='chapter'?'章节':'标签')+
     ' · '+field.text.slice(0,85)+' · '+field.byteLength+' UTF-8 字节';
    fieldSelect.appendChild(opt);
   }
   if(list.fields.length){
    newText.value=list.fields[0].text;
    report('已检查 '+list.kindCounts.chapter+' 个章节标题、'+
     list.kindCounts.tag+' 个标签文本。仅允许等 UTF-8 字节长度替换。','ready');
   }else report('此容器没有符合本功能范围的可编辑 ChapString/TagString。','blocked');
  }catch(error){
   report('来源被安全拒绝：'+(error.message||String(error)),'blocked');
  }
  update();
 });
 fieldSelect.addEventListener('change',()=>{
  expire();review.checked=false;
  newText.value=inventory?.fields.find(f=>f.id===fieldSelect.value)?.text||'';
  update();
 });
 newText.addEventListener('input',()=>{expire();review.checked=false;update();});
 review.addEventListener('change',()=>{expire();update();});
 prepare.addEventListener('click',async()=>{
  if(!active())return;
  const token=epoch,target=inventory.fields.find(f=>f.id===fieldSelect.value);
  const proposed=newText.value,bound=source;
  busy=true;update();report('正在验证等长度变更及真实输出原始字节…');
  try{
   const plan=await prepareMatroskaTextReplacement({
    source:bound,targetId:target.id,expectedOldText:target.text,
    newText:proposed,confirmSameSize:true,
   });
   if(token!==epoch||sourceInput.files?.[0]!==bound||
      fieldSelect.value!==target.id||newText.value!==proposed||!review.checked)
     throw Error('MATROSKA_TEXT_UI_CHANGED_AFTER_REVIEW');
   const result=await executeMatroskaTextReplacement(plan);
   if(token!==epoch||sourceInput.files?.[0]!==bound||
      fieldSelect.value!==target.id||newText.value!==proposed||!review.checked)
     throw Error('MATROSKA_TEXT_UI_CHANGED_DURING_AUDIT');
   output=result;save.disabled=false;
   evidence.textContent='类别：'+result.evidence.kind+
    '；原始 SHA-256：'+result.evidence.sourceSha256+
    '；成品 SHA-256：'+result.evidence.outputSha256+
    '；媒体、章节/标签结构、UID、Cues、SeekHead：本地字节验证未变；'+
    '外部播放器与 MKVToolNix 兼容性：待验收。';
   report('已形成只修改选定文本字节的独立 MKV 副本；可下载后独立审计。','ready');
  }catch(error){
   if(token===epoch){
    output=null;save.disabled=true;
    report('编辑拒绝：'+(error.message||String(error)),'blocked');
   }
  }finally{busy=false;update();}
 });
 save.addEventListener('click',()=>{
  if(!output||busy||!review.checked||sourceInput.files?.[0]!==source)return;
  url=URL.createObjectURL(output.output);
  const link=document.createElement('a');link.href=url;link.download=output.filename;
  document.body.appendChild(link);link.click();link.remove();
  report('已请求下载本地字节核验的新副本；不会覆盖原文件。','ready');
 });
 update();
}
