import test from 'node:test';
import assert from 'node:assert/strict';
import {createContainerProject,serializeContainerProject} from '../src/container-project.js';
import {
  serializePortableWorkspaceBundle,parsePortableWorkspaceBundle,
  PORTABLE_WORKSPACE_BUNDLE_SCHEMA,
} from '../src/portable-workspace-bundle.js';

function components(){
 const project=createContainerProject({documentId:'document:test',
   sources:[{id:'source:test',name:'source.mkv',size:100,
     sha256:'a'.repeat(64)}],
   objects:[{id:'track:test',kind:'audio',sourceId:'source:test',
     included:true,order:0,attributes:{title:'A'}}]});
 return {sourceDraftJson:serializeContainerProject(project),
   externalCheckpointJson:JSON.stringify({
     schema:'mkv-external-metadata-checkpoint-v1',rows:[],
   })};
}

test('S09 single file contains both inert recovery scopes and no executable permissions',()=>{
 const txt=serializePortableWorkspaceBundle(components());
 const bundled=parsePortableWorkspaceBundle(txt);
 assert.equal(bundled.schema,PORTABLE_WORKSPACE_BUNDLE_SCHEMA);
 assert.equal(bundled.sourceDraft.sources[0].sha256,'a'.repeat(64));
 assert.equal(bundled.externalCheckpoint.schema,'mkv-external-metadata-checkpoint-v1');
 assert.equal(bundled.requiresSeparateVerification,true);
 assert.equal(bundled.requiresSeparateExplicitApproval,true);
 assert.equal(bundled.canAutoApply,false);
 assert.equal(bundled.writerAuthorized,false);
 assert.equal(bundled.sourceDraft.authorization,'requires-relink');
 assert.equal(bundled.externalCheckpoint.authorization,'requires-current-file-rebind');
 assert.doesNotMatch(txt,/file:\/\/|blob:\/\/|ObjectURL|FileSystemDirectoryHandle/);
});

test('S09 bundle can omit external checkpoint without inventing an external authority',()=>{
 const {sourceDraftJson}=components();
 const pkg=parsePortableWorkspaceBundle(serializePortableWorkspaceBundle({sourceDraftJson}));
 assert.equal(pkg.externalCheckpoint,null);
});

test('S09 rejects additional top-level execution/authority fields',()=>{
 const obj=JSON.parse(serializePortableWorkspaceBundle(components()));
 obj.executionAuthorized=true;
 assert.throws(()=>parsePortableWorkspaceBundle(JSON.stringify(obj)),/WORKSPACE_BUNDLE_SCHEMA/);
 delete obj.executionAuthorized;
 obj.schema='softmux-workspace-recovery-bundle-v9';
 assert.throws(()=>parsePortableWorkspaceBundle(JSON.stringify(obj)),/WORKSPACE_BUNDLE_SCHEMA/);
});

test('S09 rejects source identity/intent forgery and malformed external rows before presenting either',()=>{
 const obj=JSON.parse(serializePortableWorkspaceBundle(components()));
 obj.sourceDraft.sources[0].sha256='invalid';
 assert.throws(()=>parsePortableWorkspaceBundle(JSON.stringify(obj)),/PROJECT_SOURCE_UNTRUSTED/);
 const fresh=JSON.parse(serializePortableWorkspaceBundle(components()));
 fresh.externalCheckpoint.rows=[{kind:'audio',index:0}];
 assert.throws(()=>parsePortableWorkspaceBundle(JSON.stringify(fresh)),/EXTERNAL_CHECKPOINT_ENTRY/);
});

test('S09 missing scope, malformed JSON, or oversized input fails closed',()=>{
 const obj=JSON.parse(serializePortableWorkspaceBundle(components()));
 delete obj.externalCheckpoint;
 assert.throws(()=>parsePortableWorkspaceBundle(JSON.stringify(obj)),/WORKSPACE_BUNDLE_SCHEMA/);
 assert.throws(()=>parsePortableWorkspaceBundle('{'),/WORKSPACE_BUNDLE_INVALID_JSON/);
 assert.throws(()=>parsePortableWorkspaceBundle(' '.repeat(2*1024*1024+1)),/WORKSPACE_BUNDLE_TOO_LARGE/);
});

test('S09 writer-side serialization independently validates both existing schema contracts',()=>{
 const c=components();
 assert.throws(()=>serializePortableWorkspaceBundle({
   sourceDraftJson:c.sourceDraftJson,
   externalCheckpointJson:'{"schema":"untrusted","rows":[]}',
 }),/EXTERNAL_CHECKPOINT_SCHEMA/);
 assert.throws(()=>serializePortableWorkspaceBundle({
   sourceDraftJson:'{}',
   externalCheckpointJson:c.externalCheckpointJson,
 }),/PROJECT_IMPORT_SCHEMA_UNSUPPORTED/);
});
