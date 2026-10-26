import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 inspectSoftmuxRelease,fetchGithubExactHeadRuns,
 RELEASE_REQUIRED_WORKFLOWS,
} from '../scripts/audit-softmux-1.0-release.mjs';

const files=[
 'docs/softmux-1.0-release-evidence.json',
 'docs/softmux-1.0-legacy-capability-ledger.json',
 'docs/ten-round-sprint-20261015/acceptance-ledger.json',
];
const load=()=>files.map(path=>JSON.parse(readFileSync(
 new URL('../'+path,import.meta.url),'utf8')));
const SHA='a'.repeat(40), OTHER='b'.repeat(40);
const contractSha256=createHash('sha256').update(readFileSync(
 new URL('../docs/softmux-1.0-product-acceptance-contract-20261020.md',import.meta.url)
)).digest('hex');
const proof=(sha=SHA)=>({
 commit:sha,url:'https://example.org/independent-mkv-evidence',
 fixture:'real-mkv-fixture-with-independent-stream-and-byte-check',
 oracle:'mkvextract + ffprobe + SHA-256',
 result:'pass',
});
function syntheticComplete(){
 const [release,legacy,historical]=load();
 release.release.targetVersion='1.0.0';
 release.release.candidateCommit=SHA;
 release.contractApproval={
   status:'APPROVED',documentSha256:contractSha256,
   approvalUrl:'https://example.org/synthetic-owner-signature',
   approvedBy:'synthetic-only-reviewer',approvedAt:'synthetic-date',
 };
 release.release.publishedWebsiteEvidence={
   commit:SHA,url:'https://example.org/website',
   evidenceUrl:'https://example.org/independent-site-audit',result:'pass',
 };
 release.release.rollbackEvidence={
   procedureUrl:'https://example.org/rollback-procedure',
   testEvidenceUrl:'https://example.org/rollback-check',
   previousCommit:OTHER,
 };
 for(const item of release.scenarios){
   item.status='PASS';item.verifiedCommit=SHA;item.evidence=[proof()];
   if(['S12','S13'].includes(item.id))item.deviceEvidence={
     commit:SHA,url:'https://example.org/target-tablet-test',
     hardware:'synthetic-only-model',os:'synthetic-only-OS',
     browser:'synthetic-only-Chromium',result:'pass',
   };
 }
 for(const item of legacy.requirements){
   item.outcome='PASS';item.verifiedCommit=SHA;item.evidence=[proof()];
   item.migrationPath='synthetic-alternative-proven';
 }
 for(const item of release.original57){
   item.releaseScope='IN_SCOPE';item.outcome='PASS';
   item.verifiedCommit=SHA;item.evidence=[proof()];
 }
 return {release,legacy,historical,packageVersion:'1.0.0',actualCommit:SHA,
   contractSha256,
   workflowRuns:RELEASE_REQUIRED_WORKFLOWS.map(name=>({
     name,head_sha:SHA,status:'completed',conclusion:'success',
   }))};
}
const inspect=opts=>inspectSoftmuxRelease(opts);

test('S14 current project baseline: 14 must cases + 44 original legacy IDs + 57 original historical cases, fail-closed',()=>{
 const [release,legacy,historical]=load();
 const result=inspect({
  release,legacy,historical,packageVersion:'0.1033.0',
  actualCommit:'c'.repeat(40),contractSha256,
 });
 assert.equal(result.scenarioCount,14);
 assert.equal(result.legacyCount,44);
 assert.equal(result.originalCount,57);
 assert.equal(result.ready,false);
 assert.ok(result.blockers.some(x=>x.id==='S13'));
 assert.ok(result.blockers.some(x=>x.id==='S14'));
 assert.ok(result.blockers.some(x=>x.id==='L-044'));
 assert.ok(result.blockers.some(x=>x.id==='U-012'));
 assert.ok(result.blockers.some(x=>x.id==='CI'));
 assert.equal(release.scenarios.some(s=>s.status==='PASS'),false,
   'CI green on a prior developer commit must never silently promote a 1.0 case');
});

test('S14 synthetic complete fixture illustrates exact evidence contract, NOT a release acceptance',()=>{
 const fixture=syntheticComplete(),result=inspect(fixture);
 assert.equal(result.blockers.length,0);
 assert.equal(result.ready,true);
});

test('S14 contract list cannot silently shrink, duplicate or change an original ID',()=>{
 const x=syntheticComplete();x.release.scenarios.pop();
 assert.throws(()=>inspect(x),/SCENARIO_ID_MATRIX/);
 const y=syntheticComplete();y.legacy.requirements[0].id='L-002';
 assert.throws(()=>inspect(y),/LEGACY_ID_MATRIX/);
 const z=syntheticComplete();z.release.original57[0].id='R-000';
 assert.throws(()=>inspect(z),/ORIGINAL_57_ID_MATRIX/);
 const a=syntheticComplete();a.release.original57[0].historicState='verified';
 assert.throws(()=>inspect(a),/HISTORY_CHANGED_R-01/);
});

test('S14 title-only or same-file-name receipts cannot establish an exact-commit PASS',()=>{
 const x=syntheticComplete();
 x.release.scenarios[0].evidence=[{url:'https://example.org/pretty-ui'}];
 assert.ok(inspect(x).blockers.some(x=>x.id==='S01'));
 const y=syntheticComplete();y.release.scenarios[8].verifiedCommit=OTHER;
 assert.ok(inspect(y).blockers.some(x=>x.id==='S09'));
});

test('S14 actual on-device proof and verified live deployment are independent CI gates',()=>{
 const a=syntheticComplete();a.release.scenarios.find(x=>x.id==='S13').deviceEvidence=null;
 assert.ok(inspect(a).blockers.some(x=>x.id==='S13'));
 const b=syntheticComplete();b.release.release.publishedWebsiteEvidence=null;
 assert.ok(inspect(b).blockers.some(x=>x.id==='SITE'));
 const c=syntheticComplete();c.release.release.rollbackEvidence=null;
 assert.ok(inspect(c).blockers.some(x=>x.id==='ROLLBACK'));
});

test('S14 CI source must match exact pinned commit, successful terminal workflow and required names',()=>{
 const a=syntheticComplete();a.workflowRuns[0].head_sha=OTHER;
 assert.ok(inspect(a).blockers.some(x=>x.id==='CI'));
 const b=syntheticComplete();b.workflowRuns[0].conclusion='cancelled';
 assert.ok(inspect(b).blockers.some(x=>x.id==='CI'));
 const c=syntheticComplete();c.actualCommit=OTHER;
 assert.ok(inspect(c).blockers.some(x=>x.id==='COMMIT'));
});

test('S14 legacy removal and historical exception cannot launder a missing approval into green',()=>{
 const a=syntheticComplete(),item=a.legacy.requirements[0];
 item.outcome='APPROVED_RETIREMENT';item.formalRemovalApproved=false;
 assert.ok(inspect(a).blockers.some(x=>x.id==='L-001'));
 const b=syntheticComplete(),original=b.release.original57[0];
 original.outcome='APPROVED_EXCEPTION';original.releaseScope='APPROVED_OUT_OF_SCOPE';
 original.releaseExceptionApproval=null;
 assert.ok(inspect(b).blockers.some(x=>x.id==='R-01'));
});

test('S14 live GitHub receipt lookup requires authorization and filters commit SHA',async()=>{
 await assert.rejects(fetchGithubExactHeadRuns(SHA,null),/ONLINE_AUTH_REQUIRED/);
 const returned=await fetchGithubExactHeadRuns(SHA,'synthetic-only-token',
   async(_url,options)=>{
     assert.match(options.headers.Authorization,/Bearer/);
     return {ok:true,json:async()=>({workflow_runs:[
       {name:RELEASE_REQUIRED_WORKFLOWS[0],head_sha:SHA,status:'completed',conclusion:'success'},
       {name:RELEASE_REQUIRED_WORKFLOWS[1],head_sha:OTHER,status:'completed',conclusion:'success'},
     ]})};
   });
 assert.equal(returned.length,1);
 assert.equal(returned[0].head_sha,SHA);
});

test('S14 unapproved or outdated owner acceptance contract cannot be promoted by green media CI',()=>{
 const missing=syntheticComplete();
 missing.release.contractApproval.status='PENDING_OWNER_REVIEW';
 assert.ok(inspect(missing).blockers.some(x=>x.id==='CONTRACT'));
 const changed=syntheticComplete();
 changed.contractSha256='0'.repeat(64);
 assert.ok(inspect(changed).blockers.some(x=>x.id==='CONTRACT'));
 const malformed=syntheticComplete();
 malformed.release.contractApproval.approvalUrl='not-an-approval-url';
 assert.ok(inspect(malformed).blockers.some(x=>x.id==='CONTRACT'));
});
