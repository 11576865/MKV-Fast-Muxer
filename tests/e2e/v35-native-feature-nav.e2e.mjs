import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// V3.5 source/batch/tool entry PILOT only: reuses the existing actual batch
// editor and original File inputs. Does not claim full 55-state implementation.
const output=path.resolve('.e2e/ui-v35-navigation');
await mkdir(output,{recursive:true});
const source=path.join(output,'Pilot S01E01.mkv');
const subtitle=path.join(output,'Pilot S01E01.srt');
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=640x360:r=24:d=1',
  '-c:v','mpeg4','-q:v','4',source,
],{stdio:'pipe'});
await writeFile(subtitle,'1\n00:00:00,100 --> 00:00:00,900\nV3.5 navigation pilot\n\n');
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{
    executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const ctx=await browser.newContext({
  viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true,
});
const page=await ctx.newPage(),pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const evidence={
  schema:'softmux-v35-real-native-entry-pilot-v2',
  source:path.basename(source),
  claims:[],
  limits:[
    'Opt-in ?ui=v3&nav=full; default V3 and original visual authority remain unchanged',
    'Opening the real Batch workspace does not itself certify 20-job execution or saved MKV',
    'Browser screenshots are not approved Figma pixel-diff or physical tablet tests',
  ],
};
try {
  await page.goto(new URL('?ui=v3&nav=full',base).href,{waitUntil:'networkidle'});
  const root=page.locator('#sf14Root.sfv3.sfv35-nav');
  await root.waitFor();
  const nav=page.locator('#sfv35FeatureNavigation');
  assert.deepEqual(await nav.locator('button').allTextContents(),
    ['来源','拟输出','轨道','字幕','字体','附件',
      '批量任务','验证','工程','容器工具']);
  assert.equal(await nav.locator('[data-sfv35-task="source"]').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#sf14Batch').count(),1);
  assert.equal(await page.locator('#batchPlan').count(),1);
  assert.equal(await page.locator('#unifiedAssetInput').count(),1);
  assert.equal(await page.locator('#muxBtn').count(),1);
  await page.setInputFiles('#unifiedAssetInput',source);
  // V3's approved first-source path is a real Matroska source; do not
  // generalize an MP4-only input fixture into a V3 MKV inventory failure.
  await page.waitForFunction(()=>{
    const f=document.getElementById('videoInput')?.files?.[0];
    return f?.name==='Pilot S01E01.mkv' &&
      document.getElementById('sfv3FileName')?.textContent===f.name &&
      document.querySelector('#sfv3SourceContents .sfv3-observed-row');
  },null,{timeout:45000});
  await page.evaluate(()=>{
    window.__v35Source=document.getElementById('videoInput').files[0];
  });
  await page.screenshot({path:path.join(output,'01-source.png')});
  evidence.claims.push('real input yields source-only presentation with one File identity');

  await nav.locator('[data-sfv35-task="plan"]').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true,
    'no approved target means an explicit picker, never implicit writing');
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-target-confirmed'),'false');
  await page.locator('.sfv3-picker-cancel').click();

  await nav.locator('[data-sfv35-task="batch"]').click();
  assert.equal(await root.getAttribute('data-view'),'batch');
  assert.equal(await page.locator('#sf14Batch').isVisible(),true);
  assert.equal(await page.locator('#sf14Single').isVisible(),false,
    'original single-workbench grid must not overlap the batch');
  assert.equal(await page.locator('#sf14Root [data-sf-view="batch"]').count(),1,
    'only original native batch view owner exists');
  assert.equal(await nav.locator('[data-sfv35-task="batch"]').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#batchUnifiedInput').count(),1);
  assert.equal(await page.locator('#batchPlan').count(),1);
  assert.equal(await page.locator('#batchStartBtn').isDisabled(),true,
    'empty batch does not claim an executable plan');
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-target-confirmed'),'false');
  await page.screenshot({path:path.join(output,'02-batch-empty.png')});
  evidence.claims.push('visible batch task uses exact production batch matrix and no fabricated plan');

  const [chooser]=await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#sf14Add').click(),
  ]);
  assert.equal(await chooser.element().evaluate(el=>el.id),'batchUnifiedInput',
    'global Add must follow the active batch, not replace the single-project source');
  await chooser.setFiles([source,subtitle]);
  // The canonical importer intentionally clears input.value immediately
  // after it transfers exact File identity to its domain-owned inventory.
  // Assert the actual recognized assets, never the reset file picker.
  await page.waitForFunction(()=>
    document.querySelectorAll('#batchAssetInventory .asset-entry').length===2 &&
    (document.querySelector('#batchAssetStatus')?.textContent||'').includes('2 文件'),
  null,{timeout:60000});
  assert.equal(await page.evaluate(()=>
    window.__v35Source===document.getElementById('videoInput').files[0]),true,
    'opening/importing batch cannot replace the independent single-project File');
  await page.screenshot({path:path.join(output,'03-batch-imported.png')});
  evidence.claims.push('batch Add routes to one original batch importer; single source identity remains stable');

  await nav.locator('[data-sfv35-task="tools"]').click();
  assert.equal(await root.getAttribute('data-view'),'tools');
  assert.equal(await page.locator('#sf14Tools').isVisible(),true);
  assert.equal(await page.locator('#sf14Single').isVisible(),false);
  assert.equal(await nav.locator('[data-sfv35-task="tools"]').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#sf14ToolList').count(),1);
  await page.screenshot({path:path.join(output,'04-tools.png')});

  await nav.locator('[data-sfv35-task="source"]').click();
  assert.equal(await root.getAttribute('data-view'),'single');
  assert.equal(await root.getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.locator('#sf14Single').isVisible(),true);
  assert.equal(await page.locator('#sf14Batch').isVisible(),false);
  assert.equal(await nav.locator('[data-sfv35-task="source"]').getAttribute('aria-current'),'page');
  assert.equal(await page.evaluate(()=>
    window.__v35Source===document.getElementById('videoInput').files[0]),true);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.claims.push('round-trip tools/batch/source retains File and target authorization boundary');

  // Actual full-capability contextual navigation: not copies of editors.
  await nav.locator('[data-sfv35-task="project"]').click();
  assert.equal(await root.getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.locator('#sf14Recovery').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#sf14Recovery').count(),1);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  evidence.claims.push('project recovery is the one real cross-session draft control and needs no target');

  await nav.locator('[data-sfv35-task="attachments"]').click();
  assert.equal(await root.getAttribute('data-view'),'tools');
  assert.equal(await page.locator('#sf14Tools').isVisible(),true);
  assert.equal(await page.locator('#attachmentExtractionDetails').count(),1);
  assert.equal(await page.locator('#attachmentExtractionDetails').evaluate(el=>el.open),true);
  assert.equal(await nav.locator('[data-sfv35-task="attachments"]').getAttribute('aria-current'),'page');
  await page.screenshot({path:path.join(output,'05-attachments-native-tools.png')});
  evidence.claims.push('attachment entry opens original read/inspect/extract tool, no writer bypass');

  await nav.locator('[data-sfv35-task="tracks"]').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true,
    'track editor requires an explicitly approved output target');
  assert.equal(await root.getAttribute('data-sfv3-target-confirmed'),'false');
  await page.locator('.sfv3-picker-cancel').click();
  assert.equal(await root.getAttribute('data-sfv3-surface'),'source');
  assert.equal(await root.getAttribute('data-sfv3-target-confirmed'),'false');

  await nav.locator('[data-sfv35-task="subtitle"]').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true);
  await page.locator('#sfv3ConfirmTarget').click();
  await page.waitForFunction(()=>{
    const el=document.querySelector('#sf14Root');
    return el?.dataset.sfv3Surface==='plan' &&
      el?.dataset.sfv35Task==='subtitle' &&
      el?.dataset.sfv3TargetConfirmed==='true';
  },null,{timeout:60000});
  assert.equal(await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#sf14PreviewDrawer').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#sfv3InspectorOpen').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#newSubtitleList').count(),1);
  await page.screenshot({path:path.join(output,'06-subtitle-native-inspector.png')});
  evidence.claims.push('deferred subtitle entry resumes only after explicit target acceptance and uses one inspector');

  await nav.locator('[data-sfv35-task="font"]').click();
  assert.equal(await root.getAttribute('data-sfv3-surface'),'plan');
  assert.equal(await page.locator('#sf14OptionsDrawer').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#fontMode').count(),1);
  assert.equal(await nav.locator('[data-sfv35-task="font"]').getAttribute('aria-current'),'page');
  await page.screenshot({path:path.join(output,'07-font-native-editor.png')});

  await nav.locator('[data-sfv35-task="tracks"]').click();
  assert.equal(await page.locator('#sfv3InspectorOpen').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#compositionTracks').count(),1);
  assert.equal(await nav.locator('[data-sfv35-task="tracks"]').getAttribute('aria-current'),'page');

  await nav.locator('[data-sfv35-task="verification"]').click();
  assert.equal(await page.locator('#sfv3Verification').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#sfv3InspectorOpen').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#outputEvidencePanel').count(),1);
  assert.equal(await page.locator('#outputEvidencePanel').isVisible(),false,
    'no output was generated; verification cannot claim a completed delivery');
  await page.screenshot({path:path.join(output,'08-verification-unverified.png')});
  evidence.claims.push('real verification summary opens without inventing a generated or audited MKV');

  await nav.locator('[data-sfv35-task="project"]').click();
  assert.equal(await root.getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.locator('#sf14Recovery').evaluate(el=>el.open),true);
  assert.equal(await page.evaluate(()=>
    window.__v35Source===document.getElementById('videoInput').files[0]),true);
  await nav.locator('[data-sfv35-task="source"]').click();
  assert.equal(await nav.locator('[data-sfv35-task="source"]').getAttribute('aria-current'),'page');

  await page.setViewportSize({width:620,height:900});
  const boxes=await nav.locator('button').evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect();return {width:r.width,height:r.height};
  }));
  assert.equal(boxes.length,10);
  assert.ok(boxes.every(b=>b.width>=49&&b.height>=39),
    'all ten compact named task buttons have a visible touch target');
  const rows=await nav.locator('button').evaluateAll(nodes=>[
    ...new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().top)))
  ]);
  assert.equal(rows.length,2,'compact layout must show ten entries in two rows');
  await page.screenshot({path:path.join(output,'09-compact-ten-entry-navigation.png')});
  assert.deepEqual(pageErrors,[]);
  await writeFile(path.join(output,'navigation-evidence.json'),
    JSON.stringify({...evidence,passed:true},null,2)+'\n');
  console.log('V3.5 ten real native task/context entries and no implicit output authority: PASS');
}catch(error){
  evidence.domAtFailure=await page.evaluate(()=>({
    rootView:document.querySelector('#sf14Root')?.dataset?.view,
    surface:document.querySelector('#sf14Root')?.dataset?.sfv3Surface,
    file:document.querySelector('#videoInput')?.files?.[0]?.name,
    activeTitle:document.querySelector('#sfv3FileName')?.textContent,
    observedRows:document.querySelectorAll('#sfv3SourceContents .sfv3-observed-row').length,
    batchCount:document.querySelectorAll('#batchPlan [data-batch-job-index]').length,
  })).catch(()=>null);
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(output,'navigation-evidence.json'),
    JSON.stringify({...evidence,passed:false,error:String(error),pageErrors},null,2)+'\n');
  throw error;
}finally{
  await ctx.close();await browser.close();
}
