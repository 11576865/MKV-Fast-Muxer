import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedPreviewTracks,readEmbeddedPreviewFonts} from '../src/embedded-preview.js';
const source={};
test('embedded preview requires exact scanned source and uses real ASS stream indexes, including excluded output tracks',()=>{
 const state={streams:[{index:4,codec_type:'subtitle',codec_name:'ass',tags:{title:'Inside'}},{index:7,codec_type:'subtitle',codec_name:'subrip'}],tracks:[{index:4,include:false}]};
 assert.deepEqual(embeddedPreviewTracks({source,scannedSource:{},state}),[]);
 const rows=embeddedPreviewTracks({source,scannedSource:source,state});
 assert.equal(rows.length,1);assert.equal(rows[0].streamIndex,4);assert.equal(rows[0].key,'source:4');
 assert.equal(rows[0].sourceFile,source);assert.match(rows[0].file.name,/Inside/);
 assert.equal(state.tracks[0].include,false);
});
function reader(items,{afterInspect=()=>{}}={}){
 return ()=>({inspect:async()=>{afterInspect();return {state:'inspected',attachments:items.map((item,i)=>({id:String(i),filename:item.name,mimeType:item.mime||'application/octet-stream',byteLength:item.size??item.bytes.length}))};},openAttachment:id=>({data:new Blob([new Uint8Array(items[Number(id)].bytes)]),declaredSize:items[Number(id)].size??items[Number(id)].bytes.length})});
}
test('embedded fonts are identified from header, use generated safe names and do not load non-font payloads',async()=>{
 const files=await readEmbeddedPreviewFonts(source,{readerFactory:reader([{name:'../../font.bin',bytes:[0,1,0,0,0,0]},{name:'notes.pdf',bytes:[37,80,68,70]}])});
 assert.equal(files.length,1);assert.match(files[0].name,/^embedded-font-0/);assert.equal(files[0].size,6);
});
test('embedded preview refuses malformed inventory, stale source and excessive font payloads',async()=>{
 await assert.rejects(readEmbeddedPreviewFonts(source,{readerFactory:()=>({inspect:async()=>({state:'unverified'})})}),/INSPECTION/);
 let current=true;
 await assert.rejects(readEmbeddedPreviewFonts(source,{isCurrent:()=>current,readerFactory:reader([],{afterInspect:()=>{current=false}})}),/STALE/);
 await assert.rejects(readEmbeddedPreviewFonts(source,{readerFactory:reader([{name:'huge.ttf',bytes:[0,1,0,0],size:9*1024*1024}])}),/BUDGET/);
 await assert.rejects(readEmbeddedPreviewFonts(source,{readerFactory:reader([{name:'bad.ttf',bytes:[0,0,0,0]}])}),/FONT_HEADER/);
});

test('embedded preview enforces aggregate and count budgets before full font parsing',async()=>{
 const item={name:'font.ttf',bytes:[0,1,0,0]};
 await assert.rejects(readEmbeddedPreviewFonts(source,{readerFactory:reader(Array.from({length:33},()=>({...item})))}),/BUDGET/);
 await assert.rejects(readEmbeddedPreviewFonts(source,{readerFactory:reader(Array.from({length:5},()=>({...item,size:8*1024*1024})))}),/BUDGET/);
});
