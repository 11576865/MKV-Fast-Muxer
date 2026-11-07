/*
 * V3 shell refactor — opt-in visual implementation, never a new workbench.
 *
 * Layout owns three existing DOM regions: header, workspace and current
 * footer. The original File inputs, target authority, editor, native
 * mux/cancel and output evidence stay on their original nodes.
 * Only ?ui=v3&shell=next opts into this structure during validation.
 */
import {V3_APPROVED_SHELLS} from './v3-shell-geometry-contract.mjs';

// Static Vite-resolved exact Figma SVG asset paths. Do not compose an
// unresolved string URL relative to the hashed production bundle.
const RAIL_ICON_URLS=Object.freeze({
  'object-list':new URL('./v3-assets/object-list.svg',import.meta.url).href,
  search:new URL('./v3-assets/search.svg',import.meta.url).href,
  help:new URL('./v3-assets/help.svg',import.meta.url).href,
});

export function resolveV3ShellFrame({width,height,surface}){
  if(surface!=='source' && surface!=='plan')return null;
  const mode=surface==='plan'?'target':'source';
  const key=width>=1320?'desktop-'+mode:
    width>=720 && width<=959 && height>width?'portrait-'+mode:null;
  return key && V3_APPROVED_SHELLS[key]?key:null;
}

export function mountV3ShellNext(doc,root){
  if(!root || !root.classList.contains('sfv3'))return false;
  const search=doc.defaultView?.location?.search||'';
  if(new URLSearchParams(search).get('shell')!=='next')return false;
  const header=root.querySelector('.sf14-header');
  const workspace=root.querySelector('#sf14Single');
  const sourceStatus=root.querySelector('.sfv3-source-status');
  const output=root.querySelector('.sf14-output');
  // Required live nodes must already exist exactly ONCE; no editor copies.
  if(!header || !workspace || !sourceStatus || !output ||
      [header,workspace,sourceStatus,output].some(node=>node.parentElement!==root))
    throw new Error('V3_NEXT_SHELL_REQUIRED_NATIVE_ROOT_SLOTS');
  if(root.querySelectorAll('#sf14Single').length!==1)
    throw new Error('V3_NEXT_SHELL_MULTIPLE_EDITORS');
  root.dataset.sfv3Shell='next';

  // One Figma navigation rail (V3-01 / 28:2) made of real commands. These
  // controls delegate to the ORIGINAL source tabs/search/help, not cloned
  // importers, hidden editors or an invented app navigation state.
  const rail=root.querySelector('#sfv3Rail');
  const existingAdd=rail?.querySelector('button[aria-label="添加资源"]');
  if(!rail || !existingAdd || rail.querySelectorAll('.sfv3-rail-action').length!==2)
    throw new Error('V3_NEXT_RAIL_NATIVE_ACTIONS_MISSING');
  rail.setAttribute('role','navigation');
  rail.setAttribute('aria-label','资源与对象导航');

  const createRailAction=(id,icon,label,click)=>{
    const button=doc.createElement('button');
    button.type='button';
    button.id=id;
    button.className='sfv3-rail-action sfv3-shell-rail-action';
    button.title=label;
    button.setAttribute('aria-label',label);
    const svg=doc.createElement('img');
    if(!RAIL_ICON_URLS[icon])throw new Error('V3_NEXT_UNKNOWN_RAIL_ICON:'+icon);
    svg.src=RAIL_ICON_URLS[icon];
    svg.className='sfv3-svg-icon';
    svg.dataset.sfv3Icon=icon;
    svg.alt='';
    svg.setAttribute('aria-hidden','true');
    button.appendChild(svg);
    button.addEventListener('click',click);
    return button;
  };
  const focusList=()=>{
    const isSource=root.dataset.sfv3Surface==='source';
    const target=doc.getElementById(isSource?'sfv3SourceContents':'compositionTracks');
    if(!target)return;
    target.scrollIntoView({block:'start',behavior:'instant'});
    // The list itself is the focus return point: track buttons remain
    // original, focusable, and bound to their original File and editor.
    if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
    target.focus({preventScroll:true});
  };
  const objectList=createRailAction('sfv3ShellObjectList','object-list',
    '定位当前对象列表',focusList);
  const searchAction=createRailAction('sfv3ShellSearch','search',
    '搜索来源轨道',()=>{
      if(root.dataset.sfv3Surface==='plan')
        doc.getElementById('sfv3SourceTab')?.click();
      const native=doc.getElementById('sfv3SourceSearchToggle');
      if(native?.getAttribute('aria-expanded')!=='true')native?.click();
      doc.getElementById('sfv3SourceSearch')?.focus();
    });
  searchAction.setAttribute('aria-controls','sfv3SourceSearch');
  const helpAction=createRailAction('sfv3ShellHelp','help',
    '打开工作台帮助',()=>doc.getElementById('sf14Help')?.click());
  helpAction.classList.add('sfv3-shell-rail-help');
  rail.insertBefore(objectList,existingAdd);
  rail.insertBefore(searchAction,existingAdd);
  rail.appendChild(helpAction);
  const refresh=()=>{
    const win=doc.defaultView;
    const key=resolveV3ShellFrame({
      width:win?.innerWidth||0,height:win?.innerHeight||0,
      surface:root.dataset.sfv3Surface
    });
    if(key)root.dataset.sfv3ShellFrame=key;
    else delete root.dataset.sfv3ShellFrame;
  };
  const observer=new MutationObserver(refresh);
  observer.observe(root,{attributes:true,attributeFilter:['data-sfv3-surface']});
  doc.defaultView?.addEventListener('resize',refresh);
  refresh();
  return true;
}
