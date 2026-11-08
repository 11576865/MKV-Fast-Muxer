/*
 * V3.5 batch review semantic projection.
 * Decorates existing native DOM only; no copies of source File, pairings,
 * batch selection, metadata, recipe, or execution state are ever created.
 * The legacy batch renderer is the sole owner of these live controls.
 */
const find=(doc,id)=>doc.getElementById(id);

export function mountV35BatchReviewDetail(doc,root){
  if(!root?.classList.contains('sfv35-nav'))return null;
  const matrix=find(doc,'batchPlan');
  const inspector=find(doc,'batchJobInspector');
  if(!matrix||!inspector)return null;
  if(matrix.dataset.sfv35ReviewMounted==='true')return null;
  matrix.dataset.sfv35ReviewMounted='true';

  const decorate=()=>{
    // Each unresolved tie is a different real input pair; the native select
    // remains the ONLY user decision and still owns the fail-closed gate.
    const choices=[...matrix.querySelectorAll('.batch-review-conflicts .batch-pairing-choice')];
    for(const [i,choice] of choices.entries()){
      const picker=choice.querySelector('select[data-batch-tie-index]');
      if(!picker)continue;
      choice.classList.add('sfv35-pair-review');
      const ordinal=choice.querySelector('.sfv35-pair-ordinal')||
        doc.createElement('span');
      ordinal.className='sfv35-pair-ordinal';
      ordinal.textContent='待确认 '+String(i+1).padStart(2,'0')+
        ' / '+String(choices.length).padStart(2,'0');
      if(!ordinal.isConnected)choice.prepend(ordinal);
      const candidates=picker.options.length-1;
      choice.dataset.sfv35Candidates=String(candidates);
      const hint=choice.querySelector('.sfv35-pair-count')||doc.createElement('small');
      hint.className='sfv35-pair-count';
      hint.textContent='候选来源 '+candidates+' 个 · 必须人工选择';
      if(!hint.isConnected)picker.before(hint);
      // Preserve the original explicit native label and options; never
      // insert a guessed first choice or submit a pair automatically.
    }

    const subtitles=[...inspector.querySelectorAll('.batch-inspector-subtitle')];
    for(const [i,section] of subtitles.entries()){
      const source=section.querySelector(':scope > strong');
      if(!source)continue;
      section.classList.add('sfv35-subtitle-editor');
      const header=section.querySelector('.sfv35-subtitle-index')||
        doc.createElement('span');
      header.className='sfv35-subtitle-index';
      header.textContent='字幕轨 '+String(i+1).padStart(2,'0')+
        ' / '+String(subtitles.length).padStart(2,'0');
      if(!header.isConnected)source.before(header);
      const file=source.textContent?.trim()||'未知字幕';
      // Native generation is already bound to File + track index. This
      // label only disambiguates the *existing* per-track controls for
      // assistive technologies and keyboard users.
      section.setAttribute('role','group');
      section.setAttribute('aria-label',
        '第'+(i+1)+'条字幕：'+file);
      for(const control of section.querySelectorAll('[data-batch-task-field]')){
        const field=control.dataset.batchTaskField;
        const role=field==='title'?'标题':
          field==='language'?'语言':
          field==='default'?'Default 默认字幕':
          field==='forced'?'Forced 强制字幕':field;
        control.setAttribute('aria-label',
          '字幕轨 '+(i+1)+' / '+subtitles.length+' · '+file+' · '+role);
      }
    }
    inspector.dataset.sfv35SubtitleCount=String(subtitles.length);
  };

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    doc.defaultView?.queueMicrotask?.(()=>{
      scheduled=false;
      if(matrix.isConnected&&inspector.isConnected)decorate();
    });
  };
  // The native owner replaces innerHTML directly on each re-scan or field
  // commit. Observe only the host's DIRECT children to avoid a feedback loop
  // from the subordinate semantic markers we add.
  const observer=new MutationObserver(schedule);
  observer.observe(matrix,{childList:true});
  observer.observe(inspector,{childList:true});
  decorate();
  return {refresh:decorate};
}
