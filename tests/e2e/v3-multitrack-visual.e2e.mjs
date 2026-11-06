// Bounded five-track Figma V3-08 compact evidence, not a pixel sign-off.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const dir=path.resolve('.e2e/ui-v3-multitrack');
await fs.mkdir(dir,{recursive:true});
const source=path.join(dir,'V3 Five Track Source.mkv');
const ass=path.join(dir,'original.ass'),extra=path.join(dir,'extra.ass');
const font=execFileSync('fc-match',['-f','%{file}','DejaVu Sans'],{encoding:'utf8'}).trim();
assert.match(font,/\.(ttf|otf)$/i);await fs.access(font);
const header=['[Script Info]','ScriptType: v4.00+','PlayResX: 640','PlayResY: 360',
 '[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
 'Style: Default,DejaVu Sans,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1',
 '[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];
await fs.writeFile(ass,[...header,'Dialogue: 0,0:00:00.10,0:00:01.70,Default,,0,0,0,,Original ASS'].join('\n')+'\n');
await fs.writeFile(extra,[...header,'Dialogue: 0,0:00:00.20,0:00:01.60,Default,,0,0,0,,External ASS'].join('\n')+'\n');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i','color=c=black:s=640x360:r=24:d=2',
 '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
 '-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=2',
 '-i',ass,'-map','0:v:0','-map','1:a:0','-map','2:a:0','-map','3:s:0',
 '-c:v','mpeg4','-q:v','5','-c:a:0','aac','-b:a:0','96k','-c:a:1','flac','-c:s','ass',
 '-metadata:s:a:0','language=jpn','-metadata:s:a:1','language=eng',
 '-metadata:s:s:0','language=jpn','-attach',font,
 '-metadata:s:t:0','mimetype=application/x-truetype-font',
 '-metadata:s:t:0','filename=SourceFont.ttf',source],{timeout:90000});
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceSHA=sha(await fs.readFile(source));
const streams=JSON.parse(execFileSync('ffprobe',
 ['-v','error','-show_streams','-of','json',source],{encoding:'utf8'})).streams;
for(const [kind,n] of [['video',1],['audio',2],['subtitle',1],['attachment',1]])
 assert.equal(streams.filter(s=>s.codec_type===kind).length,n);
const browser=await chromium.launch({headless:true,
 ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
 args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:900},
 acceptDownloads:true,hasTouch:true,reducedMotion:'reduce'});
page.setDefaultTimeout(45000);
const evidence={schema:'v3-native-five-track-compact-v1',sourceSha256:sourceSHA,
 figma:['36:2','37:223'],viewports:[],screenshots:[],
 limits:'Real 1 video / 2 audio / 2 subtitle target with one source font and one external font. Figma mock has two source MKVs and six fonts; compare track density and geometry only, NOT pixel identity or full design sign-off.'};
try{
 await page.goto(new URL('?ui=v3',process.env.E2E_BASE_URL||'http://127.0.0.1:4173/').href,{waitUntil:'networkidle'});
 await page.setInputFiles('#unifiedAssetInput',[source,extra,font]);
 await page.waitForFunction(name=>
   document.querySelector('#videoInput')?.files?.[0]?.name===name &&
   document.querySelectorAll('#sfv3SourceContents .sfv3-observed-row').length>=4 &&
   (document.querySelector('#newSubtitleList')?.textContent||'').includes('extra.ass') &&
   !document.querySelector('#unifiedAssetInput')?.disabled,
   path.basename(source),{timeout:180000});
 assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
 // Approved V3-01: use this *real* 1 video + 2 audio + ASS + attached font
 // source as the visual audit fixture, rather than the geometry suite's
 // intentional one-video/zero-audio minimal file (not a matched mock).
 await page.waitForFunction(()=>{
   const root=document.getElementById('sf14Root');
   const rows=[...document.querySelectorAll('#sfv3SourceContents > .sfv3-object-group .sfv3-observed-row')];
   const groups=[...document.querySelectorAll('#sfv3SourceContents > .sfv3-object-group .sfv3-object-group-title')]
     .map(node=>node.textContent);
   return root?.dataset.sfv3Surface==='source' && rows.length>=4 &&
     groups.includes('视频') && groups.includes('音频') && groups.includes('字幕');
 },null,{timeout:60000});
 await page.screenshot({path:path.join(dir,'five-track-source-1440x900.png')});
 evidence.screenshots.push('five-track-source-1440x900.png');
 await page.locator('#sfv3EnterOutput').click();
 await page.locator('#sfv3ConfirmTarget').click();
 await page.waitForFunction(()=>{
   const root=document.getElementById('sf14Root'), rows=[...document.querySelectorAll('#compositionTracks button[data-composition-id]')];
   const count=k=>rows.filter(x=>x.dataset.sfv3ObjectKind===k).length;
   return root?.dataset.sfv3TargetConfirmed==='true' &&
     count('video')===1&&count('audio')===2&&count('subtitle')===2;
 },null,{timeout:180000});
 await page.locator('#sfv3TargetTab').click();
 for(const [width,height] of [[1440,900],[1180,820],[820,1180],[620,900]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const data=await page.evaluate(()=>{
     const rect=x=>{const r=x?.getBoundingClientRect();return r?
       {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;};
     const rows=[...document.querySelectorAll('#compositionTracks button[data-composition-id]')];
     const dock=document.querySelector('.sf14-output');
     return {scrollWidth:document.documentElement.scrollWidth,
       selectedFile:document.querySelector('#videoInput')?.files?.[0]?.name,
       target:document.getElementById('sf14Root')?.dataset.sfv3Surface,
       groups:[...document.querySelectorAll('#compositionTracks .sfv3-target-group')].map(x=>x.dataset.kind),
       dock:rect(dock),heading:rect(document.getElementById('sfv3PlanHeading')),
       lastMediaRow:rect(rows.filter(x=>['video','audio','subtitle'].includes(x.dataset.sfv3ObjectKind)).at(-1)),
       lastStructureRow:rect([...document.querySelectorAll('#compositionTracks .sfv3-compact-structure-open')].at(-1)),
       titleRect:rect(document.getElementById('sfv3PlanName')),
       statsRect:rect(document.getElementById('sfv3PlanStats')),
       desktopToolbarVisible:!!document.getElementById('sfv3CompositionToolbar')?.getClientRects().length,
       rows:rows.map(x=>({kind:x.dataset.sfv3ObjectKind,
         title:x.querySelector('strong')?.textContent,box:rect(x)})),
       nativeEditorCount:document.querySelectorAll('#newSubtitleList').length,
       stats:[...document.querySelectorAll('#sfv3PlanStats .sfv3-plan-stat')]
         .map(x=>({kind:x.dataset.kind,count:x.querySelector('strong')?.textContent})),
       compactSourceMenuVisible:!!document.querySelector('#sfv3CompactSources summary')?.getClientRects().length,
       resourceSummaryVisible:!!document.querySelector('#sfv3ResourceDetails > summary')?.getClientRects().length,
       resourceOpen:document.getElementById('sfv3ResourceDetails')?.open,
       resourceCards:[
         '#sfv3ResourceDetails > summary',
         '#compositionTracks .sfv3-compact-structure-open[data-sfv3-structure-open="chapter"]',
         '#compositionTracks .sfv3-compact-structure-open[data-sfv3-structure-open="metadata"]',
       ].map(query=>rect(document.querySelector(query))),
       nativeResourceEditors:document.querySelectorAll('#sfv3ResourceDetails button[data-composition-id]').length,
       compactStructureLinks:document.querySelectorAll('#compositionTracks .sfv3-compact-structure-open').length,
       mediaRowHeights:rows.filter(x=>['video','audio','subtitle'].includes(x.dataset.sfv3ObjectKind))
         .map(x=>Math.round(x.getBoundingClientRect().height))};
   });
   assert.ok(data.scrollWidth<=width+2,'no horizontal overflow '+width);
   assert.equal(data.selectedFile,path.basename(source));
   assert.equal(data.target,'plan');
   assert.equal(data.nativeEditorCount,1);
   const scrollDiagnostic=await page.evaluate(()=>{
     const el=document.getElementById('sfv3PlanHeading');
     const chain=[];let n=el;
     while(n&&chain.length<10) {
       const cs=getComputedStyle(n),rect=n.getBoundingClientRect();
       chain.push({tag:n.tagName,id:n.id,cls:String(n.className).slice(0,75),
         top:Math.round(rect.top),scrollTop:n.scrollTop,
         scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,
         overflowY:cs.overflowY,position:cs.position});
       n=n.parentElement;
     }
     return {scrollY:window.scrollY,chain};
   });
   assert.ok(data.heading && data.heading.y>=55 && data.heading.y<160,
     'new target document title must be visible under the V3 header at '+width+
       ': '+JSON.stringify(data.heading)+' ancestors: '+
       JSON.stringify(scrollDiagnostic));
   for(const [kind,n] of [['video',1],['audio',2],['subtitle',2]])
     assert.equal(data.rows.filter(x=>x.kind===kind).length,n);
   const stat=k=>data.stats.find(x=>x.kind===k)?.count;
   assert.equal(stat('video'),'01','real video count should be visible');
   assert.equal(stat('audio'),'02','real audio count should be visible');
   assert.equal(stat('subtitle'),'02','real subtitle count should be visible');
   assert.equal(data.resourceOpen,false,
     'real target attachments/fonts start collapsed at every V3 viewport');
   assert.equal(data.resourceSummaryVisible,true,
     'real font and attachment disclosure remains reachable');
   if(width>=720){
     const [files,chapters,tags]=data.resourceCards;
     assert.ok(files&&chapters&&tags && files.width>80 && chapters.width>80 && tags.width>80 &&
       Math.abs(files.y-chapters.y)<=3 && Math.abs(chapters.y-tags.y)<=3 &&
       files.right<=chapters.x+3 && chapters.right<=tags.x+3,
       'approved V3-04/06/07 resource cards must share one compact horizontal row: '+
         JSON.stringify(data.resourceCards));
   }
   if(width<=719){
     assert.equal(data.compactSourceMenuVisible,true,'Figma compact source selector');
     assert.equal(data.resourceSummaryVisible,true,'compact attachment/structure cards');
     assert.ok(data.nativeResourceEditors>=1,
       'real attachment/font editor rows remain under the disclosure');
     assert.equal(data.compactStructureLinks,2,'real chapter/tag read-only entry points');
     assert.ok(data.mediaRowHeights.every(h=>h>=49&&h<=56),
       'Figma 53px rows expected, got '+JSON.stringify(data.mediaRowHeights));
     assert.equal(await page.locator('#sfv3ResourceDetails').getAttribute('open'),null,
       'resource details collapsed by default on compact, not silently removed');
     const orders=await page.locator('#compositionTracks .sfv3-track-order').allTextContents();
     assert.deepEqual(orders,['01','02','03','04','05']);
   }
   if(width===1180 || width===620){
     assert.ok(data.dock && data.dock.bottom>=height-3 &&
       data.dock.height<=65,
       'approved Figma output dock must reach bottom, not leave a blank strip: '+
         JSON.stringify(data.dock));
   }
   if(width===1180){
     assert.ok(data.lastMediaRow?.bottom<=data.dock.y,
       'all five real target tracks must be visible above the 1180 dock');
     assert.ok(data.titleRect && data.statsRect &&
       data.statsRect.x>=data.titleRect.right,
       'approved V3-07: counts must be to the right of actual target title');
     assert.equal(data.desktopToolbarVisible,true,
       'approved V3-07 requires the working container-content/add-resources toolbar');
   }
   if(width===620){
     assert.ok(data.lastStructureRow?.bottom<=data.dock.y,
       'compact font/chapter/tag summary must fit above the 620 output dock');
     assert.ok(data.statsRect.y>=data.titleRect.bottom,
       'approved V3-08: compact target counters must be below the document title');
     assert.equal(data.desktopToolbarVisible,false);
   }
   const picture='five-track-'+width+'x'+height+'.png';
   await page.screenshot({path:path.join(dir,picture)});
   evidence.viewports.push({width,height,...data});evidence.screenshots.push(picture);
 }
 // Real source selector remains navigable, and must not implicitly revoke
 // the confirmed File-bound target or clone the media editor.
 await page.locator('#sfv3CompactSources > summary').click();
 await page.locator('.sfv3-compact-source-choice').first().click();
 assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'source');
 await page.locator('#sfv3TargetTab').click();
 assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'plan');
 await page.locator('#sfv3ResourceDetails > summary').click();
 assert.equal(await page.locator('#sfv3ResourceDetails').getAttribute('open'),'',
   'real font/attachment editors must remain accessible');
 assert.ok(await page.locator('#sfv3ResourceDetails button[data-composition-id]').first().isVisible());
 await page.locator('#sfv3ResourceDetails > summary').click();
 await page.locator('#compositionTracks button[data-sfv3-object-kind="subtitle"]').last().tap();
 assert.equal(await page.locator('.sf14-pane.sf14-inspector').isVisible(),true);
 assert.equal(await page.locator('#newSubtitleList').count(),1);
 await page.screenshot({path:path.join(dir,'selected-subtitle-620x900.png')});
 evidence.screenshots.push('selected-subtitle-620x900.png');
 assert.equal(sha(await fs.readFile(source)),sourceSHA);
 evidence.passed=true;
 console.log('V3 real five-track visual structure: PASS (not Figma sign-off)');
}catch(e){
 evidence.passed=false;evidence.error=String(e);
 evidence.status=await page.locator('#status').textContent().catch(()=>null);
 await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
 throw e;
}finally{
 await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 await browser.close();
}
