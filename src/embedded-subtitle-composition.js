import {sniffSubtitleBytes} from './subtitle-format.js';

// This is a bounded bridge to the EXISTING external subtitle execution path.
// ASS/SSA is not admitted until its source-font closure can be delivered too.
export const MAX_EMBEDDED_SUBRIP_BYTES = 16 * 1024 * 1024;

export function secondarySubripEligibility(stream, entries = [], sourceFile = null) {
  if (!stream || stream.codec_type !== 'subtitle' || stream.codec_name !== 'subrip' ||
      !Number.isSafeInteger(stream.index) || stream.index < 0)
    return {allowed:false, reason:'目前仅能将实际扫描到的 SubRip（SRT）轨道直接加入拟输出。'};
  if (entries.some(e => e.embeddedOrigin?.sourceFile === sourceFile &&
      e.embeddedOrigin.streamIndex === stream.index &&
      e.embeddedOrigin.kind === 'subtitle'))
    return {allowed:false, reason:'该来源字幕轨已加入拟输出。'};
  return {allowed:true, reason:''};
}

export function createSecondarySubripEntry({
  sourceEntry, stream, bytes, existingEntries = [],
  createFile = (parts, name, options) => new File(parts, name, options),
}) {
  if (sourceEntry?.kind !== 'container' || !sourceEntry.file || !sourceEntry.key)
    throw Error('CROSS_SOURCE_SUBTITLE_SOURCE_INVALID');
  const eligible = secondarySubripEligibility(stream, existingEntries, sourceEntry.file);
  if (!eligible.allowed) throw Error('CROSS_SOURCE_SUBTITLE_NOT_ELIGIBLE: ' + eligible.reason);
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength ||
      bytes.byteLength > MAX_EMBEDDED_SUBRIP_BYTES)
    throw Error('CROSS_SOURCE_SUBTITLE_SIZE_OUT_OF_BOUNDS');
  const detected = sniffSubtitleBytes(bytes.subarray(0, 256 * 1024));
  if (detected.id !== 'srt' || detected.confidence !== 'high')
    throw Error('CROSS_SOURCE_SUBTITLE_CONTENT_NOT_SUBRIP');
  const stem = String(sourceEntry.file.name)
    .replace(/\.[^.]*$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .slice(0, 80) || 'source';
  const language = String(stream.tags?.language || 'und').toLowerCase();
  const safeLanguage = /^[a-z]{2,3}$/.test(language) ? language : 'und';
  const name = stem + '.stream-' + stream.index + '.' + safeLanguage + '.srt';
  const file = createFile([bytes], name, {
    type:'application/x-subrip', lastModified:sourceEntry.file.lastModified || Date.now(),
  });
  if (!file?.slice || file.name !== name || file.size !== bytes.byteLength)
    throw Error('CROSS_SOURCE_SUBTITLE_FILE_BINDING_FAILED');
  return {
    key:'embedded-subtitle:' + sourceEntry.key + ':' + stream.index,
    kind:'subtitle', status:'recognized', file,
    label:'内封 SubRip 字幕', evidence:'real-source-stream-copy',
    detail:'来自 ' + sourceEntry.file.name + ' 的原字幕轨 #' + stream.index +
      '。未下载中转文件；实际输出时间轴仍需成品检查。',
    embeddedOrigin:Object.freeze({
      kind:'subtitle', sourceFile:sourceEntry.file, sourceKey:sourceEntry.key,
      sourceName:sourceEntry.file.name, streamIndex:stream.index,
      codec:'subrip', title:String(stream.tags?.title || ''),
      language:String(stream.tags?.language || 'und'),
    }),
  };
}

export const pruneSecondarySubtitlesForSource = (entries, sourceFile) =>
  entries.filter(entry => !(entry.embeddedOrigin?.kind === 'subtitle' &&
    entry.embeddedOrigin.sourceFile === sourceFile));
