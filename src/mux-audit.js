function normLanguage(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || 'und';
}

function normTitle(value) {
  return String(value || '');
}

function disposition(stream, key) {
  return Boolean(stream?.disposition?.[key]);
}

function pushMismatch(issues, label, expected, actual) {
  issues.push(`${label}：期望“${expected}”，实际“${actual}”`);
}

function compareTrack(issues, kind, index, expected, actual) {
  if (!actual) {
    issues.push(`${kind} #${index + 1} 缺失。`);
    return;
  }

  if (expected.codec && String(actual.codec_name || '').toLowerCase() !== String(expected.codec).toLowerCase()) {
    pushMismatch(issues, `${kind} #${index + 1} codec`, expected.codec, actual.codec_name || 'unknown');
  }

  const actualLanguage = normLanguage(actual.tags?.language);
  const expectedLanguage = normLanguage(expected.language);
  if (actualLanguage !== expectedLanguage) {
    pushMismatch(issues, `${kind} #${index + 1} language`, expectedLanguage, actualLanguage);
  }

  const actualTitle = normTitle(actual.tags?.title);
  const expectedTitle = normTitle(expected.title);
  if (actualTitle !== expectedTitle) {
    pushMismatch(issues, `${kind} #${index + 1} title`, expectedTitle || '(空)', actualTitle || '(空)');
  }

  const actualDefault = disposition(actual, 'default');
  if (actualDefault !== Boolean(expected.default)) {
    pushMismatch(issues, `${kind} #${index + 1} Default`, expected.default ? '1' : '0', actualDefault ? '1' : '0');
  }

  if (kind === '字幕') {
    const actualForced = disposition(actual, 'forced');
    if (actualForced !== Boolean(expected.forced)) {
      pushMismatch(issues, `${kind} #${index + 1} Forced`, expected.forced ? '1' : '0', actualForced ? '1' : '0');
    }
  }
}

export function auditMuxProbe(probe, expected) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const subtitles = streams.filter((stream) => stream.codec_type === 'subtitle');
  const attachments = streams.filter((stream) => stream.codec_type === 'attachment');
  const issues = [];

  if (videos.length < (expected.videoMin ?? 1)) {
    issues.push(`视频轨数量异常：至少应有 ${expected.videoMin ?? 1} 条，实际 ${videos.length} 条。`);
  }

  if (Array.isArray(expected.audio)) {
    if (audios.length !== expected.audio.length) {
      issues.push(`音频轨数量不一致：期望 ${expected.audio.length} 条，实际 ${audios.length} 条。`);
    }
    expected.audio.forEach((track, index) => compareTrack(issues, '音频', index, track, audios[index]));
  }

  if (Array.isArray(expected.subtitles)) {
    if (subtitles.length !== expected.subtitles.length) {
      issues.push(`字幕轨数量不一致：期望 ${expected.subtitles.length} 条，实际 ${subtitles.length} 条。`);
    }
    expected.subtitles.forEach((track, index) => compareTrack(issues, '字幕', index, track, subtitles[index]));
  }

  if (Number.isInteger(expected.attachmentCount) && attachments.length !== expected.attachmentCount) {
    issues.push(`附件数量不一致：期望 ${expected.attachmentCount} 个，实际 ${attachments.length} 个。`);
  }

  const actualFilenames = attachments
    .map((stream) => String(stream.tags?.filename || ''))
    .filter(Boolean);

  for (const filename of expected.newFontFilenames || []) {
    if (!actualFilenames.includes(filename)) {
      issues.push(`未在输出附件中找到新字体“${filename}”。`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      video: videos.length,
      audio: audios.length,
      subtitle: subtitles.length,
      attachment: attachments.length,
    },
  };
}
