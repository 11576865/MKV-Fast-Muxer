import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const run=(program,args)=>execFileSync(program,args,{
  encoding:'utf8',timeout:120000,maxBuffer:24*1024*1024,
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const probe=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',file,
]));
function packetsFor(probed,index) {
  return (probed.packets||[]).filter(p=>p.stream_index===index);
}
function assertCopiedPackets(before,after,scope) {
  assert.ok(before.length>0,scope+' must have actual source data');
  assert.deepEqual(after.map(p=>p.data_hash),before.map(p=>p.data_hash),
    scope+' compressed packet order and payload must be retained');
  assert.equal(after.length,before.length);
  for(let i=0;i<before.length;i++){
    for(const key of ['pts_time','dts_time','duration_time']){
      if(before[i][key]==null || after[i][key]==null)continue;
      assert.ok(Math.abs(Number(before[i][key])-Number(after[i][key]))<=0.0011,
        scope+' '+key+' at packet '+i+' moved unexpectedly');
    }
  }
}

export async function scenarioCrossSourceSubrip(browser,{root,outDir,baseUrl}){
  await fs.mkdir(outDir,{recursive:true});
  const sourceA=path.join(outDir,'A-with-SubRip.mkv');
  const sourceB=path.join(outDir,'B-original-media.mkv');
  const output=path.join(outDir,'B-with-A-SubRip.mkv');
  const originalSub=path.join(root,'sample.srt');
  run('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),'-i',originalSub,
    '-map','0:v:0','-map','0:a:0','-map','1:s:0','-c','copy',
    '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=Caption from A',
    '-avoid_negative_ts','disabled',sourceA]);
  run('ffmpeg',['-v','error','-y','-copyts','-i',path.join(root,'base.mp4'),
    '-map','0:v:0','-map','0:a:0','-c','copy','-avoid_negative_ts','disabled',sourceB]);
  const aBefore=sha(await fs.readFile(sourceA)),bBefore=sha(await fs.readFile(sourceB));
  const aProbe=probe(sourceA),bProbe=probe(sourceB);
  const sourceSubtitle=aProbe.streams.find(s=>s.codec_type==='subtitle'&&s.codec_name==='subrip');
  assert.ok(sourceSubtitle,'fixture must have an actual native SubRip track');
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:980}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(60000);
  const aRow=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'A-with-SubRip.mkv'})});
  const bRow=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'B-original-media.mkv'})});
  try {
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[sourceA,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2 &&
      !(document.querySelector('#assetImportStatus')?.textContent||'').includes('正在'),
      null,{timeout:120000});
    await bRow().locator('[data-asset-source]').check();
    await page.waitForFunction(()=>
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-original-media.mkv' &&
      document.querySelector('#assetInventory [data-secondary-subtitle-inspect]'),
      null,{timeout:120000});
    assert.equal(await page.locator('[data-secondary-subtitle-inspect]').count(),1);
    await aRow().locator('[data-secondary-subtitle-inspect]').click();
    await page.waitForFunction(()=>
      document.querySelector('#assetInventory [data-secondary-subtitles][data-state="inspected"]') &&
      document.querySelector('#assetInventory [data-secondary-subtitle-add]'),
      null,{timeout:120000});
    const selected=aRow().locator(
      '[data-secondary-subtitle-add][data-stream-index="'+sourceSubtitle.index+'"]');
    assert.equal(await selected.isEnabled(),true);
    await selected.click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===1 &&
      !document.querySelector('#muxBtn')?.disabled &&
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-original-media.mkv',
      null,{timeout:120000});
    assert.equal(await aRow().locator('[data-secondary-subtitle-add]').isDisabled(),true,
      'the exact source stream cannot be included twice');
    assert.match(await page.locator('#assetInventory .asset-entry[data-kind="subtitle"]').textContent(),
      /A-with-SubRip/);
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="language"][data-index="0"]').inputValue(),
      'eng','source language must survive its reclassification as external draft subtitle');
    assert.equal(await page.locator('#newSubtitleList [data-new-sub-field="title"][data-index="0"]').inputValue(),
      'Caption from A','source title must survive its reclassification as external draft subtitle');
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>/^完成。/.test(document.querySelector('#status')?.textContent||'') &&
      !document.querySelector('#muxBtn')?.disabled,null,{timeout:180000});
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.locator('#downloadLink').click(),
    ]);
    await download.saveAs(output);
    const actual=probe(output);
    const subtitleStreams=actual.streams.filter(s=>s.codec_type==='subtitle');
    assert.equal(subtitleStreams.length,1,'B receives one selected A subtitle, not all A tracks');
    assert.equal(subtitleStreams[0].codec_name,'subrip');
    assert.equal(subtitleStreams[0].tags?.language,'eng');
    assert.equal(subtitleStreams[0].tags?.title,'Caption from A');
    assertCopiedPackets(packetsFor(aProbe,sourceSubtitle.index),
      packetsFor(actual,subtitleStreams[0].index),'A SubRip → B');
    for(const type of ['video','audio']){
      const before=bProbe.streams.find(s=>s.codec_type===type);
      const after=actual.streams.find(s=>s.codec_type===type);
      assert.ok(before&&after,type+' stream must remain');
      assert.equal(after.codec_name,before.codec_name);
      assertCopiedPackets(packetsFor(bProbe,before.index),
        packetsFor(actual,after.index),'B '+type);
    }
    assert.equal(sha(await fs.readFile(sourceA)),aBefore);
    assert.equal(sha(await fs.readFile(sourceB)),bBefore);
    await aRow().locator('[data-asset-remove]').click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===1 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="subtitle"]').length===0,
      null,{timeout:120000});
    assert.equal(await page.locator('#videoInput').evaluate(input=>input.files[0]?.name),
      'B-original-media.mkv');
    assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false',
      'removing A revokes the output evidence that included A SubRip');
    assert.deepEqual(errors,[]);
    const receipt={
      schema:'softmux-cross-source-subrip-real-browser-v1',verdict:'PASS',
      originalAsha256:aBefore,originalBsha256:bBefore,
      outputSha256:sha(await fs.readFile(output)),
      sourceAStreamIndex:sourceSubtitle.index,
      outputSubtitleStreamIndex:subtitleStreams[0].index,
      subtitlePackets:packetsFor(actual,subtitleStreams[0].index).length,
      sourcesUnchanged:true,noManualTrackExtraction:true,
      subtitlePayloadAndPtsDtsVerified:true,mediaPayloadAndPtsDtsVerified:true,
      dependentMemberRevokedOnSourceRemoval:true,
      scope:'SubRip only, no ASS font dependency/PGS cross-transfer, no alternate sync edit',
    };
    await fs.writeFile(path.join(outDir,'cross-source-subrip-evidence.json'),
      JSON.stringify(receipt,null,2)+'\n');
    console.log('P3 A.mkv SubRip → B.mkv actual Chromium + independent packet/timecode + A removal: PASS');
  }catch(error){
    console.error('P3 cross-source subtitle:',await page.locator('#status').textContent().catch(()=>''),errors);
    throw error;
  }finally{await context.close();}
}
