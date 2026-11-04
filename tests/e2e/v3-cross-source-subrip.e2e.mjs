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
  await page.waitForFunction(()=>
    document.querySelectorAll('#assetInventory .asset-entry[data-kind="container"]').length===2 &&
    document.querySelector('#videoInput')?.files?.[0]?.name==='B-base.mkv' &&
    document.querySelector('#assetInventory [data-secondary-subtitle-inspect]') &&
    document.querySelectorAll('#sfv3Tabs [data-sfv3-source-key]').length===2,
    null,{timeout:120000});
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  const aTab=page.locator('#sfv3Tabs [data-sfv3-source-key]').filter({hasText:'A-with-SubRip'});
  await aTab.click();
  assert.equal(await page.locator('#sfv3FileName').textContent(),'A-with-SubRip.mkv');
  assert.equal(await page.locator('#videoInput').evaluate(el=>el.files?.[0]?.name),
    'B-base.mkv','viewing A must not rebind the actual base source');
  await screenshot('wu02-view-A-before-target.png');
  const inspect=page.locator('#sfv3SourceContents .sfv3-inspect-source');
  await inspect.click();
  await page.waitForFunction(()=>
    document.querySelector('#sfv3SourceContents .sfv3-row-action') &&
    document.querySelector('#assetInventory [data-secondary-subtitles][data-state="inspected"]'),
    null,{timeout:150000});
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  await page.locator('#sfv3SourceContents .sfv3-row-action').click();
  assert.equal(await page.locator('#sfv3TargetPicker').isVisible(),true);
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#outputCompositionPanel').isVisible(),false);
  await screenshot('wu02-target-dialog.png');
  await page.locator('.sfv3-picker-cancel').click();
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.steps.push('read-only A observation and cancellation do not create target');
  await page.locator('#sfv3SourceContents .sfv3-row-action').click();
  const options=page.locator('#sfv3PickerOptions input[name="sfv3TargetBase"]');
  assert.equal(await options.count(),1);
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
  await screenshot('wu02-confirmed-target.png');
  await page.locator('#muxBtn').click();
  await page.waitForFunction(()=>/^完成。/.test(document.querySelector('#status')?.textContent||''),
    null,{timeout:180000});
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
