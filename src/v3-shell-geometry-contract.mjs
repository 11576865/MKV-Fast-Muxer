/*
 * V3 layout rebuild | immutable shell topology captured from the approved
 * Figma nodes (2026-11-07 read-only inspection, page 27:2).
 *
 * This module never controls the media writer, File ownership, or a target
 * decision. It specifies WHERE the authentic existing controls should appear
 * for each mode. Measured geometry is evidence, not a pixel-matching claim
 * when the loaded input files and on-screen content still differ.
 */
const shell = (frame,viewport,regions)=>Object.freeze({
  frame,
  viewport:Object.freeze({...viewport}),
  regions:Object.freeze(Object.fromEntries(
    Object.entries(regions).map(([key,box])=>[key,Object.freeze({...box})])
  ))
});

export const V3_APPROVED_SHELLS=Object.freeze({
  // V3-01: unlike the target state, desktop source document tabs live below
  // the workspace, immediately above the 56px read-only source status.
  'desktop-source':shell('28:2',{width:1440,height:900},{
    chrome:{x:0,y:786,width:1440,height:58},
    workspace:{x:0,y:0,width:1440,height:786},
    footer:{x:0,y:844,width:1440,height:56},
  }),
  'desktop-target':shell('32:2',{width:1440,height:900},{
    chrome:{x:0,y:0,width:1440,height:58},
    workspace:{x:0,y:58,width:1440,height:786},
    footer:{x:0,y:844,width:1440,height:56},
  }),
  // V3-05 and V3-06 each deliberately place the 60px toolbar in a
  // *different* shell slot. The old legacy DOM must not dictate topology.
  'portrait-source':shell('33:2',{width:820,height:1180},{
    chrome:{x:0,y:0,width:820,height:60},
    workspace:{x:0,y:60,width:820,height:1060},
    footer:{x:0,y:1120,width:820,height:60},
  }),
  'portrait-target':shell('35:2',{width:820,height:1180},{
    chrome:{x:0,y:0,width:820,height:60},
    footer:{x:0,y:60,width:820,height:60},
    workspace:{x:0,y:120,width:820,height:1060},
  }),
});

export const V3_SHELL_REGION_SELECTORS=Object.freeze({
  // These selectors resolve the *existing* original live DOM nodes.
  // No hidden duplicate editors or mock File input will be introduced.
  chrome:'.sf14-header',
  workspace:'#sf14Single',
  'source-footer':'.sfv3-source-status',
  'target-footer':'.sf14-output',
});

export function inspectV3ShellGeometry(key,observed,{tolerance=2}={}){
  const target=V3_APPROVED_SHELLS[key];
  if(!target)throw new Error('V3_SHELL_UNKNOWN_REFERENCE:'+key);
  if(!Number.isFinite(tolerance)||tolerance<0)throw new Error('V3_SHELL_INVALID_TOLERANCE');
  const delta=[];
  for(const [region,reference] of Object.entries(target.regions)){
    const actual=observed?.[region]??null;
    if(!actual){
      delta.push({region,type:'MISSING_REGION',reference});
      continue;
    }
    const components={};
    for(const k of ['x','y','width','height']){
      const value=Number(actual[k]);
      if(!Number.isFinite(value)){
        components[k]=null;
        delta.push({region,component:k,type:'INVALID_MEASUREMENT',reference:reference[k]});
      } else {
        components[k]=Math.round((value-reference[k])*100)/100;
        if(Math.abs(components[k])>tolerance){
          delta.push({region,component:k,type:'GEOMETRY_DEVIATION',
            expected:reference[k],actual:value,delta:components[k]});
        }
      }
    }
  }
  return {key,frame:target.frame,viewport:target.viewport,
    tolerance,matched:delta.length===0,discrepancies:delta,
    evidenceScope:'SHELL_GEOMETRY_ONLY_NOT_FULL_VISUAL_OR_FUNCTIONAL_ACCEPTANCE'};
}
