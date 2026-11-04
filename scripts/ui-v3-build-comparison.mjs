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
const cases=[
  {id:'desktop-source',figma:'v3-desktop-source-1440x900.png',live:'source-1440x900.png',liveRoot:actual,frame:'28:2'},
  {id:'portrait-source',figma:'v3-portrait-source-820x1180.png',live:'source-820x1180.png',liveRoot:actual,frame:'33:2'},
  {id:'landscape-target',figma:'v3-landscape-target-1180x820.png',live:'plan-1180x820.png',liveRoot:actual,frame:'36:2'},
  {id:'compact-target',figma:'v3-compact-target-620x900.png',live:'plan-620x900.png',liveRoot:actual,frame:'37:223'},
  {id:'desktop-empty',figma:'v3-desktop-empty-1440x900.png',live:'1440-empty.png',liveRoot:emptyActual,frame:'39:2'},
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
  await writeFile(path.join(root,'review-index.json'),
    JSON.stringify({schema:'softmux-ui-v3-visual-review-pairs-v1',
      strictDesignAuthority:'docs/ui-v3/UI_DESIGN_CONTRACT.md',
      actualRun:'This CI HEAD, see screenshot artifact and workflow commit SHA',
      passedStructuralPairing:true,visuallyAccepted:false,comparisons:summaries},null,2)+'\n');
  console.log('Created '+summaries.length+' equal-scale visual comparison pairs; visuallyAccepted=false');
  await page.close();
}finally{
  await browser.close();
}
