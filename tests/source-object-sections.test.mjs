import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSourceObjectSections } from '../src/source-object-sections.js';

const scanned = () => ({
  streams: [
    { index:0, codec_type:'video', codec_name:'h264' },
    { index:3, codec_type:'attachment', tags:{ filename:'font.otf' } },
  ],
  attachments: [{
    index:3, filename:'font.otf', originalFilename:'font.otf',
    mimetype:'font/otf', originalMimetype:'font/otf', include:true,
  }],
  chapters: [
    { start_time:'0.000000', end_time:'21.000000', tags:{ title:'Opening' } },
    { start_time:'21.000000', end_time:'92.000000', tags:{ title:'Episode' } },
  ],
  format: { tags:{ title:'Episode 01', ENCODER:'OriginalTool' } },
});

test('unscanned source yields no fabricated attachments, chapters or tags', () => {
  const model = buildSourceObjectSections(null);
  assert.equal(model.scanned,false);
  assert.deepEqual(model.attachments,[]);
  assert.deepEqual(model.chapters,[]);
  assert.deepEqual(model.tags,[]);
});

test('actual ffprobe source projects attachment, flat chapters and format-only tags', () => {
  const model=buildSourceObjectSections(scanned());
  assert.equal(model.scanned,true);
  assert.equal(model.attachments.length,1);
  assert.equal(model.attachments[0].title,'font.otf');
  assert.equal(model.attachments[0].sourceIndex,3,'attachment selection must retain exact stream identity');
  assert.equal(model.attachments[0].status,'keep');
  assert.equal(model.attachments[0].evidence,'ffprobe-stream');
  assert.deepEqual(model.chapters.map(x=>x.title),['Opening','Episode']);
  assert.equal(model.chapters[0].evidence,'ffprobe-flat-chapter');
  assert.match(model.chapters[0].detail,/0\.000000.*21\.000000/);
  assert.deepEqual(model.tags.map(x=>x.title),['title','ENCODER']);
  assert.equal(model.tags[0].evidence,'ffprobe-format-tags');
  assert.ok(!model.tags[0].targetUid,'a flat format tag cannot fabricate TagTargets');
  assert.ok(Object.isFrozen(model.attachments[0]));
  assert.ok(Object.isFrozen(model.tags));
});

test('excluded source attachment is a proposed edit, not proof of output state', () => {
  const source=scanned();
  source.attachments[0].include=false;
  assert.equal(buildSourceObjectSections(source).attachments[0].status,'remove');
  assert.equal(buildSourceObjectSections(source,{appendMode:true}).attachments[0].status,'keep');
  // Source input is not mutated by the projection.
  assert.equal(source.attachments[0].include,false);
});

test('exact source File identity travels with the read-only view', () => {
  const a = { name:'same.mkv', size:100, lastModified:1 };
  const b = { name:'same.mkv', size:100, lastModified:1 };
  const observed = buildSourceObjectSections(scanned(), { sourceFile:a });
  assert.strictEqual(observed.sourceFile,a);
  assert.notStrictEqual(observed.sourceFile,b,
    'matching name, size and mtime never grant a second File its scan identity');
  const none = buildSourceObjectSections(null,{sourceFile:a});
  assert.equal(none.sourceFile,null);
});

test('scanned files with no chapter / tag evidence keep the tabs truly empty', () => {
  const source={streams:[{index:0,codec_type:'video'}],attachments:[],chapters:[],format:{}};
  const model=buildSourceObjectSections(source);
  assert.equal(model.scanned,true);
  assert.deepEqual(model.attachments,[]);
  assert.deepEqual(model.chapters,[]);
  assert.deepEqual(model.tags,[]);
});

test('untrusted source labels stay plain data with bounded size', () => {
  const source=scanned();
  source.chapters[0].tags.title='<img src=x onerror=alert(1)>'+'x'.repeat(2048);
  const model=buildSourceObjectSections(source);
  assert.equal(model.chapters[0].title.length,1024);
  assert.ok(model.chapters[0].title.startsWith('<img'));
  // UI uses textContent, never innerHTML, to render these labels.
});
