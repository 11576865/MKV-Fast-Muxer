// Plate 01 / source-object projection onto the real Softmux workbench.
// This is a presentation adapter only. The authoritative output plan,
// source File grants, inspector editors and writer remain unchanged.
export function mountSoftmuxDesignPlate(doc, root) {
  const central = doc.getElementById('sf14Composition');
  const inspector = doc.getElementById('sf14Inspector');
  const notice = doc.getElementById('sf14SectionNotice');
  const sourceItems = doc.getElementById('sf14SectionItems');
  const outputComposition = doc.getElementById('outputCompositionPanel');
  if (!root || !central || !inspector || !notice || !sourceItems || !outputComposition ||
      doc.getElementById('sf14SourceOutline')) return false;

  // Move the SINGLE existing contextual reader to the inspector. No input,
  // editor instance, File grant, listener or output object is cloned.
  inspector.prepend(notice);
  const outline = doc.createElement('section');
  outline.id = 'sf14SourceOutline';
  outline.className = 'sf14-source-outline';
  outline.setAttribute('aria-label', '来源容器的附件、章节和标签');
  outputComposition.after(outline);

  const sections = [
    { key:'attachments', title:'来源附件 / ATTACHMENTS' },
    { key:'chapters', title:'来源章节 / CHAPTERS' },
    { key:'tags', title:'来源标签 / TAGS' },
  ];
  let snapshot = { scanned:false, sourceFile:null, attachments:[], chapters:[], tags:[] };
  let lastSource = null;
  let selectedKey = '';
  let selectedSection = '';

  const draw = () => {
    outline.replaceChildren();
    for (const spec of sections) {
      const group = doc.createElement('section');
      group.id = 'sf14Outline-' + spec.key;
      group.className = 'sf14-source-outline-group';
      group.dataset.objectGroup = spec.key;
      const head = doc.createElement('div');
      head.className = 'sf14-source-outline-heading';
      const heading = doc.createElement('h3');
      heading.textContent = spec.title;
      const count = doc.createElement('span');
      const rows = snapshot.scanned ? snapshot[spec.key] || [] : [];
      count.textContent = snapshot.scanned ? rows.length + ' 项 · 来源扫描' : '尚未扫描';
      head.append(heading, count);
      group.append(head);
      if (!rows.length) {
        const empty = doc.createElement('p');
        empty.className = 'sf14-source-outline-empty';
        empty.textContent = snapshot.scanned
          ? '来源扫描未返回此类对象；未证明完整 EBML 结构不存在。'
          : '导入并扫描来源后显示实际对象。';
        group.append(empty);
      }
      for (const item of rows) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'sf14-source-outline-row';
        button.dataset.plateSection = spec.key;
        button.dataset.plateId = item.id;
        button.setAttribute('aria-pressed', String(selectedSection === spec.key && selectedKey === item.id));
        const label = doc.createElement('strong');
        label.textContent = item.title;
        const detail = doc.createElement('small');
        detail.textContent = item.detail;
        const state = doc.createElement('span');
        state.className = 'sf14-source-outline-state';
        state.textContent = item.status === 'remove' ? '拟排除' :
          item.status === 'modify' ? '拟修改' : '来源已观察';
        button.append(label, detail, state);
        group.append(button);
      }
      outline.append(group);
    }
  };

  // React only to the existing exact-File-bound scan broadcast. Neither
  // pathname, filename nor synthetic fixture is accepted as object authority.
  root.addEventListener('softmux:source-sections-updated', event => {
    const next = event.detail;
    if (!next || typeof next !== 'object') return;
    const sameFile = Boolean(snapshot.scanned && next.scanned &&
      lastSource && next.sourceFile === lastSource);
    snapshot = next;
    lastSource = next.scanned ? next.sourceFile : null;
    const selectedStillExists = selectedSection && selectedKey &&
      (next[selectedSection] || []).some(row => row.id === selectedKey);
    if (!sameFile || (selectedKey && !selectedStillExists)) {
      selectedKey = '';
      selectedSection = '';
      root.dataset.plateContext = 'tracks';
      root.querySelector('[data-sf-section="tracks"]')?.click();
    }
    const label = doc.getElementById('sf14ProjectName');
    if (label) label.textContent = next.scanned && next.sourceFile
      ? next.sourceFile.name + ' · 来源已扫描'
      : '未选择已扫描来源';
    draw();
  });

  outline.addEventListener('click', event => {
    const button = event.target.closest('button[data-plate-section][data-plate-id]');
    if (!button || !outline.contains(button)) return;
    const section = button.dataset.plateSection;
    const row = snapshot[section]?.find(item => item.id === button.dataset.plateId);
    if (!snapshot.scanned || !row) return;
    const tab = root.querySelector('[data-sf-section="' + section + '"]');
    if (!tab) return;
    tab.click(); // existing presenter supplies the one authoritative observation inspector
    const current = [...sourceItems.querySelectorAll('button[data-observed-id]')]
      .find(candidate => candidate.dataset.observedId === row.id);
    if (!current) return;
    current.click(); // existing exact identity selection, tool route and evidence
    selectedKey = row.id;
    selectedSection = section;
    root.dataset.plateContext = 'source';
    draw();
    if (doc.defaultView?.matchMedia?.('(max-width:680px)').matches) {
      root.querySelector('[data-sf-focus="inspector"]')?.click();
    }
    outline.querySelector('button[aria-pressed="true"]')?.focus({preventScroll:true});
  });

  // The original tab strip now acts as a fast jump to each always-visible
  // group; its content remains a contextual inspector rather than a second list.
  for (const tab of root.querySelectorAll('[data-sf-section]')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.sfSection === 'tracks') {
        root.dataset.plateContext = 'tracks';
        selectedKey = '';
        selectedSection = '';
        draw();
        return;
      }
      root.dataset.plateContext = 'source';
      const target = doc.getElementById('sf14Outline-' + tab.dataset.sfSection);
      target?.scrollIntoView({block:'nearest'});
    });
  }
  outputComposition.addEventListener('click', event => {
    if (!event.target.closest('button[data-composition-id]')) return;
    root.querySelector('[data-sf-section="tracks"]')?.click();
    if (doc.defaultView?.matchMedia?.('(max-width:680px)').matches)
      root.querySelector('[data-sf-focus="inspector"]')?.click();
  });
  // Internal, previously supported navigation routes can also exit source
  // observation. Keep the live editor visible after a tool consumes a route.
  root.addEventListener('click', event => {
    if (!event.target.closest('#sf14SectionTracks, #sf14SectionEvidence, ' +
      '[data-open-observed-attachment], [data-open-observed-metadata]')) return;
    selectedKey = '';
    selectedSection = '';
    root.dataset.plateContext = 'tracks';
    draw();
  });
  root.dataset.plateContext = 'tracks';
  draw();
  return true;
}
