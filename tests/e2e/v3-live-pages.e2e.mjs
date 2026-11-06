// Post-deploy browser attestation. The normal pull-request Vite preview
// cannot prove the *published* default route, build provenance, or rollback.
// This runs on main after actions/deploy-pages, against the real Pages URL.
// It uses no File uploads, never starts muxing and makes no 1.0 release claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const url=process.env.SOFTMUX_PAGES_URL||'https://11576865.github.io/MKV-Fast-Muxer/';
const base=new URL(url);
assert.equal(base.protocol,'https:','live release proof requires HTTPS');
assert.equal(base.hostname,'11576865.github.io','never probe an untrusted mirror');
const expected=process.env.SOFTMUX_EXPECTED_SHA||process.env.GITHUB_SHA||'';
assert.match(expected,/^[0-9a-f]{40}$/,'published build must attest an exact Git SHA');
const dir=path.resolve('.e2e/v3-live-pages');
await fs.mkdir(dir,{recursive:true});
const evidence={schema:'softmux-v3-live-deployment-v1',
  expectedCommit:expected,site:base.href,checks:[],attempts:[],passed:false,
  limits:['Only the deployed public UI/rollback/access-control smoke is tested',
    'No media bytes are sent, written, or uploaded',
    'Not a full Figma, device, accessibility or 1.0 release signoff']};
const pageErrors=[];
const browser=await chromium.launch({
  headless:true,
  ...(process.env.E2E_BROWSER_EXECUTABLE?
    {executablePath:process.env.E2E_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const context=await browser.newContext({viewport:{width:1280,height:820}});
const page=await context.newPage();
page.on('pageerror',e=>pageErrors.push(String(e)));
page.setDefaultTimeout(20000);
function route(mode){
  const target=new URL(base.href);
  if(mode!==null)target.searchParams.set('ui',mode);
  target.searchParams.set('deployment-proof',expected.slice(0,12));
  return target.href;
}
async function visit(mode){
  const requested=route(mode);
  const response=await page.goto(requested,{waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(response?.status(),200,'Pages must return HTTP 200: '+requested);
  assert.equal(new URL(page.url()).origin,base.origin,
    'production cannot silently redirect to another origin');
  const actual=await page.locator('meta[name="softmux-deployment-sha"]')
    .getAttribute('content',{timeout:6000});
  assert.equal(actual,expected,
    'GitHub Pages must serve the exact merged commit, not cached PR/old HTML');
  return actual;
}
try{
  // Pages may propagate after deploy-pages reports success. Only the exact SHA
  // and rendered V3 qualify, with bounded polling and explicit failure output.
  let ready=false;
  for(let n=0;n<10;n++){
    try{
      await visit(null);
      await page.locator('#sf14Root.sfv3').waitFor({state:'visible',timeout:16000});
      assert.equal(await page.locator('#sf14Root').getAttribute('data-sfv3-surface'),'source');
      assert.equal(await page.locator('#muxBtn').isDisabled(),true,
        'homepage must not grant write authority without explicit target File');
      ready=true;
      evidence.attempts.push({number:n+1,result:'exact-head-rendered'});
      break;
    }catch(error){
      evidence.attempts.push({number:n+1,result:String(error).slice(0,700)});
      if(n===9)throw error;
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
  }
  assert.equal(ready,true);
  await page.screenshot({path:path.join(dir,'published-default-v3.png')});
  evidence.checks.push('Deployed root HTML and rendered V3 both attest the expected merge SHA; mux disabled without target');

  // The explicit alias and both recovery routes are part of the same deployed
  // source; no browser File authority is transferred across navigation.
  await visit('v3');
  await page.locator('#sf14Root.sfv3').waitFor({state:'visible'});
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.checks.push('Published ?ui=v3 alias is source-only');

  await visit(null);
  await page.locator('#sf14Root.sfv3').waitFor({state:'visible'});
  await page.locator('.sfv3-legacy-menu > summary').click();
  const link=page.locator('#sfv3PreviousWorkbench');
  assert.equal(await link.isVisible(),true);
  assert.equal(new URL(await link.getAttribute('href'),page.url()).searchParams.get('ui'),
    'workbench');
  await link.click();
  await page.waitForURL(u=>u.searchParams.get('ui')==='workbench');
  await page.locator('#sf14Root:not(.sfv3)').waitFor({state:'visible'});
  assert.equal(await page.locator('#muxBtn').count(),1);
  await page.screenshot({path:path.join(dir,'published-previous-workbench.png')});
  evidence.checks.push('Published V3 menu navigates to original previous workbench');

  await visit('legacy');
  assert.equal(await page.locator('#sf14Root').count(),0);
  assert.equal(await page.locator('#muxBtn').count(),1);
  evidence.checks.push('Published legacy diagnostic route is available');

  await visit('unknown');
  await page.locator('#sf14Root.sfv3').waitFor({state:'visible'});
  assert.equal(await page.locator('#muxBtn').isDisabled(),true);
  evidence.checks.push('Unknown query does not weaken the default V3 target-authority boundary');
  assert.deepEqual(pageErrors,[],'no page JS errors during live route smoke');
  evidence.passed=true;
  console.log('LIVE V3 PAGES EXACT-SHA DEFAULT/ROLLBACK ATTESTATION: PASS '+expected);
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
