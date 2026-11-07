/*
 * V3 shell refactor — opt-in visual implementation, never a new workbench.
 *
 * Layout owns three existing DOM regions: header, workspace and current
 * footer. The original File inputs, target authority, editor, native
 * mux/cancel and output evidence stay on their original nodes.
 * Only ?ui=v3&shell=next opts into this structure during validation.
 */
import {V3_APPROVED_SHELLS} from './v3-shell-geometry-contract.mjs';

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
