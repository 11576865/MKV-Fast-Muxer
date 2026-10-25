import test from 'node:test';
import assert from 'node:assert/strict';
import {createContainerProject,serializeContainerProject}
  from '../src/container-project.js';
import {serializePortableWorkspaceBundle}
  from '../src/portable-workspace-bundle.js';
import {prepareWorkspaceShelfEntry,validateWorkspaceShelfEntry,
  createWorkspaceCheckpointShelf,WORKSPACE_SHELF_SCHEMA,
  WORKSPACE_SHELF_MAX_ENTRIES} from '../src/workspace-checkpoint-shelf.js';
const id='12345678-1234-4234-8234-123456789abc';
const source=(hash='a'.repeat(64))=>serializeContainerProject(
 createContainerProject({documentId:'test:s09:shelf',
  sources:[{id:'source:test',name:'episode.mkv',size:444,
    ...(hash===null?{}:{sha256:hash})}],
  objects:[{id:'source:audio',kind:'audio',sourceId:'source:test',
    included:true,order:0,attributes:{title:'Example'}}],
 }));
const pkg=(hash)=>serializePortableWorkspaceBundle({
  sourceDraftJson:source(hash),
  externalCheckpointJson:JSON.stringify({
    schema:'mkv-external-metadata-checkpoint-v1',rows:[],
  }),
});
const make=(json=pkg())=>prepareWorkspaceShelfEntry({
  json,sourceName:'episode.mkv',id,createdAt:1792965600000,
});

test('S09 local storage checkpoint: strict inert JSON, no File permission or auto-apply',()=>{
 const entry=make();
 assert.equal(entry.schema,WORKSPACE_SHELF_SCHEMA);
 assert.equal(validateWorkspaceShelfEntry(entry).json,entry.json);
 assert.equal(entry.hasExternalCheckpoint,true);
 assert.doesNotMatch(JSON.stringify(entry),/blob:\/\/|FileSystemFileHandle|file:\/\//);
 assert.equal(Object.isFrozen(entry),true);
});
test('S09 only byte-verifiable projects qualify for a local saved recovery point',()=>{
 assert.throws(()=>make(pkg(null)),/WORKSPACE_SHELF_SOURCE_SHA256_REQUIRED/);
 assert.throws(()=>make(pkg('deadbeef')),/PROJECT_SOURCE_UNTRUSTED/);
 const withBad=JSON.parse(pkg());
 withBad.externalCheckpoint.rows=[{kind:'subtitle',index:0,sha256:'ff'}];
 assert.throws(()=>make(JSON.stringify(withBad)),/EXTERNAL_CHECKPOINT_ENTRY/);
});
test('S09 metadata validation rejects foreign execution claims, malformed ID/name and scope mismatch',()=>{
 const entry=make();
 assert.throws(()=>validateWorkspaceShelfEntry({...entry,writerAuthorized:true}),/WORKSPACE_SHELF_ENTRY_SCHEMA/);
 assert.throws(()=>validateWorkspaceShelfEntry({...entry,hasExternalCheckpoint:false}),/WORKSPACE_SHELF_ENTRY_SCOPE_MISMATCH/);
 assert.throws(()=>prepareWorkspaceShelfEntry({
   json:pkg(),sourceName:'../\u0000unsafe',id,createdAt:1,
 }),/WORKSPACE_SHELF_ENTRY_METADATA_INVALID/);
 assert.throws(()=>prepareWorkspaceShelfEntry({
   json:pkg(),sourceName:'episode.mkv',id:'untrusted-key',createdAt:1,
 }),/WORKSPACE_SHELF_ENTRY_METADATA_INVALID/);
});
test('S09 corruption and huge local records cannot be loaded as executable plans',()=>{
 const entry=make();
 assert.throws(()=>validateWorkspaceShelfEntry({
   ...entry,json:'{"schema":"bogus"}',
 }),/WORKSPACE_BUNDLE_SCHEMA/);
 assert.throws(()=>prepareWorkspaceShelfEntry({
   json:' '.repeat(2*1024*1024+1),sourceName:'x',id,createdAt:1,
 }),/WORKSPACE_SHELF_OVERSIZE/);
});
test('S09 without IndexedDB has explicit unavailable state, not fake successful persistence',async()=>{
 const shelf=createWorkspaceCheckpointShelf({indexedDB:null});
 await assert.rejects(shelf.list(),/WORKSPACE_SHELF_INDEXEDDB_UNAVAILABLE/);
 await assert.rejects(shelf.save({json:pkg(),sourceName:'episode.mkv'}),
   /WORKSPACE_SHELF_INDEXEDDB_UNAVAILABLE/);
 assert.equal(WORKSPACE_SHELF_MAX_ENTRIES,8);
});
