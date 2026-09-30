export const PROBE_STREAM_ENTRIES = [
  'stream=index,codec_type,codec_name',
  'stream_tags=language,title,filename,mimetype',
  'stream_disposition=default,forced',
].join(':');

export const PROBE_CHAPTER_ENTRIES = [
  'chapter=id,start_time,end_time',
  'chapter_tags=title,language',
].join(':');

export const PROBE_FORMAT_ENTRIES = [
  'format=format_name,duration',
  'format_tags=title',
].join(':');

export const PROBE_ENTRIES = [
  PROBE_STREAM_ENTRIES,
  PROBE_CHAPTER_ENTRIES,
  PROBE_FORMAT_ENTRIES,
].join(':');

export function buildProbeArgs(inputPath, outputPath, { decodeStreams = false } = {}) {
  const args = ['-v', 'error'];

  if (!decodeStreams) args.push('-no_find_stream_info');

  args.push(
    '-show_streams',
    '-show_chapters',
    '-show_format',
    '-show_entries', PROBE_ENTRIES,
    '-of', 'json',
    inputPath,
    '-o', outputPath,
  );
  return args;
}
