import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContainerDocument } from '../src/container-document.js';
import {
  createContainerProjectFromProjection, createEditedContainerProjectFromProjection,
  applyContainerProjectEdit, serializeContainerProject,
} from '../src/container-project.js';
import { parseContainerProjectDraft } from '../src/container-project-import.js';
import {
  prepareVerifiedTrackReplay as prepare, applyPreparedTrackReplay as apply,
} from '../src/container-project-restore.js';

const proof = Object.freeze({
  state: 'digest-matches-draft',
  matched: true, sourceByteIdentityProven: true,
});
const mkTrack = (index, type, stream) => ({
  index, type, stream, include: true, order: index,
  title: stream.tags?.title || '', language: stream.tags?.language || 'und',
  default: Boolean(stream.disposition?.default),
  forced: Boolean(stream.disposition?.forced),
  original: Boolean(stream.disposition?.original),
  commentary: Boolean(stream.disposition?.comment),
  hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
  originalTitle: stream.tags?.title || '', originalLanguage: stream.tags?.language || 'und',
  originalDefault: Boolean(stream.disposition?.default),
  originalForced: Boolean(stream.disposition?.forced),
  originalOriginal: Boolean(stream.disposition?.original),
  originalCommentary: Boolean(stream.disposition?.comment),
  originalHearingImpaired: Boolean(stream.disposition?.hearing_impaired),
});
function fixture() {
  const file = { name: 'verified.mkv', size: 123, lastModified: 7 };
  const streams = [
    { index: 0, codec_type: 'video', codec_name: 'h264', tags: {}, disposition: {} },
    { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { language: 'jpn' }, disposition: { default: 1 } },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { title: 'Chinese', language: 'zho' }, disposition: {} },
    { index: 3, codec_type: 'attachment', codec_name: 'ttf',
      tags: { filename: 'Font.ttf', mimetype: 'font/ttf' }, disposition: {} },
  ];
  const state = {
    fileKey: 'verified.mkv|123|7', streams,
    tracks: [mkTrack(1, 'audio', streams[1]), mkTrack(2, 'subtitle', streams[2])],
    attachments: [{ index: 3, stream: streams[3], filename: 'Font.ttf', originalFilename: 'Font.ttf',
      mimetype: 'font/ttf', originalMimetype: 'font/ttf', include: true }],
    chapters: [], format: { tags: {} },
  };
  const live = buildContainerDocument({ video: file, trackState: state });
  return { file, state, live };
}
function editProject(live, specs) {
  let project = createContainerProjectFromProjection(live);
  for (const [kind, type, field, value] of specs) {
    const object = project.objects.find(item => item.kind === kind);
    assert.ok(object, 'missing test object ' + kind);
    project = applyContainerProjectEdit(project, {
      type, objectId: object.id, ...(field ? { field } : {}), value,
    });
  }
  return parseContainerProjectDraft(serializeContainerProject(project));
}
const title = ['audio', 'set-attribute', 'title', 'Japanese commentary'];
const language = ['audio', 'set-attribute', 'language', 'eng'];
const include = ['subtitle', 'include', null, false];

test('inspected source projects exact editable values, provenance and scan binding', () => {
  const { live } = fixture();
  const project = createContainerProjectFromProjection(live);
  const audio = project.objects.find(o => o.kind === 'audio');
  assert.equal(audio.attributes.title, '', 'do not confuse display codec with real empty title');
  assert.equal(audio.attributes.language, 'jpn');
  assert.equal(audio.attributes.default, true);
  assert.equal(audio.sourceId, project.sources[0].id);
  assert.equal(live.sourceScanKey, 'verified.mkv|123|7');
  assert.equal(project.objects.find(o => o.kind === 'attachment').attributes.name, 'Font.ttf');
});

test('a verified multi-track detached change commits in one explicit transaction without a media write', () => {
  const { state, live, file } = fixture();
  const draft = editProject(live, [title, language, include]);
  const plan = prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state });
  assert.equal(plan.proposedCount, 3);
  assert.equal(plan.tracks.length, 2);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(state.tracks[0].title, '');
  const beforeFile = JSON.stringify(file);
  const receipt = apply(plan, state);
  assert.equal(receipt.status, 'applied-to-current-edit-plan');
  assert.equal(receipt.updatedTracks, 2);
  assert.equal(receipt.fileWritten, false);
  assert.equal(receipt.muxStarted, false);
  assert.equal(state.tracks[0].title, 'Japanese commentary');
  assert.equal(state.tracks[0].language, 'eng');
  assert.equal(state.tracks[1].include, false);
  assert.equal(state.tracks[1].original, false, 'legacy track exclusion clears dispositions');
  assert.equal(JSON.stringify(file), beforeFile);
  const afterLive = buildContainerDocument({ video: file, trackState: state });
  assert.equal(afterLive.objects.find(o => o.kind === 'audio').attributes.title, 'Japanese commentary');
});


test('real scan-to-editor export encodes all changed fields as a portable coherent intent chain', () => {
  const { file, state } = fixture();
  state.tracks[0].title = 'Edited in real UI';
  state.tracks[0].language = 'eng';
  const liveEdited = buildContainerDocument({ video: file, trackState: state });
  const detached = createEditedContainerProjectFromProjection(liveEdited);
  assert.equal(detached.editIntents.length, 2);
  assert.deepEqual(detached.editIntents.map(i => [i.field, i.from, i.to]),
    [['title', '', 'Edited in real UI'], ['language', 'jpn', 'eng']]);
  const imported = parseContainerProjectDraft(serializeContainerProject(detached));
  state.tracks[0].title = '';
  state.tracks[0].language = 'jpn';
  const restoredBaseline = buildContainerDocument({ video: file, trackState: state });
  const plan = prepare({ draft: imported, liveProjection: restoredBaseline,
    sourceProof: proof, trackState: state });
  apply(plan, state);
  assert.equal(state.tracks[0].title, 'Edited in real UI');
  assert.equal(state.tracks[0].language, 'eng');
});

test('source exclusion exports disposition reset as an explicit recoverable delta', () => {
  const { file, state } = fixture();
  state.tracks[0].include = false;
  state.tracks[0].default = false;
  state.tracks[0].original = false;
  const modified = buildContainerDocument({ video: file, trackState: state });
  const draft = parseContainerProjectDraft(serializeContainerProject(
    createEditedContainerProjectFromProjection(modified)));
  assert.deepEqual(draft.editIntents.map(x => [x.type, x.field, x.to]), [
    ['set-attribute', 'default', false], ['include', null, false],
  ]);
  state.tracks[0].include = true;
  state.tracks[0].default = true;
  state.tracks[0].original = true;
  const base = buildContainerDocument({ video: file, trackState: state });
  const plan = prepare({ draft, liveProjection: base, sourceProof: proof, trackState: state });
  apply(plan, state);
  assert.equal(state.tracks[0].include, false);
  assert.equal(state.tracks[0].default, false);
  assert.equal(state.tracks[0].original, false);
});

test('transaction inverse is atomic and refuses a subsequent conflicting user edit', async () => {
  const { file, state, live } = fixture();
  const { revertPreparedTrackReplay: revert } = await import('../src/container-project-restore.js');
  const draft = editProject(live, [title, include]);
  const plan = prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state });
  const original = JSON.stringify(state.tracks);
  apply(plan, state);
  state.tracks[1].title = 'edited after restore';
  const changed = JSON.stringify(state.tracks);
  assert.throws(() => revert(plan, state), /TRACK_REPLAY_UNDO_CONFLICT/);
  assert.equal(JSON.stringify(state.tracks), changed);
  state.tracks[1].title = 'Chinese';
  const undone = revert(plan, state);
  assert.equal(undone.revertedTracks, 2);
  assert.equal(JSON.stringify(state.tracks), original);
  assert.equal(undone.fileWritten, false);
});

test('a stale track change rejects the ENTIRE prepared transaction', () => {
  const { state, live } = fixture();
  const draft = editProject(live, [title, include]);
  const plan = prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state });
  state.tracks[1].title = 'changed after preview';
  const before = JSON.stringify(state.tracks);
  assert.throws(() => apply(plan, state), /TRACK_REPLAY_LIVE_STATE_CHANGED/);
  assert.equal(JSON.stringify(state.tracks), before);
  assert.equal(state.tracks[0].title, '');
});

test('a user edit after import blocks new preparation, not just final application', () => {
  const { state, file, live } = fixture();
  const draft = editProject(live, [title]);
  state.tracks[0].title = 'current UI';
  const now = buildContainerDocument({ video: file, trackState: state });
  assert.throws(() => prepare({
    draft, liveProjection: now, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_BASELINE_NOT_VERIFIED/);
});

test('hash proof, source scan, valid state and selective mode are independent gates', () => {
  const { state, file, live } = fixture();
  const draft = editProject(live, [title]);
  const args = { draft, liveProjection: live, sourceProof: proof, trackState: state };
  assert.throws(() => prepare({ ...args, sourceProof: null }), /BASELINE_NOT_VERIFIED/);
  assert.throws(() => prepare({ ...args, appendMode: true }), /SELECTIVE_MODE_REQUIRED/);
  assert.throws(() => prepare({ ...args, trackState: { ...state, fileKey: 'stale' } }), /SOURCE_SCAN_STALE/);
  const headerOnly = buildContainerDocument({ video: file, trackState: null });
  assert.throws(() => prepare({ ...args, liveProjection: headerOnly }), /BASELINE_NOT_VERIFIED/);
});

test('unsupported source modifications reject the full mixed import', () => {
  const { state, live } = fixture();
  for (const unsupported of [
    ['attachment', 'reorder', null, 0],
    ['audio', 'reorder', null, 0],
    ['video', 'set-attribute', 'title', 'new title'],
  ]) {
    const draft = editProject(live, [title, unsupported]);
    const before = JSON.stringify(state.tracks);
    assert.throws(() => prepare({ draft, liveProjection: live, sourceProof: proof, trackState: state }),
      /(?:TRACK|ATTACHMENT)_REPLAY_UNSUPPORTED_/);
    assert.equal(JSON.stringify(state.tracks), before);
  }
});

test('track exclusion plus field replay cannot silently edit an excluded object', () => {
  const { state, live } = fixture();
  const draft = editProject(live, [include, ['subtitle', 'set-attribute', 'title', 'Invisible edit']]);
  assert.throws(() => prepare({
    draft, liveProjection: live, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_EXCLUDED_FIELD_EDIT/);
});

test('invalid title and language values cannot bypass the editor constraints', () => {
  const { state, live } = fixture();
  for (const spec of [
    ['audio', 'set-attribute', 'title', 'x'.repeat(161)],
    ['audio', 'set-attribute', 'language', '!!invalid!!'],
  ]) {
    const draft = editProject(live, [spec]);
    assert.throws(() => prepare({
      draft, liveProjection: live, sourceProof: proof, trackState: state,
    }), /TRACK_REPLAY_(TITLE|LANGUAGE)_INVALID/);
  }
});

test('an unbound external subtitle is never allowed to mutate a source track', () => {
  const { state, file, live } = fixture();
  const ext = { name: 'extra.ass', size: 3, lastModified: 4 };
  const full = buildContainerDocument({ video: file, trackState: state,
    newSubtitles: [{ file: ext, title: 'external', format: { assLike: true } }] });
  let draft = editProject(full, [['subtitle', 'set-attribute', 'title', 'changed']]);
  // The fixture above selects the first source subtitle; make an external-only draft.
  let project = createContainerProjectFromProjection(full);
  const external = project.objects.find(o => o.sourceId === null && o.kind === 'subtitle');
  assert.ok(external);
  project = applyContainerProjectEdit(project, {
    type: 'set-attribute', objectId: external.id, field: 'title', value: 'external edit',
  });
  draft = parseContainerProjectDraft(serializeContainerProject(project));
  assert.throws(() => prepare({
    draft, liveProjection: full, sourceProof: proof, trackState: state,
  }), /TRACK_REPLAY_BASELINE_NOT_VERIFIED/);
});

test('actual advanced source disposition deltas survive strict import and verified replay', () => {
  const { file, state } = fixture();
  const fresh = buildContainerDocument({ video:file, trackState:state });
  const audio = state.tracks[0];
  const subtitle = state.tracks[1];
  audio.commentary = true;
  audio.original = true;
  subtitle.hearingImpaired = true;
  const changed = buildContainerDocument({ video:file, trackState:state });
  const draft = parseContainerProjectDraft(serializeContainerProject(
    createEditedContainerProjectFromProjection(changed)));
  assert.deepEqual(draft.editIntents.map(intent => [intent.field, intent.to]),
    [['original', true], ['commentary', true], ['hearingImpaired', true]]);
  assert.equal(draft.objects.some(o=>o.attributes.commentary === true),true);
  audio.commentary = false;
  audio.original = false;
  subtitle.hearingImpaired = false;
  const plan = prepare({draft,liveProjection:fresh,sourceProof:proof,trackState:state});
  assert.equal(plan.tracks.length,2);
  const outcome = apply(plan,state);
  assert.equal(outcome.updatedTracks,2);
  assert.equal(audio.original,true);
  assert.equal(audio.commentary,true);
  assert.equal(subtitle.hearingImpaired,true);
});

test('exported excluded-track advanced flags clear only as explicitly reviewed changes', () => {
  const { file, state } = fixture();
  const audio=state.tracks[0];
  audio.original=true;
  audio.commentary=true;
  audio.hearingImpaired=true;
  // In the scanned state, three advanced flags have changed. Exclusion
  // resets them, so final snapshot equals original scanned values.
  audio.include=false;
  for(const field of ['default','forced','original','commentary','hearingImpaired'])
    audio[field]=false;
  const projection=buildContainerDocument({video:file,trackState:state});
  const draft=parseContainerProjectDraft(serializeContainerProject(
    createEditedContainerProjectFromProjection(projection)));
  assert.ok(draft.editIntents.some(i=>i.type==='include' && i.to===false));
  assert.ok(draft.editIntents.every(i=>i.to!==true ||
    !['original','commentary','hearingImpaired'].includes(i.field)));
});

function fixtureWithTwoAttachments() {
  const f = fixture();
  const another = {index:4,codec_type:'attachment',codec_name:'ttf',
    tags:{filename:'Second.ttf',mimetype:'font/ttf'},disposition:{}};
  f.state.streams.push(another);
  f.state.attachments.push({index:4,stream:another,filename:'Second.ttf',
    mimetype:'font/ttf',originalFilename:'Second.ttf',
    originalMimetype:'font/ttf',include:true});
  f.live=buildContainerDocument({video:f.file,trackState:f.state});
  return f;
}

test('actual source attachment scan-to-editor deltas survive strict JSON import and SHA-bound preview', () => {
  const {file,state} = fixtureWithTwoAttachments();
  state.attachments[0].filename='Renamed.ttf';
  state.attachments[0].mimetype='application/x-font-ttf';
  state.attachments[1].include=false;
  const modified=buildContainerDocument({video:file,trackState:state});
  const exported=createEditedContainerProjectFromProjection(modified);
  const draft=parseContainerProjectDraft(serializeContainerProject(exported));
  assert.deepEqual(draft.editIntents.filter(i=>
    draft.objects.some(o=>o.id===i.objectId && o.kind==='attachment'))
    .map(i=>[i.type,i.field,i.to]),[
      ['set-attribute','name','Renamed.ttf'],
      ['set-attribute','mime','application/x-font-ttf'],
      ['include',null,false],
    ]);
  state.attachments[0].filename='Font.ttf';
  state.attachments[0].mimetype='font/ttf';
  state.attachments[1].include=true;
  const base=buildContainerDocument({video:file,trackState:state});
  const plan=prepare({draft,liveProjection:base,sourceProof:proof,trackState:state});
  assert.equal(plan.tracks.length,0);
  assert.equal(plan.attachments.length,2);
  const applied=apply(plan,state);
  assert.equal(applied.updatedAttachments,2);
  assert.equal(applied.updatedTracks,0);
  assert.equal(applied.fileWritten,false);
  assert.equal(state.attachments[0].filename,'Renamed.ttf');
  assert.equal(state.attachments[0].mimetype,'application/x-font-ttf');
  assert.equal(state.attachments[1].include,false);
});

test('combined track AND source attachment recovery is atomic, including inverse conflict', async () => {
  const {file,state,live}=fixtureWithTwoAttachments();
  const draft=editProject(live,[
    ['audio','set-attribute','title','Muxed Japanese'],
    ['attachment','set-attribute','name','Font-Restored.ttf'],
  ]);
  const plan=prepare({draft,liveProjection:live,sourceProof:proof,trackState:state});
  const initial=JSON.stringify(state.tracks)+JSON.stringify(state.attachments);
  assert.equal(plan.tracks.length,1);
  assert.equal(plan.attachments.length,1);
  state.attachments[0].filename='Edited after proof';
  assert.throws(()=>apply(plan,state),/ATTACHMENT_REPLAY_LIVE_STATE_CHANGED/);
  assert.equal(state.tracks[0].title,'');
  state.attachments[0].filename='Font.ttf';
  assert.equal(apply(plan,state).updatedAttachments,1);
  assert.equal(state.tracks[0].title,'Muxed Japanese');
  assert.equal(state.attachments[0].filename,'Font-Restored.ttf');
  const {revertPreparedTrackReplay:undo}=await import('../src/container-project-restore.js');
  state.attachments[0].filename='Another edit';
  assert.throws(()=>undo(plan,state),/ATTACHMENT_REPLAY_UNDO_CONFLICT/);
  assert.equal(state.tracks[0].title,'Muxed Japanese');
  state.attachments[0].filename='Font-Restored.ttf';
  const receipt=undo(plan,state);
  assert.equal(receipt.revertedTracks,1);
  assert.equal(receipt.revertedAttachments,1);
  assert.equal(JSON.stringify(state.tracks)+JSON.stringify(state.attachments),initial);
});

test('source attachment recovery refuses replaced ffprobe stream identity and hidden metadata', () => {
  const {file,state,live}=fixtureWithTwoAttachments();
  const draft=editProject(live,[
    ['attachment','set-attribute','name','Approved.ttf'],
  ]);
  const plan=prepare({draft,liveProjection:live,sourceProof:proof,trackState:state});
  const original=state.attachments[0].stream;
  state.attachments[0].stream={...original};
  assert.throws(()=>apply(plan,state),/ATTACHMENT_REPLAY_LIVE_STATE_CHANGED/);
  state.attachments[0].stream=original;
  const excluded=editProject(live,[
    ['attachment','set-attribute','name','Hidden.ttf'],
    ['attachment','include',null,false],
  ]);
  assert.throws(()=>prepare({draft:excluded,liveProjection:live,
    sourceProof:proof,trackState:state}),/ATTACHMENT_REPLAY_EXCLUDED_METADATA_EDIT/);
  assert.throws(()=>prepare({draft,liveProjection:live,
    sourceProof:null,trackState:state}),/TRACK_REPLAY_BASELINE_NOT_VERIFIED/);
  assert.throws(()=>prepare({draft,liveProjection:live,
    sourceProof:proof,trackState:state,appendMode:true}),
    /TRACK_REPLAY_SELECTIVE_MODE_REQUIRED/);
  assert.equal(state.attachments[0].filename,'Font.ttf');
});

test('attachment replay rejects malicious metadata and preserves entire edit set', () => {
  const {state,live}=fixtureWithTwoAttachments();
  const mixed=editProject(live,[
    ['audio','set-attribute','title','Safe title'],
    ['attachment','set-attribute','name','..\\outside.ttf'],
  ]);
  const before=JSON.stringify(state.tracks)+JSON.stringify(state.attachments);
  assert.throws(()=>prepare({draft:mixed,liveProjection:live,
    sourceProof:proof,trackState:state}),/ATTACHMENT_REPLAY_METADATA_INVALID/);
  assert.equal(JSON.stringify(state.tracks)+JSON.stringify(state.attachments),before);
});
