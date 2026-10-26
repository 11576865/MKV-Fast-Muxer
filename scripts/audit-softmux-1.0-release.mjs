import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

export const RELEASE_REQUIRED_WORKFLOWS=Object.freeze([
  'Deploy to GitHub Pages','Browser E2E mux tests',
  'S12 scoped real large media acceptance',
]);
export const RELEASE_REQUIRED_S12_JOBS=Object.freeze([
  'S12 actual MKV / 128m / attachment',
  'S12 actual MKV / 512m / pcm',
  'S12 actual MKV / 1000m / pcm',
]);
export const RELEASE_SCENARIO_COUNT=14;
export const RELEASE_LEGACY_COUNT=44;
export const RELEASE_ORIGINAL_COUNT=57;
const STATES=new Set(['PASS','FAIL','BLOCKED','UNASSESSED','IMPLEMENTED_NOT_ACCEPTED']);
const shaOk=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const urlOk=s=>typeof s==='string'&&/^https:\/\//.test(s);
const fail=(code)=>{throw Error('RELEASE_LEDGER_'+code)};
const sorted=x=>[...x].sort().join('|');
const expected=(stem,count)=>Array.from({length:count},
  (_,i)=>stem+String(i+1).padStart(3,'0'));
const expectedOriginal=[
  ...Array.from({length:5},(_,i)=>'R-'+String(i+1).padStart(2,'0')),
  ...expected('T-',15),...expected('B-',17),
  ...expected('S-',8),...expected('U-',12),
];
function exactIds(rows,ids,code){
  if(!Array.isArray(rows)||rows.length!==ids.length||rows.some(r=>!r||
      typeof r.id!=='string')||
      sorted(rows.map(r=>r.id))!==sorted(ids))fail(code);
}
function evidenceValid(row,sha,key='evidence'){
  const receipts=row[key];
  return Array.isArray(receipts)&&receipts.length>0&&
    receipts.every(e=>e&&typeof e==='object'&&
      e.commit===sha&&urlOk(e.url)&&
      typeof e.fixture==='string'&&e.fixture.length>0&&
      typeof e.oracle==='string'&&e.oracle.length>0&&
      e.result==='pass');
}
/**
 * Offline shape check, NOT a claim that supplied URLs prove test success.
 * The strict release check additionally queries GitHub workflow conclusions
 * for the exact candidate SHA and requires real device/site/rollback records.
 */
export function inspectSoftmuxRelease({
  release,legacy,historical,packageVersion,actualCommit=null,workflowRuns=[],
  contractSha256=null,
}={}){
  if(release?.schema!=='softmux-1.0-evidence-gate-v1'||
     legacy?.schema!=='softmux-legacy-44-evidence-v1'||
     historical?.schema!=='mkv-ten-round-acceptance-ledger-v1')
    fail('SCHEMA_MISMATCH');
  exactIds(release.scenarios,Array.from({length:14},(_,i)=>
    'S'+String(i+1).padStart(2,'0')),'SCENARIO_ID_MATRIX');
  exactIds(legacy.requirements,expected('L-',44),'LEGACY_ID_MATRIX');
  exactIds(release.original57,expectedOriginal,'ORIGINAL_57_ID_MATRIX');
  exactIds(historical.requirements,expectedOriginal,'HISTORIC_57_ID_MATRIX');
  for(const row of release.original57){
    const historic=historical.requirements.find(h=>h.id===row.id);
    if(row.requirement!==historic.title||
       row.historicState!==historic.state||
       row.originalPriority!==historic.priority||
       row.originalPhase!==historic.phase)fail('HISTORY_CHANGED_'+row.id);
  }
  const why=[];
  const note=(id,reason)=>why.push({id,reason});
  const candidate=release.release?.candidateCommit;
  const pinned=shaOk(candidate);
  if(!pinned)note('RLS','missing exact 40-digit candidate commit');
  const approval=release.contractApproval;
  if(approval?.status!=='APPROVED'||
     typeof contractSha256!=='string'||
     !/^[a-f0-9]{64}$/.test(contractSha256)||
     approval.documentSha256!==contractSha256||
     !urlOk(approval.approvalUrl)||!approval.approvedBy||!approval.approvedAt)
    note('CONTRACT','owner approval must bind the SHA-256 of the exact frozen S01-S14 product contract');
  if(packageVersion!==release.release?.targetVersion||
      release.release?.targetVersion!=='1.0.0')
    note('VERSION','developer version or target is not 1.0.0');
  if(!shaOk(actualCommit)||candidate!==actualCommit)
    note('COMMIT','actual checkout is not the pinned release commit');
  for(const row of release.scenarios){
    if(!STATES.has(row.status)||row.status!=='PASS'){
      note(row.id,'not fully accepted: '+String(row.status));continue;
    }
    if(!pinned||row.verifiedCommit!==candidate||
        !evidenceValid(row,candidate))
      note(row.id,'missing exact-commit test and independent result evidence');
    if(['S12','S13'].includes(row.id)){
      const device=row.deviceEvidence;
      if(!device||device.commit!==candidate||!urlOk(device.url)||
          !device.hardware||!device.os||!device.browser||
          device.result!=='pass')
        note(row.id,'physical reference device and browser evidence missing');
    }
  }
  for(const row of legacy.requirements){
    if(!row.originalCapability||!row.proposedDisposition)
      fail('LEGACY_DESCRIPTION_MISSING_'+row.id);
    if(row.outcome==='APPROVED_RETIREMENT'){
      if(row.formalRemovalApproved!==true||
         !urlOk(row.removalApprovalUrl)||!row.migrationPath)
        note(row.id,'retirement has no verified explicit approval/transition');
      continue;
    }
    if(row.outcome!=='PASS'||row.verifiedCommit!==candidate||
       !evidenceValid(row,candidate,'actualOutputEvidence')||!row.migrationPath)
      note(row.id,'legacy behavior not independently verified or migrated');
  }
  for(const row of release.original57){
    if(row.outcome==='APPROVED_EXCEPTION'){
      const approval=row.releaseExceptionApproval;
      if(!approval||!urlOk(approval.url)||
         !approval.scope||row.releaseScope!=='APPROVED_OUT_OF_SCOPE')
        note(row.id,'scoped exception lacks approval evidence');
      continue;
    }
    if(row.releaseScope!=='IN_SCOPE'||row.outcome!=='PASS'||
       row.verifiedCommit!==candidate||!evidenceValid(row,candidate))
      note(row.id,'historic acceptance task not reconciled with release scope');
  }
  const site=release.release?.publishedWebsiteEvidence;
  if(!site||site.commit!==candidate||!urlOk(site.url)||
     !urlOk(site.evidenceUrl)||site.result!=='pass')
    note('SITE','live website + exact published build verification missing');
  const rollback=release.release?.rollbackEvidence;
  if(!rollback||!urlOk(rollback.procedureUrl)||
     !urlOk(rollback.testEvidenceUrl)||!shaOk(rollback.previousCommit))
    note('ROLLBACK','recovery/rollback procedure has no executed evidence');
  for(const workflow of RELEASE_REQUIRED_WORKFLOWS){
    const covered=pinned&&workflowRuns.some(r=>r.head_sha===candidate&&
      r.name===workflow&&r.status==='completed'&&
      r.conclusion==='success'&&
      (workflow!=='S12 scoped real large media acceptance'||
        RELEASE_REQUIRED_S12_JOBS.every(name=>Array.isArray(r.jobs)&&
          r.jobs.some(job=>job.name===name&&job.status==='completed'&&
            job.conclusion==='success'))));
    if(!covered)note('CI','missing exact-head full successful workflow/jobs: '+workflow);
  }
  return Object.freeze({
    schema:'softmux-release-gate-result-v1',
    candidateCommit:pinned?candidate:null,packageVersion,
    scenarioCount:release.scenarios.length,legacyCount:legacy.requirements.length,
    originalCount:release.original57.length,
    blockers:why,ready:why.length===0,
    evidenceLimits:'Offline receipt fields are self-reported; --release also fetches exact-head GitHub workflow outcomes. Device evidence requires human verification.',
  });
}
export async function fetchGithubExactHeadRuns(sha,token,fetcher=fetch){
  if(!shaOk(sha)||!token)fail('ONLINE_AUTH_REQUIRED');
  const url='https://api.github.com/repos/11576865/MKV-Fast-Muxer/actions/runs?head_sha='+
    encodeURIComponent(sha)+'&per_page=100';
  const r=await fetcher(url,{headers:{
    Accept:'application/vnd.github+json',
    Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28',
  }});
  if(!r.ok)fail('GITHUB_QUERY_FAILED_'+r.status);
  const json=await r.json();
  if(!Array.isArray(json.workflow_runs))fail('GITHUB_BAD_WORKFLOWS');
  return json.workflow_runs.filter(run=>run.head_sha===sha);
}
function load(relative){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  return JSON.parse(readFileSync(resolve(root,relative),'utf8'));
}
async function main(){
  const strict=process.argv.includes('--release');
  if(!strict&&!process.argv.includes('--audit'))
    fail('SELECT_AUDIT_OR_RELEASE');
  const release=load('docs/softmux-1.0-release-evidence.json');
  const legacy=load('docs/softmux-1.0-legacy-capability-ledger.json');
  const historical=load('docs/ten-round-sprint-20261015/acceptance-ledger.json');
  const pkg=load('package.json');
  const contractBytes=readFileSync(resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../docs/softmux-1.0-product-acceptance-contract-20261020.md'));
  const contractSha256=createHash('sha256').update(contractBytes).digest('hex');
  let actualCommit=null;
  try {actualCommit=execFileSync('git',['rev-parse','HEAD'],{
    encoding:'utf8'}).trim();}catch{}
  const workflowRuns=strict?await fetchGithubExactHeadRuns(
    release.release?.candidateCommit,process.env.GITHUB_TOKEN):[];
  const result=inspectSoftmuxRelease({
    release,legacy,historical,packageVersion:pkg.version,
    actualCommit,workflowRuns,contractSha256,
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(strict&&!result.ready)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');
    process.exitCode=1;});
}
