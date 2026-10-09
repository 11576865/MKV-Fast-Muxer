import {
  collectSubtitleInputs,
  subtitleExtension,
} from './subtitle-format.js';
import {
  identityMismatchMessage,
  isSupportedVideoIdentity,
  sniffFileContainer,
  sniffedVideoIdentity,
} from './media-identity.js';
import {
  fontIdentityMismatchMessage,
  identifyFontFile,
  isSupportedFontIdentity,
} from './font-identity.js';

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

async function mapWithConcurrency(items, limit, worker) {
  const source = Array.from(items || []);
  const results = new Array(source.length);
  let cursor = 0;

  async function consume() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(source[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), source.length) },
    () => consume()
  );
  await Promise.all(workers);
  return results;
}

export async function identifyBatchVideos(
  files = [],
  {
    sniff = sniffFileContainer,
    concurrency = 8,
    cache = null,
  } = {}
) {
  const source = Array.from(files || []);

  const entries = await mapWithConcurrency(source, concurrency, async (file) => {
    const key = fileIdentity(file);
    let pending = cache?.get(key);

    if (!pending) {
      pending = Promise.resolve()
        .then(() => sniff(file))
        .then((sniffed) => sniffedVideoIdentity(file, sniffed))
        .catch((error) => ({
          ...sniffedVideoIdentity(file, { container: 'unknown', evidence: 'read-error' }),
          inspectionError: error?.message || String(error),
        }));
      cache?.set(key, pending);
    }

    const identity = await pending;
    return {
      file,
      identity,
      supported: isSupportedVideoIdentity(identity),
      mismatch: identityMismatchMessage(identity),
    };
  });

  return {
    recognized: entries.filter((entry) => entry.supported),
    ignored: entries.filter((entry) => !entry.supported),
  };
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

export function findBatchOutputNameCollisions(jobs = []) {
  const byName = new Map();
  for (const job of jobs) {
    // Case/Unicode variants can name the same output on common file systems.
    const key = String(job.outputName || '').normalize('NFKC').toLocaleLowerCase('en-US');
    const entries = byName.get(key) || [];
    entries.push(job);
    byName.set(key, entries);
  }
  return [...byName.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => ({
      outputName: entries[0].outputName,
      videos: entries.map((job) => job.video),
    }));
}

export function buildBatchJobsFromCollected(videoFiles = [], collected = {}) {
  const videos = Array.from(videoFiles || []);
  const subtitleTracks = Array.from(collected.tracks || []);
  const assignments = new Map(videos.map((video) => [video, []]));
  const unmatchedSubtitleTracks = [];
  const ambiguousPairings = [];

  for (const track of subtitleTracks) {
    let bestScore = -1;
    let bestVideos = [];
    for (const video of videos) {
      const score = scorePair(video, track.file);
      if (score < 0) continue;
      if (score > bestScore) {
        bestVideos = [video];
        bestScore = score;
      } else if (score === bestScore) {
        bestVideos.push(video);
      }
    }
    if (bestVideos.length === 1) {
      assignments.get(bestVideos[0]).push(track);
    } else if (bestVideos.length > 1) {
      // Never assign tied episode/stem matches based on input enumeration order.
      ambiguousPairings.push({ track, candidates: bestVideos, score: bestScore });
    } else {
      unmatchedSubtitleTracks.push(track);
    }
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
    ambiguousPairings,
    outputNameCollisions: findBatchOutputNameCollisions(jobs),
    unmatchedSubtitles: unmatchedSubtitleTracks.map((track) => track.file),
    orphanSidecars: Array.from(collected.orphanSidecars || []),
    invalidSubtitles: Array.from(collected.invalid || []),
    subtitleMismatches: Array.from(collected.mismatches || []),
    ignoredVideos: [],
  };
}

export function buildBatchJobs(videoFiles = [], subtitleFiles = []) {
  return buildBatchJobsFromCollected(videoFiles, collectSubtitleInputs(subtitleFiles));
}

export async function identifyBatchFonts(
  files = [],
  {
    identify = identifyFontFile,
    concurrency = 8,
    cache = null,
  } = {}
) {
  const source = Array.from(files || []);
  const entries = await mapWithConcurrency(source, concurrency, async (file) => {
    const key = fileIdentity(file);
    let pending = cache?.get(key);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => identify(file))
        .catch((error) => ({
          kind: 'font',
          fileName: file?.name || '',
          valid: false,
          parseError: error?.message || String(error),
        }));
      cache?.set(key, pending);
    }
    const identity = await pending;
    return {
      file,
      identity,
      supported: isSupportedFontIdentity(identity),
      mismatch: fontIdentityMismatchMessage(identity),
    };
  });

  return {
    recognized: entries.filter((entry) => entry.supported),
    ignored: entries.filter((entry) => !entry.supported),
  };
}

export function collectBatchFonts(files = []) {
  return Array.from(files || []);
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
