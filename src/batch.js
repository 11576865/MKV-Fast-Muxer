import { isSupportedSubtitleFile, subtitleExtension } from './subtitle-format.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v']);

function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function isSupportedBatchVideo(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return VIDEO_EXTENSIONS.has(extension(name));
}

export function stem(name = '') {
  return String(name)
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
}

function episodeToken(value) {
  const normalized = stem(value);
  const se = normalized.match(/(?:^|[^a-z0-9])(s\d{1,2}e\d{1,3})(?:[^a-z0-9]|$)/i);
  if (se) return se[1].toLowerCase();
  const ep = normalized.match(/(?:^|[^a-z0-9])(?:ep?|episode)[ ._-]?(\d{1,4})(?:[^0-9]|$)/i);
  if (ep) return `e${String(Number(ep[1])).padStart(3, '0')}`;
  return '';
}

function scorePair(video, subtitle) {
  const v = stem(video.name);
  const s = stem(subtitle.name);
  if (v === s) return 1000;
  if (s.startsWith(`${v}.`) || s.startsWith(`${v}-`) || s.startsWith(`${v}_`) || s.startsWith(`${v} `)) {
    return 900 + Math.min(v.length, 90);
  }

  const vt = episodeToken(video.name);
  const st = episodeToken(subtitle.name);
  if (vt && vt === st) return 700;

  const compactV = v.replace(/[ ._-]+/g, '');
  const compactS = s.replace(/[ ._-]+/g, '');
  if (compactS.startsWith(compactV) || compactV.startsWith(compactS)) return 500;
  return -1;
}

export function buildBatchJobs(videoFiles = [], subtitleFiles = []) {
  const videos = Array.from(videoFiles).filter(isSupportedBatchVideo);
  const subtitles = Array.from(subtitleFiles).filter(isSupportedSubtitleFile);
  const assignments = new Map(videos.map((video) => [video, []]));
  const unmatchedSubtitles = [];

  for (const subtitle of subtitles) {
    let best = null;
    let bestScore = -1;
    for (const video of videos) {
      const score = scorePair(video, subtitle);
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0) assignments.get(best).push(subtitle);
    else unmatchedSubtitles.push(subtitle);
  }

  const jobs = videos
    .map((video) => ({
      video,
      subtitles: assignments.get(video).sort((a, b) => a.name.localeCompare(b.name)),
      outputName: `${video.name.replace(/\.[^.]+$/, '')}.mkv`,
    }))
    .filter((job) => job.subtitles.length);

  const unmatchedVideos = videos.filter((video) => !(assignments.get(video)?.length));
  return {
    jobs,
    unmatchedVideos,
    unmatchedSubtitles,
    ignoredVideos: Array.from(videoFiles).filter((file) => !isSupportedBatchVideo(file)),
    ignoredSubtitles: Array.from(subtitleFiles).filter((file) => !isSupportedSubtitleFile(file)),
  };
}

export function batchSubtitleSummary(job) {
  const counts = new Map();
  for (const file of job?.subtitles || []) {
    const key = subtitleExtension(file.name).replace(/^\./, '').toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(' · ');
}
