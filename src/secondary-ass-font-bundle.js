import {createMatroskaAttachmentReader} from './matroska-attachment-reader.js';
import {sanitizeAttachmentFilename} from './attachment-export-policy.js';
import {identifyFontFile,fontMimeType} from './font-identity.js';
import {
  analyzeAssFontUsage,readFontDescriptors,scoreFontFaceMatch,checkFontCharacters,
} from './ass-font-rewrite.js';
import {sniffSubtitleBytes} from './subtitle-format.js';

export const MAX_CROSS_SOURCE_ASS_BYTES=8*1024*1024;
const MAX_FONT_BYTES=8*1024*1024;
const MAX_TOTAL_FONT_BYTES=32*1024*1024;
const MAX_FONT_COUNT=32;

export function secondaryAssEligibility(stream,entries=[],sourceFile=null) {
  if(!stream || stream.codec_type!=='subtitle' ||
      !['ass','ssa'].includes(stream.codec_name) ||
      !Number.isSafeInteger(stream.index)||stream.index<0)
    return {allowed:false,reason:'只能选择实际扫描到的 ASS / SSA 字幕轨。'};
  if(entries.some(e=>e.embeddedOrigin?.sourceFile===sourceFile &&
    e.embeddedOrigin?.bundleKind==='ass-font-closure'))
    return {allowed:false,reason:'该来源已经加入一组 ASS 与字体，请先移除旧成员再重新组合。'};
  return {allowed:true,reason:''};
}

/**
 * Strict source-font dependency closure for one actual ASS/SSA stream.
 * This is not a promise of arbitrary playback fidelity: final rendering is
 * independently tested on genuine downloaded browser MKV outputs.
 *
 * Nothing mutates current editor state until the whole bundle succeeds.
 * Input filenames are not trusted as proof of font identity or format.
 */
export async function prepareSecondaryAssFontBundle({
  sourceEntry,stream,bytes,existingEntries=[],
  readerFactory=createMatroskaAttachmentReader,
  createFile=(parts,name,options)=>new File(parts,name,options),
  isCurrent=()=>true,
}={}) {
  const check=()=>{
    if(!isCurrent()) throw Error('CROSS_SOURCE_ASS_SOURCE_CHANGED');
  };
  check();
  if(sourceEntry?.kind!=='container'||!sourceEntry.file||!sourceEntry.key)
    throw Error('CROSS_SOURCE_ASS_SOURCE_INVALID');
  const permitted=secondaryAssEligibility(stream,existingEntries,sourceEntry.file);
  if(!permitted.allowed)throw Error('CROSS_SOURCE_ASS_NOT_ELIGIBLE: '+permitted.reason);
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_CROSS_SOURCE_ASS_BYTES)
    throw Error('CROSS_SOURCE_ASS_SIZE_OUT_OF_BOUNDS');
  let content;
  try {content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch {throw Error('CROSS_SOURCE_ASS_UTF8_REQUIRED');}
  const detected=sniffSubtitleBytes(bytes.subarray(0,256*1024));
  if(!['ass','ssa'].includes(detected.id)||detected.confidence!=='high')
    throw Error('CROSS_SOURCE_ASS_CONTENT_UNVERIFIED');
  const analysis=analyzeAssFontUsage(content);
  const required=analysis.usedFonts.filter(face=>face.characters.length);
  if(!required.length)
    throw Error('CROSS_SOURCE_ASS_NO_RENDERED_FONT_DEPENDENCIES');

  const reader=readerFactory(sourceEntry.file);
  const inventory=await reader.inspect();check();
  if(inventory.state!=='inspected')
    throw Error('CROSS_SOURCE_ASS_ATTACHMENT_INSPECTION_REQUIRED');
  const fonts=[];
  let total=0;
  const knownNames=new Set(existingEntries
    .filter(e=>e.kind==='font')
    .map(e=>String(e.file?.name||'').normalize('NFC').toLowerCase()));
  for(const item of inventory.attachments){
    check();
    const opened=reader.openAttachment(item.id);
    const prefix=new Uint8Array(await opened.data.slice(0,64).arrayBuffer());
    check();
    const isFontHeader=prefix.length>=4&&(
      [0,1,0,0].every((v,i)=>prefix[i]===v) ||
      ['OTTO','true','typ1','ttcf'].includes(String.fromCharCode(...prefix.subarray(0,4)))
    );
    const declaredFont=/\.(ttf|otf|ttc|otc)$/i.test(item.filename)||
      /^(font\/|application\/(x-truetype-font|vnd\.ms-opentype|x-font-ttf))/i.test(item.mimeType);
    if(!isFontHeader&&!declaredFont)continue;
    if(!isFontHeader)
      throw Error('CROSS_SOURCE_ASS_DECLARED_FONT_HEADER_INVALID');
    if(!Number.isSafeInteger(item.byteLength)||item.byteLength<1||
        item.byteLength>MAX_FONT_BYTES||total+item.byteLength>MAX_TOTAL_FONT_BYTES||
        fonts.length>=MAX_FONT_COUNT)
      throw Error('CROSS_SOURCE_ASS_FONT_BUDGET_EXCEEDED');
    if(sanitizeAttachmentFilename(item.filename).transformed)
      throw Error('CROSS_SOURCE_ASS_UNSAFE_FONT_FILENAME');
    const nameKey=item.filename.normalize('NFC').toLowerCase();
    if(knownNames.has(nameKey))throw Error('CROSS_SOURCE_ASS_FONT_NAME_CONFLICT');
    knownNames.add(nameKey);
    const file=createFile([opened.data],item.filename,{
      type:item.mimeType,lastModified:sourceEntry.file.lastModified||0,
    });
    if(!file?.slice||file.size!==item.byteLength||file.name!==item.filename)
      throw Error('CROSS_SOURCE_ASS_FONT_FILE_BINDING_FAILED');
    const identity=await identifyFontFile(file);check();
    if(!identity.valid)throw Error('CROSS_SOURCE_ASS_FONT_STRUCTURE_INVALID');
    const descriptors=await readFontDescriptors(file);check();
    fonts.push({file,item,identity,descriptors});
    total+=item.byteLength;
  }
  if(!fonts.length)throw Error('CROSS_SOURCE_ASS_MISSING_EMBEDDED_FONT');
  const chosen=new Set();
  const matches=[];
  for(const face of required){
    check();
    const candidates=fonts.flatMap((font,index)=>
      font.descriptors.map(descriptor=>({
        font,index,descriptor,match:scoreFontFaceMatch(face,descriptor),
      }))).filter(entry=>entry.match.matched)
      .sort((a,b)=>b.match.score-a.match.score);
    if(!candidates.length)
      throw Error('CROSS_SOURCE_ASS_FONT_FAMILY_UNRESOLVED: '+face.name);
    const exact=candidates.filter(entry=>entry.match.styleExact);
    if(!exact.length)
      throw Error('CROSS_SOURCE_ASS_FONT_FACE_UNRESOLVED: '+face.name);
    const bestScore=exact[0].match.score;
    const best=exact.filter(entry=>entry.match.score>=bestScore-20);
    if(best.length!==1)
      throw Error('CROSS_SOURCE_ASS_AMBIGUOUS_FONT_FACE: '+face.name);
    const hit=best[0];
    const coverage=await checkFontCharacters(hit.font.file,face.characters,hit.descriptor.collectionIndex);
    check();
    if(coverage.missing.length)
      throw Error('CROSS_SOURCE_ASS_MISSING_FONT_GLYPHS: '+face.name+' / '+coverage.missing.length);
    chosen.add(hit.index);
    matches.push({
      requestedFamily:face.name,weight:face.weight,italic:Boolean(face.italic),
      actualFamily:hit.descriptor.family,sourceFileUid:hit.font.item.fileUid,
      requiredGlyphCount:face.characters.length,
    });
  }
  const safeStem=String(sourceEntry.file.name)
    .replace(/\.[^.]*$/,'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').slice(0,80)||'source';
  const lang=String(stream.tags?.language||'und').toLowerCase();
  const safeLang=/^[a-z]{2,3}$/.test(lang)?lang:'und';
  const subtitleName=safeStem+'.stream-'+stream.index+'.'+safeLang+'.ass';
  const subtitleFile=createFile([bytes],subtitleName,{
    type:'text/x-ssa',lastModified:sourceEntry.file.lastModified||0,
  });
  if(!subtitleFile?.slice||subtitleFile.size!==bytes.length||subtitleFile.name!==subtitleName)
    throw Error('CROSS_SOURCE_ASS_SUBTITLE_FILE_BINDING_FAILED');
  const origin={
    bundleKind:'ass-font-closure',sourceFile:sourceEntry.file,
    sourceKey:sourceEntry.key,sourceName:sourceEntry.file.name,
    streamIndex:stream.index,codec:stream.codec_name,
  };
  const selectedFonts=[...chosen].sort((a,b)=>a-b).map(index=>{
    const font=fonts[index];
    return {
      kind:'font',status:'unverified',file:font.file,
      key:'secondary-ass-font:'+sourceEntry.key+':'+stream.index+':'+font.item.fileUid,
      label:'来源 ASS 所需字体',evidence:'source-attached-font-verified-face-and-glyphs',
      detail:'来自 '+sourceEntry.file.name+' 的 FileUID '+font.item.fileUid+
        '；与来源 ASS 的实际使用 face 和字形匹配。',
      embeddedOrigin:Object.freeze({...origin,kind:'font-ass',
        fileUid:font.item.fileUid,originalName:font.item.filename,
        attachmentMime:fontMimeType(font.identity)}),
    };
  });
  check();
  return {
    subtitle:{
      kind:'subtitle',status:'recognized',file:subtitleFile,
      key:'secondary-ass:'+sourceEntry.key+':'+stream.index,
      label:'内封 ASS + 字体',evidence:'source-ass-stream-copy-with-font-closure',
      detail:'来自 '+sourceEntry.file.name+' 的轨道 #'+stream.index+
        '；同时加入 '+selectedFonts.length+' 个已匹配字体。',
      embeddedOrigin:Object.freeze({...origin,kind:'subtitle-ass',
        title:String(stream.tags?.title||''),language:String(stream.tags?.language||'und')}),
    },
    fonts:selectedFonts,
    closure:Object.freeze({
      schema:'secondary-ass-font-closure-v1',
      sourceStreamIndex:stream.index,sourceFontCount:fonts.length,
      selectedFontCount:selectedFonts.length,usedFaceCount:required.length,
      matches,
      claimedScope:'ASS used face and cmap glyph coverage; not generic player rendering',
    }),
  };
}

export const pruneSecondaryAssFontBundleForSource=(entries,sourceFile)=>
  entries.filter(item=>!(item.embeddedOrigin?.bundleKind==='ass-font-closure' &&
    item.embeddedOrigin.sourceFile===sourceFile));
