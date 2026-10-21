/**
 * S12 large ORIGINAL Matroska attachment reinsertion research — native only.
 *
 * The original source includes genuinely written, incompressible FileData;
 * native FFmpeg deliberately copies ONLY A/V and adds SRT, producing a small
 * remux without attachments. A separate bounded Blob.slice reader reinserts
 * exact original Attachments bytes; native probes and full extracted SHA-256
 * audit the actual finished MKV. This never runs FFmpeg.wasm or a product UI.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openAsBlob, createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash, randomFillSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { prepareResearchSeekHeadReattachment } from '../research/s12-reattach-seekhead-prototype.mjs';

const tier=process.env.S12_REATTACH_TIER||'128m';
const chunkMiB=Number(process.env.S12_REATTACH_CHUNK_MIB||64);
const totalMap=Object.freeze({'128m':128*1024*1024,'256m':256*1024*1024});
if(!Object.hasOwn(totalMap,tier)||![32,64,128].includes(chunkMiB))
 throw Error('S12_REATTACH_LARGE_TIER_OR_CHUNK_INVALID');
const attachmentBytes=totalMap[tier];
const chunkBytes=chunkMiB*1024*1024;
if(attachmentBytes%chunkBytes!==0)throw Error('S12_REATTACH_NOT_DIVISIBLE');
const dir=path.resolve(process.env.S12_REATTACH_DIR||'.e2e/s12-reattach-large');
await fs.mkdir(dir,{recursive:true});
const f=name=>path.join(dir,name);
const source=f('source-'+tier+'-'+chunkMiB+'m.mkv');
const clean=f('remux-without-original-attachments.mkv');
const out=f('reattached-byte-lane-output.mkv');
const receiptPath=f('s12-large-reattach-receipt.json');
const clip=f('short-valid-av.mp4'),srt=f('new.srt');
const receipt={
 schema:'softmux-s12-large-original-attachments-bloblane-v1',
 status:'PENDING',tier,chunkMiB,attachmentBytes,
 phase:'init',startedAt:new Date().toISOString(),
 runtime:'native Ubuntu FFmpeg/MKVToolNix/Node; not Chromium or FFmpeg.wasm',
 verificationScope:'limited complete finite Matroska Segment; CRC SeekHead + adjacent Void; no Chapters or Tags in source',
 attachmentParts:[],error:null,success:false,
 memoryObservations:[],
};
const save=async()=>fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const phase=async value=>{
 receipt.phase=value;receipt.memoryObservations.push({
  phase:value,rssBytes:process.memoryUsage().rss,
  heapUsedBytes:process.memoryUsage().heapUsed,
  timestamp:new Date().toISOString(),
 });console.log('S12 large byte-lane:',value);
 await save();
};
function native(command,args,timeout=240_000){
 return execFileSync(command,args,{
  encoding:'utf8',timeout,maxBuffer:10*1024*1024,
  stdio:['ignore','pipe','pipe']
 });
}
const sha=async file=>{
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
};
function probe(file){return JSON.parse(native('ffprobe',[
 '-v','error','-show_streams','-show_format','-of','json',file
 ],120_000));}
function extractedKinds(data){return data.streams.map(s=>s.codec_type);}
try{
 await phase('generate-genuine-original-attachments');
 const parts=[];
 for(let i=0;i<attachmentBytes/chunkBytes;i++){
  const name='original-'+String(i).padStart(2,'0')+'.bin';
  const file=f(name), fd=await fs.open(file,'w');
  const hash=createHash('sha256');
  const buffer=Buffer.allocUnsafe(1024*1024);
  try{
   for(let at=0;at<chunkBytes;at+=buffer.length){
    randomFillSync(buffer);
    const {bytesWritten}=await fd.write(buffer,0,buffer.length,at);
    if(bytesWritten!==buffer.length)throw Error('S12_SHORT_RANDOM_FILE_WRITE');
    hash.update(buffer);
   }
  }finally{await fd.close();}
  assert.equal((await fs.stat(file)).size,chunkBytes);
  parts.push({name,file,bytes:chunkBytes,sha256:hash.digest('hex')});
 }
 receipt.attachmentParts=parts.map(({name,bytes,sha256})=>({name,bytes,sha256}));
 await fs.writeFile(srt,'1\n00:00:00,150 --> 00:00:01,250\nS12 original bytes survive remux\n');
 native('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','testsrc2=size=160x90:rate=5',
  '-f','lavfi','-i','sine=frequency=400:sample_rate=44100',
  '-t','2','-c:v','mpeg4','-q:v','5','-c:a','aac',clip
 ],120_000);
 await phase('build-native-original-mkv');
 const mkvArgs=['-q','--disable-track-statistics-tags','-o',source];
 for(const part of parts)mkvArgs.push(
  '--attachment-name',part.name,
  '--attachment-mime-type','application/octet-stream',
  '--attach-file',part.file);
 // The 2-second MP4 can supply track/global tags even when mkvmerge
 // statistics tags are disabled. They are explicitly excluded ONLY from this
 // bounded fixture; the research writer must keep refusing real source Tags.
 mkvArgs.push('--no-global-tags','--no-track-tags','--no-chapters',clip);
 native('mkvmerge',mkvArgs,240_000);
 receipt.actualSourceBytes=(await fs.stat(source)).size;
 receipt.sourceSha256=await sha(source);
 const input=probe(source);
 assert.ok(input.streams.some(s=>s.codec_type==='video'));
 assert.ok(input.streams.some(s=>s.codec_type==='audio'));
 assert.equal(input.streams.filter(s=>s.codec_type==='attachment').length,parts.length,
  'native input must contain exact number of original attachments');
 await phase('FFmpeg-native-mux-without-attachments');
 // A deliberate alternative to FFmpeg copying original attachment AVStreams.
 // All original A/V streams remain copied; one new subtitle is introduced.
 native('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-i',source,'-f','srt','-i',srt,
  '-map','0:v:0','-map','0:a:0','-map','1:s:0',
  '-c','copy','-c:s','srt',clean
 ],180_000);
 const base=probe(clean);
 assert.equal(base.streams.filter(s=>s.codec_type==='attachment').length,0);
 assert.ok(base.streams.some(s=>s.codec_type==='subtitle'));
 receipt.baseRemuxBytes=(await fs.stat(clean)).size;
 await phase('apply-Blob-backed-byte-range-reinsertion');
 // openAsBlob creates a lazily readable file-backed Blob in Node 22. Never
 // fs.readFile the 128/256 MiB Matroska or its original FileData.
 const originalBlob=await openAsBlob(source);
 const remuxBlob=await openAsBlob(clean);
 assert.equal(originalBlob.size,receipt.actualSourceBytes);
 const result=await prepareResearchSeekHeadReattachment({
   original:originalBlob,remuxed:remuxBlob
 });
 assert.equal(result.evidence.authorization,'NONE_RESEARCH_ONLY');
 receipt.reinsertEvidence=result.evidence;
 await pipeline(Readable.fromWeb(result.blob.stream()),createWriteStream(out));
 receipt.outputBytes=(await fs.stat(out)).size;
 assert.equal(receipt.outputBytes,result.evidence.outputBytes);
 await phase('independently-probe-and-extract-original-attachments');
 const done=probe(out);
 const wanted=['video','audio','subtitle'];
 for(const kind of wanted)
  assert.ok(done.streams.some(s=>s.codec_type===kind),'missing output '+kind);
 assert.equal(done.streams.filter(s=>s.codec_type==='attachment').length,parts.length,
  'output contains missing or extra original Matroska attachments');
 const mkv=JSON.parse(native('mkvmerge',['-J',out],120_000));
 assert.equal(mkv.attachments.length,parts.length);
 const args=['attachments',out];
 for(const part of parts){
  const att=mkv.attachments.find(a=>a.file_name===part.name);
  assert.ok(att&&Number.isSafeInteger(att.id),'original FileUID/name not independently recognized: '+part.name);
  args.push(String(att.id)+':'+f('extracted-'+part.name));
 }
 native('mkvextract',args,300_000);
 for(const part of parts){
  const extracted=f('extracted-'+part.name);
  assert.equal((await fs.stat(extracted)).size,part.bytes,'attachment length changed');
  assert.equal(await sha(extracted),part.sha256,'original attachment bytes differ '+part.name);
 }
 receipt.outputSha256=await sha(out);
 assert.equal(await sha(source),receipt.sourceSha256,'original source mutated');
 receipt.nativeOutputKinds=extractedKinds(done);
 receipt.success=true;receipt.status='PASS_NATIVE_LARGE_RESEARCH_ONLY';
 await phase('done');
 console.log('S12 LARGE ORIGINAL ATTACHMENTS REINSERT NATIVE SHA PASS',JSON.stringify({
  tier,chunkMiB,attachmentCount:parts.length,outputBytes:receipt.outputBytes
 }));
}catch(error){
 receipt.status='FAIL_NATIVE_LARGE_RESEARCH';
 receipt.error={message:String(error?.message||error),stack:String(error?.stack||'').slice(0,4500)};
 receipt.finishedAt=new Date().toISOString();
 await save();
 console.error('S12 LARGE ORIGINAL ATTACHMENTS FAILED',receipt.phase,receipt.error);
 process.exitCode=1;
}finally{
 receipt.finishedAt=new Date().toISOString();
 await save();
}
