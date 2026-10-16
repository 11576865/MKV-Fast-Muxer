import { PRODUCT_LABEL } from './product-version.js';
// 软封现行产品版本: object-centred presentation over existing production DOM.
// Historical sf14 DOM ids and module names are retained for compatibility.
// Rehosting (appendChild), never cloning: all File inputs, data owners and handlers
// keep their exact identity. This module owns layout only, not media mutations.
export const SOFTMUX_1014_UI_VERSION = PRODUCT_LABEL;
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
        '<button type="button" id="sf14SourceToggle" aria-expanded="false">来源</button>',
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
        '<header class="sf14-pane-head"><strong>来源资源</strong><span>来源身份与内容</span></header>',
        '<div id="sf14Source" class="sf14-pane-body"></div></section>',
      '<section class="sf14-pane sf14-composition" aria-label="拟输出 Matroska">',
        '<header class="sf14-pane-head"><strong>拟输出 MKV</strong><span>输出结构与变更计划</span></header>',
        '<div id="sf14Composition" class="sf14-pane-body">',
          '<nav id="sf14ObjectTabs" class="sf14-object-tabs" aria-label="拟输出对象分类" role="tablist">',
            '<button type="button" role="tab" data-sf-section="tracks" aria-selected="true">轨道</button>',
            '<button type="button" role="tab" data-sf-section="attachments" aria-selected="false">附件</button>',
            '<button type="button" role="tab" data-sf-section="chapters" aria-selected="false">章节</button>',
            '<button type="button" role="tab" data-sf-section="tags" aria-selected="false">标签</button>',
          '</nav>',
          '<section class="sf14-section-notice" id="sf14SectionNotice" role="tabpanel" hidden>',
            '<div class="sf14-section-icon" aria-hidden="true">↗</div>',
            '<h3 id="sf14SectionTitle"></h3>',
            '<p id="sf14SectionText"></p>',
          '<div id="sf14SectionItems" class="sf14-section-items" role="list" aria-label="实际来源扫描对象"></div>',
            '<div class="sf14-section-actions">',
              '<button id="sf14SectionEvidence" type="button">查看现有来源证据</button>',
              '<button id="sf14SectionTracks" type="button">返回轨道工作区</button>',
            '</div>',
            '<small>此入口已保留。当前真实读写能力由原有工作台与执行前验证决定，不会伪造容器修改。</small>',
          '</section>',
          '<p class="sf14-empty" id="sf14CompositionEmpty">添加资源后，在此检查将要生成的 Matroska 容器。来源列表不会成为第二个编辑器。</p>',
        '</div></section>',
      '<section class="sf14-pane sf14-inspector" aria-label="选中对象检查器">',
        '<header class="sf14-pane-head"><strong>对象检查器</strong><span>检查与编辑</span><button id="sf14BackToComposition" type="button">返回拟输出</button></header>',
        '<div id="sf14Inspector" class="sf14-pane-body"></div></section>',
    '</div>',
    '<section class="sf14-output" aria-label="执行、检查与成品">',
      '<div class="sf14-output-head"><strong>交付与验证</strong><span>计划 → 封装 → 审计 → 保存</span></div>',
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
    SOFTMUX_1014_UI_VERSION + ' · 本地处理 · 功能可用性以执行与审计结果为准 · 未实现入口均有明确状态说明';

  // Rehost actual production DOM nodes, preserving listeners, File grants,
  // track editing state, stable IDs, preview and audit/queue lifecycle.
  workspace.appendChild(root);
  get(doc,'sf14Source').appendChild(source);
  get(doc,'sf14Composition').appendChild(composition);
  get(doc,'sf14Inspector').appendChild(inspector);
  get(doc,'sf14Output').appendChild(output);
  // The plan is still the original, live output plan. Its detailed controls
  // are available from a compact tablet disclosure instead of competing with
  // the active mux, cancellation and save actions in the permanent bottom bar.
  const outputPlan = output.querySelector('.plan-panel');
  // 'output' is already the .output-hub element rehosted above.
  const outputHub = output;
  if (outputPlan && outputHub) {
    outputPlan.id = outputPlan.id || 'sf14OutputPlan';
    const planButton = doc.createElement('button');
    planButton.id = 'sf14PlanToggle';
    planButton.type = 'button';
    planButton.textContent = '检查与计划';
    planButton.setAttribute('aria-controls', outputPlan.id);
    planButton.setAttribute('aria-expanded', 'false');
    outputHub.insertBefore(planButton, outputPlan);
    const outputBar = root.querySelector('.sf14-output');
    const closePlan = () => {
      outputBar.dataset.planOpen = 'false';
      planButton.setAttribute('aria-expanded','false');
    };
    planButton.addEventListener('click', () => {
      const opened = outputBar.dataset.planOpen !== 'true';
      outputBar.dataset.planOpen = String(opened);
      planButton.setAttribute('aria-expanded', String(opened));
    });
    planButton.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closePlan(); planButton.focus(); }
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && outputBar.dataset.planOpen === 'true') {
        closePlan();
        planButton.focus();
      }
    });
    outputBar.dataset.planOpen = 'false';
  }
  // Present the REAL finished-file evidence within object context, not a
  // hidden parallel badge or a fabricated success state.
  const finishedEvidence = get(doc,'outputEvidencePanel');
  if (finishedEvidence) get(doc,'sf14Inspector').appendChild(finishedEvidence);
  get(doc,'sf14Batch').appendChild(batch);
  // Tablet batch view: the EXISTING job matrix is the primary workspace.
  // Present source intake and recipe as optional drawers, reusing the same
  // input nodes, recipe controls, queue, inspectors and execution handlers.
  const batchPanel = get(doc,'sf14Batch');
  const batchInputs = batch.querySelector('.batch-inputs');
  const batchSettings = batch.querySelector('.batch-settings');
  if (batchInputs && batchSettings) {
    batchInputs.id = 'sf14BatchSources';
    batchSettings.id = 'sf14BatchRecipe';
    const controls = doc.createElement('div');
    controls.className = 'sf14-batch-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '批量资源与配方');
    controls.innerHTML =
      '<button type="button" data-sf-batch-controls="sources" aria-controls="sf14BatchSources" aria-expanded="false">＋ 批量资源</button>' +
      '<button type="button" data-sf-batch-controls="recipe" aria-controls="sf14BatchRecipe" aria-expanded="false">配方与输出设置</button>';
    batch.querySelector('.batch-head')?.after(controls);
    const setBatchControls = (requested) => {
      const next = batchPanel.dataset.controls === requested ? '' : requested;
      batchPanel.dataset.controls = next;
      for (const button of controls.querySelectorAll('button')) {
        button.setAttribute('aria-expanded', String(button.dataset.sfBatchControls === next));
      }
    };
    for (const button of controls.querySelectorAll('button')) {
      button.addEventListener('click', () => setBatchControls(button.dataset.sfBatchControls));
    }
    batchPanel.dataset.controls = '';
  }
  const tools = get(doc,'sf14ToolList');
  for (const detail of [...source.querySelectorAll('.unified-intake > details')]) {
    if (detail.id !== 'sourceFilesDetails') tools.appendChild(detail);
  }
  // The inspection/extraction task is not eleven separate backend destinations.
  // Rehost each real, already-wired tool exactly once. Technical writers stay
  // available in a clearly scoped advanced disclosure, never silently enabled.
  const toolGroups = [
    { title:'检查与提取', id:'sf14ToolInspect',
      ids:['attachmentExtractionDetails','existingAttachmentImpactDetails'] },
    { title:'受限容器修改', id:'sf14ToolModify',
      ids:['existingMkvRoutedEditDetails','p2MetadataInlineDetails'] },
  ];
  for (const spec of toolGroups) {
    const section = doc.createElement('section');
    section.id = spec.id;
    section.className = 'sf14-tool-group';
    const title = doc.createElement('h3');
    title.textContent = spec.title;
    section.appendChild(title);
    for (const id of spec.ids) {
      const detail = get(doc,id);
      if (detail && detail.parentElement === tools) section.appendChild(detail);
    }
    tools.appendChild(section);
  }
  const advanced = doc.createElement('details');
  advanced.id = 'sf14ToolAdvanced';
  advanced.className = 'sf14-tool-advanced';
  const advancedSummary = doc.createElement('summary');
  advancedSummary.textContent = '高级结构与实验性修改（需符合当前能力限制）';
  advanced.appendChild(advancedSummary);
  const advancedBody = doc.createElement('div');
  advancedBody.className = 'sf14-tool-advanced-body';
  for (const detail of [...tools.children]) {
    if (detail.tagName === 'DETAILS') advancedBody.appendChild(detail);
  }
  advanced.appendChild(advancedBody);
  tools.appendChild(advanced);
  const sourceDetails = get(doc,'sourceFilesDetails');
  if (sourceDetails) {
    // Source identity belongs in the visible source pane, not a silently
    // re-collapsed legacy disclosure after content reclassification.
    sourceDetails.open = true;
    sourceDetails.dataset.userToggled = 'true';
  }

  // Progressive disclosure of recovery workflows, not an always-visible
  // form that outranks the prospective MKV objects themselves.
  const recovery = doc.createElement('details');
  recovery.id = 'sf14Recovery';
  recovery.className = 'sf14-recovery';
  const recoverySummary = doc.createElement('summary');
  recoverySummary.textContent = '工程草稿 · 核验与恢复';
  recovery.appendChild(recoverySummary);
  const recoveryNodes = [
    '.composition-header-tools',
    '.container-project-intent-review:not([id])',
    '#containerProjectImportReview', '#containerProjectIntentReview',
    '#containerProjectConflictReview', '#containerProjectVerifySourceBtn',
    '#containerProjectHashActions', '#containerProjectRestorePanel',
  ];
  for (const selector of recoveryNodes) {
    const node = composition.querySelector(selector);
    if (node) recovery.appendChild(node);
  }
  composition.insertBefore(recovery,composition.querySelector('.composition-actions'));
  for (const id of ['containerProjectImportInput','externalCheckpointImportInput']) {
    get(doc,id)?.addEventListener('change', () => { recovery.open = true; });
  }

  const preview = inspector.querySelector('.subtitle-preview-card');
  const editor = inspector.querySelector('.editor-grid');
   const createDrawer = (id, title, child) => {
    if (!child) return null;
    const detail = doc.createElement('details');
    detail.id = id;
    detail.className = 'sf14-inspector-drawer';
    const summary = doc.createElement('summary');
    summary.textContent = title;
    detail.appendChild(summary);
    child.before(detail);
    detail.appendChild(child);
    return detail;
  };
  const previewDrawer = createDrawer('sf14PreviewDrawer','字幕预览 · 按需生成',preview);
  const optionsDrawer = createDrawer('sf14OptionsDrawer','轨道、音频与字体选项',editor);
  get(doc,'previewImage')?.addEventListener('load', () => {
    if (previewDrawer) previewDrawer.open = true;
  });

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
  get(doc,'sf14BackToComposition')?.addEventListener('click', () => setFocus('composition'));

  // Permanent product entry points: preserve identity even where a dedicated
  // output editor has not yet passed the production capability gate.
  // Read-only source observation. The writer and legacy owner remain unique.
  // This snapshot is replaced whenever main renders from the exact scanned File.
  let observedSections = { scanned:false, attachments:[], chapters:[], tags:[] };
  let selectedObservedId = '';
  const sectionItems = get(doc,'sf14SectionItems');
  const sectionSelection = doc.createElement('section');
  sectionSelection.id = 'sf14SectionSelection';
  sectionSelection.className = 'sf14-section-selection';
  sectionSelection.setAttribute('aria-label','当前来源对象详情');
  sectionSelection.hidden = true;
  sectionItems.after(sectionSelection);
  const sectionContent = {
    attachments: {
      title: '附件 · 来源观察',
      body: '列表来自当前已核验的来源扫描。来源附件可在原有对象检查器中按后端支持范围编辑；独立的拟输出附件编排尚未完全接入。'
    },
    chapters: {
      title: '章节 · 来源观察',
      body: '仅展示 ffprobe 返回的扁平章节与时间信息；这不是完整嵌套 EBML 树或安全章节重写的证明。后端未实现的修改保持受限。'
    },
    tags: {
      title: '标签 · 来源观察',
      body: '仅展示 ffprobe 格式层可观察的全局标签；不等同完整 Matroska TagTargets 或 UID 关联，未验证关联不允许修改。'
    }
  };
  const renderSectionSelection = (section, rows) => {
    sectionSelection.replaceChildren();
    const item = rows.find(row => row.id === selectedObservedId);
    sectionSelection.hidden = !item || section === 'tracks';
    if (!item) return;
    const heading = doc.createElement('strong');
    heading.textContent = item.title;
    const detail = doc.createElement('p');
    detail.textContent = item.detail;
    const evidence = doc.createElement('small');
    evidence.textContent = {
      'ffprobe-stream': '来源 ffprobe 轨道证据；仅在后端明确支持时修改',
      'ffprobe-flat-chapter': '扁平章节观察；不具备嵌套章节/UID 安全写入证据',
      'ffprobe-format-tags': '格式层标签观察；不是 Matroska TagTargets 修改许可',
    }[item.evidence] || '来源证据范围未知；禁止修改';
    sectionSelection.append(heading,detail,evidence);
    const lifecycle = doc.createElement('small');
    lifecycle.className = 'sf14-source-draft-evidence';
    lifecycle.textContent = section === 'attachments'
      ? '此处显示工程草稿意图；实际 MKV 附件结果须以封装后的独立审计为准。'
      : '此处仅显示已观察的源数据，不代表具备安全写入能力。';
    sectionSelection.appendChild(lifecycle);
    if (section === 'attachments' && observedSections.deliveryStale) {
      const stale = doc.createElement('small');
      stale.className = 'sf14-source-delivery-stale';
      stale.textContent = '之前生成过成品，但当前来源或草稿计划已变化；旧成品审计不适用于这个附件。';
      sectionSelection.appendChild(stale);
    }
    if (section === 'attachments' && Number.isSafeInteger(item.sourceIndex)) {
      const delivered = observedSections.deliveryEvidence?.find(entry =>
        entry.sourceIndex === item.sourceIndex);
      if (delivered) {
        const result = doc.createElement('small');
        result.className = 'sf14-source-delivery-evidence';
        result.dataset.status = delivered.status;
        result.textContent = ({
          'filedata-verified':'成品已验证 FileData',
          'absent-in-probe':'成品清单未出现',
          'unavailable':'成品证据不足',
        })[delivered.status] + '：' + delivered.message;
        sectionSelection.appendChild(result);
      }

      const open = doc.createElement('button');
      open.type = 'button';
      open.textContent = '定位来源附件编辑器';
      open.dataset.openObservedAttachment = String(item.sourceIndex);
      sectionSelection.appendChild(open);
      if (observedSections.undoIndex === item.sourceIndex) {
        const undo = doc.createElement('button');
        undo.type = 'button';
        undo.dataset.undoObservedAttachment = String(item.sourceIndex);
        undo.textContent = '撤销最近一次附件修改';
        sectionSelection.appendChild(undo);
      }
    }
  };
  const renderSectionItems = (section) => {
    sectionItems.replaceChildren();
    if (section === 'tracks') {
      sectionSelection.hidden = true;
      return;
    }
    const rows = observedSections[section] || [];
    if (!observedSections.scanned || !rows.length) {
      selectedObservedId = '';
      sectionSelection.hidden = true;
      const empty = doc.createElement('p');
      empty.className = 'sf14-section-observation-empty';
      empty.textContent = !observedSections.scanned
        ? '尚无已扫描并绑定当前来源的对象；不能凭文件名生成附件、章节或标签。'
        : '当前来源扫描未报告此类对象；不代表完整 EBML 内绝对不存在。';
      sectionItems.appendChild(empty);
      return;
    }
    if (!rows.some(row => row.id === selectedObservedId)) selectedObservedId = '';
    for (const item of rows) {
      const row = doc.createElement('div');
      row.className = 'sf14-source-observation';
      row.setAttribute('role','listitem');
      row.dataset.evidence = item.evidence;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'sf14-source-observation-choice';
      button.dataset.observedId = item.id;
      button.setAttribute('aria-pressed',String(item.id === selectedObservedId));
      const content = doc.createElement('div');
      const title = doc.createElement('strong');
      title.textContent = item.title;
      const detail = doc.createElement('small');
      detail.textContent = item.detail;
      content.append(title, detail);
      const state = doc.createElement('span');
      state.className = 'sf14-source-observation-status';
      const finished = section === 'attachments' &&
        observedSections.deliveryEvidence?.find(entry =>
          entry.sourceIndex === item.sourceIndex);
      state.textContent = finished
        ? ({'filedata-verified':'成品 SHA-256 已核验',
            'absent-in-probe':'成品清单未出现',
            'unavailable':'成品待复核'})[finished.status]
        : item.status === 'remove' ? '拟排除'
        : item.status === 'modify' ? '拟修改' : '来源已观察';
      button.append(content,state);
      row.appendChild(button);
      sectionItems.appendChild(row);
    }
    renderSectionSelection(section,rows);
  };
  sectionItems.addEventListener('click',event => {
    const button = event.target.closest('button[data-observed-id]');
    if (!button || !sectionItems.contains(button)) return;
    const section = root.dataset.section;
    const items = observedSections[section] || [];
    if (!items.some(item => item.id === button.dataset.observedId)) return;
    selectedObservedId = button.dataset.observedId;
    renderSectionItems(section);
    sectionItems.querySelectorAll('button[data-observed-id]').forEach(peer =>
      peer.setAttribute('aria-pressed',String(peer.dataset.observedId === selectedObservedId)));
    sectionItems.querySelectorAll('button[data-observed-id]').forEach(peer => {
      if (peer.dataset.observedId === selectedObservedId)
        peer.focus({preventScroll:true});
    });
    if (doc.defaultView?.matchMedia?.('(max-width:680px)').matches) setFocus('composition');
  });
  sectionSelection.addEventListener('click',event => {
    const undo = event.target.closest('button[data-undo-observed-attachment]');
    if (undo && sectionSelection.contains(undo)) {
      const item = observedSections.attachments?.find(row => row.id === selectedObservedId);
      if (!item || String(item.sourceIndex) !== undo.dataset.undoObservedAttachment) return;
      const EventCtor = doc.defaultView?.CustomEvent;
      if (!EventCtor) return;
      const cmd = new EventCtor('softmux:undo-observed-source-attachment', {
        bubbles:true,cancelable:true,
      });
      root.dispatchEvent(cmd);
      if (!cmd.defaultPrevented) {
        const error = doc.createElement('small');
        error.textContent = '当前工程状态已变化；请重新确认附件属性，撤销未执行。';
        sectionSelection.appendChild(error);
      }
      return;
    }
    const button = event.target.closest('button[data-open-observed-attachment]');
    if (!button || !sectionSelection.contains(button)) return;
    const item = observedSections.attachments?.find(row => row.id === selectedObservedId);
    if (!item || String(item.sourceIndex) !== button.dataset.openObservedAttachment) return;
    const EventCtor = doc.defaultView?.CustomEvent;
    if (!EventCtor) return;
    // Only leave this list if the authoritative editor actually accepts
    // the exact attachment identity. A failed route must not look successful.
    const navigation = new EventCtor('softmux:open-observed-source-attachment', {
      detail: { sourceIndex: item.sourceIndex },
      bubbles: true,
      cancelable: true,
    });
    root.dispatchEvent(navigation);
    if (!navigation.defaultPrevented) {
      const unavailable = doc.createElement('small');
      unavailable.className = 'sf14-source-navigation-error';
      unavailable.textContent = '当前来源附件未能对应到可检查的编辑器对象；未执行修改。';
      sectionSelection.querySelector('.sf14-source-navigation-error')?.remove();
      sectionSelection.appendChild(unavailable);
      return;
    }
    setSection('tracks');
    if (doc.defaultView?.matchMedia?.('(max-width:680px)').matches) setFocus('inspector');
  });
  const setSection = (section) => {
    if (!['tracks','attachments','chapters','tags'].includes(section)) return;
    root.dataset.section = section;
    for (const button of root.querySelectorAll('[data-sf-section]')) {
      const selected = button.dataset.sfSection === section;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    const notice = get(doc,'sf14SectionNotice');
    notice.hidden = section === 'tracks';
    if (sectionContent[section]) {
      get(doc,'sf14SectionTitle').textContent = sectionContent[section].title;
      get(doc,'sf14SectionText').textContent = sectionContent[section].body;
    }
    renderSectionItems(section);
  };
  root.addEventListener('softmux:source-sections-updated', event => {
    const next = event.detail;
    if (!next || typeof next !== 'object') return;
    // Preserve selection across changes to the SAME exact source File, such
    // as attachment include/rename. Rebinding to another File invalidates it.
    const sameSource = Boolean(observedSections.scanned && next.scanned &&
      observedSections.sourceFile && next.sourceFile &&
      observedSections.sourceFile === next.sourceFile);
    observedSections = next;
    if (!sameSource) selectedObservedId = '';
    renderSectionItems(root.dataset.section || 'tracks');
  });
  for (const button of root.querySelectorAll('[data-sf-section]')) {
    button.addEventListener('click', () => setSection(button.dataset.sfSection));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...root.querySelectorAll('[data-sf-section]')];
      const index = tabs.indexOf(button);
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setSection(next.dataset.sfSection);
      next.focus();
    });
  }
  get(doc,'sf14SectionTracks').addEventListener('click',() => setSection('tracks'));
  get(doc,'sf14SectionEvidence').addEventListener('click', () => {
    setSection('tracks');
    const evidence = get(doc,'compositionSourceEvidence');
    if (evidence && !evidence.hidden) {
      evidence.open = true;
      evidence.scrollIntoView({block:'nearest',behavior:'smooth'});
    } else {
      get(doc,'sf14Recovery').open = true;
      get(doc,'sf14Recovery').scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  });
  setSection('tracks');
  get(doc,'assetInventory')?.addEventListener('click', event => {
    if (!doc.defaultView?.matchMedia?.('(max-width: 680px)').matches) return;
    const external = event.target.closest('[data-asset-focus-key]');
    if (external && optionsDrawer) optionsDrawer.open = true;
    if (external || event.target.closest('[data-tree-select]')) {
      setFocus('inspector');
    }
  });
  const sourceToggle = get(doc,'sf14SourceToggle');
  sourceToggle.addEventListener('click', () => {
    const show = single.dataset.showSource !== 'true';
    single.dataset.showSource = String(show);
    sourceToggle.setAttribute('aria-expanded', String(show));
  });
  composition.addEventListener('click', event => {
    const target = event.target.closest('button[data-composition-id]');
    if (!target) return;
    // Source tracks already have a contextual inspector. The legacy bulk
    // editor is supplementary, and must not duplicate that object by default.
    if (optionsDrawer && !String(target.dataset.compositionId||'').startsWith('source:')) {
      optionsDrawer.open = true;
    }
    if (doc.defaultView?.matchMedia?.('(max-width: 680px)').matches) setFocus('inspector');
  });

  const changeView = (view) => {
    if (!['single','batch','tools'].includes(view)) return;
    root.dataset.view = view;
    if (view !== 'single') {
      single.dataset.showSource = 'false';
      sourceToggle.setAttribute('aria-expanded', 'false');
    }
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
  get(doc,'sf14Add').addEventListener('click', () => {
    // The global Add command belongs to the CURRENT user task.
    // Never discard the batch context by silently switching to single work.
    if (root.dataset.view === 'batch') {
      const isTablet = doc.defaultView?.matchMedia?.('(min-width:681px) and (max-width:1365px)').matches;
      const sourceButton = batchPanel?.querySelector('[data-sf-batch-controls="sources"]');
      if (isTablet && sourceButton) {
        if (batchPanel.dataset.controls !== 'sources') sourceButton.click();
        get(doc,'batchUnifiedInput')?.focus();
      } else {
        get(doc,'batchUnifiedInput')?.click();
      }
      return;
    }
    changeView('single');
    setFocus('source');
    get(doc,'unifiedAssetInput')?.click();
  });
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

/**
 * Only projects the latest verified source observation into the current UI.
 * Does not create a new editable ContainerProject or claim writer capability.
 */
export function updateSoftmux1014SourceSections(doc, sections) {
  const root = doc.getElementById('sf14Root');
  if (!root) return false;
  const EventCtor = doc.defaultView?.CustomEvent;
  if (!EventCtor) return false;
  root.dispatchEvent(new EventCtor('softmux:source-sections-updated', { detail: sections }));
  return true;
}
