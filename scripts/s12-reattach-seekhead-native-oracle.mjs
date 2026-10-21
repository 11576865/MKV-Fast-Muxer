/**
 * NATIVE-only S12 research acceptance — not FFmpeg.wasm, not product writer.
 * Actual FFmpeg-built Matroska video/audio source with TWO original attachments,
 * native remux excluding attachments, Blob.slice reinsertion, independent
 * ffprobe/mkvmerge/mkvextract SHA-256 and structural refusal assertions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {prepareResearchSeekHeadReattachment} from '../research/s12-reattach-seekhead-prototype.mjs';

const root=path.resolve(process.env.S12_PROTOTYPE_OUT||'.e2e/s12-raw-reattach');
await fs.mkdir(root,{recursive:true});
const f=name=>path.join(root,name);
const realSource=f('native-original-two-attachments.mkv');
const remuxed=f('native-remux-with-subtitle-no-attachments.mkv');
const output=f('candidate-original-attachments-reattached.mkv');
const payloads=[
 {name:'first-original.bin',file:f('first-original.bin'),bytes:randomBytes(64*1024)},
 {name:'second-original.bin',file:f('second-original.bin'),bytes:randomBytes(96*1024)},
];
const sha=async file=>{
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
};
const exec=(cmd,args,timeout=60_000)=>
 execFileSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:10*1024*1024});
const probe=file=>JSON.parse(exec('ffprobe',[
 '-v','error','-show_streams','-show_format','-of','json',file
]));
const names=streams=>streams
 .filter(s=>s.codec_type==='attachment')
 .map(s=>s.tags?.filename||'');
for(const p of payloads)await fs.writeFile(p.file,p.bytes);
await fs.writeFile(f('new.srt'),'1\n00:00:00,100 --> 00:00:01,000\nS12 original attachment bytes preserved\n');
const args=[
 '-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i','testsrc2=size=160x90:rate=5',
 '-f','lavfi','-i','sine=frequency=300:sample_rate=44100',
 '-t','2','-c:v','mpeg4','-q:v','5','-c:a','aac'
];
for(let i=0;i<payloads.length;i++){
 args.push('-attach',payloads[i].file,
 '-metadata:s:t:'+i,'mimetype=application/octet-stream',
 '-metadata:s:t:'+i,'filename='+payloads[i].name);
}
args.push(realSource);
exec('ffmpeg',args);
const orig=probe(realSource);
assert.ok(orig.streams.some(s=>s.codec_type==='video'));
assert.ok(orig.streams.some(s=>s.codec_type==='audio'));
assert.deepEqual(names(orig.streams),payloads.map(p=>p.name));
exec('ffmpeg',[
 '-hide_banner','-loglevel','error','-y',
 '-i',realSource,'-f','srt','-i',f('new.srt'),
 '-map','0:v:0','-map','0:a:0','-map','1:s:0',
 '-c','copy','-c:s','srt',remuxed
]);
const base=probe(remuxed);
assert.equal(names(base.streams).length,0);
assert.ok(base.streams.some(s=>s.codec_type==='subtitle'));
const sourceSha=await sha(realSource);
const originalBytes=await fs.readFile(realSource);
const remuxBytes=await fs.readFile(remuxed);
const res=await prepareResearchSeekHeadReattachment({
 original:new Blob([originalBytes]),remuxed:new Blob([remuxBytes])
});
assert.equal(res.schema,'s12-raw-attachments-seekhead-research-v0');
assert.equal(res.evidence.authorization,'NONE_RESEARCH_ONLY');
await pipeline(Readable.fromWeb(res.blob.stream()),createWriteStream(output));
const result=probe(output);
assert.deepEqual(names(result.streams),payloads.map(p=>p.name));
assert.ok(result.streams.some(s=>s.codec_type==='video'));
assert.ok(result.streams.some(s=>s.codec_type==='audio'));
assert.ok(result.streams.some(s=>s.codec_type==='subtitle'));
const native=JSON.parse(exec('mkvmerge',['-J',output]));
assert.deepEqual(native.attachments.map(a=>a.file_name),payloads.map(p=>p.name));
const extract=[];
for(const [i,p] of payloads.entries())
 extract.push(String(native.attachments[i].id)+':'+f('extracted-'+p.name));
exec('mkvextract',['attachments',output,...extract]);
for(const p of payloads){
 const original=await sha(p.file),extracted=await sha(f('extracted-'+p.name));
 assert.equal(extracted,original,'native extracted original attachment mismatch '+p.name);
}
assert.equal(await sha(realSource),sourceSha,'native source modified');
// Fail-closed negative cases: a missing original master, or an already
// attachment-bearing FFmpeg output, cannot be mistaken for this exact class.
await assert.rejects(prepareResearchSeekHeadReattachment({
 original:new Blob([remuxBytes]),remuxed:new Blob([remuxBytes])
}),/S12_REATTACH_EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED/);
await assert.rejects(prepareResearchSeekHeadReattachment({
 original:new Blob([originalBytes]),remuxed:new Blob([originalBytes])
}),/S12_REATTACH_EXACTLY_ONE_SOURCE_ATTACHMENTS_AND_ZERO_OUTPUT_REQUIRED/);
// Mutated bytes in FFmpeg's SeekHead must not be silently declared valid.
const broken=Uint8Array.from(remuxBytes);
const ix=broken.indexOf(0xbf,52); // ffmpeg SeekHead CRC child begins in early segment
assert.ok(ix>0&&ix<512,'expected independently generated SeekHead CRC field');
broken[ix+2]^=1;
await assert.rejects(prepareResearchSeekHeadReattachment({
 original:new Blob([originalBytes]),remuxed:new Blob([broken])
}),/S12_REATTACH_SEEKHEAD_CRC_INVALID/);
const receipt={
 schema:'s12-native-seekhead-reattach-prototype-v1',
 status:'PASS_NATIVE_SMALL_SCOPE_ONLY',
 source:path.basename(realSource),sourceSha256:sourceSha,
 detachedRemux:path.basename(remuxed),
 candidate:path.basename(output),candidateBytes:(await fs.stat(output)).size,
 candidateSha256:await sha(output),
 sourceAttachments:payloads.map(p=>({
   filename:p.name,bytes:p.bytes.length,
   sha256:createHash('sha256').update(p.bytes).digest('hex')
 })),
 observedStreamTypes:result.streams.map(s=>s.codec_type),
 nativeTools:['ffmpeg','ffprobe','mkvmerge','mkvextract'],
 scope:'Two small originals, FFmpeg-produced CRC SeekHead + Void. No browser/Wasm, >64MiB, UID/tag/chapters or save guarantees. Source metadata not presumed preserved.',
 ...res.evidence
};
await fs.writeFile(f('native-prototype-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('S12 NATIVE SEEKHEAD REATTACH + TWO ORIGINAL ATTACHMENTS SHA PASS');
console.log(JSON.stringify({outputBytes:receipt.candidateBytes,attachments:payloads.length}));
