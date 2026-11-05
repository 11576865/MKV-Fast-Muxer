/**
 * Real Matroska Foundation-primary promotion *evidence* matrix.
 *
 * Every positive fixture is independently authored/identified by MKVToolNix.
 * Every attachment's bytes are independently extracted with mkvextract.
 * Real Chromium runs the actual product Foundation-primary inventory backend,
 * the legacy backend only as differential reference, and official BSD
 * libMatroska2 via WORKERFS. It does not silently switch production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {parseMkvmergeJsonWithExactUids,exactPositiveUid}
  from '../src/mkvmerge-exact-uid-json.js';

const ROOT='.e2e/fixtures';
const OUT='.e2e/output';
const REPORT=path.join(OUT,'foundation-inventory-matrix-chromium.json');
const CASES=Object.freeze([
  {id:'p0-independent-mkvtoolnix',count:1,reason:'nested-chapter-tag'},
  {id:'p0-independent-tracktag',count:0,reason:'track-uid-tag-no-attachments'},
  {id:'p0-independent-attachmenttag',count:2,reason:'referenced-fileuid-and-decoy'},
  {id:'foundation-no-attachments',count:0,reason:'remuxed-nested-chapter-without-files'},
  {id:'foundation-three-attachments',count:3,
    reason:'unicode-filename-description-and-mime-variation'},
  {id:'foundation-audio-only',count:1,
    reason:'independently-generated-audio-only-source-with-unicode-attachment'},
]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const digestFile=async file=>{
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
};
const report={
  schema:'foundation-primary-independent-attachment-matrix-v1',
  result:'NOT_RUN',cases:[],totalAttachments:0,
  sourceOverwrite:false,
  independentWriter:'mkvmerge/mkvpropedit',
  independentExtractor:'mkvextract',
  readBackend:'foundation-libmatroska-c-wasm',
  productionDefaultChanged:false,
  legacyRetirementAuthorized:false,
  pendingAdmission:[
    'wider-malformed-fuzz-and-resource-exhaustion-corpus',
    'unknown-sized-segments-and-CRC-variations',
    'multi-GB-and-mobile-device-pressure',
    'full-container-output-preservation',
    'upstream-Emscripten-portability',
  ],
};
let browser,server;
await fs.mkdir(OUT,{recursive:true});
try {
  const files=Object.create(null);
  for(const name of [
    'matroska-attachment-reader','foundation-structure-observation',
    'foundation-attachment-inventory','foundation-attachment-crc32','ebml-crc32-bounded','foundation-wasm-json-abi',
    'source-asset-session','output-composition','container-tree',
    'preservation-preflight','matroska-attachment-relation-graph',
  ]){
    files['/src/'+name+'.js']=await fs.readFile('src/'+name+'.js');
  }
  files['/foundation-worker.js']=await fs.readFile(
    'scripts/workers/foundation-matroska-worker.js');
  files['/foundation-json.js']=await fs.readFile(
    '.e2e/foundation-build/libmatroska2/foundation_json_probe.js');
  files['/foundation_json_probe.wasm']=await fs.readFile(
    '.e2e/foundation-build/libmatroska2/foundation_json_probe.wasm');
  const pageBody=Buffer.from('<!doctype html><meta charset="utf-8">'+
    '<input id="source" type="file">');
  server=createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(pageBody);return;
    }
    const key=req.url||'';
    const bytes=files[key];
    if(!bytes){res.writeHead(404);res.end();return;}
    res.writeHead(200,{
      'Content-Type':key.endsWith('.wasm')?
        'application/wasm':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store',
      'Cross-Origin-Resource-Policy':'same-origin',
    });
    res.end(bytes);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.FOUNDATION_CHROMIUM_EXECUTABLE||undefined,
    args:['--no-sandbox'],
  });
  const page=await browser.newPage();
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  await page.goto(origin+'/');

  for(const sample of CASES){
    const filePath=path.resolve(ROOT,sample.id+'.mkv');
    const expected= parseMkvmergeJsonWithExactUids(
      await fs.readFile(path.join(OUT,'foundation-matrix-'+sample.id+'.json'),
        'utf8'));
    const nativeAttachments=expected.attachments||[];
    const nativeTrackTypes=(expected.tracks||[]).map(track=>track.type);
    if(sample.id==='foundation-audio-only' &&
       (!nativeTrackTypes.length ||
        nativeTrackTypes.some(type=>type!=='audio')))
      throw Error('MATRIX_AUDIO_ONLY_FILE_CONTAINS_NONAUDIO_TRACKS');
    assert.equal(nativeAttachments.length,sample.count,
      'NATIVE_FIXTURE_COUNT_MISMATCH_'+sample.id);
    const beforeHash=await digestFile(filePath);
    const stat=await fs.stat(filePath);
    const native=[];
    for(const entry of nativeAttachments){
      if(!Number.isSafeInteger(entry.id)||entry.id<1 ||
         !Number.isSafeInteger(entry.size)||entry.size<0)
        throw Error('NATIVE_ATTACHMENT_REFERENCE_UNRECOGNIZED_'+sample.id);
      const output=path.resolve(OUT,'foundation-matrix-'+sample.id+
        '-native-'+entry.id+'.bin');
      execFileSync('mkvextract',['attachments',filePath,
        String(entry.id)+':'+output],{timeout:30000,stdio:'pipe'});
      const bytes=await fs.readFile(output);
      if(bytes.length!==entry.size)
        throw Error('NATIVE_ATTACHMENT_LENGTH_MISMATCH_'+sample.id);
      native.push({
        ordinal:native.length,
        fileUid:exactPositiveUid(entry.properties?.uid),
        filename:entry.file_name,
        mimeType:entry.content_type,
        description:entry.description||'',
        byteLength:entry.size,
        sha256:digest(bytes),
      });
    }
    await page.locator('#source').setInputFiles(filePath);
    const actual=await page.evaluate(async nativeEvidence=>{
      const {createMatroskaAttachmentReader}=await import(
        '/src/matroska-attachment-reader.js');
      const file=document.querySelector('#source')?.files?.[0];
      if(!file)throw Error('MATRIX_FILE_INPUT_ABSENT');

      const sourceFactory=()=>new Worker('/foundation-worker.js');
      const primary=createMatroskaAttachmentReader(file,{
        inspectionBackend:'foundation-primary',
        foundationWorkerFactory:sourceFactory,
      });
      const legacy=createMatroskaAttachmentReader(file);
      const primaryInventory=await primary.inspect();
      const legacyInventory=await legacy.inspect();
      if(primaryInventory.state!=='inspected' ||
         legacyInventory.state!=='inspected')
        throw Error('MATRIX_READER_DISAGREEMENT_'+
          primaryInventory.diagnostic?.code+'|'+
          legacyInventory.diagnostic?.code);
      if(primaryInventory.scanning.structureBackend!==
           'foundation-libmatroska-c-wasm' ||
         primaryInventory.scanning.headerCount!==0 ||
         primaryInventory.scanning.fileDataBytesRead!==0)
        throw Error('MATRIX_FOUNDATION_NOT_PRIMARY');
      if(!primary.isCurrentInspection(primaryInventory)||
         primaryInventory.source!==primary.source)
        throw Error('MATRIX_SOURCE_IDENTITY_STALE');
      if(primaryInventory.attachments.length!==nativeEvidence.length ||
         legacyInventory.attachments.length!==nativeEvidence.length)
        throw Error('MATRIX_ATTACHMENT_COUNT_DIFFER');
      if(JSON.stringify(primaryInventory.structure)!==
         JSON.stringify(legacyInventory.structure))
        throw Error('MATRIX_SOURCE_STRUCTURE_DIFFER');
      const parityFields=item=>({
        id:item.id,ordinal:item.ordinal,filename:item.filename,
        mimeType:item.mimeType,description:item.description,
        fileUid:item.fileUid,byteLength:item.byteLength,
        dataRange:item.dataRange,
      });
      const primaryItems=primaryInventory.attachments.map(parityFields);
      const legacyItems=legacyInventory.attachments.map(parityFields);
      if(JSON.stringify(primaryItems)!==JSON.stringify(legacyItems))
        throw Error('MATRIX_PRIMARY_VS_LEGACY_INVENTORY_MISMATCH');
      // Existing TagAttachmentUID/TrackUID relation consumers must see
      // exactly the same source graph when fed either inventory backend.
      const primaryRelations=await primary.inspectRelations(primaryInventory);
      const legacyRelations=await legacy.inspectRelations(legacyInventory);
      if(primaryRelations.state!=='inspected'||
         legacyRelations.state!=='inspected'||
         JSON.stringify(primaryRelations)!==JSON.stringify(legacyRelations))
        throw Error('MATRIX_DOWNSTREAM_RELATION_GRAPH_CHANGED');
      const actualItems=[];
      for(const [i,a] of primaryInventory.attachments.entries()){
        const independent=nativeEvidence[i];
        if(a.fileUid!==independent.fileUid||
           a.filename!==independent.filename||
           a.mimeType!==independent.mimeType||
           a.description!==independent.description||
           a.byteLength!==independent.byteLength)
          throw Error('MATRIX_INDEPENDENT_METADATA_MISMATCH_'+i);
        const modern=await primary.openAttachment(a.id).data.arrayBuffer();
        const old=await legacy.openAttachment(
          legacyInventory.attachments[i].id).data.arrayBuffer();
        const modernBytes=new Uint8Array(modern);
        const oldBytes=new Uint8Array(old);
        if(modernBytes.length!==oldBytes.length||
           modernBytes.some((value,k)=>value!==oldBytes[k]))
          throw Error('MATRIX_LEGACY_EXTRACTED_BYTES_DIFFER_'+i);
        const hash=Array.from(new Uint8Array(
          await crypto.subtle.digest('SHA-256',modern)))
          .map(byte=>byte.toString(16).padStart(2,'0')).join('');
        if(hash!==independent.sha256)
          throw Error('MATRIX_NATIVE_MKVEXTRACT_SHA256_MISMATCH_'+i);
        actualItems.push({
          fileUid:a.fileUid,name:a.filename,
          dataOffset:a.dataRange.offset,bytes:a.byteLength,
          sha256:hash,
        });
      }
      return {
        sourceBytes:file.size,
        count:primaryItems.length,
        trackPresent:primaryInventory.structure.hasTracksElement,
        chapterAware:false,
        primaryScannerHeaderCount:primaryInventory.scanning.headerCount,
        legacyScannerHeaderCount:legacyInventory.scanning.headerCount,
        writerAuthorization:false,
        reference:'independent-mkvextract',
        relationEdges:primaryRelations.edges.map(edge=>({
          targetKind:edge.targetKind,
          targetUid:edge.targetUid,
          targetAttachmentId:edge.targetAttachmentId,
          resolution:edge.resolution,
        })),
        relationsEqual:true,
        items:actualItems,
      };
    },native);
    if(actual.count!==sample.count||
       !actual.relationsEqual||
       actual.primaryScannerHeaderCount!==0 ||
       actual.writerAuthorization!==false ||
       actual.sourceBytes!==stat.size)
      throw Error('MATRIX_RUNTIME_ENVELOPE_BROKEN_'+sample.id);
    if(sample.id==='p0-independent-attachmenttag'){
      const matched=actual.relationEdges.filter(edge=>
        edge.targetKind==='attachment'&&edge.resolution==='matched');
      if(matched.length!==1||
         !native.some(item=>item.fileUid===matched[0].targetUid))
        throw Error('MATRIX_TAG_ATTACHMENT_UID_TARGET_NOT_MATCHED');
    }
    const afterHash=await digestFile(filePath);
    if(afterHash!==beforeHash)
      throw Error('MATRIX_SOURCE_MODIFIED_'+sample.id);
    report.totalAttachments+=sample.count;
    report.cases.push({
      id:sample.id,reason:sample.reason,
      sourceBytes:stat.size,sourceSha256:beforeHash,
      sourceTrackTypes:nativeTrackTypes,
      attachmentCount:actual.count,
      nativeExtractedSha256:actual.items.map(x=>x.sha256),
      exactFileUids:actual.items.map(x=>x.fileUid),
      legacyHeaderCalls:actual.legacyScannerHeaderCount,
      primaryHeaderCalls:0,
      sourceUnmodified:true,
      readOnly:true,inventoryParity:true,
      sourceNativeByteParity:true,
      relationGraphParity:true,
      matchedAttachmentTagEdges:actual.relationEdges.filter(edge=>
        edge.targetKind==='attachment'&&edge.resolution==='matched').length,
    });
  }
  // Negative controls use byte-corrupted copies of the *same* independent
  // native MKV, not fake worker responses. Neither the official C/WASM path
  // nor the legacy inspector may return "inspected" for these inputs.
  const original=await fs.readFile(path.join(ROOT,
    'p0-independent-mkvtoolnix.mkv'));
  const changedDocType=Buffer.from(original);
  const docTypeAt=changedDocType.indexOf(Buffer.from('matroska'));
  if(docTypeAt<0||docTypeAt>65536)
    throw Error('MATRIX_NEGATIVE_DOCTYPE_MARKER_MISSING');
  changedDocType.write('webm    ',docTypeAt,'ascii');
  const invalidFilename=Buffer.from(original);
  const filenameAt=invalidFilename.indexOf(Buffer.from('p0-generic-report.bin'));
  if(filenameAt<0)
    throw Error('MATRIX_NEGATIVE_FILENAME_MARKER_MISSING');
  invalidFilename[filenameAt]=0xff;
  const badElementId=Buffer.from(original);
  badElementId[0]=0x00;
  const negatives=[
    {id:'wrong-doctype',buffer:changedDocType},
    {id:'invalid-utf8-filename',buffer:invalidFilename},
    {id:'truncated-segment',buffer:Buffer.from(original.subarray(0,-17))},
    {id:'invalid-ebml-id',buffer:badElementId},
  ];
  report.negativeControls=[];
  for(const negative of negatives){
    await page.locator('#source').setInputFiles({
      name:negative.id+'.mkv',
      mimeType:'video/x-matroska',buffer:negative.buffer,
    });
    const denied=await page.evaluate(async()=>{
      const {createMatroskaAttachmentReader}=await import(
        '/src/matroska-attachment-reader.js');
      const file=document.querySelector('#source')?.files?.[0];
      const primary=createMatroskaAttachmentReader(file,{
        inspectionBackend:'foundation-primary',
        foundationWorkerFactory:()=>new Worker('/foundation-worker.js'),
      });
      const legacy=createMatroskaAttachmentReader(file);
      const modern=await primary.inspect();
      const old=await legacy.inspect();
      if(modern.state!=='unverified'||old.state!=='unverified'||
         modern.attachments.length!==0||old.attachments.length!==0)
        throw Error('MATRIX_CORRUPTED_INPUT_NOT_REJECTED_'+
          modern.state+'_'+old.state);
      let extracted=false;
      try{primary.openAttachment('attachment:0:uid:1');extracted=true;}
      catch(error){
        if(error.message!=='ATTACHMENT_INSPECTION_REQUIRED')throw error;
      }
      if(extracted)throw Error('MATRIX_INVALID_ATTACHMENT_EXTRACTED');
      return {primary:modern.state,legacy:old.state,
        primaryCode:modern.diagnostic?.code||'UNKNOWN',
        legacyCode:old.diagnostic?.code||'UNKNOWN',
        extractionDenied:true};
    });
    report.negativeControls.push({id:negative.id,...denied});
  }
  if(await digestFile(path.join(ROOT,
    'p0-independent-mkvtoolnix.mkv'))!==report.cases[0].sourceSha256)
    throw Error('MATRIX_NEGATIVE_CONTROL_MODIFIED_SOURCE');
  if(browserErrors.length)
    throw Error('MATRIX_BROWSER_ERRORS_'+browserErrors.join(';'));
  report.browserErrorCount=0;
  report.result='FOUNDATION_PRIMARY_INDEPENDENT_MATRIX_PASS';
} catch(error){
  report.result='FAILED';
  report.error=error?.stack||String(error);
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({
    result:report.result,passed:report.cases.length,
    expected:CASES.length,report:REPORT,error:report.error||null,
  }));
}
if(report.result!=='FOUNDATION_PRIMARY_INDEPENDENT_MATRIX_PASS'||
   report.cases.length!==CASES.length ||
   report.totalAttachments!==7 ||
   report.negativeControls?.length!==4)process.exitCode=1;
