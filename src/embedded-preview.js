import {createMatroskaAttachmentReader} from './matroska-attachment-reader.js';
import {sniffFontFile} from './font-identity.js';
export const MAX_EMBEDDED_ASS_BYTES=8*1024*1024;
const MAX_FONT_BYTES=8*1024*1024,MAX_FONT_TOTAL=32*1024*1024,MAX_FONTS=32;
// Read-only preview candidates. Inclusion/order/metadata in the output domain
// are neither consulted nor mutated by choosing a preview track.
export function embeddedPreviewTracks({source,scannedSource,state}={}){
 if(!source||source!==scannedSource||!Array.isArray(state?.streams))return [];
 return state.streams.filter(s=>s.codec_type==='subtitle'&&['ass','ssa'].includes(s.codec_name)&&Number.isSafeInteger(s.index)&&s.index>=0).map(s=>({
  embedded:true,sourceFile:source,streamIndex:s.index,key:'source:'+s.index,
  file:{name:`来源 ASS #${s.index}${s.tags?.title?' · '+s.tags.title:''}`},
  format:{id:'ass',label:'内封 ASS/SSA',previewable:true},
 }));
}
export async function readEmbeddedPreviewFonts(source,{readerFactory=createMatroskaAttachmentReader,isCurrent=()=>true}={}){
 const check=()=>{if(!isCurrent())throw Error('EMBEDDED_PREVIEW_STALE_SOURCE');};
 check();const reader=readerFactory(source);const inventory=await reader.inspect();check();
 if(inventory.state!=='inspected')throw Error('EMBEDDED_PREVIEW_ATTACHMENT_INSPECTION_REQUIRED');
 const files=[];let total=0;
 for(const item of inventory.attachments){
  check();const opened=reader.openAttachment(item.id);
  const prefix=new File([opened.data.slice(0,64)],'prefix.bin');
  const identity=await sniffFontFile(prefix,{maxBytes:64});check();
  if(!['single','collection'].includes(identity.container)){
   if(/\.(ttf|otf|ttc|otc)$/i.test(item.filename)||/^(font\/|application\/(x-truetype-font|vnd\.ms-opentype|x-font-ttf))/i.test(item.mimeType))throw Error('EMBEDDED_PREVIEW_FONT_HEADER_INVALID');
   continue;
  }
  if(!Number.isSafeInteger(item.byteLength)||item.byteLength<=0||item.byteLength>MAX_FONT_BYTES||total+item.byteLength>MAX_FONT_TOTAL||files.length>=MAX_FONTS)throw Error('EMBEDDED_PREVIEW_FONT_BUDGET_EXCEEDED');
  total+=item.byteLength;
  files.push(new File([opened.data],`embedded-font-${files.length}${identity.container==='collection'?'.ttc':identity.flavor==='opentype-cff'?'.otf':'.ttf'}`,{type:item.mimeType}));
 }
 check();return files;
}
