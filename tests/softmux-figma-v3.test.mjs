import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { groupV3Objects, canCommitV3CrossSource, V3_SOURCE_GROUPS } from '../src/softmux-figma-v3.js';

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Figma V3 is a separately reviewable route, never a silent replacement of default or legacy', async () => {
  const [main, shell, css] = await Promise.all([
    source('src/main.js'),source('src/softmux-figma-v3.js'),source('src/softmux-figma-v3.css')
  ]);
  assert.match(main,/get\('ui'\) !== 'legacy'/);
  assert.match(main,/get\('ui'\) === 'v3'/);
  assert.match(main,/mountSoftmux1014Workbench\(document\)/);
  assert.match(main,/mountSoftmuxFigmaV3\(document\)/);
  assert.match(css,/\.sf14\.sfv3-active:not\(\.sfv3-legacy-open\)/);
  assert.match(shell,/originalInspectorParent\.appendChild\(inspector\)/);
  assert.match(shell,/q\('sfv3DropHost'\)\.appendChild\(dropzone\)/);
});

test('source and proposed output have separate visible identities and the output is explicitly created', async () => {
  const shell = await source('src/softmux-figma-v3.js');
  assert.match(shell,/state\.outputVisible = false|outputVisible: false/);
  assert.match(shell,/state\.view = 'output'/);
  assert.match(shell,/state\.intentSourceKey = key|state\.intentSourceKey=key/);
  assert.match(shell,/sourceKey\(inventory\)!==state\.intentSourceKey/);
  assert.match(shell,/id="sfv3DestChoices"/);
  assert.match(shell,/新建无来源的空 MKV · 此操作未获得后端能力许可/);
  assert.doesNotMatch(shell,/new File\(|new DataTransfer\(|createObjectURL|FFmpeg\(/);
});

test('V3 projections preserve source track kinds without manufacturing missing objects', () => {
  assert.deepEqual(V3_SOURCE_GROUPS.map(group => group[0]),['video','audio','subtitle']);
  const result=groupV3Objects([
    {kind:'video',index:0,title:'HEVC'},
    {kind:'audio',index:2,title:'AAC'},
    {kind:'subtitle',index:5,title:'ASS'},
    {kind:'chapter',index:0,title:'No writer'},
    {kind:'subtitle',index:-1,title:'Invalid index'},
  ]);
  assert.deepEqual(result.video.map(x=>x.title),['HEVC']);
  assert.deepEqual(result.audio.map(x=>x.title),['AAC']);
  assert.deepEqual(result.subtitle.map(x=>x.title),['ASS']);
  assert.equal(Object.hasOwn(result,'chapter'),false);
});

test('cross-source subtitle action fails closed on stale source, selection or capability', () => {
  const valid={fromKey:'A',targetKey:'B',index:3,sourcePresent:true,targetActive:true,eligible:true};
  assert.equal(canCommitV3CrossSource(valid),true);
  for(const patch of [
    {targetKey:'A'}, {index:-1}, {index:1.5}, {sourcePresent:false},
    {targetActive:false}, {eligible:false}, {fromKey:''},{targetKey:''},
  ]) assert.equal(canCommitV3CrossSource({...valid,...patch}),false,JSON.stringify(patch));
});

test('V3 actions delegate to existing production inputs, inspection, output and export instead of synthetic write state', async () => {
  const shell=await source('src/softmux-figma-v3.js');
  for(const marker of [
    /q\('scanTracksBtn'\)/,/q\('unifiedAssetInput'\)/,
    /data-secondary-subtitle-inspect/,
    /data-secondary-subtitle-add/,
    /q\('muxBtn'\)/,/q\('downloadLink'\)/,
    /q\('previewRefreshBtn'\)/,
    /data-extract-original-track-index/,
  ]) assert.match(shell,marker);
  assert.match(shell,/eligible:Boolean\(add && !add\.disabled\)/);
  assert.match(shell,/sourceKey\(inventory\)===pending\.targetKey/);
  assert.match(shell,/real\.click\(\)/);
});

test('V3 supports wide, landscape, portrait, compact and reduced-motion layout contracts', async () => {
  const css=await source('src/softmux-figma-v3.css');
  for(const marker of [
    /@media \(max-width:1319px\)/,
    /@media \(max-width:959px\)/,
    /@media \(max-width:719px\)/,
    /@media \(prefers-reduced-motion:reduce\)/,
    /\.sfv3-sheet-panel/,
    /\.sfv3-structures/,
    /\.sfv3-destination-dialog/,
    /\.sfv3-drop-host #assetDropzone/,
  ]) assert.match(css,marker);
});
