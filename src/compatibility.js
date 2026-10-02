import {
  COMPATIBILITY_EVIDENCE_STATUS,
  compatibilityEvidenceFor,
} from './compatibility-evidence.js';

export const COMPATIBILITY_STATE = Object.freeze({
  DIRECT_COPY: 'DIRECT_COPY',
  COMPATIBILITY_WARNING: 'COMPATIBILITY_WARNING',
  CONVERSION_REQUIRED: 'CONVERSION_REQUIRED',
  UNSUPPORTED: 'UNSUPPORTED',
  UNVERIFIED: 'UNVERIFIED',
});

const DIRECT_SUBTITLE_FORMATS = new Set([
  'ass',
  'ssa',
  'srt',
  'pgs',
  'vobsub',
]);

const ASS_LIKE_SOURCE_CODECS = new Set([
  'ass',
  'ssa',
  'substation_alpha',
]);

const STATE_PRIORITY = Object.freeze({
  [COMPATIBILITY_STATE.DIRECT_COPY]: 0,
  [COMPATIBILITY_STATE.COMPATIBILITY_WARNING]: 1,
  [COMPATIBILITY_STATE.UNVERIFIED]: 2,
  [COMPATIBILITY_STATE.CONVERSION_REQUIRED]: 3,
  [COMPATIBILITY_STATE.UNSUPPORTED]: 4,
});

function normalizedCodec(value) {
  return String(value || '').trim().toLowerCase();
}

function issue(state, dimension, code, message, extra = {}) {
  return {
    state,
    dimension,
    code,
    message,
    ...extra,
  };
}

function mostSignificantState(issues) {
  if (!issues.length) return COMPATIBILITY_STATE.DIRECT_COPY;
  return issues.reduce((current, item) => (
    (STATE_PRIORITY[item.state] || 0) > (STATE_PRIORITY[current] || 0)
      ? item.state
      : current
  ), COMPATIBILITY_STATE.DIRECT_COPY);
}

function assessCodecList(streams, kind, issues, evidence, origin) {
  for (const [index, stream] of Array.from(streams || []).entries()) {
    const codec = normalizedCodec(stream?.codec_name || stream?.codec);
    if (!codec) {
      issues.push(issue(
        COMPATIBILITY_STATE.UNVERIFIED,
        `${kind}-codec`,
        'codec-missing',
        `${kind === 'video' ? '视频' : '音频'} #${index + 1} 没有可验证的 codec 名称；将由实际 FFmpeg mux 结果验证。`,
        { index, codec: '', origin },
      ));
      evidence.push({
        dimension: kind,
        origin,
        index,
        codec: '',
        evidenceId: null,
        status: 'missing-codec',
      });
      continue;
    }

    const record = compatibilityEvidenceFor(kind, codec);
    evidence.push({
      dimension: kind,
      origin,
      index,
      codec,
      evidenceId: record?.id || null,
      status: record?.status || 'unrecorded',
      fixture: record?.fixture || null,
    });

    if (!record) {
      issues.push(issue(
        COMPATIBILITY_STATE.UNVERIFIED,
        `${kind}-codec`,
        'codec-no-evidence-record',
        `${kind === 'video' ? '视频' : '音频'} codec “${codec}”没有当前运行时的 Matroska Stream Copy 证据记录；不会自动转码，将交给实际 mux 验证。`,
        { index, codec, origin },
      ));
      continue;
    }

    if (record.status !== COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E) {
      issues.push(issue(
        COMPATIBILITY_STATE.UNVERIFIED,
        `${kind}-codec`,
        'codec-not-e2e-verified',
        `${kind === 'video' ? '视频' : '音频'} codec “${codec}”目前只有 ${record.status} 证据，尚未由本项目浏览器 E2E + post-mux audit 验证；不会自动转码，将交给实际 mux 验证。`,
        {
          index,
          codec,
          origin,
          evidenceId: record.id,
          evidenceStatus: record.status,
        },
      ));
    }
  }
}

function activeAssLikeSubtitle({
  newSubtitles = [],
  sourceSubtitleStreams = [],
}) {
  if (newSubtitles.some((track) => track?.format?.assLike || ['ass', 'ssa'].includes(track?.format?.id))) {
    return true;
  }

  return sourceSubtitleStreams.some((stream) =>
    ASS_LIKE_SOURCE_CODECS.has(normalizedCodec(stream?.codec_name || stream?.codec))
  );
}

export function resolveMuxCompatibility({
  targetContainer = 'matroska',
  videoStreams = [],
  sourceAudioStreams = [],
  externalAudioTracks = [],
  newSubtitles = [],
  sourceSubtitleStreams = [],
  fontAttachments = [],
  playbackProfile = null,
} = {}) {
  const issues = [];
  const evidence = [];
  const normalizedTarget = String(targetContainer || '').toLowerCase();

  if (!['matroska', 'mkv'].includes(normalizedTarget)) {
    issues.push(issue(
      COMPATIBILITY_STATE.UNSUPPORTED,
      'target-container',
      'unsupported-target-container',
      `当前兼容性解析器只支持 Matroska / MKV 输出，收到“${targetContainer || 'unknown'}”。`,
    ));
  }

  if (!Array.from(videoStreams || []).length) {
    issues.push(issue(
      COMPATIBILITY_STATE.UNSUPPORTED,
      'video',
      'missing-video-stream',
      '没有可用视频轨，不能按当前视频封装工作流执行。',
    ));
  } else {
    assessCodecList(videoStreams, 'video', issues, evidence, 'source-video');
  }

  assessCodecList(sourceAudioStreams, 'audio', issues, evidence, 'source-audio');
  assessCodecList(
    Array.from(externalAudioTracks || []).map((track) => ({
      codec_name: track?.identity?.codec || track?.codec,
    })),
    'audio',
    issues,
    evidence,
    'external-audio',
  );

  for (const [index, track] of Array.from(newSubtitles || []).entries()) {
    const formatId = String(track?.format?.id || '').toLowerCase();

    if (formatId === 'webvtt') {
      issues.push(issue(
        COMPATIBILITY_STATE.CONVERSION_REQUIRED,
        'subtitle',
        'webvtt-to-subrip',
        `字幕 #${index + 1} WebVTT 将转换为 SubRip；该转换只作用于字幕流，视频和音频保持 Stream Copy。`,
        {
          index,
          from: 'webvtt',
          to: 'subrip',
          builtIn: true,
        },
      ));
      continue;
    }

    if (!DIRECT_SUBTITLE_FORMATS.has(formatId)) {
      issues.push(issue(
        COMPATIBILITY_STATE.UNSUPPORTED,
        'subtitle',
        'unsupported-subtitle-format',
        `字幕 #${index + 1} 的格式“${formatId || 'unknown'}”没有已定义的 MKV 写入策略。`,
        { index, formatId },
      ));
    }
  }

  if (
    Array.from(fontAttachments || []).length &&
    !activeAssLikeSubtitle({ newSubtitles, sourceSubtitleStreams })
  ) {
    issues.push(issue(
      COMPATIBILITY_STATE.COMPATIBILITY_WARNING,
      'font-relevance',
      'font-without-ass-like-subtitle',
      '已选择字体附件，但当前活动字幕中没有 ASS / SSA；字体仍可作为 MKV attachment 写入，但不会改变 SRT / WebVTT / PGS / VobSub 的渲染。',
    ));
  }

  const state = mostSignificantState(issues);
  const counts = Object.values(COMPATIBILITY_STATE).reduce((acc, key) => {
    acc[key] = issues.filter((item) => item.state === key).length;
    return acc;
  }, {});

  return {
    targetContainer: 'matroska',
    state,
    issues,
    counts,
    evidence,
    mediaPolicy: {
      video: 'stream-copy-only',
      audio: 'stream-copy-only',
      silentTranscode: false,
      subtitleConversions: issues
        .filter((item) => item.state === COMPATIBILITY_STATE.CONVERSION_REQUIRED)
        .map((item) => ({
          code: item.code,
          from: item.from,
          to: item.to,
          builtIn: Boolean(item.builtIn),
        })),
    },
    playback: playbackProfile
      ? {
          profile: playbackProfile,
          verified: false,
          note: '当前解析只证明容器 / FFmpeg 路径；具体播放器能力需要独立验证。',
        }
      : {
          profile: null,
          verified: false,
          note: '未指定目标播放器；当前结果不等同于播放器兼容性保证。',
        },
  };
}

export function compatibilityPlanMessages({
  newSubtitles = [],
  fontCount = 0,
  hasKnownAssLikeSource = false,
  sourceSubtitleKnowledge = 'known',
} = {}) {
  const messages = [];
  const webvttCount = Array.from(newSubtitles || [])
    .filter((track) => track?.format?.id === 'webvtt')
    .length;

  if (webvttCount) {
    messages.push(
      `兼容处理：${webvttCount} 条 WebVTT 将转换为 SubRip；视频 / 音频保持 Stream Copy。`
    );
  }

  const hasAssLikeNew = Array.from(newSubtitles || [])
    .some((track) => track?.format?.assLike || ['ass', 'ssa'].includes(track?.format?.id));

  if (
    fontCount > 0 &&
    !hasAssLikeNew &&
    !hasKnownAssLikeSource &&
    sourceSubtitleKnowledge !== 'unknown'
  ) {
    messages.push(
      '字体附件已选择，但当前可见计划中没有 ASS / SSA；字体不会改变普通文本或图形字幕的渲染。'
    );
  }

  return messages;
}

export function summarizeCompatibility(result) {
  if (!result) return 'UNVERIFIED';
  const parts = [result.state];
  const conversionCount = result.counts?.[COMPATIBILITY_STATE.CONVERSION_REQUIRED] || 0;
  const warningCount = result.counts?.[COMPATIBILITY_STATE.COMPATIBILITY_WARNING] || 0;
  const unverifiedCount = result.counts?.[COMPATIBILITY_STATE.UNVERIFIED] || 0;
  if (conversionCount) parts.push(`${conversionCount} conversion`);
  if (warningCount) parts.push(`${warningCount} warning`);
  if (unverifiedCount) parts.push(`${unverifiedCount} unverified`);
  return parts.join(' · ');
}
