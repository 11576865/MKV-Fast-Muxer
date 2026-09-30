import {
  collectSubtitleInputs,
  subtitleExtension,
} from './subtitle-format.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v']);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc']);

function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function isSupportedBatchVideo(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return VIDEO_EXTENSIONS.has(extension(name));
}

export function isSupportedBatchFont(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return FONT_EXTENSIONS.has(extension(name));
}

export function fileIdentity(file) {
  if (!file) return '';
  const path = String(file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
  return `${path}|${file.size || 0}|${file.lastModified || 0}`;
}

export function mergeFileSelections(...groups) {
  const seen = new Set();
  const result = [];
  for (const group of groups) {
    for (const file of Array.from(group || [])) {
      const key = fileIdentity(file);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(file);
    }
  }
  return result;
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
  const bracket = normalized.match(/(?:^|[^0-9])(\d{1,4})(?:v\d+)?(?:[^0-9]|$)/i);
  return bracket ? `n${String(Number(bracket[1])).padStart(4, '0')}` : '';
}

function scorePair(video, subtitleFile) {
  const v = stem(video.name);
  const s = stem(subtitleFile.name);
  if (v === s) return 1000;
  if (s.startsWith(`${v}.`) || s.startsWith(`${v}-`) || s.startsWith(`${v}_`) || s.startsWith(`${v} `)) {
    return 900 + Math.min(v.length, 90);
  }

  const vt = episodeToken(video.name);
  const st = episodeToken(subtitleFile.name);
  if (vt && vt === st) return 700;

  const compactV = v.replace(/[ ._-]+/g, '');
  const compactS = s.replace(/[ ._-]+/g, '');
  if (compactS.startsWith(compactV) || compactV.startsWith(compactS)) return 500;
  return -1;
}

export function buildBatchJobs(videoFiles = [], subtitleFiles = []) {
  const sourceVideos = Array.from(videoFiles || []);
  const videos = sourceVideos.filter(isSupportedBatchVideo);
  const collected = collectSubtitleInputs(subtitleFiles);
  const subtitleTracks = collected.tracks;
  const assignments = new Map(videos.map((video) => [video, []]));
  const unmatchedSubtitleTracks = [];

  for (const track of subtitleTracks) {
    let best = null;
    let bestScore = -1;
    for (const video of videos) {
      const score = scorePair(video, track.file);
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0) assignments.get(best).push(track);
    else unmatchedSubtitleTracks.push(track);
  }

  const jobs = videos
    .map((video) => {
      const tracks = assignments.get(video).sort((a, b) => a.file.name.localeCompare(b.file.name));
      const subtitleInputFiles = [];
      for (const track of tracks) {
        subtitleInputFiles.push(track.file);
        if (track.sidecarFile) subtitleInputFiles.push(track.sidecarFile);
      }
      return {
        video,
        subtitleTracks: tracks,
        subtitles: tracks.map((track) => track.file),
        subtitleInputFiles,
        outputName: `${video.name.replace(/\.[^.]+$/, '')}.mkv`,
      };
    })
    .filter((job) => job.subtitleTracks.length);

  const unmatchedVideos = videos.filter((video) => !(assignments.get(video)?.length));
  return {
    jobs,
    unmatchedVideos,
    unmatchedSubtitleTracks,
    unmatchedSubtitles: unmatchedSubtitleTracks.map((track) => track.file),
    orphanSidecars: collected.orphanSidecars,
    invalidSubtitles: collected.invalid,
    ignoredVideos: sourceVideos.filter((file) => !isSupportedBatchVideo(file)),
  };
}

export function collectBatchFonts(files = []) {
  return Array.from(files || []).filter(isSupportedBatchFont);
}

export function batchSubtitleSummary(job) {
  const counts = new Map();
  const tracks = job?.subtitleTracks || (job?.subtitles || []).map((file) => ({
    file,
    format: null,
  }));
  for (const track of tracks) {
    const key = track.format?.label || subtitleExtension(track.file?.name).replace(/^\./, '').toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(' · ');
}
