export function normalizeTrackLanguage(value) {
  const trimmed = String(value || '').trim().replace(/_/g, '-');
  if (!trimmed) return 'und';

  const parts = trimmed.split('-').filter(Boolean);
  if (parts.length === 1) return parts[0].toLowerCase();

  return parts.map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) {
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    }
    if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) {
      return part.toUpperCase();
    }
    return part.toLowerCase();
  }).join('-');
}

export function dispositionValue(isDefault, isForced = false, extra = {}) {
  const values = [];
  if (isDefault) values.push('default');
  if (isForced) values.push('forced');
  if (extra.original) values.push('original');
  if (extra.commentary) values.push('comment');
  if (extra.hearingImpaired) values.push('hearing_impaired');
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
  originalAttachmentCount = 0,
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
        `-disposition:a:${outputIndex}`, dispositionValue(track.default, false, track),
      );
    });
  }

  externalAudioTracks.forEach((track, index) => {
    const outputIndex = mappedOriginalAudioCount + index;
    args.push(
      `-metadata:s:a:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:a:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:a:${outputIndex}`, dispositionValue(track.default, false, track),
    );
  });

  newSubtitleTracks.forEach((track, outputIndex) => {
    args.push(
      `-metadata:s:s:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:s:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:s:${outputIndex}`, dispositionValue(track.default, track.forced, track),
    );
  });

  originalSubtitleTracks.forEach((track, index) => {
    const outputIndex = newSubtitleTracks.length + index;
    args.push(
      `-metadata:s:s:${outputIndex}`, `language=${normalizeTrackLanguage(track.language)}`,
      `-metadata:s:s:${outputIndex}`, `title=${track.title || ''}`,
      `-disposition:s:${outputIndex}`, dispositionValue(track.default, track.forced, track),
    );
  });

  const mappedOriginalAttachmentCount = preserveAllOriginalAttachments
    ? Number(originalAttachmentCount || 0)
    : originalAttachments.length;

  fontAttachments.forEach((item, index) => {
    const attachmentIndex = mappedOriginalAttachmentCount + index;
    args.push(
      '-attach', item.path,
      `-metadata:s:t:${attachmentIndex}`, `mimetype=${item.mimeType}`,
      `-metadata:s:t:${attachmentIndex}`, `filename=${item.filename}`,
    );
  });

  args.push(outputPath);
  return args;
}
