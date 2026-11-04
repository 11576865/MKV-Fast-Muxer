// WU-04: browser geometry audit of the approved Figma V3 responsiveness.
// Captures measured box geometry and screenshots. Dynamic fixture text differs
// from Figma mock text: this is NOT a pixel-fidelity/visual-diff pass.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out=path.resolve('.e2e/ui-v3-responsive');
await mkdir(out,{recursive:true});
const mkv=path.join(out,'V3 Responsive Fixture.mkv');
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1',
  '-c:v','mpeg4','-q:v','5',mkv,
],{stdio:'pipe'});
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const page=await browser.newPage({
  viewport:{width:1440,height:900},deviceScaleFactor:1,
  reducedMotion:'reduce',acceptDownloads:true,
});
page.setDefaultTimeout(45000);
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const report={
  schema:'softmux-v3-responsive-geometry-v1',
  approvedFigma:{
    desktop:'28:2',portrait:'33:2',landscape:'36:2',
    compact:'37:223',empty:'39:2',
  },
  fixture:path.basename(mkv),
  caveat:'Actual Chromium geometry for source and confirmed-target view. This is not a matching Figma pixel diff; design mockups use different content, and motion is not approved.',
  cases:[],errors:[],
};
const measure=async(state,width,height)=>page.evaluate(({state,width,height})=>{
  const root=document.getElementById('sf14Root');
  const select=(query)=>root?.querySelector(query);
  const box=query=>{
    const node=select(query);
    if(!node)return null;
    const cs=getComputedStyle(node),r=node.getBoundingClientRect();
    const shown=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;
    return {
      shown,x:Math.round(r.x),y:Math.round(r.y),
      w:Math.round(r.width),h:Math.round(r.height),
      right:Math.round(r.right),bottom:Math.round(r.bottom),
      scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,
      scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,
    };
  };
  const bounds={
    root:box('#sf14Root'),
    header:box('.sf14-header'),
    tabs:box('#sfv3Tabs'),
    headerActions:box('.sf14-header-actions'),
    main:box('#sf14Single'),
    document:box('#sf14Composition'),
    source:box('#sfv3SourceReadout'),
    filename:box('#sfv3FileName'),
    targetAction:box('#sfv3EnterOutput'),
    planHeading:box('#sfv3PlanHeading'),
    planContent:box('#outputCompositionPanel'),
    sourceStatus:box('#sfv3SourceStatus'),
    outputDock:box('.sf14-output'),
    sourceToggle:box('#sf14SourceToggle'),
    add:box('#sf14Add'),
  };
  const actualFile=document.getElementById('videoInput')?.files?.[0];
  const rootRect=root.getBoundingClientRect();
  const criticalOffscreen=[];
  for(const id of ['header','main','document','sourceToggle','add']) {
    const r=bounds[id];
    if(r?.shown && (r.x<-2||r.right>width+2||r.y<-2||r.bottom>height+2))
      criticalOffscreen.push(id);
  }
  const src=bounds.source;
  const hasFile=actualFile?.name==='V3 Responsive Fixture.mkv';
  return {
    state,width,height,file:actualFile?.name||null,
    surface:root.dataset.sfv3Surface,
    targetConfirmed:root.dataset.sfv3TargetConfirmed,
    viewportOverflow:document.documentElement.scrollWidth>width+2,
    rootOverflow:rootRect.width>width+2,
    criticalOffscreen,
    sourcePrimaryActionShown:state!=='source'?null:bounds.targetAction?.shown,
    sourceHasTrack:state!=='source'?null:!!select('#sfv3SourceContents .sfv3-observed-row'),
    targetPanelShown:state==='plan'?bounds.planContent?.shown:null,
    nativeEditorNodes:document.querySelectorAll('#newSubtitleList').length,
    bodyScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    boxes:bounds,
    validFile:hasFile,
  };
},{state,width,height});
const samples=[
  [1440,900],[1320,900],[1319,900],[1180,820],
  [960,820],[959,820],[820,1180],[720,950],
  [719,950],[620,900],[600,900],
];
async function audit(state){
  for(const [width,height] of samples){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const m=await measure(state,width,height);
    report.cases.push(m);
    // These assertions are product safety properties rather than a claim
    // that all rectangles match their Figma equivalents.
    assert.equal(m.validFile,true,'exact original File must survive resize '+width);
    assert.equal(m.surface,state,'changing viewport must not silently change the current document');
    assert.equal(m.viewportOverflow,false,'document horizontal scrollbar at '+width+' '+state);
    assert.equal(m.rootOverflow,false,'root exceeds viewport at '+width+' '+state);
    assert.equal(m.boxes.root?.x,0,
      'V3 must not inherit the legacy tablet 72px canvas offset at '+width+' '+state);
    assert.equal(m.boxes.root?.w,width,
      'V3 must occupy the full responsive viewport at '+width+' '+state);
    assert.equal(m.boxes.header?.x,0,
      'V3 header must align to viewport, not legacy offset at '+width+' '+state);
    assert.deepEqual(m.criticalOffscreen,[],
      'important navigation/content is offscreen at '+width+' '+state);
    assert.equal(m.nativeEditorNodes,1,'responsive views must not clone live editor DOM');
    if(state==='source'){
      assert.equal(m.targetConfirmed==='true',false,
        'source observations must not produce output authorization');
      assert.equal(m.sourceHasTrack,true,'observed source facts remain visible at '+width);
      assert.equal(m.sourcePrimaryActionShown,true,
        'explicit target entry must be visible across widths '+width);
    }else{
      assert.equal(m.targetConfirmed,'true');
      assert.equal(m.targetPanelShown,true,'target model must remain rendered at '+width);
    }
    if([1440,1180,820,720,620].includes(width)) {
      const file=path.join(out,state+'-'+width+'x'+height+'.png');
      await page.screenshot({path:file,fullPage:false});
    }
  }
}
try{
  await page.goto(new URL('?ui=v3',base).href,{waitUntil:'networkidle'});
  await page.locator('#sf14Root.sfv3').waitFor();
  await page.locator('#unifiedAssetInput').setInputFiles(mkv);
  await page.waitForFunction(()=>
    document.querySelector('#sfv3SourceContents .sfv3-observed-row') &&
    document.querySelector('#sfv3FileName')?.textContent==='V3 Responsive Fixture.mkv',
    null,{timeout:150000});
  // Exact-source summary is not allowed to display inferred counts.
  const counters=await page.locator('#sfv3SourceCounters .sfv3-counter')
    .evaluateAll(nodes=>nodes.map(node=>({
      kind:node.dataset.kind,value:node.querySelector('.sfv3-counter-count')?.textContent,
    })));
  assert.deepEqual(counters.filter(x=>x.kind==='video'),[{kind:'video',value:'01'}]);
  assert.deepEqual(counters.filter(x=>x.kind==='audio'),[{kind:'audio',value:'00'}]);
  assert.deepEqual(counters.filter(x=>x.kind==='subtitle'),[{kind:'subtitle',value:'00'}]);
  await audit('source');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#sfv3EnterOutput').click();
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>document.querySelector('#sf14Root')?.dataset.sfv3Surface==='plan');
  await audit('plan');
  assert.deepEqual(errors,[]);
  report.passed=true;
  console.log('V3 geometry + exact-File continuity PASS, cases='+report.cases.length);
} catch(error){
  report.passed=false;report.failure=String(error);
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:false}).catch(()=>{});
  throw error;
}finally{
  report.errors=errors;
  await writeFile(path.join(out,'v3-responsive-geometry.json'),
    JSON.stringify(report,null,2)+'\n');
  await page.close();
  await browser.close();
}
