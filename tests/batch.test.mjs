import assert from 'node:assert/strict';
import test from 'node:test';

import {
  batchSubtitleSummary,
  buildBatchJobs,
  findBatchOutputNameCollisions,
  identifyBatchFonts,
  identifyBatchVideos,
  mergeFileSelections,
  stem,
} from '../src/batch.js';

function file(name) {
  return { name };
}

test('pairs same-stem and language-suffixed subtitles to videos', () => {
  const result = buildBatchJobs(
    [file('Show S01E01.mkv'), file('Show S01E02.mp4')],
    [
      file('Show S01E01.zh-Hans.ass'),
      file('Show S01E01.en.srt'),
      file('Show S01E02.vtt'),
    ],
  );

  assert.equal(result.jobs.length, 2);
  assert.equal(result.jobs[0].subtitles.length, 2);
  assert.equal(result.jobs[1].subtitles.length, 1);
  assert.equal(result.unmatchedSubtitles.length, 0);
});

test('reports unmatched batch inputs without inventing a pairing', () => {
  const result = buildBatchJobs(
    [file('episode-01.mkv'), file('episode-02.mkv')],
    [file('totally-different.ass')],
  );
  assert.equal(result.jobs.length, 0);
  assert.equal(result.unmatchedVideos.length, 2);
  assert.equal(result.unmatchedSubtitles.length, 1);
});

test('batch summary distinguishes subtitle formats', () => {
  assert.equal(
    batchSubtitleSummary({ subtitles: [file('a.ass'), file('a.srt'), file('a.vtt')] }),
    '1 ASS · 1 SRT · 1 VTT'
  );
  assert.equal(stem(' Episode 01.MKV '), 'episode 01');
});


test('batch pairing carries VobSub sidecar files into the job', () => {
  const result = buildBatchJobs(
    [file('Show S01E03.mkv')],
    [file('Show S01E03.en.idx'), file('Show S01E03.en.sub')],
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].subtitleTracks.length, 1);
  assert.equal(result.jobs[0].subtitleTracks[0].format.id, 'vobsub');
  assert.deepEqual(result.jobs[0].subtitleInputFiles.map((item) => item.name), [
    'Show S01E03.en.idx',
    'Show S01E03.en.sub',
  ]);
});

test('folder and manual file selections merge without duplicate identities', () => {
  const a = { name: 'a.mkv', size: 1, lastModified: 2, webkitRelativePath: 'video/a.mkv' };
  const same = { ...a };
  const b = { name: 'b.mkv', size: 2, lastModified: 3, webkitRelativePath: 'video/b.mkv' };
  assert.deepEqual(mergeFileSelections([a], [same, b]).map((item) => item.name), ['a.mkv', 'b.mkv']);
});


test('content-recognized video with an unknown extension can enter batch pairing', async () => {
  const renamed = { name: 'Show S01E04.mmmmmm', size: 10, lastModified: 1 };
  const recognition = await identifyBatchVideos([renamed], {
    sniff: async () => ({ container: 'iso-bmff', evidence: 'test' }),
  });

  assert.equal(recognition.recognized.length, 1);
  assert.equal(recognition.recognized[0].identity.container, 'iso-bmff');
  assert.equal(recognition.recognized[0].mismatch.includes('.mmmmmm'), true);

  const result = buildBatchJobs(
    recognition.recognized.map((entry) => entry.file),
    [file('Show S01E04.zh-Hans.ass')],
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].video.name, 'Show S01E04.mmmmmm');
  assert.equal(result.jobs[0].outputName, 'Show S01E04.mkv');
});

test('supported-looking extension does not make unidentified bytes a batch video', async () => {
  const fake = { name: 'fake.mp4', size: 10, lastModified: 1 };
  const recognition = await identifyBatchVideos([fake], {
    sniff: async () => ({ container: 'unknown', evidence: 'none' }),
  });

  assert.equal(recognition.recognized.length, 0);
  assert.equal(recognition.ignored.length, 1);
});

test('batch content recognition caches file identity and bounds repeated probing', async () => {
  let calls = 0;
  const cache = new Map();
  const media = { name: 'episode.bin', size: 10, lastModified: 2 };
  const sniff = async () => {
    calls += 1;
    return { container: 'matroska', evidence: 'test' };
  };

  const first = await identifyBatchVideos([media], { sniff, cache });
  const second = await identifyBatchVideos([media], { sniff, cache });

  assert.equal(first.recognized.length, 1);
  assert.equal(second.recognized.length, 1);
  assert.equal(calls, 1);
});


test('content-recognized font with an unknown extension can enter batch font set', async () => {
  const renamed = { name: 'FixtureSans.mmmmmm', size: 10, lastModified: 1 };
  const recognition = await identifyBatchFonts([renamed], {
    identify: async () => ({
      kind: 'font',
      fileName: renamed.name,
      extension: '.mmmmmm',
      container: 'single',
      flavor: 'truetype',
      label: 'TrueType / OpenType TT',
      valid: true,
      extensionMatches: false,
      descriptors: [{ family: 'Fixture Sans' }],
    }),
  });

  assert.equal(recognition.recognized.length, 1);
  assert.equal(recognition.recognized[0].identity.valid, true);
  assert.match(recognition.recognized[0].mismatch, /\.mmmmmm/);
});

test('supported-looking font extension does not make invalid bytes a batch font', async () => {
  const fake = { name: 'fake.ttf', size: 10, lastModified: 1 };
  const recognition = await identifyBatchFonts([fake], {
    identify: async () => ({
      kind: 'font',
      fileName: fake.name,
      valid: false,
      parseError: '字体 name 表损坏',
    }),
  });

  assert.equal(recognition.recognized.length, 0);
  assert.equal(recognition.ignored.length, 1);
});

test('batch font content recognition caches file identity', async () => {
  let calls = 0;
  const cache = new Map();
  const font = { name: 'font.bin', size: 10, lastModified: 3 };
  const identify = async () => {
    calls += 1;
    return {
      kind: 'font',
      fileName: font.name,
      extension: '.bin',
      container: 'single',
      flavor: 'truetype',
      label: 'TrueType / OpenType TT',
      valid: true,
      extensionMatches: false,
      descriptors: [{ family: 'Fixture Sans' }],
    };
  };

  await identifyBatchFonts([font], { identify, cache });
  await identifyBatchFonts([font], { identify, cache });
  assert.equal(calls, 1);
});

test('episode-only batch pairing refuses ties instead of choosing first input', () => {
  const videos = [file('Series A S01E01.mkv'), file('Series B S01E01.mkv')];
  const subtitle = file('S01E01.zh.ass');

  for (const order of [videos, [...videos].reverse()]) {
    const result = buildBatchJobs(order, [subtitle]);
    assert.equal(result.jobs.length, 0);
    assert.equal(result.ambiguousPairings.length, 1);
    assert.equal(result.unmatchedSubtitles.length, 0);
    assert.equal(result.unmatchedVideos.length, 2);
    assert.equal(result.ambiguousPairings[0].track.file, subtitle);
    assert.deepEqual(
      result.ambiguousPairings[0].candidates.map((item) => item.name).sort(),
      videos.map((item) => item.name).sort(),
    );
  }
});

test('a strong full-name pairing wins over an unrelated matching episode token', () => {
  const result = buildBatchJobs(
    [file('Series A S01E01.mkv'), file('Series B S01E01.mkv')],
    [file('Series B S01E01.zh-Hans.ass')],
  );
  assert.equal(result.ambiguousPairings.length, 0);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].video.name, 'Series B S01E01.mkv');
});

test('unambiguous work cannot conceal another subtitle with an ambiguous target', () => {
  const result = buildBatchJobs(
    [file('Series A S01E01.mkv'), file('Series B S01E01.mkv')],
    [file('Series B S01E01.eng.ass'), file('S01E01.zh.ass')],
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].subtitles.length, 1);
  assert.equal(result.ambiguousPairings.length, 1);
});

test('duplicate output names are detected under case and Unicode normalization', () => {
  const jobs = [
    { outputName: 'Film.mkv', video: file('Film.mp4') },
    { outputName: 'film.MKV', video: file('film.mov') },
    { outputName: 'Ｄｒａｍａ.mkv', video: file('Ｄｒａｍａ.mp4') },
    { outputName: 'Drama.mkv', video: file('Drama.webm') },
    { outputName: 'Unique.mkv', video: file('Unique.mp4') },
  ];
  const conflicts = findBatchOutputNameCollisions(jobs);
  assert.equal(conflicts.length, 2);
  assert.deepEqual(conflicts.map((item) => item.videos.length), [2, 2]);
  assert.deepEqual(conflicts[0].videos.map((item) => item.name), ['Film.mp4', 'film.mov']);
  assert.deepEqual(findBatchOutputNameCollisions([{ outputName: 'unique.mkv', video: file('unique.mp4') }]), []);
});
