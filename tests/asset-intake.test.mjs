import assert from 'node:assert/strict';
import test from 'node:test';
import { assetIntakeKey, classifyAssetBytes, identifyImportedAsset, resolveImportedRoles, resolveBatchImportedAssets, ASSET_STATUS } from '../src/asset-intake.js';

const bytes = (text) => new TextEncoder().encode(text);
const fixture = (name, data, lastModified = 1) => ({
  name, size: data.length, lastModified, slice: () => ({
    arrayBuffer: async () => data.slice().buffer,
  }),
});

test('container identity comes from contents, not from filename or mime label', () => {
  const file = fixture('wrong-name.txt', bytes('xxxxftypisom'));
  const result = classifyAssetBytes(file, bytes('xxxxftypisom'));
  assert.equal(result.kind, 'container');
  assert.equal(result.status, ASSET_STATUS.UNVERIFIED);
  assert.match(result.detail, /ffprobe/);
});

test('audio-only signature remains an audio asset, not a video source', () => {
  const data = bytes('fLaC......');
  const result = classifyAssetBytes(fixture('video.mp4', data), data);
  assert.equal(result.kind, 'audio');
  assert.equal(result.label, 'FLAC');
  assert.equal(resolveImportedRoles([result]).video, null);
});

test('font SFNT content is detected under an unfamiliar suffix', () => {
  const data = new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0]);
  const result = classifyAssetBytes(fixture('renamed.asset', data), data);
  assert.equal(result.kind, 'font');
  assert.equal(result.status, ASSET_STATUS.UNVERIFIED);
});

test('ASS subtitle content is detected without .ass suffix', () => {
  const data = bytes('[Script Info]\nTitle: Test\n[V4+ Styles]\n');
  const result = classifyAssetBytes(fixture('renamed.dat', data), data);
  assert.equal(result.kind, 'subtitle');
  assert.equal(result.status, ASSET_STATUS.RECOGNIZED);
  assert.equal(result.label, 'ASS');
});

test('unknown and unreadable files are not silently discarded or assigned roles', async () => {
  const file = fixture('unknown.blob', new Uint8Array([0, 2, 4, 6, 8]));
  const result = await identifyImportedAsset(file);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.status, ASSET_STATUS.UNSUPPORTED);
  assert.equal(resolveImportedRoles([result]).unknown.length, 1);
  const bad = await identifyImportedAsset({
    name: 'broken', size: 1, lastModified: 3,
    slice: () => ({ arrayBuffer: async () => { throw new Error('fixture read failed'); } }),
  });
  assert.match(bad.detail, /fixture read failed/);
});

test('one container is auto-assigned, but two containers require explicit choice', () => {
  const first = classifyAssetBytes(fixture('a.mp4', bytes('xxxxftypisom')), bytes('xxxxftypisom'));
  const second = classifyAssetBytes(fixture('b.mov', bytes('xxxxftypqt  ')), bytes('xxxxftypqt  '));
  assert.equal(resolveImportedRoles([first]).video.name, 'a.mp4');
  const many = resolveImportedRoles([first, second]);
  assert.equal(many.video, null);
  assert.equal(many.needsSourceChoice, true);
  assert.equal(resolveImportedRoles([first, second], second.key).video.name, 'b.mov');
});

test('standalone recognized assets route by detected kind; foreign container is unassigned', () => {
  const mkv = { kind: 'container', key: 'A', file: { name: 'a.mkv' } };
  const other = { kind: 'container', key: 'B', file: { name: 'b.mkv' } };
  const subtitle = { kind: 'subtitle', key: 'C', file: { name: 'zh.ass' } };
  const audio = { kind: 'audio', key: 'D', file: { name: 'sound.flac' } };
  const font = { kind: 'font', key: 'E', file: { name: 'font.ttf' } };
  const roles = resolveImportedRoles([mkv, other, subtitle, audio, font], 'A');
  assert.deepEqual(roles.subtitles.map((x) => x.name), ['zh.ass']);
  assert.deepEqual(roles.audio.map((x) => x.name), ['sound.flac']);
  assert.deepEqual(roles.fonts.map((x) => x.name), ['font.ttf']);
  assert.deepEqual(roles.unassignedContainers.map((x) => x.file.name), ['b.mkv']);
});

test('asset keys distinguish paths in selected folders', () => {
  const a = { name: '01.ass', webkitRelativePath: 'A/01.ass', size: 10, lastModified: 12 };
  const b = { name: '01.ass', webkitRelativePath: 'B/01.ass', size: 10, lastModified: 12 };
  assert.notEqual(assetIntakeKey(a), assetIntakeKey(b));
});


test('batch content-first roles include every container and standalone subtitle/font, but block unsupported audio', () => {
  const files = [
    {kind:'container',file:{name:'a.mp4'}},
    {kind:'container',file:{name:'b.mkv'}},
    {kind:'subtitle',file:{name:'a.ass'}},
    {kind:'font',file:{name:'shared.ttf'}},
    {kind:'audio',file:{name:'sound.flac'}},
    {kind:'unknown',file:{name:'unknown.bin'}},
  ];
  const roles = resolveBatchImportedAssets(files);
  assert.deepEqual(roles.containers.map(x => x.name), ['a.mp4','b.mkv']);
  assert.deepEqual(roles.subtitles.map(x => x.name), ['a.ass']);
  assert.deepEqual(roles.fonts.map(x => x.name), ['shared.ttf']);
  assert.deepEqual(roles.unsupported.map(x => x.file.name), ['sound.flac','unknown.bin']);
});

test('batch role mapping does not mutate original inventory or auto-promote audio to a video source', () => {
  const entries = [{kind:'audio',file:{name:'episode.flac'}}, {kind:'subtitle',file:{name:'episode.ass'}}];
  const before = entries.map(x => x.kind);
  const result = resolveBatchImportedAssets(entries);
  assert.deepEqual(result.containers, []);
  assert.equal(result.unsupported.length, 1);
  assert.deepEqual(entries.map(x => x.kind), before);
});
