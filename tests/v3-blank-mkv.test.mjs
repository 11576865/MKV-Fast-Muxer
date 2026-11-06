import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {
  createV3BlankTargetPlan,buildV3BlankMuxCommand,
  auditV3BlankOutput,v3BlankPlanReadiness,v3BlankTargetStillCurrent,
} from '../src/v3-blank-mkv.js';
const source=new File(['source-bytes'],'A.mkv',{type:'video/x-matroska'});
const replacement=new File(['source-bytes'],'A.mkv',{type:'video/x-matroska'});
const sub=new File(['1\n00:00:01,000 --> 00:00:02,000\nHello\n'],'test.srt');
const font=new File([1,2,3,4],'font.ttf');
const observed=[
  {index:0,kind:'video',codec:'h264',title:'main'},
  {index:1,kind:'audio',codec:'aac',title:'ja',language:'jpn'},
  {index:2,kind:'subtitle',codec:'ass',title:'words',language:'eng',
    default:true,forced:true},
  {index:3,kind:'attachment',codec:'ttf',title:'font'},
];
test('blank target never inherits video, audio or metadata without explicit inclusion',()=>{
  const plan=createV3BlankTargetPlan({
    sourceFile:source,sourceKey:'A',sourceStreams:observed,
    selectedIndices:[2],outputName:'fresh.mkv',
  });
  const args=buildV3BlankMuxCommand(plan,{
    sourcePath:'session-source.mkv',outputPath:'new.mkv',
  });
  assert.deepEqual(args.slice(args.indexOf('-map'),args.indexOf('-map_metadata')),
    ['-map','0:2']);
  assert.ok(args.includes('-map_metadata')&&args.includes('-map_chapters'));
  assert.deepEqual(args.slice(args.indexOf('-map_metadata'),args.indexOf('-map_metadata')+4),
    ['-map_metadata','-1','-map_chapters','-1']);
  assert.equal(args.includes('0:v?'),false);
  assert.equal(plan.sourceStreams.length,1);
  const dispositionIndex=args.indexOf('-disposition:s:0');
  assert.ok(dispositionIndex>=0,'selected subtitle emits a real output flag');
  assert.equal(args[dispositionIndex+1],'default+forced',
    'new Matroska retains the selected source subtitle Default and Forced values');
  assert.deepEqual(auditV3BlankOutput(plan,[{codec_type:'subtitle'}]).state,
    'STREAM_COUNTS_VERIFIED');
  assert.throws(()=>auditV3BlankOutput(plan,[
    {codec_type:'video'},{codec_type:'subtitle'},
  ]),/BLANK_AUDIT_STREAM_COUNT_MISMATCH/);
});
test('only explicit attachments enter the blank target and receive MIME/filename',()=>{
  const plan=createV3BlankTargetPlan({
    sourceFile:source,sourceKey:'A',sourceStreams:observed,
    selectedIndices:[2,3],
    externalTracks:[{kind:'subtitle',file:sub,language:'zho',title:'Chinese',default:true}],
    attachments:[{file:font,mimeType:'font/ttf',filename:'font.ttf'}],
  });
  const args=buildV3BlankMuxCommand(plan,{
    sourcePath:'A.mkv',externalPaths:['external.srt'],
    attachmentPaths:['font.ttf'],outputPath:'out.mkv',
  });
  const maps=args.flatMap((arg,i)=>arg==='-map'?[args[i+1]]:[]);
  assert.deepEqual(maps,['0:2','0:3','1:0']);
  assert.ok(args.includes('mimetype=font/ttf'));
  assert.ok(args.includes('filename=font.ttf'));
  assert.ok(args.includes('language=zho'));
  assert.equal(auditV3BlankOutput(plan,[
    {codec_type:'subtitle'},{codec_type:'attachment'},
    {codec_type:'subtitle'},{codec_type:'attachment'},
  ]).expectedStreamCount,4);
});
test('empty plan is a real editor state, not permission to write an empty command',()=>{
  const plan=createV3BlankTargetPlan({sourceFile:source,sourceKey:'A',sourceStreams:observed});
  assert.equal(v3BlankPlanReadiness(plan).ready,false);
  assert.throws(()=>buildV3BlankMuxCommand(plan,{
    outputPath:'out.mkv',
  }),/BLANK_TARGET_NO_SELECTED_CONTENT/);
});
test('File identity is exact; metadata-identical replacement loses authority',()=>{
  const plan=createV3BlankTargetPlan({
    sourceFile:source,sourceKey:'A',sourceStreams:observed,selectedIndices:[1],
  });
  assert.equal(v3BlankTargetStillCurrent(plan,{
    activeSource:source,entries:[{kind:'container',key:'A',file:source}],
  }),true);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    activeSource:replacement,entries:[{kind:'container',key:'A',file:replacement}],
  }),false);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    activeSource:source,entries:[],
  }),false);
});
test('external-only new container has input 0, never a phantom source input',()=>{
  const plan=createV3BlankTargetPlan({
    externalTracks:[{kind:'subtitle',file:sub,language:'eng'}],
  });
  const args=buildV3BlankMuxCommand(plan,{
    externalPaths:['blank-track.srt'],outputPath:'out.mkv',
  });
  assert.deepEqual(args.filter(x=>x==='-i').length,1);
  assert.ok(args.join(' ').includes('-map 0:0'));
  assert.equal(args.includes('0:v?'),false);
  assert.equal(auditV3BlankOutput(plan,[{codec_type:'subtitle'}]).observedStreamCount,1);
});
test('reject duplicate, unobserved and malicious source/resource intent',()=>{
  assert.throws(()=>createV3BlankTargetPlan({
    sourceFile:source,sourceKey:'A',sourceStreams:observed,selectedIndices:[8],
  }),/BLANK_SELECTED_STREAM_NOT_OBSERVED/);
  assert.throws(()=>createV3BlankTargetPlan({
    sourceFile:source,sourceKey:'A',sourceStreams:observed,selectedIndices:[1,1],
  }),/BLANK_SELECTED_STREAM_NOT_OBSERVED/);
  assert.throws(()=>createV3BlankTargetPlan({attachments:[{file:font,mimeType:''}]}),
    /BLANK_ATTACHMENT_INVALID/);
  assert.throws(()=>createV3BlankTargetPlan({outputName:'../escape.mkv'}),
    /BLANK_TARGET_OUTPUT_NAME_INVALID/);
});

test('new-MKV output authority revokes on external track metadata or attachment membership drift',()=>{
  const plan=createV3BlankTargetPlan({
    externalTracks:[{kind:'subtitle',file:sub,language:'eng',title:'English',default:true}],
    attachments:[{file:font,mimeType:'font/ttf',filename:'font.ttf'}],
  });
  const entries=[
    {kind:'subtitle',file:sub,include:true},
    {kind:'attachment',file:font,include:true},
  ];
  const members={entries,activeSource:null,
    externalTracks:[{kind:'subtitle',file:sub,language:'eng',title:'English',default:true}],
    attachments:[{file:font,mimeType:'font/ttf',filename:'font.ttf'}],
  };
  assert.equal(v3BlankTargetStillCurrent(plan,members),true);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    ...members,externalTracks:[{...members.externalTracks[0],language:'jpn'}],
  }),false);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    ...members,externalTracks:[{...members.externalTracks[0],title:'Changed'}],
  }),false);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    ...members,attachments:[{...members.attachments[0],filename:'renamed.ttf'}],
  }),false);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    ...members,entries:[{kind:'subtitle',file:sub,include:true},
      {kind:'attachment',file:font,include:false}],
  }),false);
  assert.equal(v3BlankTargetStillCurrent(plan,{
    ...members,externalTracks:[{...members.externalTracks[0],
      file:new File(['same bytes'],'test.srt')}],
  }),false);
});
