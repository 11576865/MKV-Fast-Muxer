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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function pushMismatch(issues, label, expected, actual) {
  issues.push(`${label}：期望“${expected}”，实际“${actual}”`);
}

function compareTrack(issues, kind, index, expected, actual) {
  if (!actual) {
    issues.push(`${kind} #${index + 1} 缺失。`);
    return;
  }

  if (hasOwn(expected, 'codec') && expected.codec) {
    const actualCodec = String(actual.codec_name || '').toLowerCase();
    const expectedCodec = String(expected.codec).toLowerCase();
    if (actualCodec !== expectedCodec) {
      pushMismatch(issues, `${kind} #${index + 1} codec`, expected.codec, actual.codec_name || 'unknown');
    }
  }

  if (hasOwn(expected, 'language')) {
    const actualLanguage = normLanguage(actual.tags?.language);
    const expectedLanguage = normLanguage(expected.language);
    if (actualLanguage !== expectedLanguage) {
      pushMismatch(issues, `${kind} #${index + 1} language`, expectedLanguage, actualLanguage);
    }
  }

  if (hasOwn(expected, 'title')) {
    const actualTitle = normTitle(actual.tags?.title);
    const expectedTitle = normTitle(expected.title);
    if (actualTitle !== expectedTitle) {
      pushMismatch(issues, `${kind} #${index + 1} title`, expectedTitle || '(空)', actualTitle || '(空)');
    }
  }

  if (hasOwn(expected, 'default')) {
    const actualDefault = disposition(actual, 'default');
    if (actualDefault !== Boolean(expected.default)) {
      pushMismatch(issues, `${kind} #${index + 1} Default`, expected.default ? '1' : '0', actualDefault ? '1' : '0');
    }
  }

  if (kind === '字幕' && hasOwn(expected, 'forced')) {
    const actualForced = disposition(actual, 'forced');
    if (actualForced !== Boolean(expected.forced)) {
      pushMismatch(issues, `${kind} #${index + 1} Forced`, expected.forced ? '1' : '0', actualForced ? '1' : '0');
    }
  }

  for (const [field, dispositionKey, label] of [
    ['original', 'original', 'Original'],
    ['commentary', 'comment', 'Commentary'],
    ['hearingImpaired', 'hearing_impaired', 'Hearing impaired'],
  ]) {
    if (!hasOwn(expected, field)) continue;
    const actualValue = disposition(actual, dispositionKey);
    if (actualValue !== Boolean(expected[field])) {
      pushMismatch(issues, `${kind} #${index + 1} ${label}`, expected[field] ? '1' : '0', actualValue ? '1' : '0');
    }
  }
}

function compareTrackGroup(issues, kind, expected, actual) {
  if (!Array.isArray(expected)) return;
  if (actual.length !== expected.length) {
    issues.push(`${kind}轨数量不一致：期望 ${expected.length} 条，实际 ${actual.length} 条。`);
  }
  expected.forEach((track, index) => compareTrack(issues, kind, index, track, actual[index]));
}

function missingFromMultiset(expected, actual) {
  const counts = new Map();
  for (const value of actual) counts.set(value, (counts.get(value) || 0) + 1);

  const missing = [];
  for (const value of expected) {
    const remaining = counts.get(value) || 0;
    if (remaining > 0) counts.set(value, remaining - 1);
    else missing.push(value);
  }
  return missing;
}

export function auditMuxProbe(probe, expected) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const chapters = Array.isArray(probe?.chapters) ? probe.chapters : [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const subtitles = streams.filter((stream) => stream.codec_type === 'subtitle');
  const attachments = streams.filter((stream) => stream.codec_type === 'attachment');
  const issues = [];

  if (Array.isArray(expected.video)) {
    compareTrackGroup(issues, '视频', expected.video, videos);
  } else if (videos.length < (expected.videoMin ?? 1)) {
    issues.push(`视频轨数量异常：至少应有 ${expected.videoMin ?? 1} 条，实际 ${videos.length} 条。`);
  }

  compareTrackGroup(issues, '音频', expected.audio, audios);
  compareTrackGroup(issues, '字幕', expected.subtitles, subtitles);

  if (Number.isInteger(expected.chapterCount) && chapters.length !== expected.chapterCount) {
    issues.push(`章节数量不一致：期望 ${expected.chapterCount} 个，实际 ${chapters.length} 个。`);
  }

  if (hasOwn(expected, 'formatTitle')) {
    const actualTitle = normTitle(probe?.format?.tags?.title);
    const expectedTitle = normTitle(expected.formatTitle);
    if (actualTitle !== expectedTitle) {
      pushMismatch(issues, '容器 title', expectedTitle || '(空)', actualTitle || '(空)');
    }
  }

  if (Number.isInteger(expected.attachmentCount) && attachments.length !== expected.attachmentCount) {
    issues.push(`附件数量不一致：期望 ${expected.attachmentCount} 个，实际 ${attachments.length} 个。`);
  }

  const actualFilenames = attachments
    .map((stream) => String(stream.tags?.filename || ''))
    .filter(Boolean);

  for (const filename of missingFromMultiset(
    (expected.attachmentFilenames || []).filter(Boolean),
    actualFilenames,
  )) {
    issues.push(`未在输出附件中找到应保留的附件“${filename}”。`);
  }

  for (const filename of missingFromMultiset(
    (expected.newFontFilenames || []).filter(Boolean),
    actualFilenames,
  )) {
    issues.push(`未在输出附件中找到新字体“${filename}”。`);
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      video: videos.length,
      audio: audios.length,
      subtitle: subtitles.length,
      attachment: attachments.length,
      chapter: chapters.length,
    },
  };
}
