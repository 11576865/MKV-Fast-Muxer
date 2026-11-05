import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceRowsFromComposition,sourceRowsFromObservation,sourceSubtitleDispositionLabels} from '../src/softmux-v3-surface.js';

function row(id,kind,name,detail) {
  const fields = new Map([
    ['.composition-kind',kind],
    ['.composition-track-main strong',name],
    ['.composition-track-main small',detail],
  ]);
  return {
    dataset:{compositionId:id},
    querySelector(selector) {
      const textContent = fields.get(selector);
      return textContent ? {textContent} : null;
    },
  };
}
function docWithRows(rows) {
  return {getElementById(id) {
    return id === 'compositionTracks' ? {querySelectorAll:()=>rows} : null;
  }};
}
test('V3 source readout only consumes real source-scanned rows, never output candidates',()=>{
  const d=docWithRows([
    row('source:0:1','视频','HEVC · Main','3840 × 2160'),
    row('external:ass:1','字幕','External ASS','not imported from source'),
    row('source:0:3','字幕','源字幕','ASS'),
    row('candidate:attachment','附件','Candidate font','not in MKV'),
  ]);
  assert.deepEqual(sourceRowsFromComposition(d),[
    {id:'source:0:1',kind:'视频',name:'HEVC · Main',detail:'3840 × 2160'},
    {id:'source:0:3',kind:'字幕',name:'源字幕',detail:'ASS'},
  ]);
});
test('V3 source projection tolerates absent track DOM or empty identities',()=>{
  assert.deepEqual(sourceRowsFromComposition({getElementById:()=>null}),[]);
  assert.deepEqual(sourceRowsFromComposition(docWithRows([row('target:1','音频','FLAC','')])),[]);
});
test('V3 pilot is isolated from existing default workbench',async()=>{
  const code=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(code,/get\('ui'\) === 'v3'/);
  assert.match(code,/get\('ui'\) !== 'legacy'/);
  assert.match(ui,/root\.dataset\.sfv3Surface = 'source'/);
  assert.match(ui,/appendChild\(dropzone\)/);
  assert.match(ui,/sourceRowsFromComposition/);
  assert.match(ui,/latestSections\.sourceFile\s*===\s*file/); // exact File identity, no name-only claim
  assert.match(css,/\.sf14\.sfv3\[data-sfv3-surface="source"\]/);
  assert.match(css,/@media \(max-width:959px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('V3 source observation is derived from exact scanned stream facts, not candidate output rows',()=>{
  assert.deepEqual(sourceRowsFromObservation([
    {index:0,type:'video',codec:'hevc',title:'',language:'und'},
    {index:3,type:'subtitle',codec:'ass',title:'简体中文',language:'chi'},
    {index:4,type:'audio',codec:'aac',title:'',language:'jpn'},
    {index:-1,type:'subtitle',codec:'fake'},
    {type:'subtitle',codec:'srt',title:'no index'},
  ]),[
    {id:'source:observed:0',kind:'视频',name:'hevc · #0',detail:'hevc · und · 来源轨 #0'},
    {id:'source:observed:3',kind:'字幕',name:'简体中文',detail:'ass · chi · 来源轨 #3'},
    {id:'source:observed:4',kind:'音频',name:'aac · #4',detail:'aac · jpn · 来源轨 #4'},
  ]);
});
test('V3 no-target path short-circuits output construction in its real renderer',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function renderOutputComposition()');
  const finish=main.indexOf('function activateCompositionTrack(',start);
  const segment=main.slice(start,finish);
  assert.ok(start>=0 && finish>start);
  const gate=segment.indexOf('if (v3Pilot && !currentV3Target())');
  const model=segment.indexOf('buildContainerDocument({');
  assert.ok(gate>=0 && model>gate,'V3 must verify optional target BEFORE building output model');
  assert.match(segment.slice(gate,model),/compositionTracks\.replaceChildren\(\)/);
  assert.match(segment.slice(gate,model),/return null;/);
  assert.match(segment.slice(0,gate),/updateSoftmux1014SourceSections/);
});

test('V3 source inspection stays read-only; ASS transfer requires explicit target and native closure',async()=>{
  const js=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(js,/sourceSheet\.id='sfv3SourceInspector'/);
  assert.match(js,/sourceSheet\.setAttribute\('role','region'\)/);
  assert.match(js,/exactEntry\(selectedSource\.sourceKey,selectedSource\.sourceFile\)/);
  assert.match(js,/selectedSource\.sourceFile===from\.file/);
  assert.match(js,/\['subrip','ass','ssa'\]\.includes\(stream\?\.codec\)/);
  assert.match(js,/track\.allowed && \['subrip','ass','ssa'\]\.includes\(track\.codec\)/);
  assert.match(js,/openTargetPicker\(selected\.transfer\)/);
  assert.match(css,/\.sfv3-source-sheet\[hidden\]/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('V3 ASS source preview routes exact File/stream to the existing native renderer',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const surface=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  assert.match(main,/softmux:v3-preview-source/);
  assert.match(main,/scannedSourceFile!==sourceFile/);
  assert.match(main,/previewRefreshBtn\.click\(\)/);
  assert.match(surface,/nativePreviewHome\.insertBefore\(nativePreviewDrawer/);
  assert.match(surface,/sourceSheetPreviewHost\.appendChild\(nativePreviewDrawer\)/);
  assert.match(surface,/sourceInput\.files\?\.\[0\]!==selected\.sourceFile/);
});

test('V3 source ASS Stream Copy extraction reuses the native readback/audit pipeline',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const surface=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  assert.match(main,/softmux:v3-extract-source/);
  assert.match(main,/trackState\?\.fileKey!==fileKey\(sourceFile\)/);
  assert.match(main,/planOriginalTrackExtraction\(sourceFile,stream,\{format:'native'\}\)/);
  assert.match(main,/extractOriginalTrack\(streamIndex,'native'\)/);
  assert.match(surface,/sourceSheetExtractionHost\.appendChild\(nativeExtractionPanel\)/);
  assert.match(surface,/nativeExtractionHome\.insertBefore\(nativeExtractionPanel/);
  assert.match(surface,/sourceSheetExtract\.hidden=!previewable \|\| !nativeExtractionPanel/);
});


test('V3 ASS Add-to stays an explicit target intent and reuses P3 complete font closure',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const surface=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  assert.match(main,/from '.\/secondary-ass-font-bundle.js'/);
  assert.match(main,/prepareSecondaryAssFontBundle\(\{/);
  assert.match(main,/Promise.all\(\[subtitleInspectPromise,fontInspectPromise\]\)/);
  assert.match(main,/!add \|\| v3MayEditOutput\(\)/);
  assert.match(main,/pruneSecondaryAssFontBundleForSource\(importedAssetEntries,removed.file\)/);
  assert.match(surface,/\['subrip','ass','ssa'\]\.includes\(track.codec\)/);
  assert.match(surface,/\['subrip','ass','ssa'\]\.includes\(stream\?\.codec\)/);
  assert.match(surface,/sourceSheetAdd\.textContent=\['ass','ssa'\]/);
  assert.match(surface,/pendingAddition=\{/);
  assert.match(surface,/setSurface\('plan'\)/);
});

test('V3 ASS/font evidence projects real derived File members and stays out of source observation',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const surface=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  assert.match(main,/const assFontBundles=importedAssetEntries/);
  assert.match(main,/entry\.embeddedOrigin\?\.bundleKind==='ass-font-closure'/);
  assert.match(main,/file===subtitle\.file/);
  assert.match(main,/file===entry\.file/);
  assert.match(main,/sourceStillPresent && subBound && fontsBound/);
  assert.match(surface,/assFontPanel\.id='sfv3AssFontDependencies'/);
  assert.match(surface,/targetValid && root\.dataset\.sfv3Surface==='plan'/);
  assert.match(surface,/bundle\.sourceFile!==targetIntent\.baseFile/);
  assert.match(surface,/bundle\.bound\?'bound':'pending'/);
  assert.match(surface,/尚未执行最终封装及成品审计/);
  assert.match(surface,/assFontPanel\.hidden=!actualBundles\.length/);
});


test('V3 target transfer highlighting is bound to exact derived File, not subtitle metadata',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(main,/newSubtitleState\[item\.target\.index\]\?\.file/);
  assert.match(main,/entry\.file===subtitleFile/);
  assert.match(main,/entry\.file===origin\.sourceFile/);
  assert.match(main,/file===entry\.file/);
  assert.match(main,/row\.dataset\.sfv3AssFont='bound'/);
  assert.match(main,/trackMain\.appendChild\(note\)/);
  assert.match(css,/composition-row\[data-sfv3-ass-font="bound"\]/);
  assert.match(css,/@media\(max-width:959px\)/);
});


test('V3 source/target inspectors focus their close and restore exact invoking object',async()=>{
  const view=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(view,/inspectorReturnCompositionId=origin\?\.dataset\?\.compositionId\|\|''/);
  assert.match(view,/node\.dataset\.compositionId===inspectorReturnCompositionId/);
  assert.match(view,/contextDismiss\.focus\(\)/);
  assert.match(view,/sourceSheetClose\.focus\(\)/);
  assert.match(view,/sourceSheetClose\.addEventListener\('click',\(\)=>closeSourceSheet\(true\)\)/);
  assert.match(view,/closeInspector\(true\)/);
  assert.match(view,/event\.key!=='Escape'/);
  assert.match(css,/\.sfv3-source-sheet-close,/);
  assert.match(css,/min-height:44px/);
});


test('V3-09 source ASS shows only observed font attachments and the one shared flag glossary',async()=>{
  const view=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(view,/sourceFontEvidence\.id='sfv3SourceFontEvidence'/);
  assert.match(view,/sourceSheetHelpHost\.id='sfv3SourceFlagHelpHost'/);
  assert.match(view,/latestSections\.sourceFile===selectedSource\.sourceFile/);
  assert.match(view,/latestSections\.attachments\|\|\[\]/);
  assert.match(view,/fontAttachments\.slice\(0,12\)/);
  assert.match(view,/sourceSheetHelpHost\.appendChild\(subtitleFlagHelp\)/);
  assert.match(view,/objectContext\.appendChild\(subtitleFlagHelp\)/);
  assert.match(view,/sourceHelpInScope \|\| Boolean\(targetValid/);
  assert.match(view,/不等于字体 face、字重、斜体或字形依赖已验证/);
  assert.match(view,/不能把未知当作 0 项/);
  assert.match(css,/\.sfv3-source-font-evidence\[hidden\]/);
  assert.match(css,/\.sfv3-source-flag-help-host/);
});


test('V3-09 renders the original native ASS preview beside real controls at 820 and 620',async()=>{
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  assert.match(css,/\.sfv3-source-sheet:has\(#sfv3SourcePreviewHost:not\(\[hidden\]\)\)/);
  assert.match(css,/grid-template-areas:"media tools" "media evidence"/);
  assert.match(css,/@media\(min-width:600px\) and \(max-width:959px\)/);
  assert.match(css,/\.sfv3-source-sheet-preview-host \.preview-stage/);
  assert.match(css,/aspect-ratio:16\/9/);
  assert.match(css,/\.sfv3-source-sheet-preview-host \.preview-tools/);
  assert.match(ui,/sourceSheetPreviewHost\.appendChild\(nativePreviewDrawer\)/);
  assert.match(ui,/nativePreviewHome\.insertBefore\(nativePreviewDrawer/);
});


test('P0 delivery gate: actual composition precedes recovery and chapters/tags',async()=>{
  const view=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(view,/actualComposition\.after\(recovery\)/);
  assert.match(view,/compositionHost\.appendChild\(structure\)/);
  assert.match(view,/const structure=doc\.createElement\('details'\)/);
  assert.match(view,/const header=doc\.createElement\('summary'\)/);
  assert.match(css,/\.sfv3-observed-structure:not\(\[open\]\) > :not\(summary\)/);
  assert.match(css,/\.sfv3-observed-structure > summary/);
});
test('P0 delivery gate: empty canvas keeps the single native click/drop importer',async()=>{
  const view=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(view,/empty\.appendChild\(dropzone\)/);
  assert.match(css,/\.sfv3-empty #assetDropzone \{/);
  assert.match(css,/position:absolute;inset:0;width:100%;height:100%/);
  assert.match(main,/assetDropzone\?\.addEventListener\('click'/);
  assert.match(main,/assetDropzone\?\.addEventListener\('drop'/);
  assert.doesNotMatch(view,/empty\.addEventListener\('drop'/);
});

test('V3-05/V3-09 shows exact observed source subtitle flags read-only and never treats unknown as Off',async()=>{
  assert.deepEqual(sourceSubtitleDispositionLabels({default:1,forced:0}),
    {default:'开',forced:'关'});
  assert.deepEqual(sourceSubtitleDispositionLabels({default:0,forced:1}),
    {default:'关',forced:'开'});
  assert.deepEqual(sourceSubtitleDispositionLabels({default:null,forced:2}),
    {default:'未观察',forced:'未观察'});
  assert.deepEqual(sourceSubtitleDispositionLabels(undefined),
    {default:'未观察',forced:'未观察'});
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const surface=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(main,/disposition:stream\.disposition && typeof stream\.disposition==='object'/);
  assert.match(surface,/sourceSheetFlags\.id='sfv3SourceFlagStates'/);
  assert.match(surface,/sourceSheetFlags\.hidden=!subtitleObserved/);
  assert.match(surface,/selectedSource\.disposition/);
  assert.match(surface,/来源 ffprobe · 只读/);
  assert.match(css,/\.sfv3-source-flag-states\[hidden\]/);
  assert.match(css,/grid-area:source-flags/);
});

test('Figma V3-03 renders native explicit-target choice cards with accessible dismissal and no fake blank writer',async()=>{
  const ui=await readFile(new URL('../src/softmux-v3-surface.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/softmux-v3.css',import.meta.url),'utf8');
  assert.match(ui,/picker\.setAttribute\('aria-describedby','sfv3PickerExplanation'\)/);
  assert.match(ui,/cancelChoice\.setAttribute\('aria-label','取消目标选择'\)/);
  assert.match(ui,/pickerOptions\.appendChild\(label\)/);
  assert.match(ui,/className='sfv3-picker-choice-copy'/);
  assert.match(ui,/以 '\+entry\.file\.name\+' 为基础/);
  assert.match(ui,/className='sfv3-picker-unavailable'/);
  assert.match(ui,/emptyOption\.setAttribute\('aria-disabled','true'\)/);
  assert.match(ui,/const accepted=signal\('softmux:v3-confirm-target'/);
  assert.doesNotMatch(ui,/radio\.value='blank'/);
  assert.match(css,/right:clamp\(24px,12\.85vw,240px\)/);
  assert.match(css,/\.sfv3-picker-option:focus-within/);
  assert.match(css,/@media\(max-width:959px\)/);
  assert.match(css,/\.sfv3-picker-confirm:focus-visible/);
});
