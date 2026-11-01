import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Authored deterministic graphic subtitles, no downloaded media. Decoder
// acceptance and visible output are checked independently by native FFmpeg.
const b=(...x)=>Buffer.from(x);
const u16=n=>b(n>>8,n&255);
const u24=n=>b(n>>16,(n>>8)&255,n&255);
const u32=n=>b(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);
const cat=(...x)=>Buffer.concat(x);
const segment=(type,payload,ticks)=>cat(b(0x50,0x47),u32(ticks),u32(ticks),b(type),u16(payload.length),payload);
const pcs=(count,number,state)=>cat(u16(320),u16(240),b(0x10),u16(number),b(state,0,0,count),count?cat(u16(0),b(0,0),u16(20),u16(20)):b());
export async function makeBitmapSubtitleFixtures(root){
 await fs.mkdir(root,{recursive:true});
 const rle=Buffer.from(Array.from({length:4},()=>[1,1,1,1,0,0]).flat());
 const sup=cat(
  segment(0x16,pcs(1,0,0x80),90000),
  segment(0x17,cat(b(1,0),u16(0),u16(0),u16(320),u16(240)),90000),
  segment(0x14,b(0,0,0,16,128,128,0,1,235,128,128,255),90000),
  segment(0x15,cat(u16(0),b(0,0xC0),u24(rle.length+4),u16(4),u16(4),rle),90000),
  segment(0x80,b(),90000),
  segment(0x16,pcs(0,1,0),270000),segment(0x80,b(),270000),
 );
 await fs.writeFile(path.join(root,'bitmap.sup'),sup);
 // DVD SPU: alternating top/bottom fields, 4 opaque pixels per row.
 const pixels=b(0x11,0x11,0x11,0x11);
 const commands=b(1,3,0x32,0x10,4,0xFF,0xF0,5,0x01,0x40,0x17,0x01,0x40,0x17,6,0,4,0,6,0xFF);
 const control=4+pixels.length,stop=control+4+commands.length;
 const spu=cat(u16(stop+6),u16(control),pixels,u16(0),u16(stop),commands,u16(176),u16(stop),b(2,0xFF));
 const ticks=90000;
 const pts=b(0x21|((Math.floor(ticks/2**30)&7)<<1),(ticks>>>22)&255,((ticks>>>15)&127)*2+1,(ticks>>>7)&255,(ticks&127)*2+1);
 const payload=cat(b(0x80,0x80,5),pts,b(0x20),spu);
 const pack=b(0,0,1,0xBA,0x44,0,4,0,4,1,0x89,0xC3,0xF8,0);
 const pes=cat(b(0,0,1,0xBD),u16(payload.length),payload);
 const padding=2048-pack.length-pes.length-6;
 await fs.writeFile(path.join(root,'bitmap.sub'),cat(pack,pes,b(0,0,1,0xBE),u16(padding),Buffer.alloc(padding,255)));
 await fs.writeFile(path.join(root,'bitmap.idx'),`# VobSub index file, v7 (do not modify this line!)\nsize: 320x240\npalette: 000000, ffffff, ff0000, 00ff00, 0000ff, ffff00, ff00ff, 00ffff, 888888, 444444, cccccc, 880000, 008800, 000088, 888800, 880088\nid: en, index: 0\ntimestamp: 00:00:01:000, filepos: 000000000\n`);
 await fs.writeFile(path.join(root,'bitmap-fixture-manifest.json'),JSON.stringify({schema:'softmux-authored-bitmap-fixtures-v1',canvas:{width:320,height:240},rectangle:{x:20,y:20,width:4,height:4},startSeconds:1,pgsClearSeconds:3,dvdStopDelayTicks:176,dvdStopClockHz:90000/1024},null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await makeBitmapSubtitleFixtures(path.resolve(process.argv[2]||'.e2e/bitmap-fixtures'));
