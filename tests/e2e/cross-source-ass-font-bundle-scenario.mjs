import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyFinishedMkvAssRender} from '../../scripts/p3-final-ass-render-proof.mjs';

const run=(command,args)=>execFileSync(command,args,{
  encoding:'utf8',timeout:120000,maxBuffer:24*1024*1024,
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const probe=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',file,
]));
function sameStream(before,after,kind){
  const original=before.streams.find(x=>x.codec_type===kind);
  const delivered=after.streams.find(x=>x.codec_type===kind);
  assert.ok(original&&delivered,kind+' stream must exist in output');
  assert.equal(delivered.codec_name,original.codec_name);
  const packets=data=>data.packets.filter(x=>x.stream_index===(data===before?original.index:delivered.index));
  const first=packets(before),second=packets(after);
  assert.ok(first.length>0);
  assert.deepEqual(second.map(p=>p.data_hash),first.map(p=>p.data_hash),
    'B '+kind+' compressed packet hashes and per-stream order');
  for(let i=0;i<first.length;i++)
    for(const field of ['pts_time','dts_time']){
      if(first[i][field]==null||second[i][field]==null)continue;
      assert.ok(Math.abs(Number(first[i][field])-Number(second[i][field]))<=0.0011,
        'B '+kind+' '+field+' changed');
    }
}
export async function scenarioCrossSourceAssFontBundle(browser,{root,outDir,baseUrl}) {
  await fs.mkdir(outDir,{recursive:true});
  const sourceA=path.join(outDir,'A-with-ASS-and-font.mkv');
  const sourceB=path.join(outDir,'B-with-original-media.mkv');
  const noFont=path.join(outDir,'A-with-ASS-no-font.mkv');
  const output=path.join(outDir,'B-with-A-ASS-font-browser.mkv');
  const ass=path.join(root,'p3-embedded-proof.ass');
  const font=path.join(root,'P3EmbeddedProof.ttf');
  assert.ok(!(run('fc-list',[':', 'family']).includes('UIGS P3 Embedded Proof')),
    'source family must be absent from installed font inventory');
  run('ffmpeg',['-v','error','-nostdin','-y','-copyts','-i',path.join(root,'base.mp4'),
    '-i',ass,'-map','0','-map','1:s:0','-c','copy','-attach',font,
    '-metadata:s:t:0','mimetype=font/ttf','-metadata:s:t:0','filename=P3EmbeddedProof.ttf',
    '-metadata:s:s:0','title=Source ASS proof','-metadata:s:s:0','language=eng',
    '-avoid_negative_ts','disabled',sourceA]);
  run('ffmpeg',['-v','error','-nostdin','-y','-copyts','-i',path.join(root,'base.mp4'),
    '-map','0','-c','copy','-avoid_negative_ts','disabled',sourceB]);
  run('ffmpeg',['-v','error','-nostdin','-y','-copyts','-i',path.join(root,'base.mp4'),
    '-i',ass,'-map','0','-map','1:s:0','-c','copy',
    '-avoid_negative_ts','disabled',noFont]);
  const sourceSha=sha(await fs.readFile(sourceA)),targetSha=sha(await fs.readFile(sourceB));
  const beforeB=probe(sourceB);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:950}});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(String(error)));
  const a=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'A-with-ASS-and-font.mkv'})});
  const b=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'B-with-original-media.mkv'})});
  try{
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[sourceA,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2,
      null,{timeout:120000});
    await b().locator('[data-asset-source]').check();
    await page.waitForFunction(()=>
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-with-original-media.mkv' &&
      document.querySelector('[data-secondary-subtitle-inspect]'),null,{timeout:120000});
    await a().locator('[data-secondary-subtitle-inspect]').click();
    await page.waitForFunction(()=>
      document.querySelector('[data-secondary-subtitles][data-state="inspected"]') &&
      document.querySelector('[data-secondary-subtitle-add]'),null,{timeout:120000});
    const add=a().locator('[data-secondary-subtitle-add]').first();
    assert.equal(await add.isEnabled(),true);
    assert.match(await add.textContent(),/加入字幕与字体/);
    await add.click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===1 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="font"]').length===1 &&
      document.querySelector('#subInput')?.files?.length===1 &&
      document.querySelector('#fontInput')?.files?.length===1 &&
      !document.querySelector('#muxBtn')?.disabled,
      null,{timeout:180000});
    assert.equal(await a().locator('[data-secondary-subtitle-add]').first().isDisabled(),true);
    assert.equal(await page.locator('#videoInput').evaluate(e=>e.files[0].name),
      'B-with-original-media.mkv');
    assert.equal(await page.locator('#fontInput').evaluate(e=>e.files[0].name),
      'P3EmbeddedProof.ttf');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="0"]').inputValue(),
      'Source ASS proof');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="language"][data-index="0"]').inputValue(),
      'eng');
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>/^完成。/.test(document.querySelector('#status')?.textContent||'') &&
      !document.querySelector('#muxBtn')?.disabled,null,{timeout:180000});
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#downloadLink').click(),
    ]);
    await download.saveAs(output);
    const final=probe(output);
    assert.equal(final.streams.filter(x=>x.codec_type==='subtitle'&&x.codec_name==='ass').length,1);
    assert.equal(final.streams.filter(x=>x.codec_type==='attachment').length,1);
    const result=await verifyFinishedMkvAssRender({
      finalMkv:output,sourceAss:ass,sourceFont:font,
      outputDir:path.join(outDir,'independent-render'),
    });
    assert.equal(result.ok,true);
    for(const kind of ['video','audio'])sameStream(beforeB,final,kind);
    assert.equal(sha(await fs.readFile(sourceA)),sourceSha);
    assert.equal(sha(await fs.readFile(sourceB)),targetSha);
    await a().locator('[data-asset-remove]').click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===1 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===0 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="font"]').length===0,
      null,{timeout:120000});
    assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false');
    assert.equal(await page.locator('#videoInput').evaluate(e=>e.files[0].name),
      'B-with-original-media.mkv');
    // The approved V3 source-first UI must reach this same validated
    // ASS+font executor, not merely offer a static mock Add-to control.
    const v3Url=new URL(baseUrl);
    v3Url.searchParams.set('ui','v3');
    await page.goto(v3Url.href,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[sourceA,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#sfv3Tabs [data-sfv3-source-key]').length===2,
      null,{timeout:120000});
    const sourceTab=page.locator('#sfv3Tabs [data-sfv3-source-key]')
      .filter({hasText:'A-with-ASS-and-font.mkv'});
    await sourceTab.click();
    await page.waitForFunction(()=>
      document.querySelector('#videoInput')?.files?.[0]?.name==='A-with-ASS-and-font.mkv' &&
      [...document.querySelectorAll('#sfv3SourceContents .sfv3-row-select')]
        .some(x=>x.textContent.includes('Source ASS proof')),
      null,{timeout:120000});
    assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
      'V3 source observation is not output authorization');
    await page.locator('#sfv3SourceContents .sfv3-row-select')
      .filter({hasText:'Source ASS proof'}).click();
    await page.waitForFunction(()=>
      document.querySelector('#sfv3SourceFontEvidence')?.textContent
        ?.includes('1 项疑似字体附件'),null,{timeout:60000});
    assert.equal(await page.locator('#sfv3SourceFontEvidence li').count(),1);
    assert.match(await page.locator('#sfv3SourceFontEvidence').textContent(),/P3EmbeddedProof\.ttf/);
    assert.match(await page.locator('#sfv3SourceFontEvidence').textContent(),/不等于字体 face/);
    assert.equal(await page.locator('#sfv3SubtitleFlagsHelp').count(),1);
    assert.equal(await page.locator('#sfv3SourceInspector #sfv3SubtitleFlagsHelp').isVisible(),true);
    assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false,
      'font observation and technical help do not authorize a target');
    await page.screenshot({path:path.join(outDir,'v3-source-ass-font-observation.png')});
    const v3Add=page.locator('#sfv3SourceInspectorAdd');
    assert.equal(await v3Add.isVisible(),true,
      'V3 must offer a font-closure-gated Add-to for scanned ASS');
    assert.match(await v3Add.textContent(),/校验 ASS 与字体/);
    await v3Add.click();
    assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true);
    assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
    assert.match(await page.locator('#sfv3PickerOptions').textContent(),/B-with-original-media.mkv/);
    await page.locator('#sfv3ConfirmTarget').click();
    await page.waitForFunction(()=>
      document.querySelector('#sf14Root')?.dataset.sfv3TargetConfirmed==='true' &&
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-with-original-media.mkv',
      null,{timeout:120000});
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===1 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="font"]').length===1 &&
      document.querySelector('#muxBtn')?.disabled===false,
      null,{timeout:180000});
    assert.equal(await page.locator('#fontInput').evaluate(x=>x.files[0]?.name),'P3EmbeddedProof.ttf');
    assert.equal(await page.locator('#subInput').evaluate(x=>x.files.length),1);
    assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'plan');
    await page.waitForFunction(()=>
      document.querySelector('#sfv3AssFontDependencies:not([hidden])') &&
      document.querySelector('#sfv3AssFontDependencies .sfv3-ass-font-bundle[data-binding="bound"]'),
      null,{timeout:60000});
    const dependencyCard=page.locator('#sfv3AssFontDependencies .sfv3-ass-font-bundle');
    assert.equal(await dependencyCard.count(),1);
    assert.match(await dependencyCard.textContent(),/A-with-ASS-and-font\.mkv/);
    assert.match(await dependencyCard.textContent(),/P3EmbeddedProof\.ttf/);
    assert.match(await dependencyCard.textContent(),/尚未执行最终封装及成品审计/);
    const realAssRow=page.locator('#compositionTracks .sfv3-target-group[data-kind="subtitle"] button.composition-row[data-sfv3-ass-font="bound"]');
    assert.equal(await realAssRow.count(),1,
      'real source ASS+font entry is visually identified without cloning a composition control');
    assert.match(await realAssRow.textContent(),/来自 A-with-ASS-and-font\.mkv/);
    assert.match(await realAssRow.textContent(),/字体依赖 1 项/);
    assert.equal(await realAssRow.locator('.sfv3-target-ass-font-note').count(),1);
    assert.equal(await page.locator('#compositionTracks button[data-composition-id]').count(),
      await page.locator('#compositionTracks button.composition-row.composition-select').count(),
      'V3 source-binding decoration must never create an extra editable composition button');
    await page.setViewportSize({width:820,height:1180});
    let assRect=await realAssRow.boundingBox();
    assert.ok(assRect && assRect.x>=-2 && assRect.x+assRect.width<=822,
      '820px real ASS row remains within the portrait viewport');
    await page.setViewportSize({width:620,height:900});
    assRect=await realAssRow.boundingBox();
    assert.ok(assRect && assRect.x>=-2 && assRect.x+assRect.width<=622,
      '620px real ASS row remains within the compact viewport');
    await page.setViewportSize({width:1440,height:950});
    assert.equal(await dependencyCard.locator('input,select,textarea,button').count(),0,
      'real dependency facts remain read-only; edits stay in original editor');
    await page.screenshot({path:path.join(outDir,'v3-ass-font-authorized-plan.png')});
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>/^完成。/.test(document.querySelector('#status')?.textContent||'') &&
      !document.querySelector('#muxBtn')?.disabled,
      null,{timeout:180000});
    await page.locator('#sfv3InspectorOpen').click();
    const v3Final=path.join(outDir,'B-with-A-ASS-font-v3-browser.mkv');
    const [v3Download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#downloadLink').click(),
    ]);
    await v3Download.saveAs(v3Final);
    const v3Probe=probe(v3Final);
    assert.equal(v3Probe.streams.filter(s=>s.codec_type==='subtitle'&&s.codec_name==='ass').length,1);
    assert.equal(v3Probe.streams.filter(s=>s.codec_type==='attachment').length,1);
    for(const kind of ['video','audio'])sameStream(beforeB,v3Probe,kind);
    const v3Render=await verifyFinishedMkvAssRender({
      finalMkv:v3Final,sourceAss:ass,sourceFont:font,
      outputDir:path.join(outDir,'v3-independent-render'),
    });
    assert.equal(v3Render.ok,true);
    assert.equal(sha(await fs.readFile(sourceA)),sourceSha);
    assert.equal(sha(await fs.readFile(sourceB)),targetSha);
    await fs.writeFile(path.join(outDir,'v3-cross-source-ass-font-evidence.json'),
      JSON.stringify({schema:'softmux-v3-ass-font-closure-v1',passed:true,
        sourceSha256:sourceSha,targetSha256:targetSha,outputSha256:sha(await fs.readFile(v3Final)),
        approvedV3SourceFirstAndExplicitTarget:true,realDownloadedMkv:true,
        originalBVideoAudioPacketCopy:true,actualFontClosureAndNativeLibassRender:true,
        limits:'one real ASS+font fixture; not arbitrary font shaping or UID/Tag preservation'},null,2)+'\n');

    // Test the exact same V3 intent when the source has NO embedded font:
    // the bounded executor must reject atomically after selecting B.
    await page.goto(v3Url.href,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[noFont,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#sfv3Tabs [data-sfv3-source-key]').length===2,
      null,{timeout:120000});
    await page.locator('#sfv3Tabs [data-sfv3-source-key]')
      .filter({hasText:'A-with-ASS-no-font.mkv'}).click();
    await page.waitForFunction(()=>
      [...document.querySelectorAll('#sfv3SourceContents .sfv3-row-select')]
        .some(x=>/ass/i.test(x.textContent)) &&
      document.querySelector('#videoInput')?.files?.[0]?.name==='A-with-ASS-no-font.mkv',
      null,{timeout:120000});
    await page.locator('#sfv3SourceContents .sfv3-row-select')
      .filter({hasText:/ass/i}).first().click();
    await page.waitForFunction(()=>
      document.querySelector('#sfv3SourceFontEvidence')?.textContent
        ?.includes('0 项疑似字体附件'),null,{timeout:60000});
    assert.equal(await page.locator('#sfv3SourceFontEvidence li').count(),0,
      'missing-font source must not claim to have any observed font attachments');
    await page.locator('#sfv3SourceInspectorAdd').click();
    await page.locator('#sfv3ConfirmTarget').click();
    await page.waitForFunction(()=>
      (document.querySelector('#status')?.textContent||'')
        .includes('CROSS_SOURCE_ASS_MISSING_EMBEDDED_FONT'),
      null,{timeout:180000});
    assert.equal(await page.locator('#assetInventory .asset-entry[data-kind="subtitle"]').count(),0);
    assert.equal(await page.locator('#assetInventory .asset-entry[data-kind="font"]').count(),0);
    assert.equal(await page.locator('#sfv3AssFontDependencies .sfv3-ass-font-bundle').count(),0,
      'failed font closure cannot leave a misleading dependency proof in V3');
    assert.equal(await page.locator('#compositionTracks button[data-sfv3-ass-font="bound"]').count(),0,
      'missing-font rejection cannot color any source ASS as transferred');
    await page.screenshot({path:path.join(outDir,'v3-no-font-fail-closed.png')});
    // The same ASS bytes without the source's font may NOT enter the output
    // as a false "self-contained" bundle. Observe an actual browser refusal.
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[noFont,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2,
      null,{timeout:120000});
    const negative=page.locator('#assetInventory .asset-entry[data-kind="container"]')
      .filter({has:page.locator('.asset-entry-name',{hasText:'A-with-ASS-no-font.mkv'})});
    const target=page.locator('#assetInventory .asset-entry[data-kind="container"]')
      .filter({has:page.locator('.asset-entry-name',{hasText:'B-with-original-media.mkv'})});
    await target.locator('[data-asset-source]').check();
    await negative.locator('[data-secondary-subtitle-inspect]').click();
    await page.waitForFunction(()=>document.querySelector('[data-secondary-subtitles][data-state="inspected"]'),
      null,{timeout:120000});
    await negative.locator('[data-secondary-subtitle-add]').click();
    await page.waitForFunction(()=>
      (document.querySelector('#status')?.textContent||'').includes('CROSS_SOURCE_ASS_MISSING_EMBEDDED_FONT'),
      null,{timeout:120000});
    assert.equal(await page.locator('#assetInventory .asset-entry[data-kind="subtitle"]').count(),0);
    assert.equal(await page.locator('#assetInventory .asset-entry[data-kind="font"]').count(),0);
    assert.deepEqual(errors,[]);
    const evidence={schema:'p3-secondary-ass-font-native-delivery-v1',status:'PASS',
      sourceSha256:sourceSha,targetSha256:targetSha,outputSha256:sha(await fs.readFile(output)),
      originalBMediaPacketHashesAndPtsDtsPreserved:true,
      downloadedMkvEmbeddedFontBytesAndIsolatedLibassRenderPassed:true,
      completeBundleRevokedOnSourceRemoval:true,
      missingEmbeddedFontNegativeRefused:true,
      sourceUnmodified:true,
      limits:'controlled ASS+1 SFNT source, one libass frame; no arbitrary ASS/SSA guarantee',
    };
    await fs.writeFile(path.join(outDir,'cross-source-ass-font-evidence.json'),
      JSON.stringify(evidence,null,2)+'\n');
    console.log('P3 A.mkv ASS+source font -> B real browser/native render + missing-font negative: PASS');
  }catch(error){
    console.error('P3 cross-MKV ASS/font:',await page.locator('#status').textContent().catch(()=>''),errors);
    throw error;
  }finally{await context.close();}
}
