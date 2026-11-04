// Real same-source, same-intent comparison of MKVToolNix's in-place
// attachment replacement and Softmux's bounded immutable-output router.
// This is an executable capability comparison, NOT a universal parity proof.
// Requires independently authored P0 fixture and mkvmerge/mkvextract/
// mkvpropedit/ffprobe on PATH. Never runs mkvpropedit on the original source.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  prepareRoutedAttachmentReplacement,executeRoutedAttachmentReplacement,
} from '../src/p2-existing-mkv-writer-router.js';
import {
  parseMkvmergeJsonWithExactUids,exactPositiveUid,
} from '../src/mkvmerge-exact-uid-json.js';

const fixtureDir=path.resolve(process.env.E2E_FIXTURE_DIR||'.e2e/fixtures');
const outputDir=path.resolve(process.env.E2E_OUTPUT_DIR||'.e2e/output');
const sourcePath=path.join(fixtureDir,'p0-independent-mkvtoolnix.mkv');
const reportPath=path.join(outputDir,'p2-mkvtoolnix-same-input-replace-comparison.json');
const sha=data=>createHash('sha256').update(data).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{
  encoding:'utf8',timeout:90000,maxBuffer:40*1024*1024,
});
const info=file=>parseMkvmergeJsonWithExactUids(run('mkvmerge',['-J',file]));
const extract=async(file,id,name)=>{
  const dst=path.join(outputDir,name);
  run('mkvextract',[file,'attachments',String(id)+':'+dst]);
  return fs.readFile(dst);
};
const xml=(file,kind,name)=>{
  const dst=path.join(outputDir,name+'.xml');
  run('mkvextract',[file,kind,dst]);
  return fs.readFile(dst,'utf8');
};
const packets=file=>JSON.parse(run('ffprobe',[
  '-v','error','-show_packets','-show_data_hash','sha256',
  '-show_entries','packet=stream_index,pts,dts,duration,size,data_hash',
  '-of','json',file,
])).packets||[];
const asBlob=(bytes,name)=>{const b=new Blob([bytes]);b.name=name;return b;};
const report={
  schema:'softmux-p2-native-mkvtoolnix-same-input-attachment-compare-v1',
  result:'NOT_RUN',
  reference:'mkvpropedit (local edited copy); independent mkvmerge/mkvextract/ffprobe',
  sourceModified:false,
  productWriterGeneralParity:false,
  scenarios:[],
};
await fs.mkdir(outputDir,{recursive:true});
try{
  const sourceBytes=await fs.readFile(sourcePath);
  const sourceSha=sha(sourceBytes);
  report.sourceSha256=sourceSha;
  report.versions={
    mkvmerge:run('mkvmerge',['--version']).trim(),
    mkvpropedit:run('mkvpropedit',['--version']).trim(),
    mkvextract:run('mkvextract',['--version']).trim(),
  };
  const initial=info(sourcePath);
  const originals=initial.attachments||[];
  const target=originals.find(a=>a.file_name==='p0-generic-report.bin');
  if(!target||originals.filter(a=>a.file_name===target.file_name).length!==1)
    throw Error('REFERENCE_TARGET_ATTACHMENT_NOT_UNIQUE');
  const uid=exactPositiveUid(target.properties?.uid);
  const baselineData=await extract(sourcePath,target.id,'p2-mtx-original-att.bin');
  const sourceChapters=await xml(sourcePath,'chapters','p2-mtx-source-chapters');
  const sourceTags=await xml(sourcePath,'tags','p2-mtx-source-tags');
  const sourcePackets=packets(sourcePath);
  if(!sourceChapters.includes('P0 nested chapter')||
     !sourceTags.includes('P0_NESTED_CHAPTER_KEEP')||
     !sourcePackets.length)
    throw Error('REFERENCE_ADVERSARIAL_SOURCE_SELF_CHECK_FAILED');
  report.source={fileUid:uid,filename:target.file_name,originalBytes:baselineData.length,
    originalPayloadSha256:sha(baselineData),packetCount:sourcePackets.length};
  if(baselineData.length<1)throw Error('REFERENCE_ATTACHMENT_EMPTY');

  for(const scenario of [
    {id:'same-size',bytes:Buffer.alloc(baselineData.length,0x5a)},
    {id:'growth',bytes:Buffer.alloc(baselineData.length+61,0x6b)},
  ]){
    const record={id:scenario.id,reference:'NOT_RUN',softmux:'NOT_RUN',
      comparableOutput:false};
    report.scenarios.push(record);
    const nativeCopy=path.join(outputDir,'p2-mtx-'+scenario.id+'-reference.mkv');
    const replacementPath=path.join(outputDir,'p2-mtx-'+scenario.id+'-replacement.bin');
    await fs.copyFile(sourcePath,nativeCopy);
    await fs.writeFile(replacementPath,scenario.bytes);
    const expected=sha(scenario.bytes);
    // UID selectors are exact; preserve original FileName & MIME explicitly.
    run('mkvpropedit',[nativeCopy,'--attachment-name',target.file_name,
      '--attachment-mime-type',target.content_type,
      '--replace-attachment','='+uid+':'+replacementPath]);
    const verifyOutput=async(file,kind)=>{
      const fresh=info(file);
      const attachments=fresh.attachments||[];
      const match=attachments.find(a=>String(a.properties?.uid)===uid);
      if(attachments.length!==originals.length||!match||
         match.file_name!==target.file_name||
         match.content_type!==target.content_type)
        throw Error(kind+'_ATTACHMENT_UID_NAME_MIME_CHANGED');
      const bytes=await extract(file,match.id,
        'p2-mtx-'+scenario.id+'-'+kind+'-attachment.bin');
      if(sha(bytes)!==expected)throw Error(kind+'_FILEDATA_SHA_MISMATCH');
      const chapters=await xml(file,'chapters','p2-mtx-'+scenario.id+'-'+kind+'-chapters');
      const tags=await xml(file,'tags','p2-mtx-'+scenario.id+'-'+kind+'-tags');
      if(chapters!==sourceChapters||tags!==sourceTags)
        throw Error(kind+'_CHAPTER_OR_TAG_XML_CHANGED');
      const actualPackets=packets(file);
      if(JSON.stringify(actualPackets)!==JSON.stringify(sourcePackets))
        throw Error(kind+'_MEDIA_PACKET_CHANGED');
      return {fileUid:uid,payloadSha256:sha(bytes),
        chaptersAndTagsEqual:true,mediaPacketsEqual:true};
    };
    record.referenceEvidence=await verifyOutput(nativeCopy,'reference');
    record.reference='PASS';
    let source=asBlob(sourceBytes,path.basename(sourcePath));
    let replacement=asBlob(scenario.bytes,path.basename(replacementPath));
    try{
      const plan=await prepareRoutedAttachmentReplacement({
        source,replacement,targetFileUid:uid,approveSourceModification:true,
      });
      record.softmuxRoute=plan.route;
      const result=await executeRoutedAttachmentReplacement(plan);
      const outPath=path.join(outputDir,'p2-mtx-'+scenario.id+'-softmux.mkv');
      await fs.writeFile(outPath,Buffer.from(await result.output.arrayBuffer()));
      record.softmuxEvidence=await verifyOutput(outPath,'softmux');
      record.softmux='PASS';
      record.comparableOutput=true;
    }catch(error){
      // Only explicit, *known* policy/geometry limits may count as a measured
      // capability gap. Treat unexpected parser/index/CRC errors as test
      // failures: an unknown preparation error must not turn this CI green.
      // Once a writer was selected, ANY execution/output failure is fatal.
      const code=String(error?.message||error);
      const expectedRefusals=new Set([
        'P2_ROUTE_NO_VERIFIED_WRITER',
        'P2_ROUTE_ORIGINAL_RAW_UNVERIFIED',
        'P2_ROUTE_TAG_REFERENCED_UID',
        'P2_ROUTE_GRAPH_UNVERIFIED',
        'P2_ROUTE_SOURCE_OR_DATA_BUDGET',
      ]);
      if(record.softmuxRoute||!expectedRefusals.has(code))throw error;
      record.softmux='BLOCKED_BY_KNOWN_CAPABILITY_LIMIT';
      record.softmuxRefusal=code;
    }
    // Original source is immutable, even though native propedit edits a copy.
    if(sha(await fs.readFile(sourcePath))!==sourceSha)
      throw Error('REFERENCE_SOURCE_MODIFIED');
  }
  report.result=report.scenarios.every(s=>s.reference==='PASS')?
    (report.scenarios.every(s=>s.softmux==='PASS')?
      'REFERENCE_AND_SOFTMUX_SCOPED_PARITY':
      'REFERENCE_PASS_SOFTMUX_SCOPE_LIMITS_OBSERVED'):
    'REFERENCE_FAILURE';
}catch(error){
  report.result='FAILED';
  report.error=String(error?.message||error);
}finally{
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,reportPath,
    variants:report.scenarios.map(({id,reference,softmux,softmuxRoute,softmuxRefusal})=>
      ({id,reference,softmux,softmuxRoute,softmuxRefusal})),error:report.error||null}));
}
if(!['REFERENCE_AND_SOFTMUX_SCOPED_PARITY',
    'REFERENCE_PASS_SOFTMUX_SCOPE_LIMITS_OBSERVED'].includes(report.result))
  process.exitCode=1;
