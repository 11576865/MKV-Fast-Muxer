/**
 * S12 large-Matroska fixture generator (native tools, actual allocated data).
 *
 * Deliberately uses a short, real MPEG-4/AAC video plus an incompressible
 * binary Matroska attachment as its large payload. This measures the actual
 * byte-volume / browser-Wasm I/O path. It DOES NOT substitute for a large
 * high-bitrate, long-duration media-packet workload.
 *
 * Never truncate a small file to fake source size; write actual random bytes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomFillSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const TIER = process.env.S12_TIER || '512m';
const tiers=Object.freeze({
  '64m': 64*1024*1024,
  '128m': 128*1024*1024,
  '256m': 256*1024*1024,
  '512m': 512*1024*1024,
  '1000m': 1_000_000_128,
  '1200m': 1_200_000_000,
});
if(!Object.hasOwn(tiers,TIER)) throw Error('S12_UNKNOWN_TIER:'+TIER);
const root=path.resolve(process.env.S12_DIR||'.e2e/s12');
await fs.mkdir(root,{recursive:true});
const source=path.join(root,'s12-'+TIER+'-actual-input.mkv');
const clip=path.join(root,'s12-short-media.mp4');
const inputBytes=tiers[TIER];
const receipt=path.join(root,'s12-fixture-receipt.json');
const KIND=process.env.S12_KIND||'attachment';
if(!['attachment','pcm'].includes(KIND)) throw Error('S12_UNKNOWN_KIND:'+KIND);

// Real packet-volume comparison: unlike the attachment-heavy fixture, the
// bulk bytes here are legitimate long-form multichannel 32-bit PCM audio
// packets plus a repeating, valid MPEG-4 picture track. Deliberately not
// representative of typical compressed-film bitrate/content.
if(KIND==='pcm'){
 execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','testsrc2=size=160x90:rate=5',
  '-t','2','-an','-c:v','mpeg4','-q:v','5',clip,
 ],{timeout:90_000,stdio:'inherit'});
 const pcmBytesPerSecond=48000*8*4;
 const duration=Math.ceil(inputBytes/pcmBytesPerSecond)+2;
 execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y',
  '-stream_loop','-1','-i',clip,
  '-f','lavfi','-i','anullsrc=r=48000:cl=7.1',
  '-t',String(duration),'-map','0:v:0','-map','1:a:0',
  '-c:v','copy','-c:a','pcm_s32le',source
 ],{timeout:240_000,stdio:'inherit'});
 const actual=(await fs.stat(source)).size;
 if(actual<inputBytes)throw Error('S12_PCM_VIDEO_MKV_TOO_SMALL:'+actual);
 const data=JSON.parse(execFileSync('ffprobe',[
  '-v','error','-show_streams','-show_format','-of','json',source
 ],{encoding:'utf8',timeout:60_000}));
 if(!(data.streams||[]).some(s=>s.codec_type==='video')||
    !(data.streams||[]).some(s=>s.codec_type==='audio'&&s.codec_name==='pcm_s32le'))
  throw Error('S12_PCM_VIDEO_NATIVE_STREAMS_MISSING');
 const saved={
  schema:'softmux-s12-genuine-large-matroska-input-v1',
  tier:TIER,kind:KIND,generatedAt:new Date().toISOString(),
  source:path.basename(source),sourceBytes:actual,
  payloadBytes:0,payloadSha256:null,attachmentCount:0,attachments:[],
  expectedAudioCodec:'pcm_s32le',mediaDurationSeconds:duration,
  mediaNote:'Real long-duration MPEG-4 video packets and 7.1-channel 32-bit PCM audio packets; NOT typical compressed-film bitrate, no original attachments',
  sparseFile:false,generator:'native FFmpeg long actual PCM packets and stream-looped MPEG-4 video',
  nativeInputStreamKinds:data.streams.map(s=>s.codec_type),
  sourceFilePath:source
 };
 await fs.writeFile(receipt,JSON.stringify(saved,null,2)+'\n');
 console.log(JSON.stringify(saved));
 process.exit(0);
}

// ffprobe currently rejects a SINGLE oversized FileData EBML element
// (0x465C above 0x10000000); do not misattribute that parser cap to
// ffmpeg.wasm. The same genuinely written total payload is sharded into
// 64 MiB individual, independently hashable original MKV attachments.
const ATTACHMENT_CHUNK_MIB=Number(process.env.S12_ATTACHMENT_CHUNK_MIB||'64');
if(![32,64,128].includes(ATTACHMENT_CHUNK_MIB))
 throw Error('S12_INVALID_ATTACHMENT_CHUNK_MIB:'+String(process.env.S12_ATTACHMENT_CHUNK_MIB));
const ATTACHMENT_CHUNK_BYTES=ATTACHMENT_CHUNK_MIB*1024*1024;
const aggregate=createHash('sha256');
const attachments=[];
const buffer=Buffer.allocUnsafe(1024*1024);
let produced=0,ordinal=0;
while(produced<inputBytes){
 const bytes=Math.min(ATTACHMENT_CHUNK_BYTES,inputBytes-produced);
 const name='s12-random-part-'+String(ordinal).padStart(3,'0')+'.bin';
 const file=path.join(root,name);
 const hash=createHash('sha256');
 let local=0;
 let fd;
 try{
  fd=await fs.open(file,'w');
  while(local<bytes){
   const n=Math.min(buffer.length,bytes-local);
   randomFillSync(buffer);
   const {bytesWritten}=await fd.write(buffer,0,n,local);
   if(bytesWritten!==n)throw Error('S12_SHORT_WRITE');
   const slice=buffer.subarray(0,n);
   hash.update(slice);
   aggregate.update(slice);
   local+=n;
  }
 }finally{await fd?.close();}
 if((await fs.stat(file)).size!==bytes)throw Error('S12_ATTACHMENT_SIZE_MISMATCH');
 attachments.push({name,file,bytes,sha256:hash.digest('hex')});
 produced+=local; ordinal++;
}

execFileSync('ffmpeg',[
 '-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i','testsrc2=size=160x90:rate=5',
 '-f','lavfi','-i','sine=frequency=500:sample_rate=44100',
 '-t','2','-c:v','mpeg4','-q:v','5','-c:a','aac',clip
],{timeout:90_000,stdio:'inherit'});
const mkvmergeArgs=['-q','-o',source];
for(const part of attachments){
 mkvmergeArgs.push('--attachment-name',part.name,
  '--attachment-mime-type','application/octet-stream',
  '--attach-file',part.file);
}
mkvmergeArgs.push(clip);
execFileSync('mkvmerge',mkvmergeArgs,{timeout:240_000,stdio:'inherit'});
const sourceStat=await fs.stat(source);
if(sourceStat.size<inputBytes) throw Error('S12_MKV_NOT_ACTUALLY_LARGE');
const probe=JSON.parse(execFileSync('ffprobe',[
 '-v','error','-show_entries','stream=index,codec_type,codec_name:stream_tags=filename,mimetype',
 '-of','json',source
],{encoding:'utf8',timeout:60_000}));
if(!(probe.streams||[]).some(s=>s.codec_type==='video') ||
   !(probe.streams||[]).some(s=>s.codec_type==='audio') ||
   !(probe.streams||[]).some(s=>s.codec_type==='attachment'))
  throw Error('S12_NATIVE_MKV_STREAM_OR_ATTACHMENT_ABSENT');
const saved={
 schema:'softmux-s12-genuine-large-matroska-input-v1',tier:TIER,kind:KIND,
 generatedAt:new Date().toISOString(),
 source:path.basename(source),sourceBytes:sourceStat.size,
 payloadBytes:inputBytes,payloadSha256:aggregate.digest('hex'),
 attachmentCount:attachments.length,attachmentChunkMiB:ATTACHMENT_CHUNK_MIB,
 attachments:attachments.map(({name,bytes,sha256})=>({name,bytes,sha256})),
 mediaNote:'2 seconds real MPEG-4/AAC; large byte volume is independently generated random attached-file data in controlled 32/64/128 MiB EBML FileData elements, NOT long-duration media packets',
 sparseFile:false,generator:'randomFillSync and sequential fs.write, native mkvmerge',
 shardingRationale:'ffprobe rejects FileData above 0x10000000; 32/64/128 MiB per-attachment variants isolate aggregate payload volume versus number of EBML attachment objects',
 nativeInputStreamKinds:probe.streams.map(s=>s.codec_type),
 sourceFilePath:source
};
await fs.writeFile(receipt,JSON.stringify(saved,null,2)+'\n');
console.log(JSON.stringify(saved));
