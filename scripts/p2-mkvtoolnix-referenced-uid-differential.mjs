// Native MKVToolNix reference vs Softmux: deliberately replace FileData
// that is the target of a TagAttachmentUID. No UI feature or overwrite.
// The source fixture is independently written by mkvmerge + mkvpropedit.
// The reference edits a private copy; Softmux must require a separate
// explicit authorization and prove unchanged physical Tag target relations.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  prepareRoutedAttachmentReplacement,executeRoutedAttachmentReplacement,
} from '../src/p2-existing-mkv-writer-router.js';
import {
  parseMkvmergeJsonWithExactUids,exactPositiveUid,
} from '../src/mkvmerge-exact-uid-json.js';
import {createMatroskaAttachmentReader} from '../src/matroska-attachment-reader.js';

const root=path.resolve(process.env.E2E_FIXTURE_DIR||'.e2e/fixtures');
const out=path.resolve(process.env.E2E_OUTPUT_DIR||'.e2e/output');
const input=path.join(root,'p0-independent-attachmenttag.mkv');
const reportFile=path.join(out,'p2-mtx-referenced-uid-differential.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:90000,
  maxBuffer:40*1024*1024});
const info=p=>parseMkvmergeJsonWithExactUids(run('mkvmerge',['-J',p]));
const packets=p=>JSON.parse(run('ffprobe',[
  '-v','error','-show_packets','-show_data_hash','sha256',
  '-show_entries','packet=stream_index,pts,dts,duration,size,data_hash',
  '-of','json',p,
])).packets||[];
const extract=async(p,id,label)=>{
  const dest=path.join(out,'p2-mtx-uid-'+label+'.bin');
  run('mkvextract',[p,'attachments',id+':'+dest]);
  return fs.readFile(dest);
};
const tags=p=>{
  const dest=path.join(out,'p2-mtx-uid-'+path.basename(p)+'.xml');
  run('mkvextract',[p,'tags',dest]);
  return fs.readFile(dest,'utf8');
};
const blob=(bytes,name)=>{const b=new Blob([bytes]);b.name=name;return b;};
const report={schema:'p2-mkvtoolnix-targeted-uid-replacement-differential-v1',
  result:'NOT_RUN',sourceOverwrite:false,productSourceOverwrite:false,
  externalWriterIntegration:false,playerCompatibility:'not-tested'};
await fs.mkdir(out,{recursive:true});
try{
  const sourceBytes=await fs.readFile(input),sourceHash=sha(sourceBytes);
  report.sourceSha256=sourceHash;
  report.mkvtoolnixVersion=run('mkvpropedit',['--version']).trim();
  const baseline=info(input);
  const target=(baseline.attachments||[]).find(a=>
    a.file_name==='p0-attachment-evidence.bin');
  const decoy=(baseline.attachments||[]).find(a=>
    a.file_name==='p0-attachment-decoy.txt');
  if(!target||!decoy||(baseline.attachments||[]).length!==2)
    throw Error('REFERENCE_TWO_ATTACHMENTS_NOT_FOUND');
  const uid=exactPositiveUid(target.properties?.uid),
        otherUid=exactPositiveUid(decoy.properties?.uid);
  if(uid===otherUid)throw Error('REFERENCE_UID_COLLISION');
  const originalPayload=await extract(input,target.id,'original');
  const decoyPayload=await extract(input,decoy.id,'decoy-original');
  const replacement=Buffer.alloc(originalPayload.length,0x39);
  if(!replacement.length||sha(replacement)===sha(originalPayload))
    throw Error('REPLACEMENT_MUST_CHANGE_CONTENT_SAME_LENGTH');
  const expectedSha=sha(replacement);
  const originalTags=await tags(input);
  const originalPackets=packets(input);
  if(!originalTags.includes('P0_ATTACHMENT_RELATION')||
     !originalTags.includes('<AttachmentUID>')||
     !originalTags.includes(uid)||!originalPackets.length)
    throw Error('REFERENCE_SOURCE_TARGET_OR_MEDIA_MISSING');
  const originalBlob=blob(sourceBytes,'p0-independent-attachmenttag.mkv');
  const reader=createMatroskaAttachmentReader(originalBlob);
  const inv=await reader.inspect();
  const graph=await reader.inspectRelations(inv);
  if(graph.state!=='inspected'||
     graph.edges.filter(e=>e.targetKind==='attachment'&&e.targetUid===uid&&
       e.resolution==='matched').length!==1)
    throw Error('SOURCE_TAG_ATTACHMENT_UID_GRAPH_NOT_EXACT');

  // Without the second explicit consent, the existing safety policy remains.
  try{
    await prepareRoutedAttachmentReplacement({
      source:originalBlob,replacement:blob(replacement,'replacement.bin'),
      targetFileUid:uid,approveSourceModification:true,
    });
    throw Error('UNREVIEWED_REFERENCED_TARGET_WAS_PERMITTED');
  }catch(error){
    if(error.message!=='P2_ROUTE_TAG_REFERENCED_UID')throw error;
    report.defaultDenied=true;
  }
  const nativeOut=path.join(out,'p2-mtx-uid-native.mkv');
  const replacementPath=path.join(out,'p2-mtx-uid-replacement.bin');
  await fs.copyFile(input,nativeOut);
  await fs.writeFile(replacementPath,replacement);
  run('mkvpropedit',[nativeOut,'--attachment-name',target.file_name,
    '--attachment-mime-type',target.content_type,
    '--replace-attachment','='+uid+':'+replacementPath]);

  const plan=await prepareRoutedAttachmentReplacement({
    source:originalBlob,replacement:blob(replacement,'replacement.bin'),
    targetFileUid:uid,approveSourceModification:true,
    approveReferencedTagTargetReplacement:true,
  });
  if(plan.route!=='same-size'||plan.evidence.referencedTagCount!==1)
    throw Error('PRODUCT_REFERENCED_TARGET_ROUTE_UNEXPECTED');
  const actual=await executeRoutedAttachmentReplacement(plan);
  const softmuxOut=path.join(out,'p2-mtx-uid-softmux.mkv');
  await fs.writeFile(softmuxOut,Buffer.from(await actual.output.arrayBuffer()));

  const verify=async(p,label)=>{
    const parsed=info(p);
    const all=parsed.attachments||[];
    const selected=all.find(a=>String(a.properties?.uid)===uid);
    const decoySelected=all.find(a=>String(a.properties?.uid)===otherUid);
    if(all.length!==2||!selected||!decoySelected||
       selected.file_name!==target.file_name||
       selected.content_type!==target.content_type||
       decoySelected.file_name!==decoy.file_name)
      throw Error(label+'_ATTACHMENT_UID_OR_METADATA_CHANGED');
    const targetBytes=await extract(p,selected.id,label+'-target');
    const decoyBytes=await extract(p,decoySelected.id,label+'-decoy');
    if(sha(targetBytes)!==expectedSha||
       sha(decoyBytes)!==sha(decoyPayload))
      throw Error(label+'_ATTACHMENT_PAYLOAD_CHANGED');
    if(await tags(p)!==originalTags)
      throw Error(label+'_TARGET_TAG_XML_CHANGED');
    if(JSON.stringify(packets(p))!==JSON.stringify(originalPackets))
      throw Error(label+'_MEDIA_PACKETS_CHANGED');
    const outBlob=blob(await fs.readFile(p),'result.mkv');
    const outReader=createMatroskaAttachmentReader(outBlob);
    const outInv=await outReader.inspect();
    const outGraph=await outReader.inspectRelations(outInv);
    if(outGraph.state!=='inspected'||
       JSON.stringify(outGraph.edges)!==JSON.stringify(graph.edges))
      throw Error(label+'_PHYSICAL_TAG_GRAPH_CHANGED');
    return {attachmentUid:uid,payloadSha256:sha(targetBytes),
      otherAttachmentSha256:sha(decoyBytes),targetTagGraphEqual:true,
      targetTagXmlEqual:true,mediaPacketsEqual:true};
  };
  report.native=await verify(nativeOut,'native');
  report.softmux=await verify(softmuxOut,'softmux');
  report.softmuxRoute=plan.route;
  report.referencedTagCount=plan.evidence.referencedTagCount;
  report.sourceUnmodified=sha(await fs.readFile(input))===sourceHash;
  if(!report.sourceUnmodified)throw Error('REFERENCE_SOURCE_MUTATED');
  if(!actual.evidence.tagTargetGraphPreserved||
     actual.evidence.nativeExternalOraclePassed!==false)
    throw Error('PRODUCT_REFERENCE_PROOF_MISREPRESENTED');
  report.result='SCOPED_TAG_UID_PRESERVATION_PASS';
}catch(e){
  report.result='FAIL';
  report.error=String(e?.message||e);
}finally{
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,reportFile,error:report.error||null}));
}
if(report.result!=='SCOPED_TAG_UID_PRESERVATION_PASS')process.exitCode=1;
