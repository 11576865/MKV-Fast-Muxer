import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContainerDocument } from '../src/container-document.js';
import { buildOutputComposition } from '../src/output-composition.js';
import {
  createLiveSourceTrackSession, commitLiveSourceTrackChanges, inspectLiveSourceTrackSession,
} from '../src/live-source-track-authority.js';

function fixture() {
  const source = { name: 'series.mkv', size: 2100, lastModified: 44 };
  const fileKey = 'series.mkv|2100|44';
  const mk = (index, codec_type, title, language, def = false) => ({
    index, codec_type, codec_name: codec_type === 'audio' ? 'aac' : codec_type === 'video' ? 'h264' : 'ass',
    tags: { title, language }, disposition: { default: Number(def), forced: 0, original: 1 },
  });
  const streams = [
    mk(0, 'video', '', 'und'),
    mk(1, 'audio', 'Japanese', 'jpn', true),
    mk(2, 'audio', 'Commentary', 'eng'),
    mk(3, 'subtitle', 'Chinese ASS', 'zho'),
    { index: 4, codec_type: 'attachment', codec_name: 'ttf',
      tags: { filename: 'main.ttf', mimetype: 'font/ttf' }, disposition: {} },
  ];
  const tracks = streams.filter(s => ['audio','subtitle'].includes(s.codec_type)).map(s => ({
    index:s.index, type:s.codec_type, stream:s, include:true,
    order:s.index, title:s.tags.title, language:s.tags.language,
    default:Boolean(s.disposition.default), forced:false,
    original:true, commentary:false, hearingImpaired:false,
    originalTitle:s.tags.title, originalLanguage:s.tags.language,
    originalDefault:Boolean(s.disposition.default), originalForced:false,
    originalOriginal:true, originalCommentary:false, originalHearingImpaired:false,
  }));
  const trackState = { fileKey, streams, tracks, attachments: [{
    index:4, stream:streams[4], include:true, filename:'main.ttf',
    mimetype:'font/ttf', originalFilename:'main.ttf', originalMimetype:'font/ttf',
  }], chapters:[{ tags:{title:'Opening'}, start_time:0 }], format:{tags:{title:'Series'}} };
  const projection = buildContainerDocument({video:source, trackState});
  const session = createLiveSourceTrackSession({ source, trackState, projection });
  const commit = changes => commitLiveSourceTrackChanges(session,
    { source, trackState, changes });
  return { source, trackState, projection, session, commit };
}
const row = (i, field, value) => ({index:i,field,value});

test('real inspected ContainerProject owns audio/subtitle edits and materializes legacy FFmpeg projection', () => {
  const f = fixture(), {session,trackState} = f;
  const oldAttachments = JSON.stringify(trackState.attachments);
  const oldChapters = JSON.stringify(trackState.chapters);
  const revision = session.project;
  const result = f.commit([
    row(1,'title','New Japanese'),row(1,'language','eng'),
    row(3,'default',true),row(2,'include',false),
  ]);
  assert.equal(result.status, 'committed-to-domain-and-executor-projection');
  assert.equal(result.updatedTracks,3);
  assert.equal(result.fileWritten,false);
  assert.equal(session.generation,1);
  assert.notEqual(session.project, revision);
  assert.equal(Object.isFrozen(session.project.objects),true);
  assert.equal(trackState.tracks[0].title,'New Japanese');
  assert.equal(trackState.tracks[0].language,'eng');
  assert.equal(trackState.tracks[2].default,true);
  assert.equal(trackState.tracks[1].include,false);
  assert.equal(trackState.tracks[1].original,false);
  const productComposition = buildOutputComposition({video:f.source,trackState});
  assert.equal(productComposition.counts.audio,1);
  assert.equal(productComposition.counts.subtitle,1);
  const latest = buildContainerDocument({video:f.source,trackState});
  const sourceAudio = latest.objects.find(o=>o.kind==='audio' && o.target?.key==='audio:1');
  assert.equal(sourceAudio.attributes.title,'New Japanese');
  assert.equal(sourceAudio.attributes.language,'eng');
  assert.equal(JSON.stringify(trackState.attachments),oldAttachments);
  assert.equal(JSON.stringify(trackState.chapters),oldChapters);
  assert.equal(inspectLiveSourceTrackSession(session,f).domainIsAuthoritative,true);
});

test('atomic failure never commits subset, mutates file, or changes domain generation', () => {
  const f=fixture();
  const before=JSON.stringify(f.trackState);
  const previous=f.session.project;
  assert.throws(()=>f.commit([
    row(1,'language','eng'), row(3,'title','x'.repeat(161)),
  ]),/LIVE_TRACK_TITLE_INVALID/);
  assert.equal(JSON.stringify(f.trackState),before);
  assert.equal(f.session.project,previous);
  assert.equal(f.session.generation,0);
  assert.throws(()=>f.commit([
    row(1,'title','safe'),row(4,'title','attachment not editable'),
  ]),/LIVE_TRACK_NOT_FOUND/);
  assert.equal(JSON.stringify(f.trackState),before);
});

test('live source/file object replacement and external mutation are rejected', () => {
  const f=fixture();
  assert.throws(()=>commitLiveSourceTrackChanges(f.session,{
    source:{...f.source},trackState:f.trackState,changes:[row(1,'title','wrong')],
  }),/LIVE_TRACK_SOURCE_SESSION_STALE/);
  const substitute={...f.trackState};
  assert.throws(()=>commitLiveSourceTrackChanges(f.session,{
    source:f.source,trackState:substitute,changes:[row(1,'title','wrong')],
  }),/LIVE_TRACK_SOURCE_SESSION_STALE/);
  f.trackState.tracks[0].title='legacy bypass';
  assert.throws(()=>f.commit([row(2,'title','Try')]),
    /LIVE_TRACK_EXECUTOR_PROJECTION_DRIFT/);
  assert.equal(f.session.generation,0);
});

test('no-change and preserve-all do not forge revisions or write projects', () => {
  const f=fixture();const current=f.session.project;
  assert.equal(f.commit([row(1,'title','Japanese')]).status,'no-change');
  assert.equal(f.session.project,current);
  assert.throws(()=>commitLiveSourceTrackChanges(f.session,{
    source:f.source,trackState:f.trackState,appendMode:true,
    changes:[row(1,'title','No')],
  }),/LIVE_TRACK_PRESERVE_ALL_READONLY/);
  assert.equal(f.session.project,current);
});

test('many live keystrokes compact history, not user edits or source identity', () => {
  const f=fixture();
  const text='abcdef'.repeat(25);
  for(let i=1;i<=text.length;i++)
    f.commit([row(1,'title',text.slice(0,i))]);
  const info=inspectLiveSourceTrackSession(f.session,f);
  assert.equal(f.trackState.tracks[0].title,text);
  assert.equal(f.session.generation,text.length);
  assert.ok(info.boundedHistoryLength<=85);
  assert.equal(f.session.project.objects.find(o=>o.kind==='audio').attributes.title,text);
  assert.equal(info.sourceTrackCount,3);
  assert.equal(info.writerAuthorization,false);
});

test('bulk default/exclusion applies in one domain transaction and clears old dispositions', () => {
  const f=fixture();
  let result=f.commit([
    row(1,'default',false),row(2,'default',true),
    row(3,'forced',true),
  ]);
  assert.equal(result.updatedTracks,3);
  result=f.commit([row(2,'include',false)]);
  const audio=f.trackState.tracks[1];
  assert.equal(audio.include,false);
  assert.equal(audio.default,false);
  assert.equal(audio.forced,false);
  assert.equal(audio.original,false);
  assert.equal(audio.commentary,false);
  assert.equal(audio.hearingImpaired,false);
  assert.equal(inspectLiveSourceTrackSession(f.session,f).domainIsAuthoritative,true);
});

test('unchanged order and advanced fields stay in explicitly legacy-owned scope', () => {
  const f=fixture();
  const order=f.trackState.tracks.map(t=>t.order);
  f.trackState.tracks[0].commentary=true;
  f.commit([row(1,'title','Independent commentary label')]);
  assert.equal(f.trackState.tracks[0].commentary,true);
  assert.deepEqual(f.trackState.tracks.map(t=>t.order),order);
  assert.throws(()=>f.commit([row(1,'order',7)]),/LIVE_TRACK_UNSUPPORTED_CHANGE/);
  assert.throws(()=>f.commit([row(1,'commentary',true)]),/LIVE_TRACK_UNSUPPORTED_CHANGE/);
});
