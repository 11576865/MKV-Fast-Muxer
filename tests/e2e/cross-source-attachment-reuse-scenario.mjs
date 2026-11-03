import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(program,args)=>execFileSync(program,args,{
  encoding:'utf8',timeout:120000,maxBuffer:24*1024*1024,
});
const native=file=>JSON.parse(run('mkvmerge',['-J',file]));
const packets=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_packets','-show_data_hash','sha256','-of','json',file,
])).packets.filter(x=>x.data_hash && x.stream_index!==undefined);

export async function scenarioCrossSourceAttachmentReuse(browser,{
  root,outDir,baseUrl='http://127.0.0.1:4173/',
}) {
  await fs.mkdir(outDir,{recursive:true});
  const sourceA=path.join(outDir,'A-with-guide.mkv');
  const sourceB=path.join(outDir,'B-clean.mkv');
  const attachment=path.join(outDir,'guide.txt');
  const output=path.join(outDir,'B-with-A-guide-browser.mkv');
  const payload=Buffer.from('A.mkv AttachedFile -> B.mkv output without manual extraction.\n');
  await fs.writeFile(attachment,payload);
  run('mkvmerge',['--quiet','--output',sourceA,
    '--attachment-name','guide.txt','--attachment-mime-type','text/plain',
    '--attach-file',attachment,path.join(root,'base.mp4')]);
  run('mkvmerge',['--quiet','--output',sourceB,path.join(root,'base.mp4')]);
  const beforeA=sha(await fs.readFile(sourceA));
  const beforeB=sha(await fs.readFile(sourceB));
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:950}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(60000);
  const aRow=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'A-with-guide.mkv'})});
  const bRow=()=>page.locator('#assetInventory .asset-entry[data-kind="container"]')
    .filter({has:page.locator('.asset-entry-name',{hasText:'B-clean.mkv'})});
  try{
    await page.goto(baseUrl,{waitUntil:'networkidle'});
    await page.setInputFiles('#unifiedAssetInput',[sourceA,sourceB]);
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2 &&
      !document.querySelector('#assetImportStatus')?.textContent.includes('正在'),
      null,{timeout:120000});
    await bRow().locator('[data-asset-source]').check();
    await page.waitForFunction(()=>
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-clean.mkv' &&
      document.querySelector('#assetInventory [data-embedded-inspect]'),
      null,{timeout:120000});
    assert.equal(await page.locator('#assetInventory [data-embedded-inspect]').count(),1,
      'secondary A has a direct attachment view; no extra reader-only mode');
    await aRow().locator('[data-embedded-inspect]').click();
    await page.waitForFunction(()=>
      document.querySelector('#assetInventory .embedded-source-attachments[data-state="inspected"]') &&
      document.querySelector('#assetInventory [data-embedded-add]'),
      null,{timeout:120000});
    const row=page.locator('#assetInventory .embedded-source-attachment-row')
      .filter({hasText:'guide.txt'});
    assert.equal(await row.count(),1);
    assert.match(await row.textContent(),/text\/plain/);
    await row.locator('[data-embedded-add]').click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="attachment"]').length===1 &&
      document.querySelector('#videoInput')?.files?.[0]?.name==='B-clean.mkv',
      null,{timeout:120000});
    assert.match(await page.locator('#assetInventory .asset-entry[data-kind="attachment"]').textContent(),
      /guide\.txt/);
    assert.equal(await aRow().locator('[data-embedded-add]').isDisabled(),true,
      'same source FileUID cannot silently be added twice');
    await page.waitForFunction(()=>
      document.querySelector('#muxBtn') && !document.querySelector('#muxBtn').disabled,
      null,{timeout:120000});
    await page.locator('#muxBtn').click();
    await page.waitForFunction(()=>
      /^完成。/.test(document.querySelector('#status')?.textContent||'') &&
      !document.querySelector('#muxBtn')?.disabled,
      null,{timeout:180000});
    const [download]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('#downloadLink').click(),
    ]);
    await download.saveAs(output);
    const observed=native(output),original=native(sourceB);
    assert.equal((observed.attachments||[]).length,1);
    assert.equal(observed.attachments[0].file_name,'guide.txt');
    assert.equal(observed.attachments[0].content_type,'text/plain');
    assert.deepEqual((observed.tracks||[]).map(t=>[t.type,t.codec]),
      (original.tracks||[]).map(t=>[t.type,t.codec]),
      'A video/audio tracks must not be silently composed into B');
    const extracted=path.join(outDir,'extracted-guide.bin');
    run('mkvextract',[output,'attachments',
      String(observed.attachments[0].id)+':'+extracted]);
    assert.deepEqual(await fs.readFile(extracted),payload);
    const bPackets=packets(sourceB),oPackets=packets(output);
    // Stream Copy permits different *cross-stream interleaving*: compare
    // packet identities in each actual track's decode order, not a global
    // ffprobe -show_packets sequence spanning both audio and video tracks.
    const byStream=rows=>{
      const streams=new Map();
      for(const row of rows){
        if(!streams.has(row.stream_index))streams.set(row.stream_index,[]);
        streams.get(row.stream_index).push(row);
      }
      return streams;
    };
    const bStreams=byStream(bPackets),oStreams=byStream(oPackets);
    assert.deepEqual([...oStreams.keys()].sort((a,b)=>a-b),
      [...bStreams.keys()].sort((a,b)=>a-b));
    for(const [index,sourcePackets] of bStreams){
      const actualPackets=oStreams.get(index)||[];
      assert.deepEqual(actualPackets.map(x=>x.data_hash),
        sourcePackets.map(x=>x.data_hash),
        'B stream '+index+' compressed packet payload sequence unchanged');
      for(let i=0;i<sourcePackets.length;i++){
        for(const key of ['pts_time','dts_time']){
          const before=Number(sourcePackets[i][key]);
          const after=Number(actualPackets[i][key]);
          if(Number.isFinite(before)&&Number.isFinite(after))
            assert.ok(Math.abs(after-before)<=0.0011,
              'B stream '+index+' '+key+' preserved to one Matroska timebase tick');
        }
      }
    }
    assert.equal(sha(await fs.readFile(sourceA)),beforeA);
    assert.equal(sha(await fs.readFile(sourceB)),beforeB);
    // Removing A invalidates all A-derived object references, not B's selected source.
    await aRow().locator('[data-asset-remove]').click();
    await page.waitForFunction(()=>
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===1 &&
      document.querySelectorAll('#assetInventory .asset-entry[data-kind="attachment"]').length===0,
      null,{timeout:120000});
    assert.equal(await page.locator('#videoInput').evaluate(el=>el.files[0]?.name),
      'B-clean.mkv');
    assert.equal(await page.locator('#outputEvidencePanel').getAttribute('data-current'),'false',
      'removing A revokes the old A-derived output evidence');
    assert.deepEqual(errors,[]);
    const receipt={
      schema:'softmux-cross-source-attachment-reuse-native-v1',verdict:'PASS',
      sourceASha256:beforeA,sourceBSha256:beforeB,
      browserOutputSha256:sha(await fs.readFile(output)),
      sourceUnchanged:true,
      noManualExtraction:true,
      originalBMediaPacketsVerified:true,
      includedAFileDataSha256:sha(payload),
      removedSourceInvalidatesDependentMember:true,
      boundedScope:'one generic AttachedFile from secondary A, B media-only target; not arbitrary cross-MKV track multiplexing',
    };
    await fs.writeFile(path.join(outDir,'cross-source-attachment-evidence.json'),
      JSON.stringify(receipt,null,2)+'\n');
    console.log('P3 cross MKV A.AttachedFile -> B browser MKV + native FileData/packet/identity/revocation: PASS');
  }catch(error){
    console.error('P3 cross-source status:',await page.locator('#status').textContent().catch(()=>''),errors);
    throw error;
  }finally{
    await context.close();
  }
}
