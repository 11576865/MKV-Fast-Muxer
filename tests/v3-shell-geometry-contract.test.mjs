import test from 'node:test';
import {resolveV3ShellFrame} from '../src/v3-shell-next.js';
import assert from 'node:assert/strict';
import {
  V3_APPROVED_SHELLS,inspectV3ShellGeometry,V3_SHELL_REGION_SELECTORS,
} from '../src/v3-shell-geometry-contract.mjs';

test('four approved Figma frame shells are distinct source/target layouts',()=>{
  assert.deepEqual(Object.keys(V3_APPROVED_SHELLS).sort(),[
    'desktop-source','desktop-target','portrait-source','portrait-target']);
  assert.equal(V3_APPROVED_SHELLS['desktop-source'].frame,'28:2');
  assert.equal(V3_APPROVED_SHELLS['desktop-target'].frame,'32:2');
  assert.equal(V3_APPROVED_SHELLS['portrait-source'].frame,'33:2');
  assert.equal(V3_APPROVED_SHELLS['portrait-target'].frame,'35:2');
  assert.equal(V3_APPROVED_SHELLS['desktop-source'].regions.chrome.y,786,
    'desktop source file tabs deliberately sit BELOW workspace');
  assert.equal(V3_APPROVED_SHELLS['desktop-target'].regions.chrome.y,0,
    'desktop target tabs deliberately sit ABOVE workspace');
  assert.equal(V3_APPROVED_SHELLS['portrait-source'].regions.footer.y,1120);
  assert.equal(V3_APPROVED_SHELLS['portrait-target'].regions.footer.y,60);
});

test('each approved shell tiles its own viewport exactly once',()=>{
  for(const [name,frame] of Object.entries(V3_APPROVED_SHELLS)){
    const {width,height}=frame.viewport;
    const regions=Object.values(frame.regions);
    assert.equal(regions.length,3,name);
    assert.equal(regions.reduce((sum,b)=>sum+b.height,0),height,name);
    for(const b of regions) {
      assert.equal(b.x,0,name);
      assert.equal(b.width,width,name);
      assert.ok(b.y>=0 && b.height>0 && b.y+b.height<=height,name);
    }
    const sorted=[...regions].sort((a,b)=>a.y-b.y);
    for(let i=1;i<sorted.length;i++)
      assert.equal(sorted[i].y,sorted[i-1].y+sorted[i-1].height,
        name+' has an invalid overlap or vertical gap');
  }
});

test('layout comparison reports actual deviations, never invents visual acceptance',()=>{
  for(const [name,frame] of Object.entries(V3_APPROVED_SHELLS)){
    const equal=inspectV3ShellGeometry(name,frame.regions);
    assert.equal(equal.matched,true,name);
    assert.equal(equal.discrepancies.length,0);
    assert.match(equal.evidenceScope,/NOT_FULL_VISUAL/);
  }
  const legacyHeader={
    ...V3_APPROVED_SHELLS['desktop-source'].regions,
    chrome:{x:0,y:0,width:1440,height:58},
  };
  const checked=inspectV3ShellGeometry('desktop-source',legacyHeader);
  assert.equal(checked.matched,false);
  assert.ok(checked.discrepancies.some(x=>
    x.region==='chrome'&&x.component==='y'&&x.delta===-786),
    'old top header must be reported as a major design deviation');
  const missing=inspectV3ShellGeometry('portrait-source',{});
  assert.equal(missing.discrepancies.filter(x=>x.type==='MISSING_REGION').length,3);
});

test('shell maps original DOM, not new File permission or media engine',()=>{
  assert.deepEqual(V3_SHELL_REGION_SELECTORS,{
    chrome:'.sf14-header',
    workspace:'#sf14Single',
    'source-footer':'.sfv3-source-status',
    'target-footer':'.sf14-output',
  });
  assert.throws(()=>inspectV3ShellGeometry('v3-12',{}),/UNKNOWN_REFERENCE/);
});

test('candidate next shell covers only explicitly reviewed frame modes',()=>{
  for(const [width,height,surface,expected] of [
    [1440,900,'source','desktop-source'],
    [1440,900,'plan','desktop-target'],
    [820,1180,'source','portrait-source'],
    [820,1180,'plan','portrait-target'],
    [620,900,'source',null],
    [1180,820,'plan',null],
    [820,1180,'unknown',null],
  ])assert.equal(resolveV3ShellFrame({width,height,surface}),expected,
    JSON.stringify({width,height,surface}));
});
