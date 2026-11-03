import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceRowsFromComposition} from '../src/softmux-v3-surface.js';

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
  assert.match(ui,/sourceFile === file|sourceFile === file/); // exact File identity, no name-only claim
  assert.match(css,/\.sf14\.sfv3\[data-sfv3-surface="source"\]/);
  assert.match(css,/@media \(max-width:959px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
