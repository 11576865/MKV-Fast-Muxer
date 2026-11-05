// Produce human-reviewable, equal-scale Figma vs real-browser screenshot
// pairs. Never turn unmatched fixture metadata into a false pixel score.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve('.e2e/ui-v3-visual-comparison');
await mkdir(root,{recursive:true});
const ref=path.resolve('docs/ui-v3/reference');
const actual=path.resolve('.e2e/ui-v3-responsive');
const emptyActual=path.resolve('.e2e/ui-v3-evidence');
const assSource=path.resolve('.e2e/ui-v3-ass-source');
const crossSource=path.resolve('.e2e/ui-v3-cross-source');
const multitrack=path.resolve('.e2e/ui-v3-multitrack');
// All ten representable static V3 screens. The eleventh approved Figma
// screen (40:2) specifies state/adaptive RULES, not a browser bitmap, and
// therefore has a structural evidence record below instead of a fake pair.
const cases=[
  {id:'V3-01-desktop-source',figma:'v3-desktop-source-1440x900.png',live:'source-1440x900.png',liveRoot:actual,frame:'28:2'},
  {id:'V3-02-desktop-ass-selected',figma:'v3-desktop-source-ass-selected-1440x900.png',live:'v3-ass-selected-1440x900.png',liveRoot:assSource,frame:'30:2'},
  {id:'V3-03-explicit-target-picker',figma:'v3-desktop-target-picker-1440x900.png',live:'wu02-target-dialog.png',liveRoot:crossSource,frame:'31:2'},
  {id:'V3-04-desktop-target',figma:'v3-desktop-target-1440x900.png',live:'five-track-1440x900.png',liveRoot:multitrack,frame:'32:2'},
  {id:'V3-05-portrait-ass-selected',figma:'v3-portrait-source-820x1180.png',live:'v3-ass-selected-820x1180.png',liveRoot:assSource,frame:'33:2'},
  {id:'V3-06-portrait-target',figma:'v3-portrait-target-820x1180.png',live:'five-track-820x1180.png',liveRoot:multitrack,frame:'35:2'},
  {id:'V3-07-landscape-target',figma:'v3-landscape-target-1180x820.png',live:'five-track-1180x820.png',liveRoot:multitrack,frame:'36:2'},
  {id:'V3-08-compact-target',figma:'v3-compact-target-620x900.png',live:'five-track-620x900.png',liveRoot:multitrack,frame:'37:223'},
  {id:'V3-09-default-forced-help',figma:'v3-portrait-help-820x1180.png',live:'v3-source-ass-flags-and-font-observation.png',liveRoot:assSource,frame:'38:2'},
  {id:'V3-10-desktop-empty',figma:'v3-desktop-empty-1440x900.png',live:'1440-empty.png',liveRoot:emptyActual,frame:'39:2'},
];
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const summaries=[];
try{
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const entry of cases){
    const [left,right]=await Promise.all([
      readFile(path.join(ref,entry.figma)),
      readFile(path.join(entry.liveRoot,entry.live)),
    ]);
    const decode=data=>'data:image/png;base64,'+data.toString('base64');
    const html=`<!doctype html><meta charset="utf-8"><title>V3 design review</title>
<style>
*{box-sizing:border-box}html,body{margin:0}body{background:#0e1114;color:#dbe3dd;
font:13px/1.5 system-ui,-apple-system,sans-serif;padding:20px}
h1{font-size:18px;margin:0 0 10px}p{max-width:100%;margin:0 0 12px;color:#9aa9a0}
.layout{display:flex;align-items:flex-start;gap:16px}
.panel{background:#1a1f23;padding:8px;border:1px solid #35403a;border-radius:8px}
.panel h2{font-size:12px;margin:0 0 8px;color:#c2d2c6}
img{display:block;width:auto;height:auto;max-width:none;background:#121518}
.note{margin-top:14px;color:#c8ad81}
</style>
<h1>V3 ${entry.id} — Figma vs Chromium</h1>
<p>Left: approved Figma node ${entry.frame}; right: actual ?ui=v3 browser.
Exact viewport PNGs are drawn at 1 CSS pixel per source pixel (no proportional stretch).</p>
<div class="layout"><div class="panel"><h2>Figma frozen reference</h2><img id="figma" src="${decode(left)}"></div>
<div class="panel"><h2>Browser actual branch preview</h2><img id="actual" src="${decode(right)}"></div></div>
<p class="note">NOT A VISUAL ACCEPTANCE OR PIXEL MATCH. Fixture file names/contents differ.
Compare spacing, hierarchy, position, color, icon roles and overflow by inspection.</p>`;
    await page.setViewportSize({width:3060,height:1600});
    await page.setContent(html,{waitUntil:'load'});
    await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode())]));
    const sizes=await page.evaluate(()=>({
      figma:[document.getElementById('figma').naturalWidth,document.getElementById('figma').naturalHeight],
      actual:[document.getElementById('actual').naturalWidth,document.getElementById('actual').naturalHeight],
    }));
    const expected=entry.figma.match(/(\d+)x(\d+)/);
    if(!expected || sizes.figma[0]!==+expected[1] || sizes.figma[1]!==+expected[2] ||
      sizes.actual[0]!==+expected[1] || sizes.actual[1]!==+expected[2]){
      throw Error(entry.id+' screenshot dimensions mismatch: '+JSON.stringify(sizes));
    }
    const file=entry.id+'-figma-vs-browser.png';
    await page.screenshot({path:path.join(root,file),fullPage:true});
    summaries.push({id:entry.id,frame:entry.frame,figma:entry.figma,actual:entry.live,
      pixels:sizes.figma,paired:file,verdict:'UNREVIEWED',score:null,
      reason:'Independent real screenshots paired with static mockups containing different fixtures.'});
  }
  // Figma V3-11 (40:2) is a 1300x650 adaptive RULE diagram, not a
  // 1300x650 application state. The real evidence is 11 viewport sizes x
  // 2 authentic source/target surfaces from Chromium; never pass a fabricated
  // browser mock screenshot as if it satisfied that design frame.
  const responsive=JSON.parse(await readFile(path.join(actual,'v3-responsive-geometry.json'),'utf8'));
  const testedWidths=[...new Set(responsive.cases.map(item=>item.width))];
  const sourceCases=responsive.cases.filter(item=>item.state==='source');
  const targetCases=responsive.cases.filter(item=>item.state==='plan');
  if(!responsive.passed || testedWidths.length!==11 || sourceCases.length!==11 ||
      targetCases.length!==11 || responsive.errors.length ||
      responsive.cases.some(item=>!item.validFile || item.viewportOverflow ||
        item.rootOverflow || item.nativeEditorNodes!==1 ||
        item.criticalOffscreen.length)){
    throw Error('V3-11 real responsive structural evidence is incomplete or failed');
  }
  const adaptive={id:'V3-11-adaptive-rules',frame:'40:2',
    figma:'v3-adaptive-rules-1300x650.png',
    evidence:'v3-responsive-geometry.json',type:'STATE_RULES_NOT_PIXEL_SCREEN',
    testedWidths,sourceCases:sourceCases.length,targetCases:targetCases.length,
    sourceAndTargetFileContinuity:true,passedBoundedGeometry:true,
    visualAcceptance:'UNREVIEWED',physicalDeviceAcceptance:false,
    note:'Figma 40:2 is a state/rules diagram. No pixel-score or fake UI render.'};
  await stat(path.join(ref,adaptive.figma));
  await writeFile(path.join(root,'review-index.json'),
    JSON.stringify({schema:'softmux-ui-v3-visual-review-pairs-v2',
      strictDesignAuthority:'docs/ui-v3/UI_DESIGN_CONTRACT.md',
      actualRun:'This CI HEAD, see screenshot artifact and workflow commit SHA',
      approvedStates:11,pairedScreenshotStates:summaries.length,
      adaptiveRuleStates:1,fixtureMatched:false,
      passedStructuralPairing:true,visuallyAccepted:false,
      physicalDeviceAccepted:false,comparisons:summaries,adaptive},null,2)+'\n');
  console.log('Created '+summaries.length+' equal-scale V3 pairs + one adaptive-rule proof; visuallyAccepted=false');
  await page.close();
}finally{
  await browser.close();
}
