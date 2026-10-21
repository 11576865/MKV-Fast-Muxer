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
  '512m': 512*1024*1024,
  '1000m': 1_000_000_128,
  '1200m': 1_200_000_000,
});
if(!Object.hasOwn(tiers,TIER)) throw Error('S12_UNKNOWN_TIER:'+TIER);
const root=path.resolve(process.env.S12_DIR||'.e2e/s12');
await fs.mkdir(root,{recursive:true});
const payload=path.join(root,'s12-actual-random-payload.bin');
const source=path.join(root,'s12-'+TIER+'-actual-input.mkv');
const clip=path.join(root,'s12-short-media.mp4');
const inputBytes=tiers[TIER];
const receipt=path.join(root,'s12-fixture-receipt.json');
const sha256=createHash('sha256');
const chunk=Buffer.allocUnsafe(1024*1024);
let produced=0;
let fd;
try {
  fd=await fs.open(payload,'w');
  while(produced<inputBytes){
    const size=Math.min(chunk.length,inputBytes-produced);
    randomFillSync(chunk);
    const {bytesWritten}=await fd.write(chunk,0,size,produced);
    if(bytesWritten!==size) throw Error('S12_SHORT_WRITE');
    sha256.update(chunk.subarray(0,size));
    produced+=bytesWritten;
  }
} finally{await fd?.close();}
if((await fs.stat(payload)).size!==inputBytes) throw Error('S12_PAYLOAD_SIZE_MISMATCH');

execFileSync('ffmpeg',[
 '-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i','testsrc2=size=160x90:rate=5',
 '-f','lavfi','-i','sine=frequency=500:sample_rate=44100',
 '-t','2','-c:v','mpeg4','-q:v','5','-c:a','aac',clip
],{timeout:90_000,stdio:'inherit'});
execFileSync('mkvmerge',[
 '-q','-o',source,
 '--attachment-name','s12-actual-random-payload.bin',
 '--attachment-mime-type','application/octet-stream',
 '--attach-file',payload,clip,
],{timeout:180_000,stdio:'inherit'});
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
 schema:'softmux-s12-genuine-large-matroska-input-v1',tier:TIER,
 generatedAt:new Date().toISOString(),
 source:path.basename(source),sourceBytes:sourceStat.size,
 payloadBytes:inputBytes,payloadSha256:sha256.digest('hex'),
 mediaNote:'2 seconds real MPEG-4/AAC; large byte volume is independently generated random attached-file data, NOT long-duration media packets',
 sparseFile:false,generator:'randomFillSync and sequential fs.write, native mkvmerge',
 nativeInputStreamKinds:probe.streams.map(s=>s.codec_type),
 sourceFilePath:source,payloadFilePath:payload
};
await fs.writeFile(receipt,JSON.stringify(saved,null,2)+'\n');
console.log(JSON.stringify(saved));
