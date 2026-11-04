import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceRowsFromComposition,sourceRowsFromObservation} from '../src/softmux-v3-surface.js';

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
