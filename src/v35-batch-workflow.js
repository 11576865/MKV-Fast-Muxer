/*
 * V3.5 opt-in Batch workbench: eight real task contexts over ONE existing
 * batch editor, pairing matrix, subtitles/metadata inspector and executor.
 * This module owns only which section is presented/focused, never File,
 * assignment, recipe, ledger, result, save-permission or writer state.
 */
const TASKS=Object.freeze([
  ['resources','资源清单','sf14BatchSources'],
  ['pairing','配对与冲突','batchPlan'],
  ['job','逐任务属性','batchJobInspector'],
  ['fonts','字体策略','batchFontSubsetEnabled'],
  ['recipe','配方与目录','sf14BatchRecipe'],
  ['run','运行队列','batchRunConsole'],
  ['results','成品与保存','batchResults'],
  ['inspection','容器检查','batchInspectBtn'],
]);
function native(doc,id){return doc.getElementById(id);}
function reveal(node,pane) {
  if(!node||!pane||!node.isConnected)return false;
  const box=node.getBoundingClientRect(),limit=pane.getBoundingClientRect();
  if(!limit.height)return false;
  const margin=12;
  // Never use global scrollIntoView(): it shifts the entire fixed-height UI.
  const delta=box.top<limit.top+margin||box.height>limit.height-margin*2
    ? box.top-limit.top-margin
    :box.bottom>limit.bottom-margin?box.bottom-limit.bottom+margin:0;
  if(delta)pane.scrollTop+=delta;
  return true;
}
export function mountV35BatchWorkflow(doc,root) {
  if(!root?.classList.contains('sfv35-nav'))return null;
  const host=native(doc,'sf14Batch');
  const batch=host?.querySelector('.stage-batch');
  const header=batch?.querySelector('.batch-head');
  if(!host||!batch||!header)return null;
  if(native(doc,'sfv35BatchFlow'))return null;
  const workflow=doc.createElement('section');
  workflow.id='sfv35BatchWorkflow';
  workflow.className='sfv35-batch-workflow';
  workflow.setAttribute('aria-label','真实批量工作区');
  const title=doc.createElement('div');
  title.className='sfv35-batch-workflow-head';
  title.innerHTML='<strong>批量工作区</strong><small>配对审核 → 逐项属性 → 执行 → 成品审计。所有操作使用原有批量引擎。</small>';
  const nav=doc.createElement('nav');
  nav.id='sfv35BatchFlow';
  nav.className='sfv35-batch-flow';
  nav.setAttribute('aria-label','批量工作阶段');
  for(const [key,label,control]of TASKS){
    const button=doc.createElement('button');
    button.type='button';
    button.className='sfv35-batch-phase';
    button.dataset.sfv35BatchPhase=key;
    button.setAttribute('aria-controls',control);
    const text=doc.createElement('span');
    text.textContent=label;
    const status=doc.createElement('small');
    status.className='sfv35-batch-phase-count';
    status.dataset.sfv35BatchCount=key;
    status.setAttribute('aria-hidden','true');
    button.append(text,status);
    nav.appendChild(button);
  }
  const summary=doc.createElement('div');
  summary.id='sfv35BatchSummary';
  summary.className='sfv35-batch-summary';
  // Existing native status elements already have aria-live. Do not broadcast
  // a second copy of every byte of run progress to screen readers.
  summary.setAttribute('aria-label','当前批次状态摘要');
  const status=doc.createElement('span');
  status.id='sfv35BatchSourceStatus';
  const review=doc.createElement('span');
  review.id='sfv35BatchReviewStatus';
  const run=doc.createElement('span');
  run.id='sfv35BatchRunStatus';
  summary.append(status,review,run);
  workflow.append(title,nav,summary);
  header.after(workflow);

  const scroller=host;
  const panels={
    resources:()=>native(doc,'sf14BatchSources'),
    pairing:()=>host.querySelector('.batch-review-conflicts')||native(doc,'batchPlan'),
    job:()=>native(doc,'batchJobInspector'),
    fonts:()=>native(doc,'batchFontSubsetEnabled'),
    recipe:()=>native(doc,'sf14BatchRecipe'),
    run:()=>native(doc,'batchRunConsole'),
    results:()=>native(doc,'batchResults'),
    inspection:()=>native(doc,'batchInspectBtn'),
  };
  const setNativeDisclosure=kind=>{
    const button=host.querySelector('[data-sf-batch-controls="'+kind+'"]');
    if(!button)return;
    if(host.dataset.controls!==kind)button.click();
  };
  const renderState=()=>{
    const jobs=host.querySelectorAll('#batchPlan button[data-batch-job-index]').length;
    const conflicts=host.querySelectorAll('#batchPlan select[data-batch-tie-index]').length;
    const outputs=host.querySelectorAll('#batchResults a.download').length;
    const selected=host.querySelectorAll('#batchPlan button[data-batch-job-index][aria-pressed="true"]').length;
    const files=native(doc,'batchAssetStatus')?.textContent?.trim()||'0 文件';
    const nativeReview=native(doc,'batchReviewSummary')?.textContent?.trim()||'等待配对审核';
    const nativeRun=native(doc,'batchRunStatus')?.textContent?.trim()||'尚未启动批次';
    status.textContent='已识别资源：'+files;
    // A tie intentionally leaves ZERO executable jobs. The native
    // empty-plan summary therefore says "无可执行任务"; show the
    // concrete observed blocker before it rather than hiding the cause.
    review.textContent=conflicts
      ?'待处理：'+conflicts+' 条字幕配对歧义，需人工确认 · '+nativeReview
      :nativeReview;
    run.textContent=nativeRun;
    const fontMode=native(doc,'batchFontSubsetEnabled')?.checked
      ?native(doc,'batchSubsetScope')?.value==='group'?'Group 子集':'逐任务子集'
      :'完整字体';
    const counts={
      resources:files,
      pairing:jobs+' 任务'+(conflicts?' · '+conflicts+' 歧义':''),
      job:selected?'已选任务':'未选择',
      fonts:fontMode,
      recipe:'JSON / 输出目录',
      run:native(doc,'batchRunProgress')?.value>0?'已开始':'未开始',
      results:outputs+' 成品',
      inspection:native(doc,'batchInspectStatus')?.textContent?.trim()||'未检查',
    };
    for(const button of nav.querySelectorAll('button[data-sfv35-batch-phase]')){
      const key=button.dataset.sfv35BatchPhase;
      button.querySelector('small').textContent=counts[key];
      const active=key===host.dataset.sfv35BatchFocus;
      button.setAttribute('aria-pressed',String(active));
    }
    host.dataset.sfv35BatchConflict=conflicts?'true':'false';
    host.dataset.sfv35BatchResults=outputs?'true':'false';
  };
  let pending=false;
  const schedule=()=>{
    if(pending)return;pending=true;
    doc.defaultView?.queueMicrotask?.(()=>{pending=false;renderState();});
  };
  const select=key=>{
    if(!panels[key])return false;
    // A batch panel must reuse the one actual drawer and original
    // source/recipe controls. It must not click the runner or change metadata.
    const drawer=batch.querySelector('.batch-drawer');
    if(drawer)drawer.open=true;
    if(key==='resources')setNativeDisclosure('sources');
    else if(key==='recipe'||key==='fonts')setNativeDisclosure('recipe');
    else if(host.dataset.controls){
      const original=host.querySelector('[data-sf-batch-controls="'+host.dataset.controls+'"]');
      original?.click();
    }
    host.dataset.sfv35BatchFocus=key;
    renderState();
    doc.defaultView?.requestAnimationFrame?.(()=>{
      if(host.dataset.sfv35BatchFocus!==key || root.dataset.view!=='batch')return;
      const panel=panels[key]();
      if(!panel)return;
      const target=key==='inspection'?
        panel.closest('.container-batch-review')||panel:panel;
      reveal(target,scroller);
      // The focused stage must be a real underlying operation, not a
      // cloned input or a dead toolbar. Avoid moving focus to disabled inputs.
      const focus=key==='resources'?
        native(doc,'batchUnifiedInput'):
        key==='pairing'?
          host.querySelector('#batchPlan select[data-batch-tie-index]')||
          host.querySelector('#batchPlan button[data-batch-job-index]'):
        key==='job'?
          host.querySelector('#batchJobInspector [data-batch-task-field]'):
        key==='fonts'?
          native(doc,'batchFontSubsetEnabled'):
        key==='recipe'?
          native(doc,'batchRecipeV2ExportBtn'):
        key==='run'?
          native(doc,'batchRunExportBtn'):
        key==='results'?
          host.querySelector('#batchResults a.download'):
          native(doc,'batchInspectBtn');
      if(focus&&!focus.disabled&&focus.getClientRects().length){
        focus.focus({preventScroll:true});
      }else{
        target.tabIndex=-1;
        target.focus({preventScroll:true});
      }
    });
    return true;
  };
  nav.addEventListener('click',event=>{
    const key=event.target.closest('[data-sfv35-batch-phase]')?.dataset.sfv35BatchPhase;
    if(key)select(key);
  });
  // ChildList changes are **actual existing renderer outputs**. Only update
  // compact readouts; never mirror mutable job data or launch a task.
  const observer=new MutationObserver(schedule);
  for(const id of ['batchPlan','batchAssetStatus','batchReviewSummary',
    'batchRunStatus','batchResults','batchInspectStatus']){
    const node=native(doc,id);
    if(node)observer.observe(node,{childList:true,subtree:true,characterData:true});
  }
  for(const id of ['batchFontSubsetEnabled','batchSubsetScope']){
    native(doc,id)?.addEventListener('change',schedule);
  }
  host.dataset.sfv35BatchFocus='pairing';
  renderState();
  return {select,renderState};
}
