const nativeFormats=Object.freeze({
 ass:['ass','.ass','text/x-ssa'],ssa:['ass','.ass','text/x-ssa'],subrip:['srt','.srt','application/x-subrip'],
 flac:['flac','.flac','audio/flac'],aac:['adts','.aac','audio/aac'],mp3:['mp3','.mp3','audio/mpeg'],
 ac3:['ac3','.ac3','audio/ac3'],eac3:['eac3','.eac3','audio/eac3'],hdmv_pgs_subtitle:['sup','.sup','application/octet-stream'],
});
const observation=s=>JSON.stringify({index:s.index,type:s.codec_type,codec:s.codec_name,
 rate:s.sample_rate,channels:s.channels,title:s.tags?.title||'',language:s.tags?.language||''});
export function planOriginalTrackExtraction(source,stream,{format='matroska'}={}){
 if(!source||!stream||!Number.isSafeInteger(stream.index)||stream.index<0||
   !['audio','subtitle'].includes(stream.codec_type)||!stream.codec_name||stream.codec_name==='unknown')
  throw Error('只能提取实际扫描到的音频或字幕轨道');
 if(!['matroska','native'].includes(format))throw Error('未知提取格式');
 const native=nativeFormats[stream.codec_name];
 if(format==='native'&&!native)throw Error('此编码暂不提供原生格式；可使用单轨 Matroska');
 const [muxer,extension,mime]=format==='native'?native:
  ['matroska',stream.codec_type==='audio'?'.mka':'.mks',stream.codec_type==='audio'?'audio/x-matroska':'application/x-matroska'];
 const stem=String(source.name||'source').replace(/\.[^.]*$/,'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').replace(/^\.+/,'').slice(0,100)||'source';
 return Object.freeze({source,stream,observed:observation(stream),format,muxer,extension,mime,
  outputName:'track-'+stem+'-'+stream.index+extension,
  codec:stream.codec_name,kind:stream.codec_type,index:stream.index,
  title:String(stream.tags?.title||''),language:String(stream.tags?.language||''),
  sampleRate:stream.sample_rate,channels:stream.channels,
  nativeAvailable:Boolean(native),timelinePreserved:format==='matroska'});
}
export function originalTrackExtractionCurrent(plan,source,streams){
 return Boolean(plan&&plan.source===source&&streams?.find(s=>s.index===plan.index)===plan.stream&&observation(plan.stream)===plan.observed);
}
export function buildTrackExtractionCommand(plan,input,output){
 if(!plan?.source||!input||!output)throw Error('提取计划或输入输出路径无效');
 return ['-hide_banner','-loglevel','error','-nostdin','-y','-copyts','-i',input,
  '-map','0:'+plan.index,'-c','copy','-map_metadata','-1','-map_metadata:s:0','-1','-map_chapters','-1',
  ...(plan.format==='matroska'?['-metadata:s:0','title='+plan.title,'-metadata:s:0','language='+(plan.language||'und')]:[]),
  '-avoid_negative_ts','disabled','-f',plan.muxer,output];
}
export function auditExtractedOriginalTrack(plan,probe){
 const issues=[],streams=probe?.streams||[],track=streams[0];
 if(streams.length!==1||track?.codec_type!==plan.kind||track?.codec_name!==plan.codec)issues.push('提取结果不是同编码的单一原轨道');
 if(probe?.chapters?.length)issues.push('提取结果意外包含章节');
 if(plan.kind==='audio'&&track){
  if(plan.sampleRate&&String(track.sample_rate)!==String(plan.sampleRate))issues.push('音频采样率改变');
  if(plan.channels&&track.channels!==plan.channels)issues.push('音频声道数改变');
 }
 if(plan.format==='matroska'&&track){
  if(plan.title&&track.tags?.title!==plan.title)issues.push('原轨道标题未保留');
  if(plan.language&&track.tags?.language!==plan.language)issues.push('原轨道语言未保留');
 }
 return Object.freeze({ok:issues.length===0,issues:Object.freeze(issues),scope:'single-stream codec/parameters/metadata readback',packetEquivalence:'not-verified-in-browser'});
}
