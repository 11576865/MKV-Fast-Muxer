import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out=path.resolve('.e2e/ui-v3-cross-source');
await fs.mkdir(out,{recursive:true});
const a=path.join(out,'A-with-SubRip.mkv');
const b=path.join(out,'B-base.mkv');
const srt=path.join(out,'A-captions.srt');
const dest=path.join(out,'B-with-A-subtitle.mkv');
const run=(args)=>execFileSync('ffmpeg',['-v','error','-y',...args],{timeout:90000});
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
run(['-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1',
  '-c:v','mpeg4','-q:v','5',b]);
await fs.writeFile(srt,'1\n00:00:00,000 --> 00:00:00,700\nFrom A to B, verified.\n');
run(['-i',b,'-i',srt,'-map','0:v:0','-map','1:s:0','-c','copy','-c:s','srt',
  '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=Caption from A',a]);
const aSHA=checksum(await fs.readFile(a)),bSHA=checksum(await fs.readFile(b));
const sourceSubtitle=probe(a).streams.find(x=>x.codec_type==='subtitle');
assert.ok(sourceSubtitle?.index>=0);
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await ctx.newPage();page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const evidence={schema:'softmux-v3-wu02-real-cross-source-v1',
  sourceFiles:[path.basename(a),path.basename(b)],
  sourceSHA256:{a:aSHA,b:bSHA},screenshots:[],steps:[],
  limits:'Native browser-backed UI flow for a bounded SubRip source. Not ASS/font closure, raw EBML preservation, motion fidelity or physical device acceptance.'};
const screenshot=async name=>{
  await page.screenshot({path:path.join(out,name),fullPage:false});
  evidence.screenshots.push(name);
};
try {
  await page.goto(new URL('?ui=v3',base).href,{waitUntil:'networkidle'});
  await page.setInputFiles('#unifiedAssetInput',[b,a]);
  // Two MKVs can legitimately be ambiguous: do not require the legacy
  // engine to silently choose B before the user explicitly selects a target.
  await page.waitForFunction(()=>
    document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2 &&
    document.querySelectorAll('#sfv3Tabs [data-sfv3-source-key]').length===2 &&
    !(document.querySelector('#assetImportStatus')?.textContent||'').includes('正在'),
    null,{timeout:120000});
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  const aTab=page.locator('#sfv3Tabs [data-sfv3-source-key]').filter({hasText:'A-with-SubRip'});
  await aTab.click();
  await page.waitForFunction(()=>
    document.querySelector('#videoInput')?.files?.[0]?.name==='A-with-SubRip.mkv' &&
    document.querySelector('#sfv3FileName')?.textContent==='A-with-SubRip.mkv' &&
    document.querySelector('#sfv3SourceContents .sfv3-row-action'),
    null,{timeout:150000});
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
    'opening A for read-only observation must not authorize any target');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  await aTab.focus();
  const focusStable=await page.evaluate(async()=>{
    const tab=document.activeElement;
    document.getElementById('compositionTracks').appendChild(document.createComment('V3 observer focus test'));
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    return tab?.isConnected && document.activeElement===tab &&
      tab.dataset.sfv3SourceKey;
  });
  assert.ok(focusStable,'async scanner repaint must preserve the selected tab and keyboard focus');
  await screenshot('wu02-view-A-before-target.png');
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  const selectObserved=page.locator('#sfv3SourceContents .sfv3-row-select')
    .filter({hasText:'Caption from A'}).first();
  await selectObserved.click();
  const sourceSheet=page.locator('#sfv3SourceInspector');
  const direct=page.locator('#sfv3SourceInlineActions');
  await direct.waitFor({state:'visible'});
  assert.equal(await sourceSheet.isVisible(),false,
    'desktop source selection must reveal local actions, not an automatic 440px inspector');
  assert.equal(await direct.locator('#sfv3SourceInspectorAdd').count(),1);
  assert.equal(await page.locator('#sfv3SourceInspectorAdd').count(),1,
    'one original Add-to action is rehosted, not cloned');
  await screenshot('wu04-source-subtitle-direct-actions.png');
  await page.locator('#sfv3SourceInlineDetail').click();
  await sourceSheet.waitFor({state:'visible'});
  assert.match(await sourceSheet.textContent(),/A-with-SubRip/);
  assert.match(await sourceSheet.textContent(),/Caption from A/);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
    'inspecting a source object alone must never create target authorization');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  await screenshot('wu04-source-subtitle-inspector.png');
  await page.locator('#sfv3SourceInspectorAdd').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true,
    'source inspector Add-to must route to the existing explicit target chooser');
  await page.locator('.sfv3-picker-cancel').click();
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  await page.locator('#sfv3SourceInspectorClose').click();
  assert.equal(await sourceSheet.isVisible(),false);
  assert.equal(await page.locator('#sfv3SourceContents .sfv3-row-select[aria-expanded="true"]').count(),0);
  evidence.steps.push('source object inspection and cancelled Add-to preserve no-target state');
  await page.locator('#sfv3SourceContents .sfv3-row-action').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false);
  // V3-03: B remains a real read-only base; the new blank destination is
  // now a DIFFERENT, explicit, enabled radio with real stream-selection scope.
  const picker=page.locator('#sfv3TargetPicker');
  assert.equal(await picker.locator('.sfv3-picker-option').count(),2);
  assert.equal(await picker.locator('.sfv3-picker-option input:checked').count(),1);
  assert.match(await picker.locator('.sfv3-picker-file-name').textContent(),/以 B-base\.mkv 为基础/);
  assert.match(await picker.locator('.sfv3-picker-file-detail').textContent(),/原文件只读/);
  assert.equal(await picker.locator('input[value="__v3_blank__"]').isDisabled(),false);
  assert.equal(await picker.locator('#sfv3BlankStreamSelection').isVisible(),false);
  // The three required icons are exported from approved Figma nodes, loaded
  // through local Vite assets rather than temporary MCP URLs or text glyphs.
  await page.waitForFunction(()=>{
    const images=[...document.querySelectorAll('#sfv3TargetPicker img.sfv3-svg-icon')];
    return ['picker-selected','picker-empty-target','picker-confirm'].every(asset=>
      images.some(image=>image.dataset.sfv3Icon===asset&&
        image.complete&&image.naturalWidth>0));
  },null,{timeout:15000});
  const pickerIconProof=await picker.locator('img.sfv3-svg-icon').evaluateAll(images=>
    images.map(img=>({name:img.dataset.sfv3Icon,src:img.getAttribute('src'),
      loaded:img.complete&&img.naturalWidth>0})));
  for(const asset of ['picker-selected','picker-empty-target','picker-confirm']) {
    assert.ok(pickerIconProof.some(entry=>entry.name===asset&&entry.loaded&&
      !entry.src.includes('figma.com/api/mcp/asset')),
      'exact Figma V3-03 SVG must load: '+asset);
  }
  const desktopPicker=await picker.boundingBox();
  assert.ok(desktopPicker && desktopPicker.width>=310 && desktopPicker.width<=342 &&
    desktopPicker.x>1440/2 && desktopPicker.x+desktopPicker.width<=1440 &&
    desktopPicker.y>=0 && desktopPicker.y+desktopPicker.height<=900,
    'V3-03 destination card must appear in desktop right object-context region');
  await screenshot('wu02-target-dialog.png');
  await page.setViewportSize({width:820,height:1180});
  const portraitPicker=await picker.boundingBox();
  assert.ok(portraitPicker && portraitPicker.x>=0 &&
    portraitPicker.x+portraitPicker.width<=820 && portraitPicker.y>=0 &&
    portraitPicker.y+portraitPicker.height<=1180,
    'same native destination dialog must remain inside portrait viewport');
  await screenshot('wu02-target-dialog-820.png');
  await page.setViewportSize({width:1440,height:900});
  evidence.steps.push('V3-03 real File chooser matches desktop/right and portrait/center card states');
  await page.locator('.sfv3-picker-cancel').click();
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.steps.push('read-only A observation and cancellation do not create target');
  await page.locator('#sfv3SourceContents .sfv3-row-action').click();
  const options=page.locator('#sfv3PickerOptions input[name="sfv3TargetBase"]');
  assert.equal(await options.count(),2);
  assert.match(await page.locator('#sfv3PickerOptions').textContent(),/B-base\.mkv/);
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>
    document.querySelector('#sf14Root')?.dataset.sfv3TargetConfirmed==='true' &&
    document.querySelector('#sfv3TargetTab')?.hidden===false,null,{timeout:60000});
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0].name),'B-base.mkv');
  evidence.steps.push('explicit B target selected by exact imported File identity');
  await page.waitForFunction(()=>
    document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===1 &&
    document.querySelector('#muxBtn')?.disabled===false,
    null,{timeout:180000});
  assert.match(await page.locator('#assetInventory .asset-entry[data-kind="subtitle"]').textContent(),
    /A-with-SubRip/);
  evidence.steps.push('real FFmpeg.wasm source SubRip extraction and external-track binding');
  await page.locator('#sfv3TargetTab').click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'plan');
  assert.equal(await page.locator('#outputCompositionPanel').isVisible(),true);
  assert.equal(await page.locator('#sfv3PlanHeading').isVisible(),true);
  assert.match(await page.locator('#sfv3PlanName').textContent(),/B-base\.mkv/);
  assert.match(await page.locator('#sfv3PlanFacts').textContent(),/为基础/);
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-inspector'),'closed');
  assert.equal(await page.locator('.sf14-pane.sf14-inspector').isVisible(),false);
  const groups=page.locator('#compositionTracks .sfv3-target-group');
  assert.ok(await groups.count()>=2,'target must display actual grouped Matroska objects');
  assert.equal(await page.locator('#compositionTracks [data-composition-id]').count(),
    await page.locator('#compositionTracks .sfv3-target-group [data-composition-id]').count(),
    'grouping must move the real editor buttons, not create a second copy');
  // Choosing an output object must route to the SINGLE existing editor,
  // not a second React/Figma form with divorced title or flags state.
  const embeddedOutputSub=page.locator('#compositionTracks button[data-composition-id]')
    .filter({hasText:'Caption from A'});
  assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').isVisible(),false,
    'flag help must not appear when no subtitle object is selected');
  await embeddedOutputSub.click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-inspector'),'open',
    'selecting real target object must open the contextual inspector');
  assert.equal(await page.locator('.sf14-pane.sf14-inspector').isVisible(),true);
  const realSubtitleTitle=page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="0"]');
  await realSubtitleTitle.waitFor();
  assert.equal(await realSubtitleTitle.inputValue(),'Caption from A');
  assert.equal(await page.locator('#compositionTracks button[aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="0"]').count(),1);
  const flagHelp=page.locator('#sfv3SubtitleFlagsHelp');
  await flagHelp.waitFor({state:'visible'});
  await flagHelp.locator('summary').click();
  assert.equal(await flagHelp.getAttribute('open'),'');
  assert.match(await flagHelp.textContent(),/Default.*Forced/s);
  assert.match(await flagHelp.textContent(),/不保证所有播放器/);
  assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="default"][data-index="0"]').count(),1);
  assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="forced"][data-index="0"]').count(),1);
  evidence.steps.push('selected subtitle reveals optional Default/Forced semantics without a second editor');
  await page.locator('#sfv3InspectorClose').click();
  assert.equal(await page.locator('.sf14-pane.sf14-inspector').isVisible(),false);
  await page.locator('#sfv3InspectorOpen').click();
  assert.equal(await page.locator('.sf14-pane.sf14-inspector').isVisible(),true,
    'same existing editor must remain accessible after dismissing it');
  // WU-03: a source tab remains read-only EVEN AFTER an output target exists.
  // Do not rely on CSS hiding the underlying legacy source-editor controls.
  await page.locator('#sfv3SourceTab').click();
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').isVisible(),false,
    'source observation must not retain target-only flag help');
  await page.waitForFunction(()=>document.getElementById('muxBtn')?.disabled===true);
  const sourceCheckbox=page.locator('#assetInventory input[data-asset-include]').first();
  assert.ok(await sourceCheckbox.count(),'real imported subtitle should have an include control');
  assert.equal(await sourceCheckbox.isDisabled(),true,
    'source view must mark legacy output-mutating inventory controls disabled');
  const attempted=await sourceCheckbox.evaluate(el=>{
    const before=el.checked;
    el.checked=!before;
    const event=new Event('change',{bubbles:true,cancelable:true});
    el.dispatchEvent(event);
    return {before,blocked:event.defaultPrevented};
  });
  assert.equal(attempted.blocked,true,
    'source-side synthetic change should be stopped before the real mutation handler');
  await page.locator('#sfv3TargetTab').click();
  await page.waitForFunction(()=>document.querySelector('#muxBtn')?.disabled===false);
  assert.equal(await page.locator('#assetInventory input[data-asset-include]').first().isChecked(),
    attempted.before,'source-only edit attempt must not change canonical subtitle inclusion');
  assert.equal(await page.locator('#sfv3PlanHeading').isVisible(),true);
  evidence.steps.push('read-only source view blocks actual edit handlers after target creation; target editor still works');
  await screenshot('wu02-confirmed-target.png');
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>/^完成。/.test(document.querySelector('#status')?.textContent||''),
    null,{timeout:180000});
  await page.locator('#sfv3InspectorOpen').click();
  assert.equal(await page.locator('#downloadLink').isVisible(),true,
    'real finished-file link must be accessible through the contextual inspector');
  const [download]=await Promise.all([
    page.waitForEvent('download'),page.locator('#downloadLink').click(),
  ]);
  await download.saveAs(dest);
  const output=probe(dest);
  assert.equal(output.streams.filter(x=>x.codec_type==='video').length,1);
  const subs=output.streams.filter(x=>x.codec_type==='subtitle');
  assert.equal(subs.length,1);
  assert.equal(subs[0].codec_name,'subrip');
  assert.equal(subs[0].tags?.language,'eng');
  assert.equal(subs[0].tags?.title,'Caption from A');
  assert.equal(checksum(await fs.readFile(a)),aSHA);
  assert.equal(checksum(await fs.readFile(b)),bSHA);
  assert.deepEqual(errors,[]);
  evidence.steps.push('real B.mkv output contains one verified A SubRip; A and B source SHA unchanged');
  await screenshot('wu02-output-complete.png');
  // Deleting the exact target File is NOT simply hiding a panel: the
  // authorized output document and its writer ability must both disappear.
  const targetRow=page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'B-base.mkv'})});
  // V3 deliberately uses a collapsed source drawer in its target view.
  // Exercise the actual visible entry point, not a hidden legacy control.
  await page.locator('#sf14SourceToggle').click();
  await targetRow.locator('button[data-asset-remove]').click();
  await page.waitForFunction(()=> {
    const root=document.querySelector('#sf14Root');
    return root?.dataset.sfv3TargetConfirmed==='false' &&
      document.querySelector('#sfv3TargetTab')?.hidden===true &&
      document.querySelector('#outputCompositionPanel')?.hidden===true &&
      document.querySelector('#compositionTracks [data-composition-id]')===null &&
      document.querySelector('#muxBtn')?.disabled===true;
  },null,{timeout:90000});
  assert.equal(await page.locator('#sfv3PlanHeading').isVisible(),false);
  evidence.steps.push('removing exact B target revokes plan, empty output model and writer ability');
  await screenshot('wu03-target-revoked.png');
  await fs.writeFile(path.join(out,'wu02-acceptance.json'),
    JSON.stringify({...evidence,passed:true,outputSHA256:checksum(await fs.readFile(dest))},null,2)+'\n');
  console.log('V3 WU02 real A SubRip -> explicit B target -> verified output: PASS');
}catch(error){
  await screenshot('wu02-failure.png').catch(()=>{});
  await fs.writeFile(path.join(out,'wu02-acceptance.json'),
    JSON.stringify({...evidence,passed:false,error:String(error),errors},null,2)+'\n');
  console.error('V3 WU02 diagnostic:',await page.locator('#status').textContent().catch(()=>''));
  throw error;
}finally{
  await ctx.close();
  await browser.close();
}
