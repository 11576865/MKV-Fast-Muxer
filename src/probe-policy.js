export const PROBE_STREAM_ENTRIES = [
  'stream=index,codec_type,codec_name',
  'stream_tags=language,title,filename',
  'stream_disposition=default,forced',
].join(':');

export function buildProbeArgs(inputPath, outputPath, { decodeStreams = false } = {}) {
  const args = ['-v', 'error'];

  // ffprobe normally calls avformat_find_stream_info(), which may open and
  // decode video streams merely to fill fields that this app never consumes.
  // That is particularly fragile for AV1 in ffmpeg.wasm. Container metadata is
  // sufficient for track selection, attachment counting and post-mux audit.
  if (!decodeStreams) args.push('-no_find_stream_info');

  args.push(
    '-show_streams',
    '-show_entries', PROBE_STREAM_ENTRIES,
    '-of', 'json',
    inputPath,
    '-o', outputPath,
  );
  return args;
}
