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
const metadata=path.join(out,'v3-real-chapters.ffmeta');
await writeFile(metadata,[
  ';FFMETADATA1','title=Verified Base Source',
  '[CHAPTER]','TIMEBASE=1/1000','START=0','END=850',
  'title=Actual Intro Chapter',
  '',
].join('\n'));
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1',
  '-f','ffmetadata','-i',metadata,
  '-map','0:v:0','-map_metadata','1','-map_chapters','1',
  '-c:v','mpeg4','-q:v','5',mkv,
],{stdio:'pipe'});
const probe=JSON.parse(execFileSync('ffprobe',[
  '-v','error','-show_chapters','-show_format','-of','json',mkv,
],{encoding:'utf8'}));
assert.ok(probe.chapters?.some(row=>row.tags?.title==='Actual Intro Chapter'),
  'native ffprobe fixture must contain a real Chapter');
assert.equal(probe.format?.tags?.title,'Verified Base Source',
  'native ffprobe fixture must contain a real format Tag');
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const page=await browser.newPage({
  viewport:{width:1440,height:900},deviceScaleFactor:1,
  reducedMotion:'reduce',acceptDownloads:true,hasTouch:true,
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
    const node=query==='#sf14Root'?root:select(query);
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
    // V3-06 has an upper action dock at portrait tablet width; V3-08 keeps
    // the lower action dock. Verify geometry, not merely absence of overflow.
    if(state==='plan' && (width===820 || width===720)) {
      assert.ok(m.boxes.outputDock?.shown && m.boxes.main?.shown &&
        Math.abs(m.boxes.outputDock.y-m.boxes.header.bottom)<=2 &&
        Math.abs(m.boxes.main.y-m.boxes.outputDock.bottom)<=2,
        'portrait target dock must sit between header and workbench at '+width);
    }
    if(state==='plan' && width===620){
      assert.ok(m.boxes.outputDock?.shown &&
        m.boxes.outputDock.y>=m.boxes.main.bottom-2,
        'compact target must retain footer dock below workbench');
    }
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
  // Figma V3-01/05: source media stays primary; actual FFprobe chapter/tag
  // observations appear as compact cards, not extra fake media tracks.
  await page.waitForFunction(()=>{
    const chapter=document.querySelector('.sfv3-source-resource-card[data-kind="chapters"] .sfv3-source-resource-count');
    const tag=document.querySelector('.sfv3-source-resource-card[data-kind="tags"] .sfv3-source-resource-count');
    return chapter?.textContent==='01' && Number(tag?.textContent)>0;
  },null,{timeout:60000});
  const sourceCards=await page.locator('.sfv3-source-resource-card').count();
  assert.equal(sourceCards,3,'exact-source secondary resources use three expandable summary cards');
  // The original single target action now lives in Figma V3-01's visible
  // content toolbar above source rows, without changing File/target authority.
  assert.equal(await page.locator('#sfv3EnterOutput').count(),1);
  const toolbarBox=await page.locator('#sfv3SourceToolbar').boundingBox();
  const firstMediaBox=await page.locator('#sfv3SourceContents > .sfv3-object-group .sfv3-observed-row').first().boundingBox();
  assert.ok(toolbarBox && firstMediaBox && toolbarBox.y+toolbarBox.height<=firstMediaBox.y+3,
    'source content toolbar should precede real source rows');
  await page.locator('#sfv3SourceSearchToggle').click();
  const search=page.locator('#sfv3SourceSearch');
  assert.equal(await search.isVisible(),true);
  await search.fill('no-such-codec-123');
  assert.equal(await page.locator('#sfv3SourceContents > .sfv3-object-group .sfv3-observed-row').first().isVisible(),false,
    'visual source search must hide unmatched rows, not remove data');
  assert.equal(await page.locator('#videoInput').evaluate(node=>node.files?.[0]?.name),
    'V3 Responsive Fixture.mkv','search cannot change canonical File');
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
    'search does not create or authorize an output');
  await search.fill('mpeg4');
  assert.equal(await page.locator('#sfv3SourceContents > .sfv3-object-group .sfv3-observed-row').first().isVisible(),true);
  await search.press('Escape');
  assert.equal(await search.isVisible(),false);
  await page.locator('#sfv3SourceStructureToggle').click();
  assert.equal(await page.locator('.sfv3-source-resource-card[open]').count(),3,
    'toolbar toggles only genuine read-only source disclosures');
  await page.locator('#sfv3SourceStructureToggle').click();
  assert.equal(await page.locator('.sfv3-source-resource-card[open]').count(),0);
  const chapterCard=page.locator('.sfv3-source-resource-card[data-kind="chapters"]');
  assert.equal(await chapterCard.getAttribute('open'),null);
  assert.equal(await chapterCard.locator('.sfv3-observed-row').first().isVisible(),false,
    'read-only chapter rows are not allowed to displace visible video/audio/subtitles');
  await chapterCard.locator('summary').click();
  assert.equal(await chapterCard.getAttribute('open'),'');
  assert.match(await chapterCard.textContent(),/Actual Intro Chapter/);
  await chapterCard.locator('.sfv3-row-select').first().click();
  assert.equal(await page.locator('#sfv3SourceInspector').isVisible(),true,
    'source chapter can still open the one read-only inspector');
  await page.locator('#sfv3SourceInspectorClose').click();
  await chapterCard.locator('summary').click();
  assert.equal(await chapterCard.getAttribute('open'),null);
  await audit('source');
  await page.setViewportSize({width:620,height:900});
  await page.locator('#sfv3SourceSearchToggle').click();
  const compactSearch=await page.locator('#sfv3SourceSearch').boundingBox();
  const compactToolbar=await page.locator('#sfv3SourceToolbar').boundingBox();
  assert.ok(compactSearch && compactToolbar &&
    compactSearch.x>=-2 && compactSearch.x+compactSearch.width<=622 &&
    compactSearch.y>=compactToolbar.y+compactToolbar.height-2 &&
    compactSearch.y+compactSearch.height<=900,
    '620px source search must be anchored directly below toolbar, within viewport');
  await page.locator('#sfv3SourceSearch').press('Escape');
  await page.setViewportSize({width:820,height:1180});
  const sourceSelection=page.locator('#sfv3SourceContents .sfv3-row-select').first();
  await sourceSelection.tap();
  const sourceSheet=page.locator('#sfv3SourceInspector');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),
    'sfv3SourceInspectorClose','source touch selection moves focus to the contextual close control');
  assert.equal(await sourceSheet.isVisible(),true,
    'actual source object selection should open an inspector without an output plan');
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.equal(await sourceSheet.locator('input,select,textarea').count(),0,
    'source object detail must not have writable shadow fields');
  let sourceRect=await sourceSheet.boundingBox();
  assert.ok(sourceRect && sourceRect.x>=-2 && sourceRect.x+sourceRect.width<=822 &&
    sourceRect.y>=0 && sourceRect.y+sourceRect.height<=1182,
    '820px source sheet remains within the viewport');
  const closeHit=await page.locator('#sfv3SourceInspectorClose').boundingBox();
  const selectHit=await sourceSelection.boundingBox();
  assert.ok(closeHit?.width>=44 && closeHit.height>=44 &&
    selectHit?.height>=44, 'source selection and contextual close meet 44px simulated hit minimum');
  await page.setViewportSize({width:620,height:900});
  sourceRect=await sourceSheet.boundingBox();
  assert.ok(sourceRect && sourceRect.x>=-2 && sourceRect.x+sourceRect.width<=622 &&
    sourceRect.y>=0 && sourceRect.y+sourceRect.height<=902,
    'source context survives resize without overflow or losing selection');
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0]?.name),
    'V3 Responsive Fixture.mkv','resizing the sheet does not replace the actual File');
  await page.keyboard.press('Escape');
  assert.equal(await sourceSheet.isVisible(),false,'Escape closes source context');
  assert.equal(await sourceSelection.getAttribute('aria-expanded'),'false');
  assert.equal(await sourceSelection.evaluate(node=>document.activeElement===node),true,
    'Escape restores source keyboard focus to the original observed row');
  await sourceSelection.tap();
  assert.equal(await sourceSheet.isVisible(),true,
    'real touchscreen emulation reopens the single source inspector');
  await page.locator('#sfv3SourceInspectorClose').tap();
  assert.equal(await sourceSheet.isVisible(),false);
  assert.equal(await sourceSelection.evaluate(node=>document.activeElement===node),true,
    'touch close restores focus to the original observed row');
  assert.equal(await page.locator('#sfv3SourceInspector').count(),1,
    'touch interactions never clone source inspectors');
  report.sourceObjectInspectorTested=true;
  report.touchSourceAndKeyboardTested=true;
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#sfv3EnterOutput').click();
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>document.querySelector('#sf14Root')?.dataset.sfv3Surface==='plan');
  const structure=page.locator('#sfv3ObservedStructure');
  await structure.waitFor({state:'visible'});
  assert.equal(await structure.locator('.sfv3-structure-group[data-kind="chapters"] .sfv3-structure-row').count(),1,
    'exact B source Chapter observation must be visible with no write affordance');
  assert.match(await structure.textContent(),/Actual Intro Chapter/);
  assert.match(await structure.textContent(),/Verified Base Source/);
  assert.match(await structure.textContent(),/只读/);
  assert.match(await structure.textContent(),/不等于完整 Matroska EBML/);
  assert.equal(await structure.locator('input,textarea,button,select').count(),0,
    'source observed Chapters and Tags must not become fake editable targets');
  report.readonlyStructureTested=true;
  assert.equal(await structure.evaluate(node=>node.tagName),'DETAILS',
    'Chapter/Tag observations remain accessible as a collapsed disclosure');
  assert.equal(await structure.getAttribute('open'),null,
    'read-only evidence must NOT displace the composed tracks by default');
  const disclosure=structure.locator('summary');
  await disclosure.click();
  assert.equal(await structure.getAttribute('open'),'',
    'Chapter/Tag evidence can be expanded by explicit user action');
  assert.equal(await structure.locator('.sfv3-structure-row').first().isVisible(),true);
  await disclosure.click();
  assert.equal(await structure.getAttribute('open'),null);

  // P0-A: the complete output composition is always ahead of recovery
  // and secondary source evidence, including after responsive reflow.
  const hierarchy=await page.evaluate(()=>{
    const tracks=document.getElementById('compositionTracks');
    const composition=document.getElementById('outputCompositionPanel');
    const recovery=document.getElementById('sf14Recovery');
    const structure=document.getElementById('sfv3ObservedStructure');
    const follows=(a,b)=>Boolean(a && b &&
      (a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      trackBeforeRecovery:follows(tracks,recovery),
      recoveryAfterComposition:follows(composition,recovery),
      recoveryBeforeStructure:follows(recovery,structure),
      trackCount:tracks?.querySelectorAll('button[data-composition-id]').length||0,
      recoveryOwnerCount:document.querySelectorAll('#sf14Recovery').length,
      compositionOwnerCount:document.querySelectorAll('#compositionTracks').length,
    };
  });
  assert.equal(hierarchy.trackBeforeRecovery,true);
  assert.equal(hierarchy.recoveryAfterComposition,true);
  assert.equal(hierarchy.recoveryBeforeStructure,true);
  assert.ok(hierarchy.trackCount>0);
  assert.equal(hierarchy.recoveryOwnerCount,1);
  assert.equal(hierarchy.compositionOwnerCount,1);
  report.p0HierarchyViewportChecks=[];
  for(const [width,height] of [[1440,900],[1180,820],[820,1180],[620,900]]){
    await page.setViewportSize({width,height});
    const first=await page.locator('#compositionTracks button[data-composition-id]').first().boundingBox();
    assert.ok(first && first.width>175 && first.height>39 &&
      first.y>=0 && first.y+first.height<height-75 &&
      first.y<height*.58,
      'actual editable track must appear in upper primary viewport at '+width+
      ': '+JSON.stringify(first));
    assert.equal(await structure.getAttribute('open'),null);
    assert.equal(await page.locator('#sf14Recovery').getAttribute('open'),null);
    await page.screenshot({path:path.join(out,'delivery-plan-'+width+'x'+height+'.png'),
      fullPage:false});
    report.p0HierarchyViewportChecks.push({width,height,
      firstTrackTop:first.y,firstTrackHeight:first.height});
  }
  await audit('plan');
  // A true responsive selected-object inspector must use the ONE original
  // editor as a bottom sheet, not duplicate or discard an input on rotation.
  for(const [width,height] of [[820,1180],[620,900]]) {
    await page.setViewportSize({width,height});
    await page.emulateMedia({reducedMotion:width===620?'reduce':'no-preference'});
    const selection=page.locator('#compositionTracks button[data-composition-id]').first();
    const selectionId=await selection.getAttribute('data-composition-id');
    await selection.tap();
    assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-inspector'),'open');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfv3InspectorClose',
      'touch selection enters the actual composition inspector at '+width);
    const inspector=page.locator('.sf14-pane.sf14-inspector');
    assert.equal(await inspector.isVisible(),true,'selected object sheet visible at '+width);
    const rect=await inspector.boundingBox();
    assert.ok(rect && rect.x>=-2 && rect.x+rect.width<=width+2 &&
      rect.y>=0 && rect.y+rect.height<=height+2,
      'bottom contextual sheet stays in viewport at '+width+': '+JSON.stringify(rect));
    assert.equal(await page.locator('#newSubtitleList').count(),1,
      'object inspector must not duplicate actual editor at '+width);
    assert.equal(await page.locator('#sfv3HistoryDrawer').isVisible(),true,
      'secondary editing history must remain accessible at '+width);
    assert.equal(await page.locator('#sfv3HistoryDrawer').getAttribute('open'),null,
      'secondary editing history must start collapsed at '+width);
    assert.equal(await page.locator('#workspaceHistoryPanel').count(),1,
      'history must be the same original DOM instance at '+width);
    assert.match(await page.locator('#sfv3ObjectContext').textContent(),/视频|Video|MPEG/,
      'selected object detail must reflect the real selected composition row');
    assert.equal(await page.locator('#sf14BackToComposition').isVisible(),false,
      'the hidden legacy Back button must not duplicate V3 Close at '+width);
    const actualVideoIcon=await page.locator(
      '#compositionTracks [data-sfv3-object-kind="video"] .composition-kind'
    ).first().evaluate(node=>getComputedStyle(node,'::before').backgroundImage);
    assert.ok(actualVideoIcon.startsWith('url(') && actualVideoIcon.includes('svg'),
      'real Matroska object icon must resolve an exported SVG at '+width);
    assert.equal(await page.locator('#sfv3InspectorScrim').isVisible(),true);
    const motion=await inspector.evaluate(node=>({
      name:getComputedStyle(node).animationName,
      duration:getComputedStyle(node).animationDuration,
    }));
    assert.equal(width===620,motion.name==='none',
      'reduced-motion preference must remove context-sheet entrance animation');
    await inspector.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
    await page.screenshot({path:path.join(out,'plan-'+width+'x'+height+'-inspector.png'),
      fullPage:false});
    await page.locator('#sfv3InspectorClose').tap();
    assert.equal(await inspector.isVisible(),false,
      'closing responsive sheet returns to same output document');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.compositionId),
      selectionId,'closing target sheet restores the exact real composition row at '+width);
    assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0]?.name),
      'V3 Responsive Fixture.mkv','File identity unchanged after inspector interaction');
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:820,height:1180});
  await page.locator('#compositionTracks button[data-composition-id]').first().click();
  await page.locator('#sfv3HistoryDrawer > summary').click();
  assert.equal(await page.locator('#sfv3HistoryDrawer').getAttribute('open'),'',
    'history disclosure must open when requested');
  assert.equal(await page.locator('#workspaceUndoBtn').count(),1,
    'undo must retain one original control and event authority');
  await page.locator('#sfv3InspectorClose').click();
  // The footer entry point remains a distinct focus origin: Escape should
  // return to it, not to a target tab or an unrelated first composition row.
  await page.locator('#sfv3InspectorOpen').tap();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfv3InspectorClose');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-inspector'),'closed');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfv3InspectorOpen');
  report.touchTargetAndKeyboardTested=true;
  report.contextualInspectorTested=true;
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
