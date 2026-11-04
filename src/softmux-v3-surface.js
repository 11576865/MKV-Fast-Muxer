/*
 * Softmux V3 / WU-01: source-first presentation over the EXISTING live DOM.
 * Opt-in via ?ui=v3. Does not create a second ContainerProject or write media.
 * Existing source inputs, composition editor, mux action and output evidence
 * are retained in place. Source observation is a read-only DOM projection.
 */
const find = (doc, id) => doc.getElementById(id);

function appendText(doc, parent, tag, className, value) {
  const el = doc.createElement(tag);
  el.className = className;
  el.textContent = value;
  parent.appendChild(el);
  return el;
}

export function sourceRowsFromComposition(doc) {
  const live = find(doc, 'compositionTracks');
  if (!live) return [];
  return [...live.querySelectorAll('[data-composition-id]')]
    .filter(node => String(node.dataset.compositionId || '').startsWith('source:'))
    .map(node => ({
      id: String(node.dataset.compositionId),
      kind: node.querySelector('.composition-kind')?.textContent?.trim() || '轨道',
      name: node.querySelector('.composition-track-main strong')?.textContent?.trim() || '未命名',
      detail: node.querySelector('.composition-track-main small')?.textContent?.trim() || '',
    }));
}

export function mountSoftmuxV3Surface(doc = document) {
  const root = find(doc, 'sf14Root');
  const single = find(doc, 'sf14Single');
  const compositionHost = find(doc, 'sf14Composition');
  const source = find(doc, 'sf14Source');
  const sourceInput = find(doc, 'videoInput');
  const actualComposition = find(doc, 'outputCompositionPanel');
  const currentTracks = find(doc, 'compositionTracks');
  const dropzone = find(doc, 'assetDropzone');
  if (!root || !single || !compositionHost || !source || !sourceInput ||
      !actualComposition || !currentTracks || !dropzone ||
      root.classList.contains('sfv3')) return false;

  root.classList.add('sfv3');
  root.dataset.sfv3Surface = 'source';
  root.dataset.sfv3Contract = 'approved-v3-wu02-pilot';

  const header = root.querySelector('.sf14-header');
  const identity = header?.querySelector('.sf14-identity strong');
  if (identity) identity.textContent = '软封';
  const nav = header?.querySelector('.sf14-nav');
  if (nav) {
    const legacy = doc.createElement('details');
    legacy.className = 'sfv3-legacy-menu';
    const summary = doc.createElement('summary');
    summary.textContent = '⋯';
    summary.title = '保留的旧工具';
    summary.setAttribute('aria-label', '保留的旧工具');
    nav.parentNode.insertBefore(legacy, nav);
    legacy.append(summary, nav);
    nav.querySelectorAll('[data-sf-view]').forEach(button =>
      button.addEventListener('click', () => { legacy.open = false; }));
  }
  const headerActions = header?.querySelector('.sf14-header-actions');
  if (headerActions) {
    for (const [id, glyph, name] of [
      ['sf14Add','＋','添加资源'],
      ['sf14SourceToggle','☰','打开来源资源'],
      ['sf14Help','?','帮助'],
      ['sf14Settings','⚙','界面设置'],
    ]) {
      const button = find(doc, id);
      if (!button) continue;
      button.textContent = glyph;
      button.title = name;
      button.setAttribute('aria-label', name);
      button.classList.add('sfv3-icon-action');
    }
  }

  const tabstrip = doc.createElement('nav');
  tabstrip.id = 'sfv3Tabs';
  tabstrip.className = 'sfv3-tabs';
  tabstrip.setAttribute('aria-label', '来源与拟输出文档');
  const sourceTab = appendText(doc, tabstrip, 'button', 'sfv3-tab sfv3-source-tab', '未加载');
  sourceTab.type = 'button';
  sourceTab.id = 'sfv3SourceTab';
  sourceTab.setAttribute('aria-current', 'page');
  const targetTab = appendText(doc, tabstrip, 'button', 'sfv3-tab sfv3-target-tab', '拟输出');
  targetTab.type = 'button';
  targetTab.id = 'sfv3TargetTab';
  targetTab.hidden = true;
  header?.insertBefore(tabstrip, headerActions || null);

  const rail = doc.createElement('div');
  rail.id = 'sfv3Rail';
  rail.className = 'sfv3-rail';
  rail.setAttribute('aria-label', '工作台快速操作');
  const sourcesBtn = appendText(doc, rail, 'button', 'sfv3-rail-action', '▤');
  sourcesBtn.type = 'button';
  sourcesBtn.title = '来源资源';
  sourcesBtn.setAttribute('aria-label', '来源资源');
  sourcesBtn.addEventListener('click', () => find(doc, 'sf14SourceToggle')?.click());
  const addBtn = appendText(doc, rail, 'button', 'sfv3-rail-action', '＋');
  addBtn.type = 'button';
  addBtn.title = '添加资源';
  addBtn.setAttribute('aria-label', '添加资源');
  addBtn.addEventListener('click', () => find(doc, 'sf14Add')?.click());
  single.prepend(rail);

  // This is a read-only observation of the SAME authoritative source scan.
  // It is not another track editor and never dispatches mutating commands.
  const readout = doc.createElement('section');
  readout.id = 'sfv3SourceReadout';
  readout.className = 'sfv3-source-readout';
  readout.setAttribute('aria-label', '当前来源的真实容器内容');
  const heading = doc.createElement('div');
  heading.className = 'sfv3-document-heading';
  const name = appendText(doc, heading, 'h1', 'sfv3-file-name', '未加载文件');
  name.id = 'sfv3FileName';
  const tag = appendText(doc, heading, 'span', 'sfv3-source-tag', '来源');
  tag.setAttribute('aria-label', '来源对象，不是拟输出');
  const meta = appendText(doc, readout, 'p', 'sfv3-source-summary', '');
  meta.id = 'sfv3SourceSummary';

  const empty = doc.createElement('div');
  empty.className = 'sfv3-empty';
  empty.id = 'sfv3Empty';
  appendText(doc, empty, 'span', 'sfv3-empty-icon', '+');
  appendText(doc, empty, 'strong', 'sfv3-empty-title', '拖入文件，或点击这里添加');
  appendText(doc, empty, 'span', 'sfv3-empty-types', 'MKV · 视频 · 字幕 · 字体');
  // Move the actual existing drop target, with all original event handlers.
  empty.appendChild(dropzone);
  const contents = doc.createElement('div');
  contents.className = 'sfv3-source-contents';
  contents.id = 'sfv3SourceContents';
  const primary = doc.createElement('button');
  primary.id = 'sfv3EnterOutput';
  primary.type = 'button';
  primary.className = 'sfv3-plan-cta';
  primary.textContent = '编辑拟输出';
  primary.title = '进入现有封装计划；不会直接修改来源文件';
  primary.hidden = true;
  readout.prepend(heading);
  readout.append(empty, contents, primary);
  compositionHost.prepend(readout);

  const bottom = doc.createElement('footer');
  bottom.id = 'sfv3SourceStatus';
  bottom.className = 'sfv3-source-status';
  bottom.setAttribute('role', 'status');
  bottom.textContent = '尚未加载资源';
  root.querySelector('.sf14-output')?.before(bottom);

  // V3 target picker is an explicit action, never an implicit file import side effect.
  const picker = doc.createElement('dialog');
  picker.id = 'sfv3TargetPicker';
  picker.className = 'sfv3-target-picker';
  picker.setAttribute('aria-label', '选择拟输出基础容器');
  const pickerTitle = appendText(doc, picker, 'h2', 'sfv3-picker-title', '加入到哪里？');
  const pickerExplanation = appendText(doc, picker, 'p', 'sfv3-picker-explanation', '请选择一个真实 MKV 作为拟输出基础。');
  const pickerOptions = doc.createElement('div');
  pickerOptions.className = 'sfv3-picker-options';
  pickerOptions.id = 'sfv3PickerOptions';
  const pickerStatus = appendText(doc, picker, 'p', 'sfv3-picker-status', '');
  pickerStatus.setAttribute('role','status');
  const pickerActions = doc.createElement('div');
  pickerActions.className = 'sfv3-picker-actions';
  const cancelChoice = appendText(doc, pickerActions, 'button', 'sfv3-picker-cancel', '取消');
  cancelChoice.type = 'button';
  const confirmChoice = appendText(doc, pickerActions, 'button', 'sfv3-picker-confirm', '创建拟输出');
  confirmChoice.type = 'button';
  confirmChoice.id = 'sfv3ConfirmTarget';
  picker.append(pickerOptions,pickerStatus,pickerActions);
  picker.insertBefore(pickerTitle,pickerOptions);
  picker.insertBefore(pickerExplanation,pickerOptions);
  root.appendChild(picker);
  cancelChoice.addEventListener('click',()=>picker.close());
  let latestSections = {scanned:false, attachments:[],chapters:[],tags:[]};
  let latestResources = {entries:[],activeBase:null,target:null};
  let viewedSourceKey = '';
  let targetIntent = null;
  let pendingTrack = null;
  let pendingAddition = null;
  let flowMessage = '';
  let scheduled = false;
  const getEntries = () => latestResources.entries || [];
  const exactEntry = (key,file) => getEntries().find(entry =>
    entry.key === key && entry.file === file && entry.kind === 'container');
  const activeView = () => {
    const entries = getEntries();
    return entries.find(entry => entry.key === viewedSourceKey) ||
      entries.find(entry => entry.file === sourceInput.files?.[0]) ||
      entries[0] || null;
  };
  const signal = (type,detail) => {
    const EventCtor=doc.defaultView?.CustomEvent;
    if (!EventCtor) return false;
    const event = new EventCtor(type,{bubbles:true,cancelable:true,detail});
    root.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const setSurface = mode => {
    if (mode === 'plan' && (!targetIntent ||
      targetIntent.baseFile !== sourceInput.files?.[0])) return false;
    if (!['source','plan'].includes(mode)) return false;
    root.dataset.sfv3Surface = mode;
    root.dataset.sfv3TargetConfirmed = String(Boolean(targetIntent));
    targetTab.hidden = !targetIntent;
    targetTab.toggleAttribute('aria-current',mode === 'plan');
    return true;
  };
  const syncTabs = () => {
    const entries=getEntries();
    // Reconcile keyed tab buttons without detaching the focused source tab
    // when an unrelated async scan refreshes the underlying inventory.
    const needed=new Set(entries.slice(1).map(entry=>entry.key));
    for(const tab of [...tabstrip.querySelectorAll('.sfv3-secondary-tab')]) {
      if(!needed.has(tab.dataset.sfv3SourceKey))tab.remove();
    }
    const first=entries[0] || null;
    sourceTab.dataset.sfv3SourceKey=first?.key || '';
    sourceTab.textContent=first?.file?.name || sourceInput.files?.[0]?.name || '未加载';
    sourceTab.title=first?.file?.name || '选择文件';
    sourceTab.toggleAttribute('aria-current',
      root.dataset.sfv3Surface==='source' &&
      (!first || viewedSourceKey===first.key));
    for (const entry of entries.slice(1)) {
      let tab=[...tabstrip.querySelectorAll('.sfv3-secondary-tab')]
        .find(x=>x.dataset.sfv3SourceKey===entry.key);
      if(!tab) {
        tab=appendText(doc,tabstrip,'button','sfv3-tab sfv3-secondary-tab',entry.file.name);
        tab.type='button';
        tab.dataset.sfv3SourceKey=entry.key;
        tabstrip.insertBefore(tab,targetTab);
      }
      tab.textContent=entry.file.name;
      tab.title=entry.file.name;
      tab.toggleAttribute('aria-current',
        root.dataset.sfv3Surface==='source' && viewedSourceKey===entry.key);
    }
    targetTab.hidden = !targetIntent;
    targetTab.toggleAttribute('aria-current',root.dataset.sfv3Surface==='plan');
    if(targetIntent)targetTab.textContent='拟输出 · '+targetIntent.baseFile.name;
  };
  const createGroup = (group,rows,readonly=false) => {
    if (!rows.length)return;
    const section=doc.createElement('section');
    section.className='sfv3-object-group';
    const head=doc.createElement('div');
    head.className='sfv3-object-group-head';
    appendText(doc,head,'h2','sfv3-object-group-title',group);
    appendText(doc,head,'span','sfv3-object-group-count',String(rows.length).padStart(2,'0'));
    section.appendChild(head);
    const list=doc.createElement('div');
    list.className='sfv3-object-list';
    list.setAttribute('role','list');
    for(const item of rows) {
      const row=doc.createElement('div');
      row.className='sfv3-observed-row';
      row.setAttribute('role','listitem');
      row.dataset.sourceObjectId=String(item.id);
      const glyph=appendText(doc,row,'span','sfv3-kind-icon',
        group==='视频'?'▣':group==='音频'?'◖':group==='字幕'?'▤':readonly?'◫':'◇');
      glyph.setAttribute('aria-hidden','true');
      const column=doc.createElement('div');
      column.className='sfv3-observed-text';
      appendText(doc,column,'strong','sfv3-observed-title',item.name||'未命名');
      if(item.detail)appendText(doc,column,'small','sfv3-observed-detail',item.detail);
      if(item.reason)appendText(doc,column,'small','sfv3-observation-note',item.reason);
      row.appendChild(column);
      if (item.transfer) {
        const button=appendText(doc,row,'button','sfv3-row-action','加入到…');
        button.type='button';
        button.title='选择拟输出基础容器，不直接修改来源';
        button.addEventListener('click',()=>openTargetPicker(item.transfer));
      } else if(readonly) {
        appendText(doc,row,'span','sfv3-readonly-indicator','只读');
      }
      list.appendChild(row);
    }
    section.appendChild(list);
    contents.appendChild(section);
  };
  const openTargetPicker = track => {
    pendingTrack=track || null;
    pickerOptions.replaceChildren();
    pickerStatus.textContent='';
    const possible=getEntries().filter(entry =>
      !pendingTrack || entry.file !== pendingTrack.sourceFile);
    pickerExplanation.textContent=pendingTrack ?
      '为这条来源字幕选择另一个 MKV 作为目标；不会写入来源文件。' :
      '选择一个 MKV 作为拟输出基础；尚未执行封装。';
    for(const entry of possible) {
      const label=doc.createElement('label');
      label.className='sfv3-picker-option';
      const radio=doc.createElement('input');
      radio.type='radio';radio.name='sfv3TargetBase';
      radio.value=entry.key;
      radio.checked=Boolean(targetIntent?.baseFile===entry.file) ||
        (!targetIntent && entry.file===latestResources.activeBase);
      label.appendChild(radio);
      appendText(doc,label,'span','sfv3-picker-file-name',entry.file.name);
      pickerOptions.appendChild(label);
    }
    const emptyOption=appendText(doc,pickerOptions,'div','sfv3-picker-unavailable',
      '新建空 MKV · 当前版本尚无受验收的空容器执行路径');
    emptyOption.setAttribute('aria-disabled','true');
    confirmChoice.disabled=!possible.length;
    if(!possible.length)pickerStatus.textContent='请先导入另一份 MKV 作为目标。';
    else if(!pickerOptions.querySelector('input:checked'))
      pickerOptions.querySelector('input').checked=true;
    confirmChoice.textContent=pendingTrack?'确认目标并加入字幕':'创建拟输出';
    if(typeof picker.showModal==='function')picker.showModal();else picker.open=true;
  };
  const runPendingAddition = () => {
    if(!pendingAddition || !targetIntent) return;
    const request=pendingAddition;
    if (!exactEntry(request.sourceKey,request.sourceFile) ||
        !exactEntry(request.baseKey,request.baseFile) ||
        latestResources.activeBase!==request.baseFile ||
        targetIntent.baseFile!==request.baseFile) {
      pendingAddition=null;
      flowMessage='来源或目标已变化；已取消这次字幕加入请求。';
      return;
    }
    const from=getEntries().find(x=>x.key===request.sourceKey);
    if(!from || from.file===latestResources.activeBase)return;
    if(from.subtitleState==='unverified') {
      flowMessage='无法核验来源字幕：'+(from.subtitleReason||'读取失败');
      pendingAddition=null;
      return;
    }
    if(from.subtitleState!=='inspected') {
      if (!request.inspectStarted) {
        if (!from.canInspect) {
          flowMessage='正在等待目标基础容器就绪，尚未开始提取。';
          return;
        }
        request.inspectStarted=true;
        if(!signal('softmux:v3-inspect-secondary',{
          sourceKey:request.sourceKey,sourceFile:request.sourceFile,
        })) {
          pendingAddition=null;
          flowMessage='当前不能读取这份来源的内封字幕，请检查文件状态。';
        } else {
          flowMessage='正在读取并核验来源字幕…';
        }
      }
      return;
    }
    const track=from.subtitleTracks.find(t=>t.index===request.streamIndex);
    if(!track) {
      pendingAddition=null;
      flowMessage='字幕轨身份已改变，未执行加入。';
      return;
    }
    if(track.codec!=='subrip' || !track.allowed) {
      pendingAddition=null;
      flowMessage=track.reason||'当前仅支持经过核验的 SubRip 跨容器加入；ASS 与字体需要独立闭包验证。';
      return;
    }
    if(!track.canAdd) {
      flowMessage='正在等候字幕提取入口就绪；未声称已经加入。';
      return;
    }
    pendingAddition=null;
    if(signal('softmux:v3-add-secondary',{
      sourceKey:request.sourceKey,sourceFile:request.sourceFile,
      streamIndex:request.streamIndex,
    })) {
      flowMessage='已提交来源字幕提取与核验，请等待真实处理结果。';
    }else {
      flowMessage='来源字幕已变化或执行器正忙，没有启动加入。';
    }
  };
  confirmChoice.addEventListener('click',()=>{
    const chosen=pickerOptions.querySelector('input[name="sfv3TargetBase"]:checked');
    const base=getEntries().find(entry=>entry.key===chosen?.value);
    if(!base) {
      pickerStatus.textContent='请选择一份仍在当前资源列表中的真实 MKV。';
      return;
    }
    if(pendingTrack && !exactEntry(pendingTrack.sourceKey,pendingTrack.sourceFile)){
      pickerStatus.textContent='来源文件已被替换或移除，请重新选择字幕。';
      return;
    }
    const accepted=signal('softmux:v3-confirm-target',{
      baseKey:base.key,baseFile:base.file,
    });
    if(!accepted) {
      pickerStatus.textContent='目标没有通过来源身份或操作状态检查，尚未创建拟输出。';
      return;
    }
    const track=pendingTrack;
    pendingTrack=null;
    picker.close();
    if(track) {
      pendingAddition={
        sourceKey:track.sourceKey,sourceFile:track.sourceFile,
        streamIndex:track.streamIndex,baseKey:base.key,baseFile:base.file,
        inspectStarted:false,
      };
      viewedSourceKey=track.sourceKey;
      setSurface('source');
      flowMessage='目标已确认；准备从来源提取所选字幕。';
    }else {
      setSurface('plan');
      flowMessage='已明确选择基础容器；尚未执行封装。';
    }
    schedule();
  });
  picker.addEventListener('close',()=>{pendingTrack=null;});
  const showSourceEntry = key => {
    const entry=getEntries().find(x=>x.key===key);
    if(!entry)return;
    viewedSourceKey=entry.key;
    // Observing another file is NOT permission to use it as a target.
    // Until a target is confirmed, opening a tab also asks the one canonical
    // scanner to inspect that exact File; no second scan/editor is invented.
    if(!targetIntent && entry.file!==latestResources.activeBase) {
      if(!signal('softmux:v3-open-source',{
        sourceKey:entry.key,sourceFile:entry.file,
      }))flowMessage='来源暂时无法打开；可能仍在执行扫描。';
    }
    setSurface('source');
    schedule();
  };
  sourceTab.addEventListener('click',()=>{
    showSourceEntry(sourceTab.dataset.sfv3SourceKey||'');
  });
  tabstrip.addEventListener('click',event=>{
    const tab=event.target.closest('button.sfv3-secondary-tab');
    if(!tab)return;
    showSourceEntry(tab.dataset.sfv3SourceKey);
  });
  targetTab.addEventListener('click',()=>{
    setSurface('plan');schedule();
  });
  primary.textContent='创建拟输出';
  primary.addEventListener('click',()=>openTargetPicker(null));

  const render = () => {
    scheduled=false;
    const from=activeView();
    const file=from?.file||sourceInput.files?.[0]||null;
    const mainSource=Boolean(file && file===sourceInput.files?.[0]);
    const mainScanned=Boolean(mainSource && !actualComposition.hidden);
    const sourceRows=mainScanned?sourceRowsFromComposition(doc):[];
    const obs=mainSource && latestSections.scanned &&
      latestSections.sourceFile===file ? latestSections:null;
    name.textContent=file?.name || '未加载文件';
    contents.replaceChildren();
    empty.hidden=Boolean(file);
    heading.hidden=!file;
    meta.hidden=!file;
    primary.hidden=!file || !getEntries().length;
    if(file && !mainSource) {
      meta.textContent='独立来源 · 查看不改变当前目标基础容器';
      const snapshot=from;
      if(snapshot.subtitleState==='inspected') {
        const rows=(snapshot.subtitleTracks||[]).map(track=>({
          id:'source:subtitle:'+track.index,
          name:(track.title||'字幕轨 #'+track.index),
          detail:track.codec+' · '+track.language+' · 轨道 #'+track.index,
          reason:track.allowed ? '' : track.reason,
          transfer:track.allowed?{
            sourceKey:from.key,sourceFile:from.file,streamIndex:track.index,
          }:null,
        }));
        createGroup('字幕',rows,true);
        if(!rows.length)appendText(doc,contents,'p','sfv3-observation-note',
          '此来源的实际扫描未报告可用的字幕轨道。');
      }else {
        const msg=snapshot.subtitleState==='unverified'
          ? '来源字幕读取失败：'+snapshot.subtitleReason :
          snapshot.subtitleState==='inspecting'
          ? '正在读取实际内封字幕轨，请勿将文件名当作扫描结果。':
          '尚未检查这份来源的内封字幕。';
        appendText(doc,contents,'p','sfv3-observation-note',msg);
        const inspect=appendText(doc,contents,'button','sfv3-inspect-source','读取内封字幕');
        inspect.type='button';
        inspect.disabled=snapshot.subtitleState==='inspecting' || !snapshot.canInspect;
        inspect.addEventListener('click',()=>{
          if(!signal('softmux:v3-inspect-secondary',{
            sourceKey:from.key,sourceFile:from.file,
          }))flowMessage='来源当前不可检查，请确认目标基础容器仍可用。';
          schedule();
        });
      }
      appendText(doc,contents,'p','sfv3-observation-note',
        '这里只列出已独立验证的字幕信息；未扫描的章节、音轨或附件不会被猜测出来。');
    }else if(file && !mainScanned) {
      meta.textContent='已选择来源 · 等待实际扫描';
      appendText(doc,contents,'p','sfv3-observation-note','来源尚无已验证的内部轨道。');
    }else if(mainScanned) {
      meta.textContent='Matroska 来源 · 已扫描；尚未自动创建拟输出';
      const groups=new Map();
      for(const row of sourceRows) {
        const kind=/视频/.test(row.kind)?'视频':/音频/.test(row.kind)?'音频':
          /字幕/.test(row.kind)?'字幕':'其他轨道';
        if(!groups.has(kind))groups.set(kind,[]);
        const streamIndex=Number(String(row.id).split(':').at(-1));
        const stream=from?.primaryStreams?.find(s=>s.index===streamIndex);
        const isSubtitle=kind==='字幕' && Number.isSafeInteger(streamIndex);
        groups.get(kind).push({
          id:row.id,name:row.name,detail:row.detail,
          transfer:isSubtitle && from ? {
            sourceKey:from.key,sourceFile:from.file,streamIndex,
          }:null,
          reason:isSubtitle && stream?.codec!=='subrip'
            ? '此编码的跨 MKV 转移需先通过独立依赖检查。':'',
        });
      }
      for(const kind of ['视频','音频','字幕','其他轨道'])
        createGroup(kind,groups.get(kind)||[]);
      for(const [kind,title] of [['attachments','附件'],['chapters','章节'],['tags','标签']])
        createGroup(title,(obs?.[kind]||[]).map(item=>({
          id:item.id,name:item.title,detail:item.detail,
        })),true);
      if(!sourceRows.length && !(obs?.attachments?.length||obs?.chapters?.length||obs?.tags?.length))
        appendText(doc,contents,'p','sfv3-observation-note',
          '当前来源尚没有足够的轨道或结构证据。');
    }
    const targetValid=Boolean(targetIntent &&
      exactEntry(targetIntent.baseKey,targetIntent.baseFile) &&
      latestResources.activeBase===targetIntent.baseFile);
    if(!targetValid && targetIntent) {
      targetIntent=null;pendingAddition=null;
      root.dataset.sfv3TargetConfirmed='false';
      root.dataset.sfv3Surface='source';
      flowMessage='目标文件身份已改变，先前的拟输出授权失效。';
    }
    syncTabs();
    runPendingAddition();
    bottom.textContent=flowMessage || (!file?'尚未加载资源':
      !mainScanned && mainSource?'正在等待来源扫描':
      targetIntent?'已选择拟输出基础容器 · 尚未执行封装':
      '当前仅观察来源 · 请选择目标后才能封装');
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    if(doc.defaultView?.queueMicrotask)doc.defaultView.queueMicrotask(render);
    else Promise.resolve().then(render);
  };
  const observer=new MutationObserver(schedule);
  observer.observe(currentTracks,{childList:true,subtree:true,characterData:true});
  observer.observe(actualComposition,{attributes:true,attributeFilter:['hidden']});
  sourceInput.addEventListener('change',schedule);
  find(doc,'unifiedAssetInput')?.addEventListener('change',schedule);
  root.addEventListener('softmux:source-sections-updated',event=>{
    if(!event.detail || typeof event.detail!=='object')return;
    latestSections=event.detail;schedule();
  });
  root.addEventListener('softmux:v3-resource-registry',event=>{
    if(!event.detail||!Array.isArray(event.detail.entries))return;
    latestResources=event.detail;
    if(!getEntries().some(entry=>entry.key===viewedSourceKey)) {
      viewedSourceKey=getEntries().find(entry=>entry.selected)?.key ||
        getEntries()[0]?.key||'';
    }
    if(!event.detail.target && targetIntent) {
      targetIntent=null;pendingAddition=null;setSurface('source');
    }
    schedule();
  });
  root.addEventListener('softmux:v3-target-confirmed',event=>{
    const {baseKey,baseFile}=event.detail||{};
    if(!exactEntry(baseKey,baseFile))return;
    targetIntent={baseKey,baseFile};
    root.dataset.sfv3TargetConfirmed='true';
    targetTab.hidden=false;
    flowMessage='目标已选择；未执行文件写入。';
    schedule();
  });
  render();
  return true;
}
