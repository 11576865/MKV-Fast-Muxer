/**
 * Native-authority Chromium test of *real* unknown-size Segment and
 * CRC-protected Attachments. Uses official BSD libMatroska2 C/WASM.
 *
 * An incorrect CRC must fail the opt-in Foundation-primary inventory.
 * A successful CRC check does not certify whole-container CRC or writers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {parseMkvmergeJsonWithExactUids,exactPositiveUid}
  from '../src/mkvmerge-exact-uid-json.js';

const root='.e2e/fixtures',out='.e2e/output';
const output=path.join(out,'foundation-ebml-edge-chromium.json');
const cases=[
  {id:'foundation-edge-crc-valid',crc:'valid',unknownSegment:false},
  {id:'foundation-edge-segment-unknown',crc:'absent',unknownSegment:true},
  {id:'foundation-edge-crc-corrupt',crc:'corrupt',unknownSegment:false},
  {id:'foundation-edge-crc-nested-valid',crc:'valid',crcChecks:2,unknownSegment:false},
  {id:'foundation-edge-crc-nested-inner-corrupt',crc:'corrupt',crcChecks:2,
    outerCrcValid:true,unknownSegment:false},
  {id:'foundation-edge-crc-misplaced',crc:'misplaced',unknownSegment:false},
  {id:'foundation-edge-crc-duplicate',crc:'duplicate',unknownSegment:false},
  {id:'foundation-edge-crc-oversized',crc:'oversized',unknownSegment:false},
  {id:'foundation-edge-cluster-unknown-terminal',crc:'absent',
    unknownSegment:false,unknownClusterTerminal:true},
  {id:'foundation-edge-cluster-unknown-nonterminal',crc:'absent',
    unknownSegment:false,unknownClusterNonterminal:true,
    expectRefusal:true},
  {id:'foundation-edge-cluster-unknown-trailing-void',crc:'absent',
    unknownSegment:false,unknownClusterTrailingVoid:true,
    expectRefusal:true},
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'foundation-ebml-edge-chromium-v1',result:'NOT_RUN',
  cases:[],productDefaultEnabled:false,writerAuthorization:false,
  wholeContainerCRCVerified:false,legacyRetirementAuthorized:false,
};
let server,browser;
await fs.mkdir(out,{recursive:true});
try{
  const files=new Map();
  for(const name of [
    'matroska-attachment-reader','foundation-structure-observation',
    'foundation-attachment-inventory','foundation-attachment-crc32','ebml-crc32-bounded',
    'foundation-wasm-json-abi','source-asset-session',
    'output-composition','container-tree','preservation-preflight',
    'matroska-attachment-relation-graph',
  ]){
    files.set('/src/'+name+'.js',await fs.readFile('src/'+name+'.js'));
  }
  files.set('/foundation-worker.js',
    await fs.readFile('scripts/workers/foundation-matroska-worker.js'));
  files.set('/foundation-json.js',
    await fs.readFile('.e2e/foundation-build/libmatroska2/foundation_json_probe.js'));
  files.set('/foundation_json_probe.wasm',
    await fs.readFile('.e2e/foundation-build/libmatroska2/foundation_json_probe.wasm'));
  server=createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><meta charset="utf-8">'+
        '<input type="file" id="source">');return;
    }
    if(!files.has(req.url)){
      res.writeHead(404);res.end();return;
    }
    const key=req.url,data=files.get(key);
    res.writeHead(200,{
      'Content-Type':key.endsWith('.wasm')?
        'application/wasm':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store',
    });
    res.end(data);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  browser=await chromium.launch({headless:true,
    executablePath:process.env.FOUNDATION_CHROMIUM_EXECUTABLE||undefined,
    args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  for(const scenario of cases){
    const source=path.resolve(root,scenario.id+'.mkv');
    const sourceBytes=await fs.readFile(source);
    const before=sha(sourceBytes);
    let native=[];
    if(!['corrupt','misplaced','duplicate','oversized'].includes(scenario.crc)){
      const nativeData=parseMkvmergeJsonWithExactUids(
        await fs.readFile(path.join(out,scenario.id+'-native.json'),'utf8'));
      if(!nativeData.container?.recognized||
         nativeData.attachments?.length!==2)
        throw Error('EDGE_NATIVE_REFERENCE_UNRECOGNIZED_'+scenario.id);
      for(const row of nativeData.attachments||[]){
        const target=path.resolve(out,scenario.id+'-native-'+row.id+'.bin');
        execFileSync('mkvextract',['attachments',source,
          row.id+':'+target],{timeout:30000,stdio:'pipe'});
        native.push({
          uid:exactPositiveUid(row.properties?.uid),
          filename:row.file_name,mimeType:row.content_type,
          bytes:row.size,sha256:sha(await fs.readFile(target)),
        });
      }
    }
    await page.locator('#source').setInputFiles(source);
    const actual=await page.evaluate(async context=>{
      const {nativeExpected,unknownClusterTerminal,expectRefusal}=context;
      const {createMatroskaAttachmentReader}=await import(
        '/src/matroska-attachment-reader.js');
      const file=document.querySelector('#source').files[0];
      const newer=createMatroskaAttachmentReader(file,{
        inspectionBackend:'foundation-primary',
        foundationWorkerFactory:()=>new Worker('/foundation-worker.js'),
      });
      const older=createMatroskaAttachmentReader(file);
      const modern=await newer.inspect(),legacy=await older.inspect();
      const result={
        modern:modern.state,legacy:legacy.state,
        modernError:modern.diagnostic?.code||null,
        legacyError:legacy.diagnostic?.code||null,
        nodeBackend:modern.scanning?.structureBackend||null,
        structure:modern.structure||null,
        crc:modern.scanning?.attachmentCrc||null,
        count:modern.attachments.length,
        items:[],
      };
      if(nativeExpected!==null && !expectRefusal){
        if(modern.state!=='inspected' ||
           (!unknownClusterTerminal && legacy.state!=='inspected'))
          throw Error('EDGE_VALID_FIXTURE_REFUSED_'+modern.diagnostic?.code+
            '_'+legacy.diagnostic?.code);
        if(modern.attachments.length!==nativeExpected.length)
          throw Error('EDGE_NATIVE_ATTACHMENT_COUNT_CHANGED');
        if(unknownClusterTerminal){
          // The legacy header reader refuses unknown-sized Segment children.
          // The mature reader can accept only a terminal unknown-size Cluster,
          // whose exact finite=false evidence must come from the official C
          // parser rather than a fabricated JS hierarchy.
          if(legacy.state!=='unverified')
            throw Error('EDGE_LEGACY_UNKNOWN_CLUSTER_EXPECTED_REFUSAL');
          const observed=await newer.inspectFoundationStructure(modern);
          const clusters=observed.nodes.filter(node=>
            Number(BigInt(node.id))===0x1f43b675);
          const infinite=clusters.filter(node=>node.finite===false);
          if(!clusters.length||infinite.length!==1||
             infinite[0]!==clusters.at(-1)||
             !modern.structure.hasClusterElement||
             modern.structure.segmentSizeKnown!==true)
            throw Error('EDGE_UNKNOWN_CLUSTER_SEMANTICS_NOT_PRESERVED');
          result.unknownClusterOfficialEvidence=true;
        }else if(JSON.stringify(modern.structure)!==
                 JSON.stringify(legacy.structure)){
          throw Error('EDGE_LEGACY_STRUCTURE_CHANGED');
        }
        const fields=item=>({
          id:item.id,filename:item.filename,mimeType:item.mimeType,
          fileUid:item.fileUid,byteLength:item.byteLength,
          range:item.dataRange,
        });
        if(!unknownClusterTerminal &&
           JSON.stringify(modern.attachments.map(fields))!==
           JSON.stringify(legacy.attachments.map(fields)))
          throw Error('EDGE_NATIVE_AND_LEGACY_BYTE_RANGES_DIFFER');
        for(const [i,attachment] of modern.attachments.entries()){
          if(attachment.fileUid!==nativeExpected[i].uid ||
             attachment.filename!==nativeExpected[i].filename||
             attachment.mimeType!==nativeExpected[i].mimeType||
             attachment.byteLength!==nativeExpected[i].bytes)
            throw Error('EDGE_NATIVE_ATTACHMENT_METADATA_MISMATCH');
          const bytes=await newer.openAttachment(attachment.id).data.arrayBuffer();
          const hex=Array.from(new Uint8Array(
            await crypto.subtle.digest('SHA-256',bytes)))
            .map(x=>x.toString(16).padStart(2,'0')).join('');
          if(hex!==nativeExpected[i].sha256)
            throw Error('EDGE_INDEPENDENT_MKVEXTRACT_SHA_MISMATCH');
          result.items.push({uid:attachment.fileUid,sha256:hex});
        }
        if(modern.scanning?.headerCount!==0)
          throw Error('EDGE_OFFICIAL_LIBRARY_NOT_PRIMARY');
      }else{
        if(modern.state!=='unverified'||modern.attachments.length!==0)
          throw Error('EDGE_REJECT_REQUIRED_INPUT_WAS_ACCEPTED_'+
            modern.state);
        let extracted=false;
        try{newer.openAttachment('attachment:0:uid:1');extracted=true;}
        catch(error){
          if(error.message!=='ATTACHMENT_INSPECTION_REQUIRED')
            throw error;
        }
        if(extracted)throw Error('EDGE_CORRUPT_CRC_EXTRACTION_ALLOWED');
      }
      return result;
    },{
      nativeExpected:['corrupt','misplaced','duplicate','oversized'].includes(scenario.crc)?null:native,
      unknownClusterTerminal:scenario.unknownClusterTerminal===true,
      expectRefusal:scenario.expectRefusal===true,
    });
    if(scenario.crc==='valid' &&
       (!actual.crc||actual.crc.checked!==(scenario.crcChecks||1)||
        actual.crc.bytesRead<=0||
        actual.crc.fullContainerCRCVerified!==false))
      throw Error('EDGE_CRC32_CHECK_NOT_ACTUALLY_EXECUTED');
    if(scenario.crc==='corrupt' &&
       actual.modernError!=='FOUNDATION_CRC32_MISMATCH')
      throw Error('EDGE_CRC32_MISMATCH_NOT_DIAGNOSED_'+actual.modernError);
    if(['misplaced','duplicate'].includes(scenario.crc) &&
       actual.modernError!=='FOUNDATION_CRC_MISPLACED_OR_REPEATED')
      throw Error('EDGE_INVALID_CRC_CHILD_ORDER_NOT_REJECTED_'+
        scenario.id+'_'+actual.modernError);
    if(scenario.crc==='oversized' &&
       actual.modernError!=='FOUNDATION_CRC_RESOURCE_LIMIT')
      throw Error('EDGE_VALID_BUT_OVERBUDGET_CRC_NOT_REJECTED_'+
        actual.modernError);
    if(scenario.unknownSegment &&
       (!actual.structure||actual.structure.segmentSizeKnown!==false||
        actual.structure.segmentFiniteExact!==false))
      throw Error('EDGE_UNKNOWN_SEGMENT_NOT_PRESERVED');
    if(scenario.unknownClusterTerminal &&
       actual.unknownClusterOfficialEvidence!==true)
      throw Error('EDGE_TERMINAL_UNKNOWN_CLUSTER_NOT_PROVEN');
    if((scenario.unknownClusterNonterminal||
        scenario.unknownClusterTrailingVoid) &&
       (actual.modern!=='unverified'||actual.count!==0))
      throw Error('EDGE_AMBIGUOUS_UNKNOWN_CLUSTER_NOT_REFUSED');
    if(sha(await fs.readFile(source))!==before)
      throw Error('EDGE_ORIGINAL_SOURCE_MODIFIED_'+scenario.id);
    report.cases.push({id:scenario.id,crc:scenario.crc,
      crcChecksExpected:scenario.crcChecks||1,
      outerCrcValid:scenario.outerCrcValid??null,
      unknownSegment:scenario.unknownSegment,
      unknownClusterTerminal:scenario.unknownClusterTerminal||false,
      unknownClusterNonterminal:scenario.unknownClusterNonterminal||false,
      unknownClusterTrailingVoid:scenario.unknownClusterTrailingVoid||false,
      fileBytes:sourceBytes.length,
      sourceSha256:before,
      sourceUnmodified:true,
      ...actual,
    });
  }
  if(errors.length)throw Error('EDGE_BROWSER_ERROR_'+errors.join(';'));
  report.browserErrors=errors.length;
  report.result='FOUNDATION_EBML_EDGE_CHROMIUM_PASS';
}catch(error){
  report.result='FAILED';report.error=error?.stack||String(error);
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,passed:report.cases.length,
    expected:cases.length,error:report.error||null}));
}
if(report.result!=='FOUNDATION_EBML_EDGE_CHROMIUM_PASS'||
   report.cases.length!==cases.length)process.exitCode=1;
