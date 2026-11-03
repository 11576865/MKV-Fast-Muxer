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
  root.dataset.sfv3Contract = 'approved-v3-wu01';

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

  let latestSections = {scanned:false, attachments:[],chapters:[],tags:[]};
  let scheduled = false;
  const render = () => {
    scheduled = false;
    const file = sourceInput.files?.[0] || null;
    const scanned = Boolean(file && !actualComposition.hidden);
    const sourceRows = scanned ? sourceRowsFromComposition(doc) : [];
    const obs = latestSections.scanned && latestSections.sourceFile === file ? latestSections : null;
    name.textContent = file ? file.name : '未加载文件';
    sourceTab.textContent = file ? file.name : '未加载';
    sourceTab.title = file?.name || '选择文件';
    contents.replaceChildren();
    empty.hidden = Boolean(file);
    heading.hidden = !file;
    meta.hidden = !file;
    primary.hidden = !scanned;
    if (file && !scanned) {
      meta.textContent = '已选来源 · 等待实际扫描';
      appendText(doc, contents, 'p', 'sfv3-observation-note', '正在等待文件识别；未生成容器结论。');
    } else if (scanned) {
      meta.textContent = 'Matroska 来源 · 已扫描；选择来源不会自动创建目标';
      const counts = new Map();
      const addGroup = (group, rows, readOnly = false) => {
        if (!rows.length) return;
        const section = doc.createElement('section');
        section.className = 'sfv3-object-group';
        const head = doc.createElement('div');
        head.className = 'sfv3-object-group-head';
        appendText(doc, head, 'h2', 'sfv3-object-group-title', group);
        appendText(doc, head, 'span', 'sfv3-object-group-count', String(rows.length).padStart(2,'0'));
        section.appendChild(head);
        const list = doc.createElement('div');
        list.className = 'sfv3-object-list';
        list.setAttribute('role', 'list');
        for (const item of rows) {
          const row = doc.createElement('div');
          row.className = 'sfv3-observed-row';
          row.setAttribute('role', 'listitem');
          row.dataset.sourceObjectId = item.id;
          const glyph = appendText(doc, row, 'span', 'sfv3-kind-icon', group === '视频' ? '▣' :
            group === '音频' ? '◖' : group === '字幕' ? '▤' : readOnly ? '◫' : '◇');
          glyph.setAttribute('aria-hidden', 'true');
          const textCol = doc.createElement('div');
          textCol.className = 'sfv3-observed-text';
          appendText(doc, textCol, 'strong', 'sfv3-observed-title', item.name || '未命名');
          if (item.detail) appendText(doc, textCol, 'small', 'sfv3-observed-detail', item.detail);
          row.appendChild(textCol);
          if (readOnly) appendText(doc, row, 'span', 'sfv3-readonly-indicator', '只读');
          list.appendChild(row);
        }
        section.appendChild(list);
        contents.appendChild(section);
      };
      for (const row of sourceRows) {
        const kind = /视频/.test(row.kind) ? '视频' : /音频/.test(row.kind) ? '音频' :
          /字幕/.test(row.kind) ? '字幕' : '其他轨道';
        if (!counts.has(kind)) counts.set(kind, []);
        counts.get(kind).push(row);
      }
      for (const kind of ['视频','音频','字幕','其他轨道']) addGroup(kind,counts.get(kind)||[]);
      for (const [kind,title] of [['attachments','附件'],['chapters','章节'],['tags','标签']]) {
        const rows = (obs?.[kind] || []).map(item => ({
          id:item.id,name:item.title,detail:item.detail,
        }));
        addGroup(title,rows,true);
      }
      if (!sourceRows.length && !(obs?.attachments?.length || obs?.chapters?.length || obs?.tags?.length)) {
        appendText(doc, contents, 'p', 'sfv3-observation-note',
          '当前来源的轨道或结构尚未形成可核验的观察结果。');
      }
    }
    bottom.textContent = !file ? '尚未加载资源' :
      !scanned ? '正在等待来源扫描' : '当前仅观察来源 · 拟输出需明确进入编辑';
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    doc.defaultView?.queueMicrotask ? doc.defaultView.queueMicrotask(render) : Promise.resolve().then(render);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(currentTracks, {childList:true,subtree:true,characterData:true});
  observer.observe(actualComposition, {attributes:true,attributeFilter:['hidden']});
  sourceInput.addEventListener('change', schedule);
  find(doc,'unifiedAssetInput')?.addEventListener('change', schedule);
  root.addEventListener('softmux:source-sections-updated', event => {
    if (!event.detail || typeof event.detail !== 'object') return;
    latestSections = event.detail;
    schedule();
  });

  const setSurface = mode => {
    if (!['source','plan'].includes(mode)) return;
    root.dataset.sfv3Surface = mode;
    sourceTab.toggleAttribute('aria-current',mode === 'source');
    targetTab.hidden = mode !== 'plan';
    targetTab.toggleAttribute('aria-current',mode === 'plan');
  };
  sourceTab.addEventListener('click', () => setSurface('source'));
  targetTab.addEventListener('click', () => setSurface('plan'));
  primary.addEventListener('click', () => {
    if (!sourceInput.files?.length || actualComposition.hidden) return;
    // Compatibility bridge only: V3-WU02 still needs true optional OutputPlan
    // intent from the domain. WU01 does NOT claim to create it.
    setSurface('plan');
  });
  render();
  return true;
}
