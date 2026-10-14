// 软封10.14版本: one object-centred presentation over existing production DOM.
// Rehosting (appendChild), never cloning: all File inputs, data owners and handlers
// keep their exact identity. This module owns layout only, not media mutations.
export const SOFTMUX_1014_UI_VERSION = '软封10.14版本';
const get = (doc, id) => doc.getElementById(id);

export function mountSoftmux1014Workbench(doc = document) {
  const workspace = doc.querySelector('.workspace');
  if (!workspace || workspace.querySelector('#sf14Root')) return false;
  const source = workspace.querySelector('.stage-input');
  const inspector = workspace.querySelector('.editor-column');
  const output = workspace.querySelector('.output-hub');
  const batch = workspace.querySelector('.stage-batch');
  const composition = get(doc, 'outputCompositionPanel');
  // Do not remove or duplicate any legacy execution/permission holder.
  if (![source, inspector, output, batch, composition, get(doc,'muxBtn'),
    get(doc,'compositionTracks'), get(doc,'batchPlan')].every(Boolean)) return false;

  const root = doc.createElement('div');
  root.id = 'sf14Root';
  root.className = 'sf14';
  root.dataset.view = 'single';
  root.dataset.density = 'compact';
  root.innerHTML = [
    '<header class="sf14-header">',
      '<div class="sf14-identity"><span class="sf14-mark" aria-hidden="true">SF</span>',
      '<div><strong></strong><span>本地 Matroska 工作台</span></div></div>',
      '<nav class="sf14-nav" aria-label="工作台导航">',
        '<button type="button" data-sf-view="single" aria-current="page">单工程</button>',
        '<button type="button" data-sf-view="batch">批量任务</button>',
        '<button type="button" data-sf-view="tools">容器工具</button>',
      '</nav>',
      '<div class="sf14-header-actions">',
        '<button type="button" id="sf14Add">＋ 添加资源</button>',
        '<button type="button" id="sf14Help">帮助</button>',
        '<button type="button" id="sf14Settings">设置</button>',
      '</div>',
    '</header>',
    '<div class="sf14-mobile-focus" id="sf14MobileFocus" aria-label="窄屏工作区焦点">',
      '<button type="button" data-sf-focus="source">来源</button>',
      '<button type="button" data-sf-focus="composition">拟输出</button>',
      '<button type="button" data-sf-focus="inspector">对象</button>',
    '</div>',
    '<div class="sf14-single" id="sf14Single">',
      '<section class="sf14-pane sf14-source" aria-label="来源资源">',
        '<header class="sf14-pane-head"><strong>来源资源</strong><span>只读身份 / 来源操作</span></header>',
        '<div id="sf14Source" class="sf14-pane-body"></div></section>',
      '<section class="sf14-pane sf14-composition" aria-label="拟输出 Matroska">',
        '<header class="sf14-pane-head"><strong>拟输出 MKV</strong><span>轨道 · 附件 · 章节 · 标签</span></header>',
        '<div id="sf14Composition" class="sf14-pane-body">',
          '<p class="sf14-empty" id="sf14CompositionEmpty">添加资源后，在此检查将要生成的 Matroska 容器。来源列表不会成为第二个编辑器。</p>',
        '</div></section>',
      '<section class="sf14-pane sf14-inspector" aria-label="选中对象检查器">',
        '<header class="sf14-pane-head"><strong>当前对象</strong><span>属性 · 字幕预览 · 证据</span></header>',
        '<div id="sf14Inspector" class="sf14-pane-body"></div></section>',
    '</div>',
    '<section class="sf14-output" aria-label="执行、检查与成品">',
      '<div class="sf14-output-head"><strong>交付与验证</strong><span>实际封装、独立回读与保存分别记录</span></div>',
      '<div id="sf14Output"></div></section>',
    '<section class="sf14-batch sf14-page" id="sf14Batch" aria-label="批量输出任务矩阵" hidden>',
      '<p class="sf14-batch-note">每行对应一个独立拟输出 MKV；配对歧义和保存失败应由真实任务状态决定。</p></section>',
    '<section class="sf14-tools sf14-page" id="sf14Tools" aria-label="专业容器工具" hidden>',
      '<header><strong>专业容器工具</strong><p>复用现有受限检查、提取与写入工具。界面存在不代表任意 Matroska 可无损改写。</p></header>',
      '<div id="sf14ToolList" class="sf14-tool-list"></div></section>',
    '<dialog id="sf14HelpDialog" class="sf14-dialog" aria-label="软封帮助">',
      '<h2>帮助与验证边界</h2>',
      '<p>来源是事实；拟输出容器是编辑对象；成品结果来自实际文件审计。不得把“封装成功”等同于保留完整 EBML 或播放器兼容。</p>',
      '<p>单工程选择目标对象进行编辑；批量以独立冻结任务为单位。复杂容器附件操作只在原有严格能力预检通过时执行。</p>',
      '<form method="dialog"><button>关闭</button></form></dialog>',
    '<dialog id="sf14SettingsDialog" class="sf14-dialog" aria-label="界面设置">',
      '<h2>界面设置</h2><p>仅改变本次页面的视觉密度，不改变容器、批量配方或媒体文件。</p>',
      '<div class="sf14-density"><button type="button" data-sf-density="compact" aria-pressed="true">紧凑</button>',
      '<button type="button" data-sf-density="comfortable" aria-pressed="false">舒展</button></div>',
      '<form method="dialog"><button>关闭</button></form></dialog>',
    '<footer class="sf14-version-note"></footer>'
  ].join('');

  root.querySelector('.sf14-identity strong').textContent = SOFTMUX_1014_UI_VERSION;
  root.querySelector('.sf14-version-note').textContent =
    SOFTMUX_1014_UI_VERSION + ' · 候选 UI / 真实功能以当前执行后端和审计为准 · 原始来源不会被此布局操作修改';

  // Rehost actual production DOM nodes, preserving listeners, File grants,
  // track editing state, stable IDs, preview and audit/queue lifecycle.
  workspace.appendChild(root);
  get(doc,'sf14Source').appendChild(source);
  get(doc,'sf14Composition').appendChild(composition);
  get(doc,'sf14Inspector').appendChild(inspector);
  get(doc,'sf14Output').appendChild(output);
  // Present the REAL finished-file evidence within object context, not a
  // hidden parallel badge or a fabricated success state.
  const finishedEvidence = get(doc,'outputEvidencePanel');
  if (finishedEvidence) get(doc,'sf14Inspector').appendChild(finishedEvidence);
  get(doc,'sf14Batch').appendChild(batch);
  const tools = get(doc,'sf14ToolList');
  for (const detail of [...source.querySelectorAll('.unified-intake > details')]) {
    if (detail.id !== 'sourceFilesDetails') tools.appendChild(detail);
  }
  const sourceDetails = get(doc,'sourceFilesDetails');
  if (sourceDetails) sourceDetails.open = true;

  const nav = doc.querySelector('.workbench-jump-nav');
  if (nav) nav.hidden = true;
  workspace.classList.add('sf14-mounted');
  doc.body.classList.add('sf14-app');
  const single = get(doc,'sf14Single');
  const setFocus = (focus) => {
    if (!['source','composition','inspector'].includes(focus)) return;
    single.dataset.focus = focus;
    for (const button of root.querySelectorAll('[data-sf-focus]')) {
      if (button.dataset.sfFocus === focus) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  };
  for (const button of root.querySelectorAll('[data-sf-focus]'))
    button.addEventListener('click', () => setFocus(button.dataset.sfFocus));
  setFocus('source');
  composition.addEventListener('click', () => {
    if (doc.defaultView?.matchMedia?.('(max-width: 680px)').matches) setFocus('inspector');
  });

  const changeView = (view) => {
    if (!['single','batch','tools'].includes(view)) return;
    root.dataset.view = view;
    single.hidden = view !== 'single';
    get(doc,'sf14MobileFocus').hidden = view !== 'single';
    root.querySelector('.sf14-output').hidden = view !== 'single';
    get(doc,'sf14Batch').hidden = view !== 'batch';
    get(doc,'sf14Tools').hidden = view !== 'tools';
    for (const button of root.querySelectorAll('[data-sf-view]')) {
      if (button.dataset.sfView === view) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if (view === 'batch') {
      const drawer = batch.querySelector('.batch-drawer');
      if (drawer) drawer.open = true;
    }
    if (view === 'single') get(doc,'sf14CompositionEmpty').hidden = !composition.hidden;
  };
  for (const button of root.querySelectorAll('[data-sf-view]'))
    button.addEventListener('click', () => changeView(button.dataset.sfView));
  get(doc,'sf14Add').addEventListener('click', () => get(doc,'unifiedAssetInput')?.click());
  get(doc,'sf14Help').addEventListener('click', () => get(doc,'sf14HelpDialog')?.showModal());
  get(doc,'sf14Settings').addEventListener('click', () => get(doc,'sf14SettingsDialog')?.showModal());
  for (const button of root.querySelectorAll('[data-sf-density]')) {
    button.addEventListener('click', () => {
      root.dataset.density = button.dataset.sfDensity;
      for (const peer of root.querySelectorAll('[data-sf-density]'))
        peer.setAttribute('aria-pressed', String(peer === button));
    });
  }
  // Observation only: track the real composition panel's hidden attribute.
  // Never compute, cache or mutate a second authoritative object list.
  const empty = get(doc,'sf14CompositionEmpty');
  const observer = new MutationObserver(() => { empty.hidden = !composition.hidden; });
  observer.observe(composition, { attributes:true, attributeFilter:['hidden'] });
  empty.hidden = !composition.hidden;
  changeView('single');
  return true;
}
