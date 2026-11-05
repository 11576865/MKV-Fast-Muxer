/**
 * S08 acceptance artifact-set verifier, run independently of the browser
 * producer and BEFORE uploading the original source/finished-output archive.
 * Do not equate a no-download assertion with absence of a malicious write:
 * the browser's execution-time gate is separately exercised in Chromium.
 *
 * Exact scope: one native nested-ChapterUID/targeted-Tag fixture is refused,
 * then another source creates a valid output from the current public workbench.
 * This does NOT certify arbitrary Matroska reference preservation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(process.env.E2E_FIXTURE_DIR||'.e2e/fixtures');
const out=path.resolve(process.env.E2E_OUTPUT_DIR||'.e2e/output');
const risky=path.join(root,'p0-independent-mkvtoolnix.mkv');
const safe=path.join(root,'source-with-attachments.mkv');
const delivered=path.join(out,'s08-modern-source-switch-safe.mkv');
const chapters=path.join(out,'s08-risk-source-chapters.xml');
const tags=path.join(out,'s08-risk-source-tags.xml');
const receiptPath=path.join(out,'softmux-s08-modern-source-safety-evidence.json');
const completionPath=path.join(out,'s08-independent-archive-completeness.json');

const hash=async filename=>{
  const sha=createHash('sha256');
  for await(const chunk of createReadStream(filename))sha.update(chunk);
  return sha.digest('hex');
};
const run=(command,args)=>execFileSync(command,args,{
  encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
}).trim();
const probe=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_streams','-show_format','-of','json',file
]));
const codecs=(p,kind)=>(p.streams||[])
  .filter(s=>s.codec_type===kind).map(s=>s.codec_name).sort();
const compressed=(file,kind)=>run('ffmpeg',[
  '-hide_banner','-loglevel','error','-i',file,
  '-map','0:'+kind+':0','-c','copy','-f','hash','-hash','SHA256','-'
]);
const chaptersXml=await fs.readFile(chapters,'utf8');
const tagsXml=await fs.readFile(tags,'utf8');
const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
assert.equal(receipt.schema,'softmux-s08-modern-source-safety-v1');
assert.equal(receipt.riskSource,path.basename(risky));
assert.equal(receipt.safeSource,path.basename(safe));
assert.equal(receipt.delivered,path.basename(delivered));
assert.equal(receipt.blockedBeforeExecution,true);
assert.equal(receipt.executionBypassRejected,true);
assert.equal(receipt.riskSourceUnchanged,true);
assert.equal(receipt.independentlyProbed,true);
assert.equal(receipt.nativeRiskEvidence?.nestedChapterAndTargetedTag,true);

for(const file of [risky,safe,delivered,chapters,tags]){
  assert.ok((await fs.stat(file)).size>0,'S08_ARCHIVE_MEMBER_MISSING:'+file);
}
const [riskSha,safeSha,outputSha,chapterSha,tagSha]=await Promise.all([
  hash(risky),hash(safe),hash(delivered),hash(chapters),hash(tags)
]);
assert.equal(riskSha,receipt.riskSourceSha256);
assert.equal(safeSha,receipt.safeSourceSha256);
assert.equal(outputSha,receipt.deliveredSha256);
assert.equal(chapterSha,receipt.nativeRiskEvidence.chapterXmlSha256);
assert.equal(tagSha,receipt.nativeRiskEvidence.tagXmlSha256);
assert.match(chaptersXml,/<ChapterUID>\s*510010\s*<\/ChapterUID>/);
assert.match(chaptersXml,/<ChapterUID>\s*510011\s*<\/ChapterUID>/);
assert.match(tagsXml,/<ChapterUID>\s*510011\s*<\/ChapterUID>/);
assert.match(tagsXml,/P0_NESTED_CHAPTER_KEEP/);
const [riskProbe,safeProbe,outputProbe]=[risky,safe,delivered].map(probe);
assert.ok((riskProbe.streams||[]).some(s=>s.codec_type==='video'));
for(const kind of ['video','audio']){
  assert.ok(codecs(safeProbe,kind).length,'S08_SAFE_SOURCE_NO_'+kind.toUpperCase());
  assert.deepEqual(codecs(outputProbe,kind),codecs(safeProbe,kind));
}
assert.ok(codecs(outputProbe,'subtitle').length>=1,
  'S08_SAFE_RECOVERY_OUTPUT_NO_IMPORTED_SUBTITLE');
// Independent compressed byte sequence identity is stronger than comparing
// codec names alone. Packet timestamp and Chapter/Tag preservation are separate.
const streamSha={};
for(const kind of ['v','a']){
  const src=compressed(safe,kind),dest=compressed(delivered,kind);
  assert.match(src,/^SHA256=[0-9a-f]{64}$/i);
  assert.equal(dest,src,'S08_SAFE_RECOVERY_'+kind+'_BITSTREAM_CHANGED');
  streamSha[kind]=src.slice(7);
}
const result={
  schema:'softmux-s08-complete-native-archive-validation-v1',
  status:'PASS',sourceArtifactClosure:true,
  risk:{file:path.basename(risky),bytes:(await fs.stat(risky)).size,
    sha256:riskSha,hasNestedChapterUid:true,tagTargetsNestedChapterUid:'510011',
    exportedChapterXmlSha256:chapterSha,exportedTagXmlSha256:tagSha,
    browserDeniedRuntimeBypass:true,originalNotModifiedByTest:true},
  safe:{file:path.basename(safe),bytes:(await fs.stat(safe)).size,sha256:safeSha},
  delivered:{file:path.basename(delivered),bytes:(await fs.stat(delivered)).size,
    sha256:outputSha,streamCopySha256:streamSha,
    audioVideoCodecs:[codecs(outputProbe,'video'),codecs(outputProbe,'audio')],
    importedSubtitleStreams:codecs(outputProbe,'subtitle').length},
  caution:'Browser denied risky execution in passing E2E. The independently reopened source and output files, native XML and per-stream bytes verify this archived bounded case, not generic EBML semantics, device durability, arbitrary PTS/DTS, or 1.0 approval.'
};
await fs.writeFile(completionPath,JSON.stringify(result,null,2)+'\n');
console.log('S08 complete real source/archive/native stream identity PASS');
