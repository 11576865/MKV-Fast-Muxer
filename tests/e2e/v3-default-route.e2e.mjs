// Default-route release check: UI presentation must never silently grant
// target File authority. Retained 10.14 and classic editors remain selectable.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const dir=path.resolve('.e2e/ui-v3-default-route');
await fs.mkdir(dir,{recursive:true});
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/';
const url=mode=>{
  const u=new URL(base);
  if(mode===null)u.searchParams.delete('ui');
  else u.searchParams.set('ui',mode);
  return u.href;
};
const browser=await chromium.launch({headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?{executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1280,height:820}});
const page=await context.newPage();page.setDefaultTimeout(45000);
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
const evidence={schema:'softmux-v3-default-route-acceptance-v1',
  steps:[],passed:false,
  limits:'Browser route and source-only authority smoke; no physical device or 1.0 product release signoff.'};
try{
  await page.goto(url(null),{waitUntil:'networkidle'});
  await page.locator('#sf14Root.sfv3').waitFor({state:'visible'});
  assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'source');
  assert.equal(await page.locator('#sfv3TargetTab').isVisible(),false);
  assert.equal(await page.locator('#muxBtn').isDisabled(),true,
    'public root cannot authorize writing before explicit destination selection');
  assert.equal(await page.locator('#sfv3PreviousWorkbench').count(),1);
  await page.screenshot({path:path.join(dir,'default-v3-1280x820.png')});
  evidence.steps.push('root URL: V3 mounted; read-only source and disabled mux');
  await page.goto(url('v3'),{waitUntil:'networkidle'});
  assert.equal(await page.locator('#sf14Root.sfv3').count(),1,
    '?ui=v3 remains a compatible explicit alias');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.steps.push('explicit V3 alias still uses V3 target authority');
  await page.goto(url(null),{waitUntil:'networkidle'});
  await page.locator('.sfv3-legacy-menu > summary').click();
  const oldLink=page.locator('#sfv3PreviousWorkbench');
  assert.equal(await oldLink.isVisible(),true,'rollback is an actual user-visible menu link');
  await oldLink.click();
  await page.waitForURL(u=>u.searchParams.get('ui')==='workbench');
  assert.equal(await page.locator('#sf14Root:not(.sfv3)').count(),1,
    'previous 10.14 workbench retained with same native editor ownership');
  assert.equal(await page.locator('#sfv3Tabs').count(),0);
  assert.equal(await page.locator('#muxBtn').count(),1);
  await page.screenshot({path:path.join(dir,'fallback-10-14-1280x820.png')});
  evidence.steps.push('V3 native menu can navigate to previous 10.14 workspace');
  await page.goto(url('legacy'),{waitUntil:'networkidle'});
  assert.equal(await page.locator('#sf14Root').count(),0,
    'original diagnostic fallback remains accessible without V3 or 10.14 chrome');
  assert.equal(await page.locator('#muxBtn').count(),1);
  evidence.steps.push('classic diagnostic ?ui=legacy retained');
  await page.goto(url('unrecognized'),{waitUntil:'networkidle'});
  assert.equal(await page.locator('#sf14Root.sfv3').count(),1,
    'unrecognized routing values fail to default V3, not privileged legacy');
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  assert.deepEqual(pageErrors,[],'no browser page exceptions during route switch');
  evidence.steps.push('unknown mode stays V3 and cannot grant a target');
  evidence.passed=true;
  console.log('V3 default-route, previous workbench and classic rollback: PASS');
}catch(error){
  evidence.error=String(error);
  await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});
  throw error;
}finally{
  evidence.pageErrors=pageErrors;
  await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  await context.close();
  await browser.close();
}
