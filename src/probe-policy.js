export const PROBE_STREAM_ENTRIES = [
  'stream=index,codec_type,codec_name',
  'stream_tags=language,title,filename,mimetype',
  'stream_disposition=default,forced,original,comment,hearing_impaired',
].join(':');

export const PROBE_CHAPTER_ENTRIES = [
  'chapter=id,start_time,end_time',
  'chapter_tags=title,language',
].join(':');

export const PROBE_FORMAT_ENTRIES = [
  'format=format_name,duration',
  'format_tags',
].join(':');

export const PROBE_ENTRIES = [
  PROBE_STREAM_ENTRIES,
  PROBE_CHAPTER_ENTRIES,
  PROBE_FORMAT_ENTRIES,
].join(':');

export function buildProbeArgs(inputPath, outputPath, { decodeStreams = false } = {}) {
  const args = ['-v', 'error'];

  // The ffprobe build shipped with @ffmpeg/core does not expose
  // -no_find_stream_info. Passing that flag aborts the wasm worker before a
  // fallback probe can run. Keep the probe metadata-only through
  // -show_entries instead of relying on an unsupported private/boolean flag.
  // decodeStreams is retained in the API for compatibility and diagnostics.
  void decodeStreams;

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

/**
 * A syntactically valid ffprobe JSON envelope can have no observed streams
 * (including after a nonzero ffprobe return code). It is not evidence that
 * a valid media source has zero tracks. Keep the source-track editor detached
 * rather than converting missing observations into approved empty plans.
 *
 * Does not affect the separate bounded, read-only Matroska attachment reader.
 */
export function requireObservedSourceStreams(probe) {
  if (!Array.isArray(probe?.streams) || probe.streams.length===0) {
    throw new Error(
      'SOURCE_PROBE_EMPTY_STREAMS: ffprobe 没有确认任何实际轨道，' +
      '不能把空流清单当作已完成的来源扫描。请手动重试；' +
      '仅附件结构可在独立只读检查器中查看。'
    );
  }
  return probe;
}
