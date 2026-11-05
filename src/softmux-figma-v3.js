/*
 * Softmux Figma V3 / Object-first adaptive candidate (page 27:2).
 * Presentation only: the live File inputs, original-track authority, single
 * ContainerProject, composition handlers and FFmpeg executor stay in sf14.
 * No sample media, second editable track arrays or synthetic write success.
 */
const byId = (doc, id) => doc.getElementById(id);
const text = node => (node?.textContent || '').trim();
const findEntry = (inventory, key) => [...inventory.querySelectorAll('.asset-entry[data-kind="container"]')]
  .find(row => row.querySelector('[data-asset-source]')?.dataset.assetSource === key);
const sourceKey = inventory =>
  inventory.querySelector('.asset-entry [data-asset-source]:checked')?.dataset.assetSource || '';

export const V3_SOURCE_GROUPS = Object.freeze([
  ['video', '视频', '▣'], ['audio', '音频', '◀'], ['subtitle', '字幕', '▤']
]);

export function groupV3Objects(items) {
  const grouped = { video: [], audio: [], subtitle: [] };
  for (const item of items) {
    if (Object.hasOwn(grouped, item.kind) && Number.isSafeInteger(item.index) && item.index >= 0)
      grouped[item.kind].push(item);
  }
  return grouped;
}

export function canCommitV3CrossSource({ fromKey, targetKey, index, sourcePresent, targetActive, eligible }) {
  return Boolean(fromKey && targetKey && fromKey !== targetKey &&
    Number.isSafeInteger(index) && index >= 0 && sourcePresent && targetActive && eligible);
}

const make = (doc, tag, className, label = '') => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (label) node.textContent = label;
  return node;
};
const button = (doc, label, attrs = {}) => {
  const b = make(doc, 'button', '', label);
  b.type = 'button';
  for (const [key, value] of Object.entries(attrs)) b.setAttribute(key, value);
  return b;
};

export function mountSoftmuxFigmaV3(doc = document) {
  const host = byId(doc, 'sf14Root');
  const inventory = byId(doc, 'assetInventory');
  const composition = byId(doc, 'compositionTracks');
  const inspector = host?.querySelector('.sf14-inspector');
  const dropzone = byId(doc, 'assetDropzone');
  if (!host || !inventory || !composition || !inspector || !dropzone ||
      byId(doc, 'sfv3Root')) return false;

  const originalInspectorParent = inspector.parentNode;
  const originalDropParent = dropzone.parentNode;
  const root = make(doc, 'div', 'sfv3');
  root.id = 'sfv3Root';
  root.innerHTML = [
    '<button id="sfv3Return" class="sfv3-return" type="button" hidden>← 返回 V3</button>',
    '<header class="sfv3-chrome">',
      '<div class="sfv3-brand"><span class="sfv3-mark" aria-hidden="true">▣</span><strong>软封</strong></div>',
      '<nav id="sfv3Tabs" class="sfv3-tabs" aria-label="已打开的来源和拟输出"></nav>',
      '<button id="sfv3Add" class="sfv3-icon" type="button" aria-label="添加文件" title="添加文件">＋</button>',
      '<div class="sfv3-spacer"></div>',
      '<button id="sfv3SearchButton" class="sfv3-icon" type="button" aria-expanded="false" aria-label="查找对象" title="查找对象">⌕</button>',
      '<button id="sfv3Help" class="sfv3-icon" type="button" aria-label="帮助" title="帮助">ⓘ</button>',
      '<button id="sfv3Settings" class="sfv3-icon" type="button" aria-label="设置" title="设置">☷</button>',
      '<button id="sfv3More" class="sfv3-icon" type="button" aria-label="更多工具" title="更多工具">···</button>',
    '</header>',
    '<div class="sfv3-shell">',
      '<aside class="sfv3-rail" aria-label="工作台导航">',
        '<button id="sfv3Documents" type="button" aria-label="来源文档" title="来源文档">▱</button>',
        '<button id="sfv3Objects" type="button" aria-label="对象列表" title="对象列表">☷</button>',
        '<button id="sfv3RailSearch" type="button" aria-label="搜索" title="搜索">⌕</button>',
        '<button id="sfv3RailHelp" type="button" aria-label="帮助" title="帮助">ⓘ</button>',
      '</aside>',
      '<main class="sfv3-workspace">',
        '<div id="sfv3SearchArea" class="sfv3-search" hidden>',
          '<label for="sfv3Search">查找当前文档中的对象</label>',
          '<input id="sfv3Search" type="search" placeholder="轨道、语言、附件名称" autocomplete="off" />',
        '</div>',
        '<section id="sfv3Empty" class="sfv3-empty" aria-label="空白工作台" hidden>',
          '<div id="sfv3DropHost" class="sfv3-drop-host"></div>',
          '<small>MKV · 视频 · 字幕 · 字体</small>',
        '</section>',
        '<section id="sfv3Document" class="sfv3-document" hidden>',
          '<header class="sfv3-heading">',
            '<div class="sfv3-title"><div class="sfv3-title-line"><h1 id="sfv3DocumentTitle"></h1>',
            '<span id="sfv3DocumentBadge" class="sfv3-badge"></span></div>',
            '<p id="sfv3DocumentMeta"></p></div>',
            '<div id="sfv3Counts" class="sfv3-counts" aria-label="当前文档对象统计"></div>',
          '</header>',
          '<div class="sfv3-toolbar"><strong>☷　容器内容</strong><div class="sfv3-toolbar-right">',
            '<button id="sfv3Scan" type="button" aria-label="扫描当前来源" title="扫描当前来源">▤ 扫描</button><button id="sfv3ContextSearch" type="button" aria-label="搜索对象" title="搜索对象">⌕</button>',
            '<button id="sfv3Structure" type="button" aria-label="查看结构" title="查看结构">◉</button>',
            '<button id="sfv3CreateOutput" class="sfv3-secondary" type="button">＋ 创建拟输出</button>',
            '<button id="sfv3AddResource" class="sfv3-secondary" type="button" hidden>＋ 添加更多资源</button>',
          '</div></div>',
          '<div id="sfv3Sections" class="sfv3-sections" aria-label="按类型组织的真实对象"></div>',
          '<div id="sfv3Cross" class="sfv3-cross" hidden>',
            '<strong id="sfv3CrossHeading">跨来源字幕</strong>',
            '<p id="sfv3CrossMessage" role="status"></p>',
            '<div class="sfv3-cross-actions"><button id="sfv3CrossInspect" type="button">检查来源字幕</button>',
            '<button id="sfv3CrossCommit" type="button" disabled>确认加入字幕与字体</button>',
            '<button id="sfv3CrossCancel" type="button">取消</button></div>',
          '</div>',
          '<div id="sfv3Structures" class="sfv3-structures" aria-label="附件和结构的来源观察"></div>',
        '</section>',
      '</main>',
    '</div>',
    '<footer class="sfv3-status">',
      '<span id="sfv3Status" role="status" aria-live="polite">未载入来源</span>',
      '<span id="sfv3Safety">来源是事实 · 成品以真实审计为准</span>',
      '<button id="sfv3Run" class="sfv3-primary" type="button" disabled>⇩　封装 MKV</button>',
      '<button id="sfv3Download" type="button" hidden>下载已验证成品</button>',
    '</footer>',
    '<div id="sfv3Sheet" class="sfv3-sheet" hidden>',
      '<div class="sfv3-sheet-panel" role="dialog" aria-modal="false" aria-label="对象上下文检查器">',
        '<div class="sfv3-sheet-handle" aria-hidden="true"></div>',
        '<header class="sfv3-sheet-head"><strong id="sfv3SheetTitle"></strong>',
          '<button id="sfv3Preview" type="button">▷ 预览</button>',
          '<button id="sfv3Extract" type="button">⇩ 提取</button>',
          '<button id="sfv3Choose" type="button">＋ 加入到…</button>',
          '<button id="sfv3SheetClose" type="button" aria-label="关闭对象检查器">×</button></header>',
        '<div id="sfv3SheetHost" class="sfv3-sheet-body"></div>',
      '</div>',
    '</div>',
    '<div id="sfv3Destination" class="sfv3-destination" hidden>',
      '<div class="sfv3-destination-dialog" role="dialog" aria-modal="true" aria-labelledby="sfv3DestTitle">',
        '<div class="sfv3-destination-head"><strong id="sfv3DestTitle">加入到哪里？</strong>',
        '<button id="sfv3DestClose" type="button" aria-label="关闭目标选择">×</button></div>',
        '<p>选择实际来源作为拟输出基础。只有已验证的跨来源字幕导入能力可执行。</p>',
        '<div id="sfv3DestChoices"></div>',
      '</div>',
    '</div>'
  ].join('');
  host.appendChild(root);
  host.classList.add('sfv3-active');
  const q = id => byId(doc, id);
  const sheet = q('sfv3Sheet');
  const dest = q('sfv3Destination');
  const state = {
    view: 'source', outputVisible: false, intentSourceKey: '',
    activeSourceKey: '', selected: null, pendingCross: null, legacy: false,
    search: '', observed: { scanned: false, attachments: [], chapters: [], tags: [] },
  };

  // The live drop target retains all original drag/drop and click listeners.
  q('sfv3DropHost').appendChild(dropzone);

  const notify = message => { q('sfv3Status').textContent = message; };
  const closeDestination = () => {
    dest.hidden = true;
    q('sfv3Choose').focus({ preventScroll: true });
  };
  const closeSheet = ({ returnFocus = false } = {}) => {
    if (inspector.parentNode !== originalInspectorParent)
      originalInspectorParent.appendChild(inspector);
    sheet.hidden = true;
    if (returnFocus) q('sfv3Sections').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  };
  const openSheet = item => {
    state.selected = item;
    const selectedRow = findEntry(inventory, item.sourceKey);
    const original = [...(selectedRow?.querySelectorAll('.asset-tree-index-row [data-tree-select]') || [])]
      .find(b => b.dataset.treeSelect === item.kind + ':' + item.index);
    if (original) original.click();
    q('sfv3SheetTitle').textContent = item.title;
    q('sfv3SheetHost').appendChild(inspector);
    sheet.hidden = false;
    const available = item.kind === 'subtitle';
    q('sfv3Choose').hidden = !available;
    q('sfv3Preview').hidden = !available;
    q('sfv3Extract').hidden = !['video','audio','subtitle'].includes(item.kind);
    scheduleRender();
  };
  const sourceEntries = () => [...inventory.querySelectorAll('.asset-entry[data-kind="container"]')];
  const availableTargetEntries = excludedKey => sourceEntries().filter(row =>
    row.querySelector('[data-asset-source]')?.dataset.assetSource !== excludedKey);
  const selectSource = key => {
    const row = findEntry(inventory, key);
    const radio = row?.querySelector('[data-asset-source]');
    if (!radio || radio.disabled) { notify('当前来源不可切换；可能正在扫描或封装。'); return false; }
    if (!radio.checked) radio.click();
    state.view = 'source';
    scheduleRender();
    return true;
  };
  const setLegacy = visible => {
    if (visible) closeSheet();
    state.legacy = visible;
    host.classList.toggle('sfv3-legacy-open', visible);
    q('sfv3Return').hidden = !visible;
    if (!visible) scheduleRender();
  };

  const selectedSource = () => findEntry(inventory, sourceKey(inventory));
  const sourceObjects = entry => {
    if (!entry) return [];
    return [...entry.querySelectorAll('.asset-tree-index-row [data-tree-select]')].map(node => {
      const raw = String(node.dataset.treeSelect || '');
      const match = /^(video|audio|subtitle):(\d+)$/.exec(raw);
      if (!match) return null;
      return {
        kind: match[1], index: Number(match[2]),
        title: text(node.querySelector('.asset-tree-index-name')) || '未命名轨道',
        detail: text(node.querySelector('small')),
        sourceKey: entry.querySelector('[data-asset-source]')?.dataset.assetSource || '',
        original: node, status: node.closest('.asset-tree-index-row')?.dataset.change || ''
      };
    }).filter(Boolean);
  };
  const outputObjects = () => [...composition.querySelectorAll('.composition-row')].map(node => {
    const kind = text(node.querySelector('.composition-kind'));
    return {
      kind: kind.includes('视频') ? 'video' : kind.includes('音频') ? 'audio' :
        kind.includes('字幕') ? 'subtitle' : kind.includes('附件') || kind.includes('字体') ? 'attachment' : 'other',
      title: text(node.querySelector('.composition-track-main strong')) || kind || '待确认对象',
      detail: text(node.querySelector('.composition-track-main small')),
      status: text(node.querySelector('.composition-state')),
      original: node,
      selectable: Boolean(node.dataset.compositionId),
    };
  });

  const presentCount = (kind, count) => {
    const item = make(doc, 'div', 'sfv3-count');
    item.append(make(doc, 'strong', '', String(count).padStart(2, '0')));
    item.append(make(doc, 'small', '', {video:'视频',audio:'音频',subtitle:'字幕',attachment:'附件'}[kind] || kind));
    return item;
  };
  const buildGroup = (kind, label, items, isOutput) => {
    if (!items.length) return null;
    const section = make(doc, 'section', 'sfv3-group');
    const heading = make(doc, 'div', 'sfv3-group-title');
    heading.append(make(doc, 'strong', '', label), make(doc, 'small', '', String(items.length).padStart(2, '0')));
    section.append(heading);
    items.forEach(item => {
      const row = button(doc, '', { 'class': 'sfv3-object', 'aria-pressed': 'false' });
      if (state.search && !(item.title + ' ' + item.detail).toLocaleLowerCase().includes(state.search)) row.hidden = true;
      if (!isOutput && state.selected?.sourceKey === item.sourceKey &&
          state.selected?.kind === item.kind && state.selected?.index === item.index)
        row.setAttribute('aria-pressed', 'true');
      const glyph = make(doc, 'span', 'sfv3-glyph', {video:'▣',audio:'◀',subtitle:'▤',attachment:'◇'}[kind] || '◉');
      const main = make(doc, 'span', 'sfv3-object-main');
      main.append(make(doc, 'strong', '', item.title), make(doc, 'small', '', item.detail || '属性待核验'));
      row.append(glyph, main, make(doc, 'span', 'sfv3-object-status', item.status || (isOutput ? '拟输出' : '来源')), make(doc, 'span', 'sfv3-arrow', '›'));
      if (isOutput) {
        row.disabled = !item.selectable;
        row.addEventListener('click', () => {
          item.original.click();
          q('sfv3SheetTitle').textContent = item.title;
          q('sfv3SheetHost').appendChild(inspector);
          sheet.hidden = false;
          q('sfv3Choose').hidden = true;
          q('sfv3Preview').hidden = false;
          q('sfv3Extract').hidden = true;
        });
      } else row.addEventListener('click', () => openSheet(item));
      section.appendChild(row);
    });
    return section;
  };

  const renderCross = () => {
    const pending = state.pendingCross;
    const panel = q('sfv3Cross');
    panel.hidden = !pending || state.view !== 'output';
    if (!pending || panel.hidden) return;
    const row = findEntry(inventory, pending.fromKey);
    const inspected = row?.querySelector('.embedded-source-attachments[data-secondary-subtitles]');
    const add = [...(inspected?.querySelectorAll('[data-secondary-subtitle-add]') || [])]
      .find(b => Number(b.dataset.streamIndex) === pending.index);
    const targetActive = sourceKey(inventory) === pending.targetKey;
    const allowed = canCommitV3CrossSource({
      fromKey:pending.fromKey, targetKey:pending.targetKey, index:pending.index,
      sourcePresent:Boolean(row && row.querySelector('[data-asset-source]')?.dataset.assetSource === pending.fromKey),
      targetActive, eligible:Boolean(add && !add.disabled),
    });
    q('sfv3CrossHeading').textContent = pending.title + ' → ' + pending.targetName;
    q('sfv3CrossMessage').textContent = !targetActive ? '目标来源已改变，需重新选择目标。'
      : !inspected || inspected.dataset.state !== 'inspected'
      ? '请先调用现有来源字幕检查，确认真实轨道及字体依赖后才能加入。'
      : allowed ? '已通过当前后端的可用性检查。确认后将调用原有跨来源字幕与字体导入。'
      : '当前轨道不具备可执行的安全导入条件；请检查来源、字体或运行状态。';
    q('sfv3CrossCommit').disabled = !allowed;
    q('sfv3CrossInspect').disabled = !targetActive || !inspected?.querySelector('[data-secondary-subtitle-inspect]:not(:disabled)');
  };

  const render = () => {
    if (state.legacy) return;
    const entries = sourceEntries();
    const currentKey = sourceKey(inventory);
    if (state.activeSourceKey !== currentKey) {
      state.activeSourceKey = currentKey;
      state.selected = null;
      closeSheet();
      if (state.outputVisible && state.intentSourceKey !== currentKey) {
        state.outputVisible = false;
        state.view = 'source';
      }
    }
    const tabs = q('sfv3Tabs');
    tabs.replaceChildren();
    entries.forEach(entry => {
      const key = entry.querySelector('[data-asset-source]')?.dataset.assetSource || '';
      const label = text(entry.querySelector('.asset-entry-name'));
      const active = state.view === 'source' && key === currentKey;
      const tab = button(doc, '▯　' + label, {'class':'sfv3-tab','aria-current':active?'page':'false','title':'查看来源 '+label});
      tab.addEventListener('click', () => selectSource(key));
      tabs.append(tab);
    });
    if (state.outputVisible) {
      const name = text(q('outputName')) || '拟输出 MKV';
      const outputTab = button(doc, '⇩　' + name, {'class':'sfv3-tab sfv3-tab-output','aria-current':state.view==='output'?'page':'false'});
      outputTab.addEventListener('click', () => { state.view = 'output'; closeSheet(); scheduleRender(); });
      tabs.append(outputTab);
    }
    const empty = !entries.length;
    q('sfv3Empty').hidden = !empty;
    q('sfv3Document').hidden = empty;
    if (empty) {
      q('sfv3Run').disabled = true;
      q('sfv3Status').textContent = '未载入来源';
      q('sfv3Download').hidden = true;
      return;
    }
    const isOutput = state.view === 'output' && state.outputVisible;
    const activeEntry = selectedSource();
    const items = isOutput ? outputObjects() : sourceObjects(activeEntry);
    const groups = groupV3Objects(items.map((item,index) => ({...item,index:isOutput?index:item.index})));
    const counts = ['video','audio','subtitle','attachment'].map(kind => [kind, isOutput ?
      items.filter(item=>item.kind===kind).length :
      kind==='attachment' ? state.observed.attachments?.length || 0 : groups[kind].length]);
    const currentName = isOutput ? text(q('outputName')) || '拟输出 MKV' :
      text(activeEntry?.querySelector('.asset-entry-name')) || '请选择来源';
    q('sfv3DocumentTitle').textContent = currentName;
    q('sfv3DocumentBadge').textContent = isOutput ? '拟输出' : '来源';
    q('sfv3DocumentBadge').dataset.type = isOutput ? 'output' : 'source';
    q('sfv3DocumentMeta').textContent = isOutput
      ? ('基于当前来源 · ' + (text(q('compositionCount')) || '输出对象待核验') + ' · 待执行与独立成品审计')
      : (activeEntry ? text(activeEntry.querySelector('.asset-entry-type')) + ' · ' +
          (text(activeEntry.querySelector('.asset-entry-desc')) || '内部结构待核验') : '请先选择当前来源');
    q('sfv3Counts').replaceChildren(...counts.map(([kind,count]) => presentCount(kind,count)));
    q('sfv3CreateOutput').hidden = isOutput;
    q('sfv3AddResource').hidden = !isOutput;
    const list = q('sfv3Sections');
    list.replaceChildren();
    for (const [kind,label] of V3_SOURCE_GROUPS) {
      const group = buildGroup(kind,label,groups[kind],isOutput);
      if (group) list.append(group);
    }
    if (isOutput) {
      const addOns = items.filter(item => item.kind==='attachment' || item.kind==='other');
      const extra = buildGroup('attachment','附件与其他',addOns,true);
      if (extra) list.append(extra);
    }
    if (!list.children.length) list.append(make(doc,'p','sfv3-pending',isOutput
      ? '当前执行计划尚无可显示的真实对象。' :
        '尚无经当前来源扫描确认的轨道。请使用右上角“更多工具”打开扫描和来源检查。'));
    const structures = q('sfv3Structures');
    structures.replaceChildren();
    for (const [kind,label] of [['attachments','字体与附件'],['chapters','章节'],['tags','标签']]) {
      const rows = state.observed[kind] || [];
      const observed = Boolean(state.observed.scanned);
      const caption = observed ? String(rows.length) : '待观察';
      const el = button(doc,'',{'class':'sfv3-structure','title':observed?'来源观察；不等于任意结构的写入许可':'未取得当前来源的扫描证据'});
      el.append(make(doc,'span','','◇　'+label),make(doc,'small','',caption),make(doc,'span','','›'));
      el.addEventListener('click', () => {
        setLegacy(true);
        const control = host.querySelector('[data-sf-section="'+kind+'"]');
        control?.click();
        host.querySelector('#sf14SectionItems')?.scrollIntoView({block:'nearest'});
      });
      structures.append(el);
    }
    if (isOutput) {
      const changes = text(q('compositionChanges'));
      const issues = text(q('compositionIssues'));
      q('sfv3Status').textContent = issues || changes || '拟输出已展示 · 尚未执行';
      q('sfv3Safety').textContent = text(q('preservationReadinessTitle')) || '成品以真实审计为准';
    } else {
      q('sfv3Status').textContent = currentKey
        ? (state.observed.scanned?'已观察当前来源 · 未创建新的输出文件':'已选择来源 · 部分对象尚待核验')
        : '请选定一个来源容器';
      q('sfv3Safety').textContent = '来源是事实 · 尚未生成新成品';
    }
    const realRun = q('muxBtn');
    q('sfv3Run').disabled = !isOutput || !realRun || realRun.disabled;
    const realDownload = q('downloadLink');
    q('sfv3Download').hidden = !isOutput || !realDownload || realDownload.hidden ||
      !realDownload.getAttribute('href');
    renderCross();
  };
  let scheduled = false;
  const scheduleRender = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; render(); });
  };
  const openDestination = () => {
    const selected = state.selected;
    if (!selected || selected.kind !== 'subtitle') return;
    const choices = q('sfv3DestChoices');
    choices.replaceChildren();
    const targets = availableTargetEntries(selected.sourceKey);
    if (!targets.length) {
      choices.append(make(doc,'p','sfv3-pending','没有其他已导入来源。请先添加目标 MKV；不会凭空生成可写目标。'));
    }
    targets.forEach(entry => {
      const targetKey = entry.querySelector('[data-asset-source]')?.dataset.assetSource || '';
      const targetName = text(entry.querySelector('.asset-entry-name'));
      const choice = button(doc,'以 '+targetName+' 为基础',{'class':'sfv3-destination-choice'});
      choice.addEventListener('click', () => {
        const pending = {
          fromKey:selected.sourceKey, index:selected.index, title:selected.title,
          targetKey,targetName
        };
        if (!selectSource(targetKey)) return;
        state.pendingCross = pending;
        state.intentSourceKey = targetKey;
        state.outputVisible = true;
        state.view = 'output';
        closeDestination();
        closeSheet();
        scheduleRender();
      });
      choices.append(choice);
    });
    const unavailable = button(doc,'新建无来源的空 MKV · 此操作未获得后端能力许可',{'class':'sfv3-destination-choice','disabled':'true'});
    choices.append(unavailable);
    dest.hidden = false;
    q('sfv3DestClose').focus({preventScroll:true});
  };

  q('sfv3Add').addEventListener('click', () => q('unifiedAssetInput')?.click());
  q('sfv3AddResource').addEventListener('click', () => q('unifiedAssetInput')?.click());
  q('sfv3Documents').addEventListener('click', () => {state.view='source';scheduleRender();});
  q('sfv3Objects').addEventListener('click', () => q('sfv3Sections').scrollIntoView({block:'start'}));
  const toggleSearch = () => {
    const area = q('sfv3SearchArea');
    area.hidden = !area.hidden;
    q('sfv3SearchButton').setAttribute('aria-expanded',String(!area.hidden));
    if (!area.hidden) q('sfv3Search').focus();
  };
  for (const id of ['sfv3SearchButton','sfv3RailSearch','sfv3ContextSearch'])
    q(id).addEventListener('click',toggleSearch);
  q('sfv3Search').addEventListener('input', event => {
    state.search = event.target.value.trim().toLocaleLowerCase();scheduleRender();
  });
  for (const id of ['sfv3Help','sfv3RailHelp'])
    q(id).addEventListener('click', () => q('sf14Help')?.click());
  q('sfv3Settings').addEventListener('click', () => q('sf14Settings')?.click());
  q('sfv3More').addEventListener('click', () => setLegacy(true));
  q('sfv3Return').addEventListener('click', () => setLegacy(false));
  q('sfv3Structure').addEventListener('click', () => setLegacy(true));
  q('sfv3Scan').addEventListener('click', () => {
    const real = q('scanTracksBtn');
    if (real && !real.disabled) real.click();
    else notify('当前不可扫描来源；请检查来源选择及后端状态。');
  });

  q('sfv3CreateOutput').addEventListener('click', () => {
    const key=sourceKey(inventory);
    if (!key) {notify('请先选定真实的来源容器。');return;}
    state.intentSourceKey=key;
    state.outputVisible=true;
    state.view='output';
    closeSheet();scheduleRender();
  });
  q('sfv3Run').addEventListener('click', () => {
    const real=q('muxBtn');
    if (!state.outputVisible || state.view!=='output' || !real || real.disabled ||
        sourceKey(inventory)!==state.intentSourceKey) {
      notify('执行条件或来源身份已经改变；请重新检查拟输出。');return;
    }
    real.click();
    scheduleRender();
  });
  q('sfv3Download').addEventListener('click', () => {
    const link=q('downloadLink');
    if (link && !link.hidden && link.getAttribute('href')) link.click();
  });
  q('sfv3SheetClose').addEventListener('click', () => closeSheet({returnFocus:true}));
  q('sfv3Preview').addEventListener('click', () => {
    const real=q('previewRefreshBtn');
    if (real && !real.disabled) {
      q('sf14PreviewDrawer').open = true;
      real.click();
    } else notify('当前字幕尚不可预览；请检查扫描状态与预览能力。');
  });
  q('sfv3Extract').addEventListener('click', () => {
    const item=state.selected;
    if (!item) return;
    const target=[...doc.querySelectorAll('[data-extract-original-track-index]')]
      .find(el => Number(el.dataset.extractOriginalTrackIndex)===item.index && !el.disabled);
    if (target) target.click();
    else notify('当前来源未提供可执行的原轨道提取控件。');
  });
  q('sfv3Choose').addEventListener('click',openDestination);
  q('sfv3DestClose').addEventListener('click',closeDestination);
  q('sfv3CrossCancel').addEventListener('click', () => {
    state.pendingCross=null;scheduleRender();
  });
  q('sfv3CrossInspect').addEventListener('click', () => {
    const pending=state.pendingCross;
    if (!pending || sourceKey(inventory)!==pending.targetKey) return;
    const row=findEntry(inventory,pending.fromKey);
    const inspect=row?.querySelector('[data-secondary-subtitle-inspect]');
    if (inspect && !inspect.disabled) inspect.click();
    else notify('当前来源的内封字幕检查不可执行。');
    scheduleRender();
  });
  q('sfv3CrossCommit').addEventListener('click', () => {
    const pending=state.pendingCross;
    if (!pending) return;
    const row=findEntry(inventory,pending.fromKey);
    const add=[...(row?.querySelectorAll('[data-secondary-subtitle-add]')||[])]
      .find(control=>Number(control.dataset.streamIndex)===pending.index);
    const allowed=canCommitV3CrossSource({
      fromKey:pending.fromKey,targetKey:pending.targetKey,index:pending.index,
      sourcePresent:Boolean(row),targetActive:sourceKey(inventory)===pending.targetKey,
      eligible:Boolean(add && !add.disabled)
    });
    if (!allowed) {notify('来源或字幕校验状态已改变，没有执行导入。');scheduleRender();return;}
    add.click(); // authoritative cross-source FFmpeg extraction + font checks
    state.pendingCross=null;
    notify('已交由现有字幕导入处理器；成败以其实际结果和拟输出回读为准。');
    scheduleRender();
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!dest.hidden) {closeDestination();event.preventDefault();}
    else if (!sheet.hidden) {closeSheet({returnFocus:true});event.preventDefault();}
    else if (state.legacy) {setLegacy(false);event.preventDefault();}
  });
  host.addEventListener('softmux:source-sections-updated', event => {
    if (event.detail && typeof event.detail==='object') {
      state.observed=event.detail;
      scheduleRender();
    }
  });
  const Observer=doc.defaultView?.MutationObserver;
  if (Observer) {
    const observer=new Observer(scheduleRender);
    observer.observe(inventory,{subtree:true,childList:true,attributes:true,
      attributeFilter:['checked','disabled','aria-pressed','data-focused']});
    observer.observe(composition,{subtree:true,childList:true});
    for (const id of ['muxBtn','downloadLink','outputName','compositionCount','compositionIssues','compositionChanges']) {
      const node=q(id);
      if (node) observer.observe(node,{attributes:true,childList:true,characterData:true,subtree:true,
        attributeFilter:['disabled','hidden','href']});
    }
    // Deliberately do not observe sfv3Root; a render may never self-schedule.
  }
  q('unifiedAssetInput')?.addEventListener('change',scheduleRender);
  q('unifiedFolderInput')?.addEventListener('change',scheduleRender);
  q('sfv3Empty').hidden=false;
  render();
  return true;
}
