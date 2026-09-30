export function normalizeTrackLanguage(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed || 'und';
}

export function dispositionValue(isDefault, isForced = false) {
  const values = [];
  if (isDefault) values.push('default');
  if (isForced) values.push('forced');
  return values.length ? values.join('+') : '0';
}

export function buildMuxCommand({
  mainInputPath,
  outputPath,
  sourceAudioCount = 0,
  originalAudioTracks = null,
  externalAudioTracks = [],
  newSubtitleTracks = [],
  originalSubtitleTracks = [],
  originalAttachments = [],
  preserveAllOriginalAttachments = false,
  fontAttachments = [],
}) {
  const args = ['-i', mainInputPath];

  for (const track of externalAudioTracks) {
    args.push('-i', track.path);
  }
  for (const track of newSubtitleTracks) {
    args.push('-i', track.path);
  }

  args.push('-map', '0:v?');

  if (Array.isArray(originalAudioTracks)) {
    for (const track of originalAudioTracks) args.push('-map', `0:${track.index}`);
  } else {
    args.push('-map', '0:a?');
  }

  for (const track of externalAudioTracks) {
    args.push('-map', `${track.inputIndex}:a:0`);
  }

  for (const track of newSubtitleTracks) {
    args.push('-map', `${track.inputIndex}:0`);
  }

  for (const track of originalSubtitleTracks) {
    args.push('-map', `0:${track.index}`);
  }

  if (preserveAllOriginalAttachments) {
    args.push('-map', '0:t?');
  } else {
    for (const attachment of originalAttachments) {
      args.push('-map', `0:${attachment.index}`);
    }
  }

  args.push('-map_metadata', '0', '-map_chapters', '0', '-c', 'copy');

  const mappedOriginalAudioCount = Array.isArray(originalAudioTracks)
    ? originalAudioTracks.length
    : sourceAudioCount;

  if (Array.isArray(originalAudioTracks)) {
    originalAudioTracks.forEach((track, outputIndex) => {
      args.push(
        `-metadata:s:a:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
        `-metadata:s:a:${outputIndex}`, `title=${track.title || ''}`,
        `-disposition:a:${outputIndex}`, dispositionValue(track.default, false),
      );
    });
  }

  externalAudioTracks.forEach((track, index) => {
    const outputIndex = mappedOriginalAudioCount + index;
    args.push(
      `-metadata:s:a:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:a:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:a:${outputIndex}`, dispositionValue(track.default, false),
    );
  });

  newSubtitleTracks.forEach((track, outputIndex) => {
    args.push(
      `-metadata:s:s:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:s:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:s:${outputIndex}`, dispositionValue(track.default, track.forced),
    );
  });

  originalSubtitleTracks.forEach((track, index) => {
    const outputIndex = newSubtitleTracks.length + index;
    args.push(
      `-metadata:s:s:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:s:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:s:${outputIndex}`, dispositionValue(track.default, track.forced),
    );
  });

  const originalAttachmentCount = preserveAllOriginalAttachments
    ? Number(fontAttachments.originalAttachmentCount || 0)
    : originalAttachments.length;

  fontAttachments.forEach((item, index) => {
    const attachmentIndex = originalAttachmentCount + index;
    args.push(
      '-attach', item.path,
      `-metadata:s:t:${attachmentIndex}`, `mimetype=${item.mimeType}`,
      `-metadata:s:t:${attachmentIndex}`, `filename=${item.filename}`,
    );
  });

  args.push(outputPath);
  return args;
}
