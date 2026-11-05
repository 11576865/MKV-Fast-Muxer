import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// One full S01 user task, rather than several independent small fixtures:
// native Matroska with video, TWO original audio tracks, original ASS,
// two source attachments, flat chapters/global Tags, plus external ASS/font.
// This proves current source inventory and identity binding before examining
// a real downloaded output. It does not certify arbitrary EBML preservation.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(tool,args,opts={})=>execFileSync(tool,args,{
  encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...opts,
});
const probe=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_streams','-show_chapters','-show_format','-of','json',file,
]));
const streams=(p,kind)=>(p.streams||[]).filter(s=>s.codec_type===kind);
const packetHash=(file,selector)=>run('ffmpeg',[
  '-hide_banner','-loglevel','error','-i',file,
  '-map',selector,'-c','copy','-f','hash','-hash','SHA256','-',
]).trim();

async function download(page,selector,file) {
  const [item]=await Promise.all([page.waitForEvent('download'),
    page.locator(selector).click()]);
  await item.saveAs(file);
}
async function selectSource(page,name){
  const row=page.locator('#assetInventory .asset-entry').filter({
    has:page.locator('.asset-entry-name',{hasText:name}),
  });
  const control=row.locator('[data-asset-source]');
  await control.waitFor({state:'attached'});
  if(!await control.isVisible())await page.locator('#sf14SourceToggle').click();
  await control.check();
  await page.waitForFunction(expected=>
    document.querySelector('#videoInput')?.files?.[0]?.name===expected &&
    !document.querySelector('#unifiedAssetInput')?.disabled,
    name,{timeout:120000});
}
export async function scenarioS01ComplexSourceWorkspace(browser,{root,outDir,baseUrl}){
  await fs.mkdir(outDir,{recursive:true});
  const source=path.join(root,'s01-native-complete-source.mkv');
  const chapters=path.join(outDir,'s01-source-chapters-input.xml');
  const tags=path.join(outDir,'s01-source-tags-input.xml');
  await fs.writeFile(chapters,`<?xml version="1.0" encoding="UTF-8"?>
<Chapters><EditionEntry><EditionUID>710001</EditionUID>
<ChapterAtom><ChapterUID>710010</ChapterUID><ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>
<ChapterTimeEnd>00:00:01.000000000</ChapterTimeEnd>
<ChapterDisplay><ChapterString>S01 opening</ChapterString><ChapterLanguage>eng</ChapterLanguage></ChapterDisplay></ChapterAtom>
<ChapterAtom><ChapterUID>710020</ChapterUID><ChapterTimeStart>00:00:01.000000000</ChapterTimeStart>
<ChapterTimeEnd>00:00:02.000000000</ChapterTimeEnd>
<ChapterDisplay><ChapterString>S01 closing</ChapterString><ChapterLanguage>eng</ChapterLanguage></ChapterDisplay></ChapterAtom>
</EditionEntry></Chapters>
`);
  await fs.writeFile(tags,`<?xml version="1.0" encoding="UTF-8"?>
<Tags><Tag><Targets><TargetTypeValue>50</TargetTypeValue></Targets>
<Simple><Name>S01_MARKER</Name><String>original-native-source</String></Simple>
</Tag></Tags>
`);
  run('mkvmerge',[
    '--quiet','--output',source,
    '--chapters',chapters,'--global-tags',tags,
    '--attachment-name','S01OriginalBold.ttf',
    '--attachment-mime-type','application/x-truetype-font',
    '--attach-file',path.join(root,'DejaVuSans-Bold.ttf'),
    '--attachment-name','s01-notes.txt','--attachment-mime-type','text/plain',
    '--attach-file',path.join(root,'notes.txt'),
    path.join(root,'source-multitrack.mkv'),
  ]);
  const original=probe(source);
  assert.equal(streams(original,'video').length,1);
  assert.equal(streams(original,'audio').length,2);
  assert.equal(streams(original,'subtitle').length,1);
  assert.equal(streams(original,'attachment').length,2);
  assert.equal((original.chapters||[]).length,2);
  const sourceDigest=sha(await fs.readFile(source));
  const native=JSON.parse(run('mkvmerge',['-J',source]));
  assert.equal(native.attachments?.length,2,
    'independent MKVToolNix must recognize both source attachments');
  const nativeChapters=path.join(outDir,'s01-native-extracted-chapters.xml');
  const nativeTags=path.join(outDir,'s01-native-extracted-tags.xml');
  run('mkvextract',[source,'chapters',nativeChapters]);
  run('mkvextract',[source,'tags',nativeTags]);
  assert.match(await fs.readFile(nativeChapters,'utf8'),/S01 opening/);
  assert.match(await fs.readFile(nativeTags,'utf8'),/original-native-source/);
  const errors=[];
  const context=await browser.newContext({acceptDownloads:true,
    viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  try {
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[
      source,path.join(root,'zh.ass'),path.join(root,'DejaVuSans.ttf'),
    ]);
    await page.waitForFunction(()=> {
      const primary=document.querySelector('#videoInput')?.files?.[0];
      const tree=document.querySelector('#assetInventory .asset-container-tree');
      return primary?.name==='s01-native-complete-source.mkv' &&
        tree?.querySelectorAll('[data-tree-group="audio"] [data-tree-select]').length===2 &&
        tree?.querySelectorAll('[data-tree-group="subtitle"] [data-tree-select]').length===1 &&
        tree?.querySelectorAll('[data-tree-group="attachment"] [data-tree-select]').length===2 &&
        !document.querySelector('#unifiedAssetInput')?.disabled;
    },null,{timeout:120000});
    const tree=page.locator('#assetInventory .asset-container-tree');
    assert.equal(await tree.locator('[data-tree-group="video"] [data-tree-select]').count(),1);
    assert.equal(await tree.locator('[data-tree-group="audio"] [data-tree-select]').count(),2);
    assert.equal(await tree.locator('[data-tree-group="subtitle"] [data-tree-select]').count(),1);
    assert.equal(await tree.locator('[data-tree-group="attachment"] [data-tree-select]').count(),2);
    const evidence=page.locator('#compositionSourceEvidence');
    if(!await evidence.evaluate(el=>el.open))
      await evidence.locator('summary').first().click();
    assert.equal(await page.locator('#compositionSourceEvidenceList [data-evidence-kind="chapter"]').count(),2,
      'real MKV chapters must be observable, not inferred from filenames');
    assert.match(await page.locator('#compositionSourceEvidenceList').textContent(),/S01_MARKER/i,
      'real global Tag must appear in source observation');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"]').count(),1);
    assert.equal(await page.locator('#fontInput').evaluate(input=>input.files.length),1);
    await page.locator('#assetInventory [data-tree-preserve-all]').uncheck();
    await tree.locator('[data-tree-group="audio"] [data-tree-select]').first().click();
    const title=page.locator('#assetInspectorHost [data-tree-track-field="title"]');
    await title.fill('S01 approved primary audio');
    assert.match(await page.locator('#muxPlan').textContent(),/S01 approved primary audio/);
    // Adding the second real source must not steal File authority or move the
    // source-bound edit. The active-plan projection is tested on both sides.
    await page.setInputFiles('#unifiedAssetInput',path.join(root,'source-multitrack.mkv'));
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory [data-asset-source]').length===2,
      null,{timeout:120000});
    assert.equal(await page.locator('#videoInput').evaluate(x=>x.files[0].name),
      's01-native-complete-source.mkv');
    await selectSource(page,'source-multitrack.mkv');
    assert.equal(await tree.locator('[data-tree-group="attachment"] [data-tree-select]').count(),0);
    assert.equal(await page.locator('#compositionSourceEvidenceList [data-evidence-kind="chapter"]').count(),0);
    assert.doesNotMatch(await page.locator('#muxPlan').textContent(),/S01 approved primary audio/,
      'old source fields must not grant edits to the newly selected source');
    await selectSource(page,'s01-native-complete-source.mkv');
    await tree.locator('[data-tree-group="audio"] [data-tree-select]').first().click();
    assert.equal(await title.inputValue(),'S01 approved primary audio',
      'revisiting identical source File must preserve the rightful source draft');
    assert.equal(await page.locator('#muxBtn').isDisabled(),false);
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>{
      const status=document.querySelector('#status')?.textContent||'';
      if(status.startsWith('失败：'))throw Error(status);
      return status.startsWith('完成。');
    },null,{timeout:180000});
    const output=path.join(outDir,'s01-native-complete-output.mkv');
    const reportPath=path.join(outDir,'s01-native-complete-output.report.json');
    await download(page,'#downloadLink',output);
    await download(page,'#reportLink',reportPath);
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    const finished=probe(output);
    assert.equal(report.output.sha256,sha(await fs.readFile(output)));
    assert.equal(report.audit?.ok,true,JSON.stringify(report.audit?.issues||[]));
    assert.equal(streams(finished,'video').length,1);
    assert.equal(streams(finished,'audio').length,2);
    assert.equal(streams(finished,'subtitle').length,2,
      'original ASS plus imported external ASS must both survive');
    assert.equal((finished.chapters||[]).length,2);
    const outputNames=streams(finished,'attachment').map(x=>x.tags?.filename);
    for(const name of ['S01OriginalBold.ttf','s01-notes.txt','DejaVuSans.ttf'])
      assert.ok(outputNames.includes(name),'missing attached source/external resource: '+name);
    assert.equal(streams(finished,'audio')[0].tags?.title,'S01 approved primary audio');
    const avPacketHashes={};
    for(const kind of ['v:0','a:0','a:1']){
      const sourceHash=packetHash(source,'0:'+kind);
      const deliveredHash=packetHash(output,'0:'+kind);
      assert.equal(deliveredHash,sourceHash,kind+' must be copied, never transcoded');
      avPacketHashes[kind]=sourceHash;
    }
    assert.equal(sha(await fs.readFile(source)),sourceDigest);
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(outDir,'s01-complex-source-workspace-evidence.json'),
      JSON.stringify({
        schema:'softmux-s01-complex-source-workspace-v1',status:'PASS',
        nativeSource:'s01-native-complete-source.mkv',
        sourceSha256:sourceDigest,sourceUnchanged:true,
        source:{video:1,audio:2,originalSubtitle:1,originalAttachments:2,chapters:2,
          nativeMkvmergeRecognized:true,nativeChaptersAndTagsExtracted:true},
        imported:{externalAss:1,externalFont:1},
        sourceSwitch:{noAuthorityLeak:true,draftRestoredToSameFile:true},
        output:{name:path.basename(output),sha256:report.output.sha256,
          video:1,audio:2,subtitle:2,attachmentNames:outputNames,chapters:2,
          independentPacketSha256:avPacketHashes},
        scope:'One independently authored flat Matroska fixture and real Chromium single-workspace workflow. Not full arbitrary UID/EBML preservation or S01 1.0 release PASS.',
      },null,2)+'\n');
    console.log('S01 full native complex source -> source switch -> imported ASS/font -> actual MKV and stream-copy PASS');
  } catch(error) {
    console.error('S01 status:',await page.locator('#status').textContent().catch(()=>'(missing)'));
    console.error('S01 log:',(await page.locator('#log').textContent().catch(()=>'' )).slice(-2200));
    throw error;
  } finally {await context.close();}
}
