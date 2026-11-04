import test from 'node:test';
import assert from 'node:assert/strict';
import {
  secondaryAssEligibility,prepareSecondaryAssFontBundle,
  pruneSecondaryAssFontBundleForSource,MAX_CROSS_SOURCE_ASS_BYTES,
} from '../src/secondary-ass-font-bundle.js';

const source=Object.assign(new Blob(['real MKV placeholder']),{name:'A.mkv',lastModified:123});
const sourceEntry={kind:'container',file:source,key:'source-A'};
const stream={codec_type:'subtitle',codec_name:'ass',index:4,
  tags:{language:'eng',title:'A original captions'}};
const bytes=new TextEncoder().encode([
  '[Script Info]','ScriptType: v4.00+','[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, Bold, Italic',
  'Style: Default,Proof Test,26,0,0','[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello world','',
].join('\n'));
const fontBytes=Uint8Array.from([0,1,0,0,...Array(32).fill(0)]);
const makeFile=(parts,name,options)=>Object.assign(new Blob(parts,{type:options.type}),{
  name,lastModified:options.lastModified,
});
const attachment={id:'attachment:0:uid:100001',fileUid:'100001',filename:'ProofTest.ttf',
  mimeType:'font/ttf',byteLength:fontBytes.byteLength};
const inventory={state:'inspected',attachments:[attachment]};
const readerFactory=()=>({
  inspect:async()=>inventory,
  openAttachment:id=>{
    assert.equal(id,attachment.id);
    return {data:new Blob([fontBytes]),filename:attachment.filename};
  },
});
const descriptor={family:'Proof Test',aliases:['Proof Test'],
  familyAliases:['Proof Test'],weight:400,bold:false,italic:false,collectionIndex:null};
const base={
  sourceEntry,stream,bytes,readerFactory,createFile:makeFile,
  fontInspector:async()=>({valid:true,container:'single',flavor:'truetype'}),
  descriptorReader:async()=>[descriptor],
  glyphChecker:async(file,characters)=>({missing:[],checkedCount:characters.length}),
};
test('P3 secondary ASS and source font are admitted only as a complete provenance-bound group',async()=>{
  const result=await prepareSecondaryAssFontBundle(base);
  assert.equal(result.subtitle.kind,'subtitle');
  assert.equal(result.fonts.length,1);
  assert.equal(result.fonts[0].file.name,'ProofTest.ttf');
  assert.equal(result.fonts[0].embeddedOrigin.fileUid,'100001');
  assert.equal(result.subtitle.embeddedOrigin.sourceFile,source);
  assert.equal(result.closure.selectedFontCount,1);
  assert.equal(result.closure.matches[0].requestedFamily,'Proof Test');
  assert.deepEqual(new Uint8Array(await result.subtitle.file.arrayBuffer()),bytes);
  assert.deepEqual(new Uint8Array(await result.fonts[0].file.arrayBuffer()),fontBytes);
  assert.equal(secondaryAssEligibility(stream,[...result.fonts,result.subtitle],source).allowed,false);
  assert.deepEqual(pruneSecondaryAssFontBundleForSource([...result.fonts,result.subtitle,sourceEntry],source),[sourceEntry]);
});
test('P3 missing source font and missing glyphs prevent any successful bundle publication',async()=>{
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    readerFactory:()=>({inspect:async()=>({state:'inspected',attachments:[]})})}),
    /MISSING_EMBEDDED_FONT/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    glyphChecker:async()=>({missing:['e'],checkedCount:10})}),
    /MISSING_FONT_GLYPHS/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    descriptorReader:async()=>[{...descriptor,family:'Other',aliases:['Other'],familyAliases:['Other']}] }),
    /FONT_FAMILY_UNRESOLVED/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    descriptorReader:async()=>[{...descriptor,weight:700,bold:true}]}),
    /FONT_FACE_UNRESOLVED/);
});
test('P3 refuses unsafe claimed fonts, stale sources, invalid subtitles and unsupported sources',async()=>{
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,isCurrent:()=>false}),/SOURCE_CHANGED/);
  assert.equal(secondaryAssEligibility({...stream,codec_name:'subrip'},[],source).allowed,false);
  assert.equal(secondaryAssEligibility({...stream,index:-1},[],source).allowed,false);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,bytes:new Uint8Array()}),/SIZE_OUT_OF_BOUNDS/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,bytes:new Uint8Array(MAX_CROSS_SOURCE_ASS_BYTES+1)}),/SIZE_OUT_OF_BOUNDS/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    readerFactory:()=>({inspect:async()=>({state:'unverified',attachments:[]})})}),
    /ATTACHMENT_INSPECTION_REQUIRED/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    readerFactory:()=>({inspect:async()=>({state:'inspected',attachments:[
      {...attachment,filename:'../evil.ttf'}] }),
      openAttachment:()=>({data:new Blob([fontBytes])})})}),
    /UNSAFE_FONT_FILENAME/);
  await assert.rejects(()=>prepareSecondaryAssFontBundle({...base,
    existingEntries:[{kind:'font',file:{name:'prooftest.ttf'}}]}),/FONT_NAME_CONFLICT/);
});
