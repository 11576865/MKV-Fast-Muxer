/*
 * Softmux V3 / WU-01: source-first presentation over the EXISTING live DOM.
 * Opt-in via ?ui=v3. Does not create a second ContainerProject or write media.
 * Existing source inputs, composition editor, mux action and output evidence
 * are retained in place. Source observation is a read-only DOM projection.
 */
const find = (doc, id) => doc.getElementById(id);

// Exact SVG exports from the approved Figma V3 nodes, all local and immutable
// at the Git commit; not hand-drawn look-alikes or expiring asset URLs.
const ICON_URLS = Object.freeze({
  softmux:new URL('./v3-assets/softmux.svg',import.meta.url).href,
  'mkv-document':new URL('./v3-assets/mkv-document.svg',import.meta.url).href,
  'add-file':new URL('./v3-assets/add-file.svg',import.meta.url).href,
  search:new URL('./v3-assets/search.svg',import.meta.url).href,
  undo:new URL('./v3-assets/undo.svg',import.meta.url).href,
  help:new URL('./v3-assets/help.svg',import.meta.url).href,
  settings:new URL('./v3-assets/settings.svg',import.meta.url).href,
  more:new URL('./v3-assets/more.svg',import.meta.url).href,
  documents:new URL('./v3-assets/documents.svg',import.meta.url).href,
  'object-list':new URL('./v3-assets/object-list.svg',import.meta.url).href,
  video:new URL('./v3-assets/video.svg',import.meta.url).href,
  audio:new URL('./v3-assets/audio.svg',import.meta.url).href,
  subtitle:new URL('./v3-assets/subtitle.svg',import.meta.url).href,
  attachment:new URL('./v3-assets/attachment.svg',import.meta.url).href,
  chapter:new URL('./v3-assets/chapter.svg',import.meta.url).href,
  tag:new URL('./v3-assets/tag.svg',import.meta.url).href,
  open:new URL('./v3-assets/open.svg',import.meta.url).href,
  'create-output':new URL('./v3-assets/create-output.svg',import.meta.url).href,
  ready:new URL('./v3-assets/ready.svg',import.meta.url).href,
  'empty-add':new URL('./v3-assets/empty-add.svg',import.meta.url).href,
  'picker-selected':new URL('./v3-assets/picker-selected.svg',import.meta.url).href,
  'picker-empty-target':new URL('./v3-assets/picker-empty-target.svg',import.meta.url).href,
  'picker-confirm':new URL('./v3-assets/picker-confirm.svg',import.meta.url).href,
});

function svgIcon(doc,name) {
  if(!ICON_URLS[name])throw Error('V3_UNKNOWN_DESIGN_ICON:'+name);
  const element=doc.createElement('img');
  element.src=ICON_URLS[name];
  element.alt='';
  element.className='sfv3-svg-icon';
  element.dataset.sfv3Icon=name;
  element.setAttribute('aria-hidden','true');
  return element;
}

function iconTab(doc,tab,icon,label) {
  let text=tab.querySelector('.sfv3-tab-label');
  if(!text) {
    tab.replaceChildren(svgIcon(doc,icon));
    text=appendText(doc,tab,'span','sfv3-tab-label','');
  }
  text.textContent=label;
}


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

// Native source projection for V3: no output model or composition DOM is
// consulted when observing a File without an approved output plan.
export function sourceRowsFromObservation(streams = []) {
  return streams
    .filter(stream => Number.isSafeInteger(stream?.index) && stream.index >= 0)
    .map(stream => {
      const type=String(stream.type||'');
      const kind=type==='video'?'视频':type==='audio'?'音频':
        type==='subtitle'?'字幕':'其他轨道';
      const codec=String(stream.codec||'unknown');
      const title=String(stream.title||'').trim();
      const language=String(stream.language||'und');
      return {
        id:'source:observed:'+stream.index,
        kind,
        name:title || (codec+' · #'+stream.index),
        detail:codec+' · '+language+' · 来源轨 #'+stream.index,
      };
    });
}

export function sourceSubtitleDispositionLabels(disposition) {
  const classify = value => value === 1 || value === true ? '开' :
    value === 0 || value === false ? '关' : '未观察';
  return {
    default:classify(disposition?.default),
    forced:classify(disposition?.forced),
  };
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
  root.dataset.sfv3Contract = 'approved-v3-wu04-object-context-pilot';
  root.dataset.sfv3Inspector = 'closed';
  root.dataset.sfv3SourceInspector = 'closed';
  // Context panel REHOSTS the existing inspector exactly once. Selection
  // opens presentation only; all editing still belongs to the live editor.
  const inspectorPane=root.querySelector('.sf14-pane.sf14-inspector');
  const inspectorHead=inspectorPane?.querySelector('.sf14-pane-head');
  const inspectorContent=find(doc,'sf14Inspector');
  // A read-only view of the selected real composition row; no shadow edit state.
  const objectContext=doc.createElement('section');
  objectContext.id='sfv3ObjectContext';
  objectContext.className='sfv3-object-context';
  objectContext.setAttribute('aria-live','polite');
  const contextEyebrow=appendText(doc,objectContext,'small','sfv3-object-eyebrow','拟输出');
  const contextTitle=appendText(doc,objectContext,'strong','sfv3-object-title','拟输出容器');
  const contextMeta=appendText(doc,objectContext,'span','sfv3-object-meta','选择对象以检查其属性');
  // Object-scoped knowledge, never a second mutating editor or an inferred
  // stream flag. Show it only for a selected subtitle in an authorized plan.
  const subtitleFlagHelp=doc.createElement('details');
  subtitleFlagHelp.id='sfv3SubtitleFlagsHelp';
  subtitleFlagHelp.className='sfv3-subtitle-flag-help';
  subtitleFlagHelp.hidden=true;
  const flagSummary=appendText(doc,subtitleFlagHelp,'summary','','Default / Forced · 说明');
  flagSummary.setAttribute('aria-label','解释字幕轨道的 Default 与 Forced 标记');
  const flagDefinitions=doc.createElement('dl');
  flagDefinitions.className='sfv3-subtitle-flag-definitions';
  for(const [name,description] of [
    ['Default','默认轨道标记：供播放器自动选择时参考，不保证所有播放器都会启用。'],
    ['Forced','强制字幕标记：表示此轨包含需要特别呈现的字幕，不等同于默认轨道；实际播放仍取决于播放器。'],
  ]) {
    appendText(doc,flagDefinitions,'dt','',name);
    appendText(doc,flagDefinitions,'dd','',description);
  }
  subtitleFlagHelp.appendChild(flagDefinitions);
  objectContext.appendChild(subtitleFlagHelp);
  const nativeEditor=find(doc,'assetInspectorHost')?.parentElement;
  if(nativeEditor)nativeEditor.insertBefore(objectContext,find(doc,'objectSelectionHint')||nativeEditor.firstChild);
  const history=find(doc,'workspaceHistoryPanel');
  const historyDrawer=doc.createElement('details');
  historyDrawer.id='sfv3HistoryDrawer';
  historyDrawer.className='sfv3-inspector-disclosure';
  const historySummary=doc.createElement('summary');
  historySummary.textContent='编辑历史与撤销';
  historyDrawer.appendChild(historySummary);
  if(history) {
    history.before(historyDrawer);
    historyDrawer.appendChild(history);
    // Editing history is secondary to the selected object and its real
    // inspector. Move the SAME disclosure below the original edit/preview
    // controls rather than leaving an irrelevant history card at the top.
    nativeEditor?.appendChild(historyDrawer);
  }
  const inspectorEvidence=find(doc,'outputEvidencePanel');
  const evidenceDrawer=doc.createElement('details');
  evidenceDrawer.id='sfv3DeliveryDrawer';
  evidenceDrawer.className='sfv3-inspector-disclosure sfv3-delivery-disclosure';
  evidenceDrawer.appendChild(appendText(doc,evidenceDrawer,'summary','','成品验证与下载'));
  if(inspectorEvidence) {
    inspectorEvidence.before(evidenceDrawer);
    evidenceDrawer.appendChild(inspectorEvidence);
  }
  const showRelevantEvidence=()=>{
    if(inspectorEvidence && !inspectorEvidence.hidden)evidenceDrawer.open=true;
  };
  // This only presents existing execution evidence after it becomes visible.
  // Never infer output success from a badge, pending plan or selected object.
  const evidenceObserver=inspectorEvidence && new MutationObserver(showRelevantEvidence);
  if(inspectorEvidence)evidenceObserver.observe(inspectorEvidence,{
    attributes:true,attributeFilter:['hidden'],
  });
  const contextDismiss=doc.createElement('button');
  contextDismiss.id='sfv3InspectorClose';
  contextDismiss.type='button';
  contextDismiss.className='sfv3-inspector-close';
  contextDismiss.textContent='关闭';
  contextDismiss.setAttribute('aria-label','关闭对象检查器');
  inspectorHead?.appendChild(contextDismiss);
  const scrim=doc.createElement('button');
  scrim.id='sfv3InspectorScrim';
  scrim.type='button';
  scrim.className='sfv3-inspector-scrim';
  scrim.hidden=true;
  scrim.setAttribute('aria-label','关闭对象检查器');
  single.appendChild(scrim);
  // Contextual inspectors are non-modal regions. Move keyboard focus into
  // visible controls and return it to the initiating real composition row
  // (not an unrelated tab) when the user explicitly dismisses the panel.
  let inspectorReturnElement=null;
  let inspectorReturnCompositionId='';
  const closeInspector=(restoreFocus=false)=>{
    root.dataset.sfv3Inspector='closed';
    scrim.hidden=true;
    const trigger=find(doc,'sfv3InspectorOpen');
    if(trigger)trigger.setAttribute('aria-expanded','false');
    if(restoreFocus) {
      const liveRow=inspectorReturnCompositionId
        ? [...currentTracks.querySelectorAll('button[data-composition-id]')]
            .find(node=>node.dataset.compositionId===inspectorReturnCompositionId)
        : null;
      const returnTo=inspectorReturnElement?.isConnected
        ? inspectorReturnElement : liveRow || trigger;
      returnTo?.focus();
    }
    inspectorReturnElement=null;
    inspectorReturnCompositionId='';
  };
  const openInspector=(origin=null)=>{
    if(root.dataset.sfv3Surface!=='plan' || !inspectorPane) return;
    inspectorReturnElement=origin||find(doc,'sfv3InspectorOpen');
    inspectorReturnCompositionId=origin?.dataset?.compositionId||'';
    root.dataset.sfv3Inspector='open';
    scrim.hidden=false;
    showRelevantEvidence();
    const trigger=find(doc,'sfv3InspectorOpen');
    if(trigger)trigger.setAttribute('aria-expanded','true');
    contextDismiss.focus();
  };
  const realOutputDock=root.querySelector('.sf14-output');
  // In V3 the native plan toggle becomes a compact icon at 620px only.
  // Keep its original listener, DOM identity and a complete accessible name.
  const nativePlanToggle=find(doc,'sf14PlanToggle');
  nativePlanToggle?.setAttribute('aria-label','检查封装计划、风险及执行边界');
  nativePlanToggle?.setAttribute('title','检查封装计划、风险及执行边界');
  const inspectorOpenButton=doc.createElement('button');
  inspectorOpenButton.id='sfv3InspectorOpen';
  inspectorOpenButton.type='button';
  inspectorOpenButton.className='sfv3-inspector-open';
  inspectorOpenButton.textContent='对象详情 / 成品';
  inspectorOpenButton.setAttribute('aria-label','查看对象详情与真实成品');
  inspectorOpenButton.setAttribute('aria-controls','sf14Inspector');
  inspectorOpenButton.setAttribute('aria-expanded','false');
  realOutputDock?.appendChild(inspectorOpenButton);
  inspectorOpenButton.addEventListener('click',()=>openInspector(inspectorOpenButton));
  const syncInspectorButton=()=>{
    inspectorOpenButton.setAttribute('aria-expanded',
      String(root.dataset.sfv3Inspector==='open'));
  };
  contextDismiss.addEventListener('click',()=>closeInspector(true));
  scrim.addEventListener('click',()=>closeInspector(true));
  currentTracks.addEventListener('click',event=>{
    const selected=event.target.closest('button[data-composition-id]');
    if(selected)openInspector(selected);
  });
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || root.dataset.sfv3Inspector!=='open' ||
       root.querySelector('dialog[open]'))return;
    event.preventDefault();
    closeInspector(true);
  });

  const header = root.querySelector('.sf14-header');
  const identity = header?.querySelector('.sf14-identity strong');
  if (identity) identity.textContent = '软封';
  header?.querySelector('.sf14-mark')?.replaceChildren(svgIcon(doc,'softmux'));
  const nav = header?.querySelector('.sf14-nav');
  if (nav) {
    const legacy = doc.createElement('details');
    legacy.className = 'sfv3-legacy-menu';
    const summary = doc.createElement('summary');
    summary.replaceChildren(svgIcon(doc,'more'));
    summary.title = '保留的旧工具';
    summary.setAttribute('aria-label', '保留的旧工具');
    nav.parentNode.insertBefore(legacy, nav);
    legacy.append(summary, nav);
    nav.querySelectorAll('[data-sf-view]').forEach(button =>
      button.addEventListener('click', () => { legacy.open = false; }));
    // Explicit recovery from the default V3 surface to the previous native
    // workbench. A link (not a cloned editor) keeps rollback independently
    // discoverable, without silently retaining unsaved browser File objects.
    const previousWorkbench=doc.createElement('a');
    previousWorkbench.id='sfv3PreviousWorkbench';
    previousWorkbench.href='?ui=workbench';
    previousWorkbench.className='sfv3-previous-workbench';
    previousWorkbench.textContent='切换至上一版工作台';
    previousWorkbench.title='页面将重新加载；请先保存当前输出文件';
    nav.appendChild(previousWorkbench);
  }
  const headerActions = header?.querySelector('.sf14-header-actions');
  if (headerActions) {
    for (const [id, iconName, name] of [
      ['sf14Add','add-file','添加资源'],
      ['sf14SourceToggle','documents','打开来源资源'],
      ['sf14Help','help','帮助'],
      ['sf14Settings','settings','界面设置'],
    ]) {
      const button = find(doc, id);
      if (!button) continue;
      button.replaceChildren(svgIcon(doc,iconName));
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
  // Exact Figma compact source selector. This only routes to the existing
  // source tabs and File-scoped inspector: it owns no source/import state.
  const compactSources=doc.createElement('details');
  compactSources.id='sfv3CompactSources';
  compactSources.className='sfv3-compact-sources';
  compactSources.hidden=true;
  const compactSourceSummary=doc.createElement('summary');
  compactSourceSummary.setAttribute('aria-label','选择真实来源文件');
  compactSourceSummary.append(svgIcon(doc,'documents'),
    appendText(doc,doc.createElement('span'),'span','','来源'));
  const compactSourceList=doc.createElement('div');
  compactSourceList.className='sfv3-compact-source-list';
  compactSources.append(compactSourceSummary,compactSourceList);
  tabstrip.prepend(compactSources);
  header?.insertBefore(tabstrip, headerActions || null);

  const rail = doc.createElement('div');
  rail.id = 'sfv3Rail';
  rail.className = 'sfv3-rail';
  rail.setAttribute('aria-label', '工作台快速操作');
  const sourcesBtn = appendText(doc, rail, 'button', 'sfv3-rail-action', '▤');
  sourcesBtn.type = 'button';
  sourcesBtn.title = '来源资源';
  sourcesBtn.setAttribute('aria-label', '来源资源');
  sourcesBtn.replaceChildren(svgIcon(doc,'documents'));
  sourcesBtn.addEventListener('click', () => find(doc, 'sf14SourceToggle')?.click());
  const addBtn = appendText(doc, rail, 'button', 'sfv3-rail-action', '＋');
  addBtn.type = 'button';
  addBtn.title = '添加资源';
  addBtn.setAttribute('aria-label', '添加资源');
  addBtn.replaceChildren(svgIcon(doc,'add-file'));
  addBtn.addEventListener('click', () => find(doc, 'sf14Add')?.click());
  single.prepend(rail);

  // Opt-in V3.5 capability-entry pilot. The existing native workbench already
  // owns single / batch / tools, and all File, plan and executor state. These
  // named controls only navigate to those ORIGINAL DOM nodes; they never clone
  // batch editors or create an implicit writable target. Default V3 unchanged.
  const featureNavigationEnabled=new URLSearchParams(
    doc.defaultView?.location?.search||'').get('nav')==='full';
  const featureNavigation=featureNavigationEnabled?doc.createElement('nav'):null;
  if(featureNavigation) {
    root.classList.add('sfv35-nav');
    featureNavigation.id='sfv35FeatureNavigation';
    featureNavigation.className='sfv35-feature-navigation';
    featureNavigation.setAttribute('aria-label','工作区功能入口');
    for(const [key,label,control] of [
      ['source','来源','sf14Single'],
      ['plan','拟输出','sf14Single'],
      ['batch','批量任务','sf14Batch'],
      ['tools','容器工具','sf14Tools'],
    ]) {
      const button=appendText(doc,featureNavigation,'button',
        'sfv35-feature-button',label);
      button.type='button';
      button.dataset.sfv35Task=key;
      button.setAttribute('aria-controls',control);
    }
    header?.after(featureNavigation);
  }

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
  const emptyIcon=appendText(doc, empty, 'span', 'sfv3-empty-icon', '');
  emptyIcon.appendChild(svgIcon(doc,'empty-add'));
  appendText(doc, empty, 'strong', 'sfv3-empty-title', '拖入文件，或点击这里添加');
  appendText(doc, empty, 'span', 'sfv3-empty-types', 'MKV · 视频 · 字幕 · 字体');
  // Move the actual existing drop target, with all original event handlers.
  // The SAME original #assetDropzone already covers the entire V3 empty
  // canvas as an invisible hit surface. Reuse its real click/drop handlers;
  // no second importer, click adapter or duplicate File input is needed.
  empty.appendChild(dropzone);
  // Unlike the importer, this action explicitly chooses a new writable
  // destination. It cannot cause an implicit output by importing a File.
  const emptyTargetAction=appendText(doc,empty,'button','sfv3-empty-blank-target','新建空 MKV 目标');
  emptyTargetAction.id='sfv3EmptyBlankTarget';
  emptyTargetAction.type='button';
  emptyTargetAction.setAttribute('aria-label','新建空 MKV，选择写入的轨道和附件');
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
  const overview=doc.createElement('div');
  overview.className='sfv3-overview';
  const counters=doc.createElement('div');
  counters.id='sfv3SourceCounters';
  counters.className='sfv3-source-counters';
  counters.hidden=true;
  overview.append(heading,counters);
  readout.prepend(overview);
  // Approved V3-01 toolbar: relocate the SAME explicit target action from
  // below the long source list to the container-content header. Search is
  // presentation-only; it must not change source File, streams or intent.
  const sourceToolbar=doc.createElement('div');
  sourceToolbar.id='sfv3SourceToolbar';
  sourceToolbar.className='sfv3-source-toolbar';
  sourceToolbar.hidden=true;
  const sourceToolbarTitle=appendText(doc,sourceToolbar,'strong','sfv3-source-toolbar-title','容器内容');
  sourceToolbarTitle.prepend(svgIcon(doc,'object-list'));
  const sourceToolbarActions=doc.createElement('div');
  sourceToolbarActions.className='sfv3-source-toolbar-actions';
  const sourceSearchToggle=doc.createElement('button');
  sourceSearchToggle.id='sfv3SourceSearchToggle';
  sourceSearchToggle.className='sfv3-source-tool-action';
  sourceSearchToggle.type='button';
  sourceSearchToggle.title='搜索已扫描的来源轨道';
  sourceSearchToggle.setAttribute('aria-label','搜索已扫描的来源轨道');
  sourceSearchToggle.setAttribute('aria-expanded','false');
  sourceSearchToggle.setAttribute('aria-controls','sfv3SourceSearch');
  sourceSearchToggle.appendChild(svgIcon(doc,'search'));
  const sourceSearch=doc.createElement('input');
  sourceSearch.id='sfv3SourceSearch';
  sourceSearch.className='sfv3-source-search';
  sourceSearch.type='search';
  sourceSearch.autocomplete='off';
  sourceSearch.placeholder='搜索轨道';
  sourceSearch.setAttribute('aria-label','按名称或编码搜索当前来源轨道');
  sourceSearch.hidden=true;
  let sourceQuery='';
  const filterSourceRows=()=>{
    const query=sourceQuery.trim().toLocaleLowerCase();
    // Only primary media rows participate. Expanded read-only chapter and
    // tag evidence remains intact and is never mistaken for a media stream.
    for(const section of contents.querySelectorAll(':scope > .sfv3-object-group')){
      let visible=0;
      for(const row of section.querySelectorAll('.sfv3-observed-row')){
        row.hidden=Boolean(query && !row.textContent.toLocaleLowerCase().includes(query));
        if(!row.hidden)visible++;
      }
      section.hidden=Boolean(query && visible===0);
    }
  };
  sourceSearch.addEventListener('input',()=>{
    sourceQuery=sourceSearch.value;
    filterSourceRows();
  });
  sourceSearchToggle.addEventListener('click',()=>{
    const expanding=sourceSearch.hidden;
    sourceSearch.hidden=!expanding;
    sourceSearchToggle.setAttribute('aria-expanded',String(expanding));
    if(expanding)sourceSearch.focus();
    else {sourceSearch.value='';sourceQuery='';filterSourceRows();sourceSearchToggle.focus();}
  });
  sourceSearch.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.stopPropagation();sourceSearchToggle.click();
    }
  });
  const sourceStructureToggle=doc.createElement('button');
  sourceStructureToggle.id='sfv3SourceStructureToggle';
  sourceStructureToggle.className='sfv3-source-tool-action';
  sourceStructureToggle.type='button';
  sourceStructureToggle.title='展开或收起来源附加结构（只读）';
  sourceStructureToggle.setAttribute('aria-label','展开或收起来源附加结构（只读）');
  sourceStructureToggle.setAttribute('aria-expanded','false');
  sourceStructureToggle.appendChild(svgIcon(doc,'documents'));
  sourceStructureToggle.addEventListener('click',()=>{
    const cards=[...contents.querySelectorAll('.sfv3-source-resource-card')];
    const next=!cards.every(card=>card.open);
    for(const card of cards)card.open=next;
    sourceStructureToggle.setAttribute('aria-expanded',String(next));
  });
  sourceToolbarActions.append(sourceSearchToggle,sourceSearch,sourceStructureToggle,primary);
  sourceToolbar.appendChild(sourceToolbarActions);
  readout.append(empty,sourceToolbar,contents);
  // The output heading is a VIEW of the one committed target authority.
  // It neither stores a second plan nor duplicates a mutating mux button.
  const planHeading=doc.createElement('header');
  planHeading.id='sfv3PlanHeading';
  planHeading.className='sfv3-plan-heading';
  planHeading.hidden=true;
  const planTitleRow=doc.createElement('div');
  planTitleRow.className='sfv3-plan-title-row';
  const planName=appendText(doc,planTitleRow,'h1','sfv3-plan-name','');
  planName.id='sfv3PlanName';
  appendText(doc,planTitleRow,'span','sfv3-plan-state-tag','拟输出');
  const planBack=appendText(doc,planTitleRow,'button','sfv3-plan-return','查看来源');
  planBack.type='button';
  planBack.title='返回只读来源，不取消已确认的目标';
  planBack.prepend(svgIcon(doc,'open'));
  const planFacts=appendText(doc,planHeading,'p','sfv3-plan-facts','');
  planFacts.id='sfv3PlanFacts';
  planHeading.prepend(planTitleRow);
  compositionHost.prepend(planHeading);
  // Figma V3-08 count strip derives solely from the ONE real composition
  // list; it is a view of actual candidate objects, not an alternate model.
  const planStats=doc.createElement('div');
  planStats.id='sfv3PlanStats';
  planStats.className='sfv3-plan-stats';
  planStats.setAttribute('aria-label','当前拟输出轨道与附件对象数量');
  planStats.hidden=true;
  planHeading.appendChild(planStats);
  compositionHost.prepend(readout);
  // V3-04 read-only provenance of the ONE real editor's ASS+font members.
  // Source/target intent and source File identity remain owned by main.js.
  const assFontPanel=doc.createElement('section');
  assFontPanel.id='sfv3AssFontDependencies';
  assFontPanel.className='sfv3-ass-font-dependencies';
  assFontPanel.setAttribute('aria-label','已加入拟输出的来源 ASS 与字体依赖');
  assFontPanel.hidden=true;
  planHeading.after(assFontPanel);
  // Provenance is explicit: these are observations from the EXACT target
  // base File, not edits or a promise of surviving final MKV EBML structures.
  // P0-A: source Chapters/Tags are useful evidence, but are NOT the
  // prospective MKV's editable tracks. Make them a collapsed secondary
  // disclosure AFTER the primary output composition. The original real
  // composition/editor and its warning gates keep their exact DOM owners.
  const structure=doc.createElement('details');
  structure.id='sfv3ObservedStructure';
  structure.className='sfv3-observed-structure';
  structure.setAttribute('aria-label','基础容器章节和标签的来源观察，只读');
  structure.hidden=true;
  // The original recovery is an independent sibling, available even when
  // no MKV is loaded. Moving it after the composition preserves that scope.
  const recovery=find(doc,'sf14Recovery');
  if(recovery?.parentNode===compositionHost &&
      actualComposition?.parentNode===compositionHost)
    actualComposition.after(recovery);
  compositionHost.appendChild(structure);
  // V3-04/06/08: keep actual preservation, capability and UID findings
  // reachable but no longer allow six independent legacy diagnostics to crowd
  // the five primary media tracks. Rehost the EXACT existing nodes, preserving
  // every live updater, status role and inspection link. The summary is always
  // visible and never claims that a saved/output audit has passed.
  const verification=doc.createElement('details');
  verification.id='sfv3Verification';
  verification.className='sfv3-verification';
  verification.dataset.level='pending';
  verification.setAttribute('aria-label','拟输出封装核验及完整风险说明');
  const verificationSummary=doc.createElement('summary');
  verificationSummary.className='sfv3-verification-summary';
  const verificationHeading=appendText(doc,verificationSummary,'strong','sfv3-verification-heading','封装核验');
  const verificationLevel=appendText(doc,verificationSummary,'span','sfv3-verification-level','尚未验收');
  const verificationBrief=appendText(doc,verificationSummary,'span','sfv3-verification-brief','核验状态待更新');
  const verificationMore=appendText(doc,verificationSummary,'span','sfv3-verification-more','查看详情');
  const verificationBody=doc.createElement('div');
  verificationBody.className='sfv3-verification-body';
  const verificationIds=[
    'compositionChanges','compositionIssues','containerCapabilitySummary',
    'containerCapabilityDetails','preservationReadiness','compositionSourceEvidence',
  ];
  const verificationOriginals=verificationIds.map(id=>find(doc,id)).filter(Boolean);
  for(const element of verificationOriginals)verificationBody.appendChild(element);
  verification.append(verificationSummary,verificationBody);
  currentTracks.after(verification);
  const updateVerificationSummary=()=>{
    const issue=find(doc,'compositionIssues');
    const preservation=find(doc,'preservationReadiness');
    const headline=find(doc,'preservationReadinessTitle')?.textContent?.trim()||'';
    const explanation=find(doc,'preservationReadinessDescription')?.textContent?.trim()||'';
    const capability=find(doc,'containerCapabilitySummary')?.textContent?.trim()||'';
    const issueText=issue && !issue.hidden ? issue.textContent.trim() : '';
    const status=preservation?.dataset.status||'idle';
    const hasBlocking=issueText.length>0 || /^(?:blocked|error|unsafe|failed)$/.test(status);
    const hasConcern=!hasBlocking && /^(?:warning|attention|limited|degraded|unverified|pending)$/.test(status);
    const level=hasBlocking?'blocked':hasConcern?'review':'pending';
    verification.dataset.level=level;
    verificationLevel.textContent=hasBlocking?'存在风险 · 需核对':
      hasConcern?'有限能力 · 需核对':'未完成成品审计';
    // Preserve real findings in the always-visible summary. Never fabricate
    // a pass status from a green-looking card or an idle native executor.
    const message=issueText || headline || explanation || capability ||
      '尚无实际输出审计，请检查来源结构与封装能力';
    verificationBrief.textContent=message;
    verificationBrief.title=message;
  };
  for(const element of verificationOriginals){
    const monitor=new MutationObserver(updateVerificationSummary);
    monitor.observe(element,{
      attributes:true,attributeFilter:['hidden','data-status','class'],
      childList:true,characterData:true,subtree:true,
    });
  }
  verification.addEventListener('toggle',()=>{
    verificationMore.textContent=verification.open?'收起详情':'查看详情';
  });
  updateVerificationSummary();
  // The design's desktop media-section toolbar is presentation over the
  // original importer. No alternate import owner or simulated search button.
  const planToolbar=doc.createElement('div');
  planToolbar.id='sfv3CompositionToolbar';
  planToolbar.className='sfv3-composition-toolbar';
  planToolbar.hidden=true;
  const toolbarTitle=appendText(doc,planToolbar,'strong','','容器内容');
  toolbarTitle.prepend(svgIcon(doc,'object-list'));
  const toolbarAdd=appendText(doc,planToolbar,'button','sfv3-toolbar-add','添加更多资源');
  toolbarAdd.type='button';
  toolbarAdd.prepend(svgIcon(doc,'add-file'));
  toolbarAdd.addEventListener('click',()=>find(doc,'sf14Add')?.click());
  actualComposition.before(planToolbar);

  const bottom = doc.createElement('footer');
  bottom.id = 'sfv3SourceStatus';
  bottom.className = 'sfv3-source-status';
  bottom.setAttribute('role', 'status');
  bottom.textContent = '尚未加载资源';
  root.querySelector('.sf14-output')?.before(bottom);

  // V3-05: a selected source object is inspectable BEFORE target intent.
  // This is observation presentation, not a second project editor.
  const sourceSheet=doc.createElement('section');
  sourceSheet.id='sfv3SourceInspector';
  sourceSheet.className='sfv3-source-sheet';
  sourceSheet.hidden=true;
  sourceSheet.setAttribute('role','region');
  sourceSheet.setAttribute('aria-labelledby','sfv3SourceInspectorTitle');
  const sourceSheetHeader=doc.createElement('header');
  sourceSheetHeader.className='sfv3-source-sheet-header';
  const sourceSheetIdentity=doc.createElement('div');
  sourceSheetIdentity.className='sfv3-source-sheet-identity';
  const sourceSheetTitle=appendText(doc,sourceSheetIdentity,'h2','sfv3-source-sheet-title','');
  sourceSheetTitle.id='sfv3SourceInspectorTitle';
  const sourceSheetOrigin=appendText(doc,sourceSheetIdentity,'small','sfv3-source-sheet-origin','');
  const sourceSheetClose=appendText(doc,sourceSheetHeader,'button','sfv3-source-sheet-close','关闭');
  sourceSheetClose.id='sfv3SourceInspectorClose';
  sourceSheetClose.type='button';
  sourceSheetClose.setAttribute('aria-label','关闭来源对象详情');
  sourceSheetHeader.prepend(sourceSheetIdentity);
  const sourceSheetDetail=appendText(doc,sourceSheet,'p','sfv3-source-sheet-detail','');
  // Exact ffprobe source disposition, read-only. Unknown must never be shown as Off.
  const sourceSheetFlags=doc.createElement('div');
  sourceSheetFlags.id='sfv3SourceFlagStates';
  sourceSheetFlags.className='sfv3-source-flag-states';
  sourceSheetFlags.setAttribute('aria-label','来源字幕轨道实际 Default 和 Forced 状态');
  sourceSheetFlags.hidden=true;
  const sourceSheetNotice=appendText(doc,sourceSheet,'p','sfv3-source-sheet-notice','');
  // Native FFprobe attachment observations are NOT proof that an ASS's
  // referenced face/style/glyph requirements can be satisfied.
  const sourceFontEvidence=doc.createElement('section');
  sourceFontEvidence.id='sfv3SourceFontEvidence';
  sourceFontEvidence.className='sfv3-source-font-evidence';
  sourceFontEvidence.setAttribute('aria-label','来源内封字体附件观察');
  sourceFontEvidence.hidden=true;
  const sourceFontHeading=appendText(doc,sourceFontEvidence,'strong','sfv3-source-font-heading','');
  const sourceFontFiles=doc.createElement('ul');
  sourceFontFiles.className='sfv3-source-font-files';
  const sourceFontLimit=appendText(doc,sourceFontEvidence,'p','sfv3-source-font-limit',
    '这里只列出来源 MKV 扫描到的字体附件；尚未证明 ASS 使用的 face、字重、斜体及字形覆盖。');
  sourceFontEvidence.insertBefore(sourceFontFiles,sourceFontLimit);
  // One technical glossary is shared with the target inspector. Moving an
  // existing read-only details DOM avoids duplicate help definitions.
  const sourceSheetHelpHost=doc.createElement('div');
  sourceSheetHelpHost.id='sfv3SourceFlagHelpHost';
  sourceSheetHelpHost.className='sfv3-source-flag-help-host';
  sourceSheetHelpHost.hidden=true;
  const sourceFlagHelpTrigger=appendText(doc,doc.createElement('span'),'button',
    'sfv3-source-flag-help-trigger','?');
  sourceFlagHelpTrigger.id='sfv3SourceFlagHelpTrigger';
  sourceFlagHelpTrigger.type='button';
  sourceFlagHelpTrigger.setAttribute('aria-label','解释当前来源字幕的 Default 与 Forced 标记');
  sourceFlagHelpTrigger.setAttribute('aria-controls','sfv3SourceFlagHelpHost');
  sourceFlagHelpTrigger.setAttribute('aria-expanded','false');
  const sourceSheetActions=doc.createElement('div');
  sourceSheetActions.className='sfv3-source-sheet-actions';
  // Figma V3-02: the original source actions appear immediately after the
  // selected desktop row; the source inspector opens only when requested.
  // This moves the SAME buttons (with their File-bound listeners), never
  // clones a preview/extraction/target writer.
  const sourceInlineActions=doc.createElement('div');
  sourceInlineActions.id='sfv3SourceInlineActions';
  sourceInlineActions.className='sfv3-source-inline-actions';
  sourceInlineActions.setAttribute('role','listitem');
  sourceInlineActions.setAttribute('aria-label','已选来源对象的直接操作');
  sourceInlineActions.hidden=true;
  const sourceInlineDetail=appendText(doc,sourceInlineActions,'button',
    'sfv3-source-inline-detail','对象详情');
  sourceInlineDetail.id='sfv3SourceInlineDetail';
  sourceInlineDetail.type='button';
  sourceInlineDetail.setAttribute('aria-controls','sfv3SourceInspector');
  sourceInlineDetail.setAttribute('aria-expanded','false');
  const sourceSheetPreview=appendText(doc,sourceSheetActions,'button','sfv3-source-sheet-preview','预览');
  sourceSheetPreview.id='sfv3SourceInspectorPreview';
  sourceSheetPreview.type='button';
  sourceSheetPreview.setAttribute('aria-label','生成来源 ASS 的真实 FFmpeg/libass 预览帧');
  sourceSheetPreview.hidden=true;
  const sourceSheetExtract=appendText(doc,sourceSheetActions,'button',
    'sfv3-source-sheet-extract','提取');
  sourceSheetExtract.id='sfv3SourceInspectorExtract';
  sourceSheetExtract.type='button';
  sourceSheetExtract.setAttribute('aria-label','提取来源 ASS 字幕轨道（不含字体附件）');
  sourceSheetExtract.hidden=true;
  const nativeExtractionPanel=find(doc,'originalTrackExtractionPanel');
  const nativeExtractionHome=nativeExtractionPanel?.parentNode;
  const nativeExtractionNext=nativeExtractionPanel?.nextSibling;
  const sourceSheetExtractionHost=doc.createElement('div');
  sourceSheetExtractionHost.id='sfv3SourceExtractionHost';
  sourceSheetExtractionHost.className='sfv3-source-sheet-extraction-host';
  sourceSheetExtractionHost.hidden=true;
  const nativePreviewDrawer=find(doc,'sf14PreviewDrawer');
  const nativePreviewHome=nativePreviewDrawer?.parentNode;
  const nativePreviewNext=nativePreviewDrawer?.nextSibling;
  const sourceSheetPreviewHost=doc.createElement('div');
  sourceSheetPreviewHost.id='sfv3SourcePreviewHost';
  sourceSheetPreviewHost.className='sfv3-source-sheet-preview-host';
  sourceSheetPreviewHost.hidden=true;
  // A real preview has NOT been rendered until the native FFmpeg/libass
  // action succeeds. Keep the Figma 16:9 preview region visible in portrait
  // with an explicit unrendered state; NEVER insert a mock subtitle image.
  const sourcePreviewIdle=doc.createElement('div');
  sourcePreviewIdle.id='sfv3SourcePreviewIdle';
  sourcePreviewIdle.className='sfv3-source-preview-idle';
  sourcePreviewIdle.hidden=true;
  sourcePreviewIdle.setAttribute('role','status');
  appendText(doc,sourcePreviewIdle,'strong','','尚未生成预览帧');
  appendText(doc,sourcePreviewIdle,'span','',
    '选择「生成 ASS 预览帧」后，显示真实 FFmpeg/libass 渲染结果');
  const sourceSheetAdd=appendText(doc,sourceSheetActions,'button','sfv3-source-sheet-add','加入到…');
  sourceSheetAdd.id='sfv3SourceInspectorAdd';
  sourceSheetAdd.type='button';
  sourceSheet.append(sourceSheetHeader,sourceSheetDetail,sourceSheetFlags,sourceFontEvidence,
    sourceSheetNotice,sourceSheetActions,sourceSheetHelpHost,
    sourcePreviewIdle,sourceSheetPreviewHost,sourceSheetExtractionHost);
  single.appendChild(sourceSheet);

  // V3 target picker is an explicit action, never an implicit file import side effect.
  const picker = doc.createElement('dialog');
  picker.id = 'sfv3TargetPicker';
  picker.className = 'sfv3-target-picker';
  picker.setAttribute('aria-label', '选择拟输出基础容器');
  picker.setAttribute('aria-describedby','sfv3PickerExplanation');
  const pickerTitle = appendText(doc, picker, 'h2', 'sfv3-picker-title', '加入到哪里？');
  const pickerExplanation = appendText(doc, picker, 'p', 'sfv3-picker-explanation', '请选择一个真实 MKV 作为拟输出基础。');
  pickerExplanation.id='sfv3PickerExplanation';
  const pickerOptions = doc.createElement('div');
  pickerOptions.className = 'sfv3-picker-options';
  pickerOptions.id = 'sfv3PickerOptions';
  const pickerStatus = appendText(doc, picker, 'p', 'sfv3-picker-status', '');
  pickerStatus.setAttribute('role','status');
  const pickerActions = doc.createElement('div');
  pickerActions.className = 'sfv3-picker-actions';
  const cancelChoice = appendText(doc, pickerActions, 'button', 'sfv3-picker-cancel', '×');
  cancelChoice.type = 'button';
  cancelChoice.setAttribute('aria-label','取消目标选择');
  cancelChoice.title='取消目标选择';
  const confirmChoice = appendText(doc, pickerActions, 'button', 'sfv3-picker-confirm', '创建拟输出');
  confirmChoice.type = 'button';
  confirmChoice.id = 'sfv3ConfirmTarget';
  confirmChoice.replaceChildren(svgIcon(doc,'picker-confirm'));
  const confirmChoiceLabel=appendText(doc,confirmChoice,'span','sfv3-picker-confirm-label','创建拟输出');
  picker.append(pickerOptions,pickerStatus,pickerActions);
  picker.insertBefore(pickerTitle,pickerOptions);
  picker.insertBefore(pickerExplanation,pickerOptions);
  root.appendChild(picker);
  cancelChoice.addEventListener('click',()=>picker.close());
  let latestSections = {scanned:false, attachments:[],chapters:[],tags:[]};
  let latestResources = {entries:[],activeBase:null,target:null};
  let viewedSourceKey = '';
  let targetIntent = null;
  let blankSelectedIndices=[];
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
  let selectedSource=null;
  let sourceDetailRequested=false;
  let sourceHelpOpen=false;
  const closeSourceFlagHelp=(restoreFocus=false)=>{
    sourceHelpOpen=false;
    sourceSheetHelpHost.hidden=true;
    subtitleFlagHelp.open=false;
    sourceFlagHelpTrigger.setAttribute('aria-expanded','false');
    if(restoreFocus)sourceFlagHelpTrigger.focus();
  };
  sourceFlagHelpTrigger.addEventListener('click',()=>{
    if(!selectedSource || selectedSource.group!=='字幕')return;
    if(sourceHelpOpen) {
      closeSourceFlagHelp();
    }else{
      sourceHelpOpen=true;
      sourceSheetHelpHost.hidden=false;
      subtitleFlagHelp.open=true;
      sourceFlagHelpTrigger.setAttribute('aria-expanded','true');
    }
  });
  // Unlike a pinned editor, source technical help is a contextual popover.
  // Dismiss it outside without consuming the original click/permission flow.
  doc.addEventListener('pointerdown',event=>{
    if(sourceHelpOpen && event.target!==sourceFlagHelpTrigger &&
       !sourceSheetHelpHost.contains(event.target))
      closeSourceFlagHelp();
  });
  subtitleFlagHelp.addEventListener('toggle',()=>{
    // Inner <details> may also be closed by keyboard or pointer. Do not
    // leave an empty popover with aria-expanded="true" on the outer trigger.
    if(sourceHelpOpen && subtitleFlagHelp.parentElement===sourceSheetHelpHost &&
       !subtitleFlagHelp.open)closeSourceFlagHelp(true);
  });
  sourceSheet.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || !sourceHelpOpen)return;
    // Closing the just-in-time help must NOT dismiss the whole source sheet.
    event.preventDefault();
    event.stopPropagation();
    closeSourceFlagHelp(true);
  });
  const desktopSourceActions=()=>Boolean(
    doc.defaultView?.matchMedia?.('(min-width: 960px)')?.matches);
  const restoreSourceActions=()=>{
    // #sfv3SourceFlagHelpHost is intentionally rehosted INSIDE the Default
    // observation flags. It is no longer a direct child of sourceSheet, so
    // using it as insertBefore reference throws NotFoundError and prevents
    // the explicit desktop "对象详情" inspector from opening.
    // The preview placeholder is a stable direct child of the ONE sheet.
    if(sourceSheetActions.parentElement!==sourceSheet)
      sourceSheet.insertBefore(sourceSheetActions,sourcePreviewIdle);
    sourceInlineActions.hidden=true;
    sourceInlineActions.remove();
    sourceInlineDetail.setAttribute('aria-expanded','false');
  };
  const restoreNativePreview=()=>{
    sourcePreviewIdle.hidden=true;
    if(nativePreviewDrawer?.parentNode===sourceSheetPreviewHost && nativePreviewHome){
      nativePreviewDrawer.open=false;
      nativePreviewHome.insertBefore(nativePreviewDrawer,
        nativePreviewNext?.parentNode===nativePreviewHome?nativePreviewNext:null);
    }
    sourceSheetPreviewHost.hidden=true;
  };
  const restoreNativeExtraction=()=>{
    if(nativeExtractionPanel?.parentNode===sourceSheetExtractionHost &&
        nativeExtractionHome){
      nativeExtractionHome.insertBefore(nativeExtractionPanel,
        nativeExtractionNext?.parentNode===nativeExtractionHome?nativeExtractionNext:null);
    }
    sourceSheetExtractionHost.hidden=true;
  };
  const closeSourceSheet=(restoreFocus=false)=>{
    const previouslySelected=selectedSource;
    selectedSource=null;
    sourceDetailRequested=false;
    sourceHelpOpen=false;
    sourceFlagHelpTrigger.setAttribute('aria-expanded','false');
    restoreSourceActions();
    restoreNativePreview();
    restoreNativeExtraction();
    if(subtitleFlagHelp.parentNode===sourceSheetHelpHost){
      subtitleFlagHelp.open=false;
      subtitleFlagHelp.hidden=true;
      objectContext.appendChild(subtitleFlagHelp);
    }
    sourceSheetHelpHost.hidden=true;
    sourceFontEvidence.hidden=true;
    sourceSheet.hidden=true;
    root.dataset.sfv3SourceInspector='closed';
    for(const node of contents.querySelectorAll('.sfv3-row-select[aria-expanded="true"]'))
      node.setAttribute('aria-expanded','false');
    if(restoreFocus && previouslySelected){
      const button=[...contents.querySelectorAll('.sfv3-row-select')]
        .find(node=>node.dataset.sourceObjectId===String(previouslySelected.id));
      button?.focus();
    }
  };
  const updateSourceSheet=()=>{
    const from=activeView();
    if(root.dataset.sfv3Surface!=='source' || !selectedSource ||
        !exactEntry(selectedSource.sourceKey,selectedSource.sourceFile) ||
        from?.key!==selectedSource.sourceKey || from?.file!==selectedSource.sourceFile){
      closeSourceSheet();
      return;
    }
    const matchingRow=[...contents.querySelectorAll('.sfv3-observed-row')]
      .find(node=>node.dataset.sourceObjectId===String(selectedSource.id));
    if(!matchingRow) {closeSourceSheet();return;}
    for(const button of contents.querySelectorAll('.sfv3-row-select')){
      button.setAttribute('aria-expanded',String(button.dataset.sourceObjectId===String(selectedSource.id)));
    }
    sourceSheetTitle.textContent=selectedSource.name||'来源对象';
    sourceSheetOrigin.textContent='来源 · '+selectedSource.sourceFile.name+
      ' · '+selectedSource.group;
    sourceSheetDetail.textContent=selectedSource.detail||'当前来源已识别此对象';
    const subtitleObserved=selectedSource.group==='字幕';
    sourceSheetFlags.hidden=!subtitleObserved;
    sourceSheetFlags.replaceChildren();
    if(subtitleObserved){
      const disposition=sourceSubtitleDispositionLabels(selectedSource.disposition);
      for(const [label,value] of [['Default',disposition.default],['Forced',disposition.forced]]){
        const entry=doc.createElement('span');
        entry.className='sfv3-source-flag-state';
        entry.dataset.observation=value==='未观察'?'unknown':'observed';
        appendText(doc,entry,'strong','',label);
        appendText(doc,entry,'span','',value);
        if(label==='Default')entry.appendChild(sourceFlagHelpTrigger);
        sourceSheetFlags.appendChild(entry);
      }
      appendText(doc,sourceSheetFlags,'small','sfv3-source-flag-provenance',
        '来源 ffprobe · 只读；与拟输出的可编辑标记分离');
    }
    if(subtitleObserved){
      // The SAME glossary is anchored to the selected source flag, instead
      // of consuming a full width unrelated inspector section (Figma V3-09).
      sourceSheetFlags.appendChild(sourceSheetHelpHost);
      sourceSheetHelpHost.appendChild(subtitleFlagHelp);
      subtitleFlagHelp.hidden=false;
      sourceSheetHelpHost.hidden=!sourceHelpOpen;
      subtitleFlagHelp.open=sourceHelpOpen;
      sourceFlagHelpTrigger.setAttribute('aria-expanded',String(sourceHelpOpen));
    }else{
      if(subtitleFlagHelp.parentNode===sourceSheetHelpHost) {
        subtitleFlagHelp.open=false;
        subtitleFlagHelp.hidden=true;
        objectContext.appendChild(subtitleFlagHelp);
      }
      sourceSheetHelpHost.hidden=true;
      sourceHelpOpen=false;
      sourceFlagHelpTrigger.setAttribute('aria-expanded','false');
    }
    const scannedSourceSections=subtitleObserved && latestSections.scanned &&
      latestSections.sourceFile===selectedSource.sourceFile;
    sourceFontEvidence.hidden=!subtitleObserved;
    sourceFontFiles.replaceChildren();
    if(subtitleObserved){
      // Only primary-source sections have a verified File identity here.
      // Secondary subtitle scans alone cannot establish attachment absence.
      const fontAttachments=scannedSourceSections
        ? (latestSections.attachments||[]).filter(attachment=>{
            const mime=String(attachment.detail||'').split(' · ')[0].toLowerCase();
            const name=String(attachment.title||'');
            return /(?:font|truetype|opentype|sfnt)/.test(mime) ||
              /\.(?:ttf|otf|ttc|otc)$/i.test(name);
          }) : [];
      sourceFontHeading.textContent=scannedSourceSections
        ? '来源扫描：'+fontAttachments.length+' 项疑似字体附件'
        : '来源字体附件尚未检查';
      for(const item of fontAttachments.slice(0,12))
        appendText(doc,sourceFontFiles,'li','',item.title);
      if(fontAttachments.length>12)
        appendText(doc,sourceFontFiles,'li','',
          '另外 '+(fontAttachments.length-12)+' 项未在此展开');
      sourceFontLimit.textContent=scannedSourceSections
        ? '仅确认来源 MKV 存在这些附件；不等于字体 face、字重、斜体或字形依赖已验证。'
        : '此来源尚无与当前 File 绑定的附件扫描结果；不能把未知当作 0 项。';
    }
    const previewable=Boolean(selectedSource.preview &&
      from.scanned && from.file===sourceInput.files?.[0] && nativePreviewDrawer);
    // V3-05 action priority: source-preview controls are contextual, but
    // their native activation remains explicit and file-identity guarded.
    sourceSheet.dataset.sfv3Previewable=String(previewable);
    sourceSheetNotice.textContent=selectedSource.reason ||
      (selectedSource.transfer
        ? '可明确选择另一份 MKV 后，使用现有受验证的字幕提取与封装流程。'
        : previewable
        ? '可使用现有 FFmpeg/libass 预览源 ASS；此操作不加入拟输出，预览字体不代表已验证封装依赖闭包。'
        : '当前对象只可观察；此处不提供未经验证的修改、提取或预览操作。');
    sourceSheetPreview.hidden=!previewable;
    sourceSheetExtract.hidden=!previewable || !nativeExtractionPanel;
    if(!previewable) {
      restoreNativePreview();
      restoreNativeExtraction();
    }
    sourcePreviewIdle.hidden=!previewable || !sourceSheetPreviewHost.hidden;
    sourceSheetAdd.hidden=!selectedSource.transfer;
    sourceSheetAdd.textContent='加入到…';
    sourceSheetAdd.setAttribute('aria-label',
      ['ass','ssa'].includes(selectedSource.transfer?.codec)
        ? '加入到明确目标（校验 ASS 与字体依赖）'
        : '加入到明确目标（不会修改来源）');
    // Keep desktop row actions local to the selected ASS: the old 440px
    // inspector must NOT open just by selecting an observed source track.
    // Portrait stays a real lower sheet; preview/extract/details can still
    // explicitly open the SAME inspector in desktop mode.
    const inline=desktopSourceActions() && !sourceDetailRequested &&
      (previewable || Boolean(selectedSource.transfer));
    if(inline) {
      matchingRow.after(sourceInlineActions);
      sourceInlineActions.insertBefore(sourceSheetActions,sourceInlineDetail);
      sourceInlineActions.hidden=false;
      sourceSheet.hidden=true;
      root.dataset.sfv3SourceInspector='closed';
      sourceInlineDetail.setAttribute('aria-expanded','false');
    }else{
      restoreSourceActions();
      sourceSheet.hidden=false;
      root.dataset.sfv3SourceInspector='open';
      sourceInlineDetail.setAttribute('aria-expanded','true');
    }
    const sourceRowButton=matchingRow.querySelector('.sfv3-row-select');
    sourceRowButton?.setAttribute('aria-controls',inline
      ? 'sfv3SourceInlineActions':'sfv3SourceInspector');
  };
  sourceInlineDetail.addEventListener('click',()=>{
    if(!selectedSource)return;
    sourceDetailRequested=true;
    updateSourceSheet();
    sourceSheetClose.focus();
  });
  doc.defaultView?.addEventListener('resize',()=>{
    if(selectedSource && root.dataset.sfv3Surface==='source')
      updateSourceSheet();
  });
  sourceSheetClose.addEventListener('click',()=>closeSourceSheet(true));
  sourceSheetPreview.addEventListener('click',()=>{
    const selected=selectedSource;
    if(sourceSheet.hidden && desktopSourceActions()) {
      sourceDetailRequested=true;
      updateSourceSheet();
    }
    if(!selected?.preview || !nativePreviewDrawer ||
        root.dataset.sfv3Surface!=='source' ||
        !exactEntry(selected.sourceKey,selected.sourceFile) ||
        activeView()?.file!==selected.sourceFile ||
        sourceInput.files?.[0]!==selected.sourceFile ||
        !activeView()?.scanned){
      restoreNativePreview();
      return;
    }
    sourceSheetPreviewHost.hidden=false;
    sourcePreviewIdle.hidden=true;
    sourceSheetPreviewHost.appendChild(nativePreviewDrawer);
    nativePreviewDrawer.open=true;
    if(!signal('softmux:v3-preview-source',{
      sourceKey:selected.preview.sourceKey,
      sourceFile:selected.preview.sourceFile,
      streamIndex:selected.preview.streamIndex,
    })){
      sourceSheetNotice.textContent='当前来源预览未通过实际轨道或运行状态检查。';
      restoreNativePreview();
    }
  });
  sourceSheetExtract.addEventListener('click',()=>{
    const selected=selectedSource;
    if(sourceSheet.hidden && desktopSourceActions()) {
      sourceDetailRequested=true;
      updateSourceSheet();
    }
    if(!selected?.preview || !nativeExtractionPanel ||
        root.dataset.sfv3Surface!=='source' ||
        !exactEntry(selected.sourceKey,selected.sourceFile) ||
        activeView()?.file!==selected.sourceFile ||
        sourceInput.files?.[0]!==selected.sourceFile ||
        !activeView()?.scanned){
      restoreNativeExtraction();
      return;
    }
    sourceSheetExtractionHost.hidden=false;
    sourceSheetExtractionHost.appendChild(nativeExtractionPanel);
    if(!signal('softmux:v3-extract-source',{
      sourceKey:selected.preview.sourceKey,
      sourceFile:selected.preview.sourceFile,
      streamIndex:selected.preview.streamIndex,
    })){
      sourceSheetNotice.textContent='提取未获执行器许可：请确认来源身份与运行状态。';
      restoreNativeExtraction();
    }
  });
  sourceSheetAdd.addEventListener('click',()=>{
    if(!selectedSource?.transfer)return;
    const selected=selectedSource;
    if(!exactEntry(selected.sourceKey,selected.sourceFile) ||
        activeView()?.file!==selected.sourceFile ||
        root.dataset.sfv3Surface!=='source'){
      closeSourceSheet();return;
    }
    openTargetPicker(selected.transfer);
  });
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape' && root.dataset.sfv3Surface==='source' &&
       root.dataset.sfv3SourceInspector==='open' && !picker.open){
      event.preventDefault();
      closeSourceSheet(true);
    }
  });
  const signal = (type,detail) => {
    const EventCtor=doc.defaultView?.CustomEvent;
    if (!EventCtor) return false;
    const event = new EventCtor(type,{bubbles:true,cancelable:true,detail});
    root.dispatchEvent(event);
    return event.defaultPrevented;
  };
  // The visible source remains observation-only, including after a target
  // exists elsewhere. DOM affordances AND the canonical handlers fail closed.
  // Import/remove/select/inspect still work; only output edits are locked.
  const mutatorSelectors = [
    '[data-tree-track-field]', '[data-tree-attachment-field]',
    '[data-tree-track-include]', '[data-tree-track-flag]',
    '[data-tree-attachment-include]', '[data-tree-track-move]',
    '[data-tree-preserve-all]', '[data-generic-include]',
    '[data-asset-include]', '[data-asset-as-attachment]',
    '[data-embedded-add]', '[data-secondary-subtitle-add]',
    '[data-track-action]', '[data-track-field]', '[data-track-move]',
    '[data-attachment-action]', '[data-attachment-field]',
    '[data-new-sub-field]', '[data-new-audio-field]',
    '#appendPreserveAll', '#preserveAttachments', '#fontMode',
    '#muxBtn', '#compositionMuxBtn', '#editorMuxBtn',
  ].join(', ');
  const originalDisableState = new WeakMap();
  const setReadOnlyAffordances = () => {
    const readOnly = root.dataset.sfv3Surface === 'source';
    for(const control of root.querySelectorAll(mutatorSelectors)) {
      if (!('disabled' in control))continue;
      if(readOnly) {
        if(!originalDisableState.has(control))
          originalDisableState.set(control,control.disabled);
        control.disabled=true;
        control.dataset.sfv3SourceReadonly='true';
      }else if(originalDisableState.has(control)) {
        control.disabled=originalDisableState.get(control);
        originalDisableState.delete(control);
        delete control.dataset.sfv3SourceReadonly;
      }
    }
  };
  for(const kind of ['click','change','input'])root.addEventListener(kind,event=>{
    if(root.dataset.sfv3Surface!=='source')return;
    const attempted=event.target?.closest?.(mutatorSelectors);
    if(!attempted)return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  // Source and target share ONE native scroll container. The source CTA can
  // scroll that container below its first screen before target confirmation.
  // Do not inherit that scroll offset into the newly authorized document.
  // #sf14Composition IS the overflow:auto pane body; querying inside it
  // returned null and silently skipped the source->target scroll reset.
  const compositionScroller=compositionHost;
  const surfaceScroll={source:0,plan:0};
  const setSurface = mode => {
    if (mode === 'plan' && (!targetIntent ||
      (targetIntent.kind!=='blank' &&
        targetIntent.baseFile !== sourceInput.files?.[0]))) return false;
    if (!['source','plan'].includes(mode)) return false;
    const oldMode=root.dataset.sfv3Surface;
    if(compositionScroller && oldMode!==mode && Object.hasOwn(surfaceScroll,oldMode))
      surfaceScroll[oldMode]=compositionScroller.scrollTop;
    root.dataset.sfv3Surface = mode;
    root.dataset.sfv3TargetConfirmed = String(Boolean(targetIntent));
    targetTab.hidden = !targetIntent;
    targetTab.toggleAttribute('aria-current',mode === 'plan');
    planHeading.hidden=mode!=='plan';
    if(mode!=='plan')closeInspector();
    if(mode!=='source')closeSourceSheet();
    setReadOnlyAffordances();
    if(compositionScroller && oldMode!==mode) {
      const targetScroll=surfaceScroll[mode]||0;
      compositionScroller.scrollTop=targetScroll;
      // The source/plan rehost is rendered synchronously and the UI
      // model may repaint in the next frame. Restore only this same active
      // document, not every refresh or responsive resize.
      doc.defaultView?.requestAnimationFrame(()=>{
        if(root.dataset.sfv3Surface===mode)
          compositionScroller.scrollTop=targetScroll;
      });
    }
    const EventCtor=doc.defaultView?.CustomEvent;
    if(EventCtor)root.dispatchEvent(new EventCtor('softmux:v3-surface-changed',{
      bubbles:true,detail:{surface:mode},
    }));
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
    iconTab(doc,sourceTab,'mkv-document',first?.file?.name || sourceInput.files?.[0]?.name || '未加载');
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
      iconTab(doc,tab,'mkv-document',entry.file.name);
      tab.title=entry.file.name;
      tab.toggleAttribute('aria-current',
        root.dataset.sfv3Surface==='source' && viewedSourceKey===entry.key);
    }
    targetTab.hidden = !targetIntent;
    targetTab.toggleAttribute('aria-current',root.dataset.sfv3Surface==='plan');
    if(targetIntent?.kind==='blank') {
      // A new destination does not have a base File. Navigation must use
      // the real target kind rather than dereference a nonexistent MKV.
      iconTab(doc,targetTab,'create-output','目标 · 新建空 MKV');
      targetTab.title='已确认的新建 Matroska · 未覆盖任何来源文件';
    }else if(targetIntent) {
      iconTab(doc,targetTab,'create-output','目标 · '+targetIntent.baseFile.name);
      targetTab.title='已确认的拟输出文档 · 基础来源：'+targetIntent.baseFile.name;
    }
    // Compact's source menu reuses the existing exact-key source switching
    // function; avoid hiding source navigation behind truncating tabs.
    compactSources.hidden=!entries.length;
    compactSourceSummary.replaceChildren(svgIcon(doc,'documents'),
      doc.createTextNode('来源 ×'+entries.length));
    compactSourceList.replaceChildren(...entries.map(entry=>{
      const button=doc.createElement('button');
      button.type='button';
      button.className='sfv3-compact-source-choice';
      button.textContent=entry.file.name;
      button.title=entry.file.name;
      button.dataset.sfv3CompactSourceKey=entry.key;
      button.setAttribute('aria-current',
        root.dataset.sfv3Surface==='source'&&viewedSourceKey===entry.key?'page':'false');
      button.addEventListener('click',()=>{
        compactSources.open=false;
        showSourceEntry(entry.key);
      });
      return button;
    }));
  };
  const createGroup = (group,rows,readonly=false,host=contents) => {
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
      const select=doc.createElement('button');
      select.type='button';
      select.className='sfv3-row-select';
      select.dataset.sourceObjectId=String(item.id);
      select.setAttribute('aria-controls','sfv3SourceInspector');
      select.setAttribute('aria-expanded','false');
      select.setAttribute('aria-label','查看来源对象：'+(item.name||'未命名'));
      const glyph=appendText(doc,select,'span','sfv3-kind-icon','');
      const groupIcon={
        '视频':'video','音频':'audio','字幕':'subtitle',
        '附件':'attachment','字体':'attachment','章节':'chapter',
        '标签':'tag','其他轨道':'object-list',
      }[group] || 'object-list';
      glyph.appendChild(svgIcon(doc,groupIcon));
      glyph.setAttribute('aria-hidden','true');
      const column=doc.createElement('div');
      column.className='sfv3-observed-text';
      appendText(doc,column,'strong','sfv3-observed-title',item.name||'未命名');
      if(item.detail)appendText(doc,column,'small','sfv3-observed-detail',item.detail);
      if(item.reason)appendText(doc,column,'small','sfv3-observation-note',item.reason);
      select.appendChild(column);
      row.appendChild(select);
      select.addEventListener('click',()=>{
        const from=activeView();
        if(!from || !exactEntry(from.key,from.file) ||
            root.dataset.sfv3Surface!=='source')return;
        if(selectedSource?.id===item.id && selectedSource.sourceFile===from.file){
          closeSourceSheet(true);return;
        }
        restoreNativePreview();
        restoreNativeExtraction();
        selectedSource={...item,group,sourceKey:from.key,sourceFile:from.file};
        sourceHelpOpen=false;
        sourceDetailRequested=false;
        updateSourceSheet();
        if(!sourceSheet.hidden)sourceSheetClose.focus();
        else (sourceSheetPreview.hidden?sourceInlineDetail:sourceSheetPreview).focus();
      });
      if (item.transfer) {
        const button=appendText(doc,row,'button','sfv3-row-action','加入到…');
        button.type='button';
        button.textContent=['ass','ssa'].includes(item.transfer?.codec)
          ? '加入到… · 验证字体' : '加入到…';
        button.title='先确认目标，再由实际执行器校验字幕和字体依赖；不直接修改来源';
        button.addEventListener('click',()=>openTargetPicker(item.transfer));
      } else if(readonly) {
        appendText(doc,row,'span','sfv3-readonly-indicator','只读');
      }
      list.appendChild(row);
    }
    section.appendChild(list);
    host.appendChild(section);
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
      const marker=doc.createElement('span');
      marker.className='sfv3-picker-radio-frame';
      marker.append(radio,svgIcon(doc,'picker-selected'));
      label.appendChild(marker);
      const copy=doc.createElement('span');
      copy.className='sfv3-picker-choice-copy';
      appendText(doc,copy,'strong','sfv3-picker-file-name','以 '+entry.file.name+' 为基础');
      appendText(doc,copy,'small','sfv3-picker-file-detail','保留此容器已选择的对象 · 原文件只读');
      label.appendChild(copy);
      pickerOptions.appendChild(label);
    }
    // V3-03: blank is an ACTUAL distinct writer intent, not a synthetic MKV
    // File granted as if it were a user's read-only source. Only selected
    // stream indices and the existing imported external inventory may enter.
    const blankOption=doc.createElement('label');
    blankOption.className='sfv3-picker-option sfv3-picker-blank';
    const blankRadio=doc.createElement('input');
    blankRadio.type='radio';blankRadio.name='sfv3TargetBase';
    blankRadio.value='__v3_blank__';
    blankRadio.checked=targetIntent?.kind==='blank'||!possible.length;
    const blankFrame=doc.createElement('span');
    blankFrame.className='sfv3-picker-radio-frame';
    blankFrame.append(blankRadio,svgIcon(doc,'picker-empty-target'));
    blankOption.appendChild(blankFrame);
    const emptyCopy=doc.createElement('span');
    emptyCopy.className='sfv3-picker-choice-copy';
    appendText(doc,emptyCopy,'strong','sfv3-picker-empty-name','新建空 MKV');
    appendText(doc,emptyCopy,'small','sfv3-picker-empty-reason',
      '不继承来源轨道、章节或标签 · 只写入明确勾选的资源');
    blankOption.appendChild(emptyCopy);
    pickerOptions.appendChild(blankOption);
    const blankSelection=doc.createElement('fieldset');
    blankSelection.id='sfv3BlankStreamSelection';
    blankSelection.className='sfv3-blank-stream-selection';
    const legend=doc.createElement('legend');
    legend.textContent='从当前已扫描来源加入轨道（可不选）';
    blankSelection.appendChild(legend);
    const from=activeView();
    const validMain=from && from.file===sourceInput.files?.[0] && from.scanned;
    const selectable=validMain?(from.primaryStreams||[]).filter(stream=>
      ['video','audio','subtitle','attachment'].includes(stream.type)):[];
    const prechecked=pendingTrack && pendingTrack.sourceFile===from?.file
      ? [pendingTrack.streamIndex]
      : targetIntent?.kind==='blank'?blankSelectedIndices:[];
    if(!selectable.length)appendText(doc,blankSelection,'p','sfv3-picker-explanation',
      '当前没有已验证的来源轨道；仍可选择空目标，并使用已导入的外部资源。');
    for(const stream of selectable){
      const label=doc.createElement('label');
      label.className='sfv3-blank-stream-choice';
      const check=doc.createElement('input');
      check.type='checkbox';check.value=String(stream.index);
      check.dataset.blankStreamIndex=String(stream.index);
      check.checked=prechecked.includes(stream.index);
      label.append(check,doc.createTextNode(
        ' #'+stream.index+' · '+({video:'视频',audio:'音频',
          subtitle:'字幕',attachment:'附件'}[stream.type]||stream.type)+
        ' · '+(stream.title||stream.codec||'未命名')));
      blankSelection.appendChild(label);
    }
    pickerOptions.appendChild(blankSelection);
    const updateBlankVisibility=()=>{
      blankSelection.hidden=!blankRadio.checked;
      confirmChoice.disabled=!pickerOptions.querySelector('input[name="sfv3TargetBase"]:checked');
      pickerStatus.textContent=blankRadio.checked
        ? '目标尚不包含任何来源轨道；只有勾选的真实流和已导入资源会参与新 MKV 写入。':
        '';
    };
    // The modal contents are rebuilt per opening. Replace, rather than
    // accumulate, closures that could act on detached old radio controls.
    pickerOptions.onchange=updateBlankVisibility;
    if(!pickerOptions.querySelector('input[name="sfv3TargetBase"]:checked'))
      pickerOptions.querySelector('input[name="sfv3TargetBase"]').checked=true;
    updateBlankVisibility();
    confirmChoiceLabel.textContent=pendingTrack
      ? (['ass','ssa'].includes(pendingTrack.codec)
          ? '确认目标并验证字幕与字体' : '创建拟输出并加入字幕')
      : '创建拟输出';
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
    if(!['subrip','ass','ssa'].includes(track.codec) || !track.allowed) {
      pendingAddition=null;
      flowMessage=track.reason||'字幕格式不受支持，或已存在相同来源的待输出字幕与字体组合。';
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
      flowMessage=['ass','ssa'].includes(track.codec)
        ? '正在执行来源 ASS/SSA、实际字体 face 和字形闭包校验；只有全部通过才加入。'
        : '已提交来源字幕提取与核验，请等待真实处理结果。';
    }else {
      flowMessage='来源字幕已变化或执行器正忙，没有启动加入。';
    }
  };
  confirmChoice.addEventListener('click',()=>{
    const chosen=pickerOptions.querySelector('input[name="sfv3TargetBase"]:checked');
    if(chosen?.value==='__v3_blank__'){
      const from=activeView();
      const currentSource=from?.file===sourceInput.files?.[0]?from:null;
      const selectedIndices=[...pickerOptions.querySelectorAll(
        '#sfv3BlankStreamSelection input[data-blank-stream-index]:checked')]
        .map(node=>Number(node.value));
      if(pendingTrack && (!currentSource ||
          pendingTrack.sourceFile!==currentSource.file ||
          !selectedIndices.includes(pendingTrack.streamIndex))){
        pickerStatus.textContent='请先打开并扫描该来源，勾选其真实字幕轨，再确认空目标。';
        return;
      }
      if(selectedIndices.length && !currentSource?.scanned){
        pickerStatus.textContent='来源轨道尚未通过扫描，请先读取当前来源。';
        return;
      }
      const accepted=signal('softmux:v3-confirm-blank',{
        sourceKey:currentSource?.key||'',sourceFile:currentSource?.file||null,
        selectedIndices,
      });
      if(!accepted){
        pickerStatus.textContent='空白目标的来源或资源身份验证失败，未获得封装许可。';
        return;
      }
      blankSelectedIndices=selectedIndices;
      targetIntent={kind:'blank',baseKey:'__v3_blank__',baseFile:null,
        sourceKey:currentSource?.key||'',sourceFile:currentSource?.file||null};
      pendingTrack=null;pendingAddition=null;surfaceScroll.plan=0;
      picker.close();setSurface('plan');
      flowMessage=selectedIndices.length
        ? '已确认从零创建 MKV；仅复制明确选中的源轨道。'
        : '已创建空白目标计划；请导入资源或添加来源轨道后封装。';
      schedule();return;
    }
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
    surfaceScroll.plan=0; // a newly confirmed target always starts at its title
    picker.close();
    if(track) {
      pendingAddition={
        sourceKey:track.sourceKey,sourceFile:track.sourceFile,
        streamIndex:track.streamIndex,baseKey:base.key,baseFile:base.file,
        inspectStarted:false,
      };
      viewedSourceKey=track.sourceKey;
      // After a confirmed Add-to intent, route subsequent native extraction
      // through the target editor scope. Source view itself stays read-only.
      setSurface('plan');
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
    if(viewedSourceKey!==entry.key)closeSourceSheet();
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
  planBack.addEventListener('click',()=>{
    setSurface('source');schedule();
  });
  primary.replaceChildren(svgIcon(doc,'create-output'),doc.createTextNode('创建拟输出'));
  primary.addEventListener('click',()=>openTargetPicker(null));
  emptyTargetAction.addEventListener('click',event=>{
    event.stopPropagation();openTargetPicker(null);
  });
  root.addEventListener('softmux:v3-edit-blank',()=>{
    if(targetIntent?.kind==='blank')openTargetPicker(null);
  });

  if(featureNavigation) {
    const syncFeatureNavigation=()=>{
      const active=root.dataset.view==='batch'?'batch':
        root.dataset.view==='tools'?'tools':
        root.dataset.sfv3Surface==='plan'?'plan':'source';
      for(const button of featureNavigation.querySelectorAll('[data-sfv35-task]')) {
        if(button.dataset.sfv35Task===active)
          button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
    };
    // The native 10.14 changeView remains the ONE authority for switching
    // workspaces. Source/plan remains governed by exact-File target intent.
    featureNavigation.addEventListener('click',event=>{
      const task=event.target.closest('button[data-sfv35-task]')?.dataset.sfv35Task;
      if(!task)return;
      const nativeView=task==='batch'?'batch':task==='tools'?'tools':'single';
      root.querySelector('[data-sf-view="'+nativeView+'"]')?.click();
      if(task==='source')setSurface('source');
      if(task==='plan') {
        if(!setSurface('plan')) {
          setSurface('source');
          openTargetPicker(null);
        }
      }
      syncFeatureNavigation();
      schedule();
    });
    const navViewObserver=new MutationObserver(syncFeatureNavigation);
    navViewObserver.observe(root,{attributes:true,
      attributeFilter:['data-view','data-sfv3-surface']});
    root.addEventListener('softmux:v3-surface-changed',syncFeatureNavigation);
    syncFeatureNavigation();
  }

  const render = () => {
    scheduled=false;
    const from=activeView();
    const file=from?.file||sourceInput.files?.[0]||null;
    const mainSource=Boolean(file && file===sourceInput.files?.[0]);
    const mainScanned=Boolean(mainSource && from?.scanned);
    const obs=mainSource && latestSections.scanned &&
      latestSections.sourceFile===file ? latestSections:null;
    // An FFprobe attachment is not a second media track. Once the SAME
    // exact-File scan has verified its attachment records, render it in the
    // resource disclosure only. Without that observation, retain unknown
    // stream rows rather than making real source data disappear.
    const sourceRows=mainScanned?sourceRowsFromObservation(from.primaryStreams)
      .filter(row=>{
        if(!obs)return true;
        const index=Number(String(row.id).split(':').at(-1));
        const stream=from.primaryStreams.find(entry=>entry.index===index);
        return String(stream?.type||'')!=='attachment';
      }):[];
    // Every number below is derived from the exact live File scan, never
    // from prospective output rows. Unknown category != observed zero.
    counters.replaceChildren();
    const observedCounts=mainScanned ? [
      ['视频','video',sourceRows.filter(row=>row.kind==='视频').length],
      ['音频','audio',sourceRows.filter(row=>row.kind==='音频').length],
      ['字幕','subtitle',sourceRows.filter(row=>row.kind==='字幕').length],
      ...(obs?[['附件','attachment',obs.attachments.length]]:[]),
    ] : from?.subtitleState==='inspected' ? [
      ['字幕','subtitle',from.subtitleTracks?.length||0],
    ] : [];
    counters.hidden=observedCounts.length===0;
    for(const [label,icon,count] of observedCounts){
      const card=doc.createElement('div');
      card.className='sfv3-counter';
      card.dataset.kind=icon;
      card.append(svgIcon(doc,icon));
      appendText(doc,card,'strong','sfv3-counter-count',String(count).padStart(2,'0'));
      appendText(doc,card,'span','sfv3-counter-label',label);
      card.setAttribute('aria-label',label+' '+count);
      counters.appendChild(card);
    }
    name.textContent=file?.name || '未加载文件';
    // Preserve expanded source structure cards across FFprobe and UI refresh.
    // A rerender may not silently collapse a user's real Chapter/Tag selection.
    const expandedSourceResources=new Set([...contents.querySelectorAll(
      '.sfv3-source-resource-card[open]')].map(node=>node.dataset.kind));
    contents.replaceChildren();
    empty.hidden=Boolean(file);
    heading.hidden=!file;
    meta.hidden=!file;
    primary.hidden=!file || !getEntries().length;
    sourceToolbar.hidden=!file;
    if(file && !mainSource) {
      meta.textContent='独立来源 · 查看不改变当前目标基础容器';
      const snapshot=from;
      if(snapshot.subtitleState==='inspected') {
        const rows=(snapshot.subtitleTracks||[]).map(track=>({
          id:'source:subtitle:'+track.index,
          name:(track.title||'字幕轨 #'+track.index),
          detail:track.codec+' · '+track.language+' · 轨道 #'+track.index,
          disposition:track.disposition,
          reason:track.allowed ? '' : track.reason,
          transfer:track.allowed && ['subrip','ass','ssa'].includes(track.codec)?{
            sourceKey:from.key,sourceFile:from.file,streamIndex:track.index,
            codec:track.codec,
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
          disposition:stream?.disposition,
          transfer:isSubtitle && ['subrip','ass','ssa'].includes(stream?.codec) && from ? {
            sourceKey:from.key,sourceFile:from.file,streamIndex,
            codec:stream.codec,
          }:null,
          reason:isSubtitle && !['subrip','ass','ssa'].includes(stream?.codec)
            ? '此字幕格式不在已测试的跨 MKV 转移范围内；不会提供虚假的加入操作。'
            : isSubtitle && ['ass','ssa'].includes(stream?.codec)
            ? '加入时必须通过来源字体 face、字形覆盖与实际文件依赖检查；预览与单轨提取不构成加入许可。'
            : '',
          preview:isSubtitle && ['ass','ssa'].includes(stream?.codec) && from?.scanned ? {
            sourceKey:from.key,sourceFile:from.file,streamIndex,
          }:null,
        });
      }
      for(const kind of ['视频','音频','字幕','其他轨道'])
        createGroup(kind,groups.get(kind)||[]);
      // Figma V3-01/05: keep the primary video/audio/subtitle rows ahead of
      // secondary source structures, represented by three compact cards.
      // Each expanded card contains the exact SAME read-only observed rows
      // and selectable source inspector; this does not create an output plan.
      if(obs) {
        const strip=doc.createElement('section');
        strip.className='sfv3-source-resource-strip';
        strip.setAttribute('aria-label','来源容器的附件和结构（来源扫描，只读）');
        const stripHeading=doc.createElement('p');
        stripHeading.className='sfv3-source-resource-eyebrow';
        stripHeading.textContent='附加结构 · 只读来源';
        strip.appendChild(stripHeading);
        for(const [kind,label,icon] of [
          ['attachments','附件','attachment'],
          ['chapters','章节','chapter'],
          ['tags','标签','tag'],
        ]) {
          const rows=(obs[kind]||[]).map(item=>({
            id:item.id,name:item.title,detail:item.detail,
          }));
          const disclosure=doc.createElement('details');
          disclosure.className='sfv3-source-resource-card';
          disclosure.dataset.kind=kind;
          disclosure.open=expandedSourceResources.has(kind);
          const summary=doc.createElement('summary');
          summary.className='sfv3-source-resource-summary';
          summary.appendChild(svgIcon(doc,icon));
          appendText(doc,summary,'strong','',label);
          appendText(doc,summary,'span','sfv3-source-resource-count',
            String(rows.length).padStart(2,'0'));
          appendText(doc,summary,'span','sfv3-source-resource-chevron','›');
          summary.setAttribute('aria-label',label+' '+rows.length+' 项来源观察，展开查看');
          disclosure.appendChild(summary);
          const panel=doc.createElement('div');
          panel.className='sfv3-source-resource-content';
          if(rows.length)createGroup(label,rows,true,panel);
          else appendText(doc,panel,'p','sfv3-observation-note',
            '本次来源扫描未报告'+label+'对象。');
          disclosure.appendChild(panel);
          strip.appendChild(disclosure);
        }
        contents.appendChild(strip);
      }
      if(!sourceRows.length && !(obs?.attachments?.length||obs?.chapters?.length||obs?.tags?.length))
        appendText(doc,contents,'p','sfv3-observation-note',
          '当前来源尚没有足够的轨道或结构证据。');
    }
    filterSourceRows();
    sourceStructureToggle.setAttribute('aria-expanded',String(Boolean(
      contents.querySelector('.sfv3-source-resource-card[open]'))));
    if(selectedSource)updateSourceSheet();
    const targetValid=Boolean(targetIntent && (targetIntent.kind==='blank'
      ? latestResources.target?.kind==='blank' &&
        targetIntent.sourceFile===latestResources.activeBase &&
        (!targetIntent.sourceFile ||
          exactEntry(targetIntent.sourceKey,targetIntent.sourceFile))
      : exactEntry(targetIntent.baseKey,targetIntent.baseFile) &&
        latestResources.activeBase===targetIntent.baseFile));
    if(!targetValid && targetIntent) {
      targetIntent=null;pendingAddition=null;
      root.dataset.sfv3TargetConfirmed='false';
      root.dataset.sfv3Surface='source';
      closeInspector();
      flowMessage='目标文件身份已改变，先前的拟输出授权失效。';
    }
    planHeading.hidden=root.dataset.sfv3Surface!=='plan' || !targetIntent;
    planStats.hidden=planHeading.hidden;
    planToolbar.hidden=planHeading.hidden;
    if(!planStats.hidden){
      const rows=[...currentTracks.querySelectorAll('.composition-row[data-sfv3-object-kind]')];
      const counts={video:0,audio:0,subtitle:0,attachment:0,font:0};
      for(const row of rows)
        if(Object.hasOwn(counts,row.dataset.sfv3ObjectKind))
          counts[row.dataset.sfv3ObjectKind]++;
      const stats=[
        ['video','视频',counts.video],
        ['audio','音频',counts.audio],
        ['subtitle','字幕',counts.subtitle],
        ['attachment','附件',counts.attachment+counts.font],
      ];
      planStats.replaceChildren(...stats.map(([icon,label,count])=>{
        const item=doc.createElement('div');
        item.className='sfv3-plan-stat';
        item.dataset.kind=icon;
        item.append(svgIcon(doc,icon),
          appendText(doc,item,'strong','',String(count).padStart(2,'0')),
          appendText(doc,item,'span','',label));
        item.setAttribute('aria-label',label+' '+count+
          (icon==='attachment'?'（包括字体与其他附件）':''));
        return item;
      }));
    }
    const selectedRow=currentTracks.querySelector('button[data-composition-id][aria-pressed="true"]');
    const selectedKind=selectedRow?.querySelector('.composition-kind')?.textContent?.trim()||'';
    const selectedTitle=selectedRow?.querySelector('.composition-track-main strong')?.textContent?.trim()||'';
    const selectedDetail=selectedRow?.querySelector('.composition-track-main small')?.textContent?.trim()||'';
    contextEyebrow.textContent=selectedRow?'当前选中 · '+selectedKind:'拟输出 · 对象检查器';
    contextTitle.textContent=selectedTitle||'拟输出容器';
    contextMeta.textContent=selectedDetail||'未选中具体对象；可查看真实成品证据与编辑历史';
    const sourceHelpInScope=Boolean(root.dataset.sfv3Surface==='source' &&
      !sourceSheet.hidden && selectedSource?.group==='字幕' &&
      subtitleFlagHelp.parentNode===sourceSheetHelpHost);
    const flagHelpInScope=sourceHelpInScope || Boolean(targetValid &&
      root.dataset.sfv3Surface==='plan' &&
      selectedRow?.dataset.sfv3ObjectKind==='subtitle');
    subtitleFlagHelp.hidden=!flagHelpInScope;
    if(!flagHelpInScope)subtitleFlagHelp.open=false;
    const structureBound=Boolean(targetValid && latestSections.scanned &&
      latestSections.sourceFile===targetIntent.baseFile);
    structure.hidden=root.dataset.sfv3Surface!=='plan' || !structureBound;
    if(structureBound) {
      structure.replaceChildren();
      const header=doc.createElement('summary');
      header.className='sfv3-observed-structure-heading';
      appendText(doc,header,'strong','','章节与标签 · 来源观察');
      appendText(doc,header,'span','','只读 · 展开查看');
      structure.appendChild(header);
      const material=[
        ['chapters','章节','chapter'],
        ['tags','标签','tag'],
      ];
      for(const [key,label,icon] of material) {
        const rows=Array.isArray(latestSections[key])?latestSections[key]:[];
        const group=doc.createElement('section');
        group.className='sfv3-structure-group';
        group.dataset.kind=key;
        const groupHead=doc.createElement('div');
        groupHead.className='sfv3-structure-group-head';
        groupHead.appendChild(svgIcon(doc,icon));
        appendText(doc,groupHead,'strong','',label);
        appendText(doc,groupHead,'small','',rows.length?
          rows.length+' 条 ffprobe 观察':'本次扫描未报告');
        group.appendChild(groupHead);
        for(const item of rows) {
          const row=doc.createElement('div');
          row.className='sfv3-structure-row';
          row.dataset.observedId=String(item.id||'');
          appendText(doc,row,'strong','',String(item.title||'未命名'));
          if(item.detail)appendText(doc,row,'small','',String(item.detail));
          appendText(doc,row,'span','sfv3-structure-readonly','只读');
          group.appendChild(row);
        }
        structure.appendChild(group);
      }
      appendText(doc,structure,'p','sfv3-structure-scope',
        '仅显示基础来源的 ffprobe 扁平章节与格式层标签；不等于完整 Matroska EBML、TagTargets 或成品保留证明。实际结果以封装后的独立审计为准。');
    } else {
      structure.replaceChildren();
    }
    if(targetIntent?.kind==='blank') {
      planName.textContent='新建空 MKV';
      planName.title='独立新建 Matroska，不覆盖来源，不继承未选中的源轨道';
      planFacts.textContent='独立新容器 · 仅保留明确选择的来源轨道与外部附件 · 章节和标签不自动复制';
    }else if(targetIntent) {
      planName.textContent=targetIntent.baseFile.name;
      planName.title='目标文档基于：'+targetIntent.baseFile.name+
        '；不会覆盖这个来源 File';
      const currentCount=find(doc,'compositionCount')?.textContent?.trim() || '';
      planFacts.textContent=[
        targetIntent.baseFile.name+' 为基础',
        currentCount,
      ].filter(Boolean).join('  ·  ');
    }else {
      planName.textContent='';
      planFacts.textContent='';
    }
    // Render derived members only in a still-authorized target plan.
    // Never render a fabricated font closure for source observations.
    const actualBundles=targetValid && root.dataset.sfv3Surface==='plan' &&
      latestResources.activeBase===targetIntent.baseFile
      ? (latestResources.assFontBundles||[]).filter(bundle=>
          exactEntry(bundle.sourceKey,bundle.sourceFile) &&
          bundle.sourceFile!==targetIntent.baseFile)
      : [];
    assFontPanel.hidden=!actualBundles.length;
    assFontPanel.replaceChildren();
    if(actualBundles.length) {
      const head=doc.createElement('header');
      head.className='sfv3-ass-font-head';
      head.appendChild(svgIcon(doc,'subtitle'));
      appendText(doc,head,'strong','', '来源 ASS 与字体依赖');
      appendText(doc,head,'small','',actualBundles.length+' 组 · 来自实际资源列表');
      assFontPanel.appendChild(head);
      for(const bundle of actualBundles) {
        const card=doc.createElement('article');
        card.className='sfv3-ass-font-bundle';
        card.dataset.sourceKey=bundle.sourceKey;
        card.dataset.streamIndex=String(bundle.streamIndex);
        card.dataset.binding=bundle.bound?'bound':'pending';
        appendText(doc,card,'strong','sfv3-ass-font-subtitle',bundle.subtitleName);
        appendText(doc,card,'small','sfv3-ass-font-origin',
          bundle.sourceName+' · 原始字幕轨 #'+bundle.streamIndex);
        appendText(doc,card,'p','sfv3-ass-font-binding',
          bundle.bound
            ? '字幕和字体已登记到拟输出编辑器 · 尚未执行最终封装及成品审计'
            : '依赖尚未全部绑定 · 不能视为已确认的完整字体组');
        const names=doc.createElement('ul');
        names.className='sfv3-ass-font-names';
        for(const fontName of bundle.fontNames)
          appendText(doc,names,'li','',fontName);
        if(!bundle.fontNames.length)
          appendText(doc,names,'li','','未找到已登记字体');
        card.appendChild(names);
        assFontPanel.appendChild(card);
      }
      appendText(doc,assFontPanel,'p','sfv3-ass-font-scope',
        '这里仅展示真实来源成员及编辑器绑定状态，不代表跨播放器字形一致、UID/Tag 关联保留或已通过成品验证。');
    }
    syncTabs();
    setReadOnlyAffordances();
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
  // Source and output resource disclosures retain explicit user-open state on
  // resize/rotation. Never auto-expand based on width: the approved layouts
  // keep primary media tracks dominant at desktop, portrait and compact sizes.
  sourceInput.addEventListener('change',schedule);
  find(doc,'unifiedAssetInput')?.addEventListener('change',schedule);
  root.addEventListener('softmux:source-sections-updated',event=>{
    if(!event.detail || typeof event.detail!=='object')return;
    latestSections=event.detail;schedule();
  });
  root.addEventListener('softmux:v3-resource-registry',event=>{
    if(!event.detail||!Array.isArray(event.detail.entries))return;
    latestResources=event.detail;
    if(selectedSource && !exactEntry(selectedSource.sourceKey,selectedSource.sourceFile))
      closeSourceSheet();
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
    const {baseKey,baseFile,kind='existing',sourceKey,sourceFile}=event.detail||{};
    if(kind==='blank'){
      targetIntent={kind,baseKey,baseFile:null,sourceKey,sourceFile};
    }else {
      if(!exactEntry(baseKey,baseFile))return;
      targetIntent={kind,baseKey,baseFile};
    }
    root.dataset.sfv3TargetConfirmed='true';
    targetTab.hidden=false;
    flowMessage='目标已选择；未执行文件写入。';
    schedule();
  });
  render();
  return true;
}
