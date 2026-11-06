/*
 * Explicit create-new Matroska target. No existing MKV is used as a writable
 * "base" and no stream from a read-only source is mapped implicitly.
 *
 * This module owns the immutable writer snapshot only. The app still owns the
 * single FFmpeg instance, downloads, cancellation and live File permissions.
 */
import {normalizeTrackLanguage,dispositionValue} from './mux-command.js';

const allowedKinds=new Set(['video','audio','subtitle','attachment']);
const allowedExternal=new Set(['audio','subtitle']);
const validPath=x=>typeof x==='string' && x.length>0 &&
  !x.includes('..') && new RegExp('^[A-Za-z0-9_./-]+$').test(x);
const safeFilename=x=>typeof x==='string' && x.length>0 &&
  !x.includes('/') && !x.includes(String.fromCharCode(92)) &&
  !Array.from(x).some(c=>c.charCodeAt(0)<32);
const safeMime=x=>typeof x==='string' &&
  new RegExp('^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$').test(x);
const index=x=>Number.isSafeInteger(x)&&x>=0;

export function createV3BlankTargetPlan({
  sourceFile=null,sourceKey='',sourceStreams=[],selectedIndices=[],
  externalTracks=[],attachments=[],outputName='new.mkv',
}={}) {
  if(sourceFile!==null && !(sourceFile instanceof Blob))
    throw Error('BLANK_SOURCE_FILE_INVALID');
  if(sourceFile===null && (sourceStreams.length||selectedIndices.length||sourceKey))
    throw Error('BLANK_SOURCE_WITHOUT_FILE');
  if(sourceFile && (!sourceKey || typeof sourceKey!=='string'))
    throw Error('BLANK_SOURCE_KEY_REQUIRED');
  const streamMap=new Map();
  for(const stream of sourceStreams){
    if(!index(stream?.index)||!allowedKinds.has(stream?.kind)||streamMap.has(stream.index))
      throw Error('BLANK_SOURCE_STREAM_INVALID');
    streamMap.set(stream.index,stream);
  }
  const unique=new Set(selectedIndices);
  if(unique.size!==selectedIndices.length ||
     selectedIndices.some(id=>!streamMap.has(id)))
    throw Error('BLANK_SELECTED_STREAM_NOT_OBSERVED');
  const sources=selectedIndices.map(id=>Object.freeze({
    index:id,kind:streamMap.get(id).kind,
    codec:String(streamMap.get(id).codec||''),
    title:String(streamMap.get(id).title||''),
    language:String(streamMap.get(id).language||'und'),
    default:Boolean(streamMap.get(id).default),
    forced:Boolean(streamMap.get(id).forced),
    original:Boolean(streamMap.get(id).original),
    commentary:Boolean(streamMap.get(id).commentary),
    hearingImpaired:Boolean(streamMap.get(id).hearingImpaired),
  }));
  if(externalTracks.some(t=>!allowedExternal.has(t?.kind)||!(t.file instanceof Blob)||
    !t.file.name || (t.kind==='subtitle' && !/\.(srt|ass|ssa|vtt|webvtt)$/i.test(t.file.name))))
    throw Error('BLANK_EXTERNAL_TRACK_INVALID');
  if(attachments.some(a=>!(a.file instanceof Blob)||!a.file.size||
    a.file.size>16*1024*1024 || !safeMime(a.mimeType) ||
    !safeFilename(a.filename||a.file.name)))
    throw Error('BLANK_ATTACHMENT_INVALID');
  if(attachments.reduce((n,a)=>n+a.file.size,0)>32*1024*1024||
      new Set(attachments.map(a=>String(a.filename||a.file.name).toLowerCase())).size
        !==attachments.length)
    throw Error('BLANK_ATTACHMENT_BUDGET_OR_NAME_COLLISION');
  if(!safeFilename(outputName)||!outputName.toLowerCase().endsWith('.mkv'))
    throw Error('BLANK_TARGET_OUTPUT_NAME_INVALID');
  return Object.freeze({
    schema:'v3-blank-target-plan-v1',kind:'blank',
    sourceFile,sourceKey,
    sourceStreams:Object.freeze(sources),
    externalTracks:Object.freeze(externalTracks.map(t=>Object.freeze({
      kind:t.kind,file:t.file,
      language:String(t.language||'und'),title:String(t.title||''),
      default:Boolean(t.default),forced:Boolean(t.forced),
    }))),
    attachments:Object.freeze(attachments.map(a=>Object.freeze({
      file:a.file,mimeType:a.mimeType,filename:a.filename||a.file.name,
    }))),
    outputName,
  });
}

export function v3BlankPlanReadiness(plan){
  if(plan?.schema!=='v3-blank-target-plan-v1')
    return Object.freeze({ready:false,reason:'空目标计划未初始化'});
  const count=plan.sourceStreams.length+plan.externalTracks.length+plan.attachments.length;
  if(!count)return Object.freeze({ready:false,reason:'新建空 MKV 已选择；请至少添加一条真实轨道或附件'});
  return Object.freeze({ready:true,reason:'',count});
}

export function v3BlankTargetStillCurrent(plan,{entries=[],activeSource=null}={}) {
  if(plan?.schema!=='v3-blank-target-plan-v1')return false;
  if(plan.sourceFile){
    if(activeSource!==plan.sourceFile ||
      !entries.some(e=>e.key===plan.sourceKey && e.file===plan.sourceFile && e.kind==='container'))
      return false;
  }
  return [...plan.externalTracks,...plan.attachments].every(asset=>
    entries.some(e=>e.file===asset.file && e.include!==false));
}

/**
 * Only stream IDs selected on the exact File are mapped. No source chapters,
 * global metadata, unknown EBML, or unintended streams are imported.
 * All input paths come from the app's own temporary FFmpeg FS assignment.
 */
export function buildV3BlankMuxCommand(plan,{
  sourcePath=null,externalPaths=[],attachmentPaths=[],outputPath,
}={}) {
  if(plan?.schema!=='v3-blank-target-plan-v1'||!validPath(outputPath))
    throw Error('BLANK_COMMAND_INVALID');
  if(!v3BlankPlanReadiness(plan).ready)throw Error('BLANK_TARGET_NO_SELECTED_CONTENT');
  if(plan.sourceStreams.length && (!plan.sourceFile||!validPath(sourcePath)))
    throw Error('BLANK_COMMAND_SOURCE_NOT_STAGED');
  if(externalPaths.length!==plan.externalTracks.length ||
     attachmentPaths.length!==plan.attachments.length ||
     [...externalPaths,...attachmentPaths].some(p=>!validPath(p)))
    throw Error('BLANK_COMMAND_STAGING_MISMATCH');
  const args=['-hide_banner','-loglevel','error'];
  let input=0;
  if(plan.sourceStreams.length){args.push('-i',sourcePath);input++;}
  for(const p of externalPaths){args.push('-i',p);input++;}
  const sourceOffset=plan.sourceStreams.length?1:0;
  for(const track of plan.sourceStreams)args.push('-map',`0:${track.index}`);
  for(let i=0;i<externalPaths.length;i++)args.push('-map',`${i+sourceOffset}:0`);
  args.push('-map_metadata','-1','-map_chapters','-1','-c','copy');
  let audioIndex=0,subtitleIndex=0;
  for(const track of [
    ...plan.sourceStreams,
    ...plan.externalTracks,
  ]){
    if(track.kind==='audio'){
      args.push(`-metadata:s:a:${audioIndex}`,`language=${normalizeTrackLanguage(track.language)}`);
      args.push(`-metadata:s:a:${audioIndex}`,`title=${track.title}`);
      args.push(`-disposition:a:${audioIndex}`,dispositionValue(track.default,false,track));
      audioIndex++;
    }else if(track.kind==='subtitle'){
      args.push(`-metadata:s:s:${subtitleIndex}`,`language=${normalizeTrackLanguage(track.language)}`);
      args.push(`-metadata:s:s:${subtitleIndex}`,`title=${track.title}`);
      args.push(`-disposition:s:${subtitleIndex}`,dispositionValue(track.default,track.forced,track));
      if(track.file && /\.(vtt|webvtt)$/i.test(track.file.name))
        args.push(`-c:s:${subtitleIndex}`,'subrip');
      subtitleIndex++;
    }
  }
  const retainedSourceAttachments=plan.sourceStreams.filter(t=>t.kind==='attachment').length;
  for(let i=0;i<plan.attachments.length;i++){
    const att=plan.attachments[i];
    const outputAttachmentIndex=retainedSourceAttachments+i;
    args.push('-attach',attachmentPaths[i],
      `-metadata:s:t:${outputAttachmentIndex}`,`mimetype=${att.mimeType}`,
      `-metadata:s:t:${outputAttachmentIndex}`,`filename=${att.filename}`);
  }
  if([...plan.sourceStreams,...plan.externalTracks].some(t=>t.kind==='subtitle'))
    args.push('-avoid_negative_ts','disabled');
  args.push('-f','matroska','-y',outputPath);
  return Object.freeze(args);
}

export function auditV3BlankOutput(plan,streams){
  if(plan?.schema!=='v3-blank-target-plan-v1'||!Array.isArray(streams))
    throw Error('BLANK_AUDIT_INVALID');
  const expected=[
    ...plan.sourceStreams.map(s=>s.kind),
    ...plan.externalTracks.map(t=>t.kind),
    ...plan.attachments.map(()=> 'attachment'),
  ];
  const types=streams.map(s=>s.codec_type);
  const counts=type=>types.filter(t=>t===type).length;
  for(const type of ['video','audio','subtitle','attachment'])
    if(counts(type)!==expected.filter(t=>t===type).length)
      throw Error('BLANK_AUDIT_STREAM_COUNT_MISMATCH:'+type);
  if(types.some(type=>!['video','audio','subtitle','attachment'].includes(type)))
    throw Error('BLANK_AUDIT_UNEXPECTED_STREAM');
  // Never infer that ffprobe's flat metadata proves EBML UID, chapter, tag,
  // attachment payload or third-party decoder fidelity.
  return Object.freeze({
    state:'STREAM_COUNTS_VERIFIED',
    expectedStreamCount:expected.length,
    observedStreamCount:streams.length,
    sourceIntactClaim:false,
    attachmentPayloadVerified:false,
    chapterTagPreservationClaim:false,
  });
}
