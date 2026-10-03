import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMuxCommand, normalizeTrackLanguage } from '../src/mux-command.js';

test('builds deterministic multi-audio multi-subtitle mux command', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    sourceAudioCount: 2,
    originalAudioTracks: [
      { index: 1, language: 'jpn', title: 'Japanese', default: true },
    ],
    externalAudioTracks: [
      { path: 'audio.flac', inputIndex: 1, language: 'zho', title: 'Chinese', default: false },
    ],
    newSubtitleTracks: [
      { path: 'zh.ass', inputIndex: 2, language: 'zho', title: '简体中文', default: true, forced: false },
      { path: 'en.ass', inputIndex: 3, language: 'eng', title: 'English', default: false, forced: false },
    ],
    originalSubtitleTracks: [
      { index: 4, language: 'jpn', title: 'Signs', default: false, forced: true },
    ],
    originalAttachments: [{ index: 7 }],
    originalAttachmentCount: 1,
    fontAttachments: [
      { path: 'font.ttf', filename: 'font.ttf', mimeType: 'font/ttf' },
    ],
  });

  assert.deepEqual(args.slice(0, 8), [
    '-i', 'main.mkv',
    '-i', 'audio.flac',
    '-i', 'zh.ass',
    '-i', 'en.ass',
  ]);
  assert.ok(args.includes('0:1'));
  assert.ok(args.includes('1:a:0'));
  assert.ok(args.includes('2:0'));
  assert.ok(args.includes('3:0'));
  assert.ok(args.includes('0:4'));
  assert.ok(args.includes('0:7'));

  assert.ok(args.includes('-metadata:s:a:1'));
  assert.ok(args.includes('language=zho'));
  assert.ok(args.includes('-metadata:s:s:0'));
  assert.ok(args.includes('-metadata:s:s:2'));

  const attachIndex = args.indexOf('-attach');
  assert.equal(args[attachIndex + 1], 'font.ttf');
  assert.ok(args.includes('-metadata:s:t:1'));
  assert.equal(args.at(-1), 'out.mkv');
});

test('unscanned source audio is preserved and external audio metadata starts after it', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mp4',
    outputPath: 'out.mkv',
    sourceAudioCount: 2,
    originalAudioTracks: null,
    externalAudioTracks: [
      { path: 'commentary.opus', inputIndex: 1, language: 'eng', title: 'Commentary', default: false },
    ],
    newSubtitleTracks: [
      { path: 'sub.ass', inputIndex: 2, language: 'eng', title: 'English', default: true, forced: false },
    ],
  });

  assert.ok(args.includes('0:a?'));
  assert.ok(args.includes('-metadata:s:a:2'));
  assert.ok(args.includes('title=Commentary'));
});

test('can preserve all original attachments without enumerating them', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    preserveAllOriginalAttachments: true,
    originalAttachmentCount: 3,
    fontAttachments: [
      { path: 'font.otf', filename: 'font.otf', mimeType: 'font/otf' },
    ],
  });

  assert.ok(args.includes('0:t?'));
  assert.ok(args.includes('-metadata:s:t:3'));
});

test('writes Original, Commentary and Hearing impaired dispositions', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mp4',
    outputPath: 'out.mkv',
    sourceAudioCount: 1,
    externalAudioTracks: [
      {
        path: 'commentary.flac',
        inputIndex: 1,
        language: 'eng',
        title: 'Commentary',
        default: false,
        original: true,
        commentary: true,
        hearingImpaired: false,
      },
    ],
    newSubtitleTracks: [
      {
        path: 'sub.ass',
        inputIndex: 2,
        language: 'zh-Hans',
        title: '简体中文',
        default: true,
        forced: false,
        hearingImpaired: true,
      },
    ],
  });

  const audioDisposition = args[args.indexOf('-disposition:a:1') + 1];
  const subtitleDisposition = args[args.indexOf('-disposition:s:0') + 1];
  assert.equal(audioDisposition, 'original+comment');
  assert.equal(subtitleDisposition, 'default+hearing_impaired');
});

test('normalizes ISO codes and canonicalizes common BCP47 casing', () => {
  assert.equal(normalizeTrackLanguage(' ZHO '), 'zho');
  assert.equal(normalizeTrackLanguage('zh-hans'), 'zh-Hans');
  assert.equal(normalizeTrackLanguage('pt_br'), 'pt-BR');
  assert.equal(normalizeTrackLanguage('sr-latn-rs'), 'sr-Latn-RS');
  assert.equal(normalizeTrackLanguage(''), 'und');
});

test('rewrites selected original attachment filename and MIME metadata', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    originalAttachments: [
      { index: 7, filename: 'notes-renamed.txt', mimetype: 'text/x-notes' },
    ],
    fontAttachments: [
      { path: 'font.ttf', filename: 'font.ttf', mimeType: 'font/ttf' },
    ],
  });

  assert.ok(args.includes('0:7'));
  assert.ok(args.includes('-metadata:s:t:0'));
  assert.ok(args.includes('filename=notes-renamed.txt'));
  assert.ok(args.includes('mimetype=text/x-notes'));
  assert.ok(args.includes('-metadata:s:t:1'));
});


test('subtitle codec override only transcodes the requested subtitle stream', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mp4',
    outputPath: 'out.mkv',
    sourceAudioCount: 1,
    newSubtitleTracks: [
      { path: 'a.ass', inputIndex: 1, language: 'eng', title: 'ASS', default: true },
      { path: 'b.vtt', inputIndex: 2, language: 'zho', title: 'VTT', default: false, codecOverride: 'srt' },
    ],
  });

  assert.equal(args.includes('-c'), true);
  const overrideIndex = args.indexOf('-c:s:1');
  assert.notEqual(overrideIndex, -1);
  assert.equal(args[overrideIndex + 1], 'srt');
  assert.equal(args.includes('-c:s:0'), false);
});


test('preserve-all append mode maps every source subtitle without rewriting metadata', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    preserveAllOriginalSubtitles: true,
    preserveAllOriginalAttachments: true,
    originalAttachmentCount: 2,
    newSubtitleTracks: [
      { path: 'new.sup', inputIndex: 1, language: 'eng', title: 'PGS', default: false },
    ],
  });

  assert.ok(args.includes('0:s?'));
  assert.ok(args.includes('0:t?'));
  assert.equal(args.some((arg) => String(arg).startsWith('-metadata:s:s:1')), false);
  assert.ok(args.includes('1:0'));
});


test('preserves verified Matroska data streams when requested', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    preserveOriginalDataStreams: true,
  });

  const mapPairs = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '-map') mapPairs.push(args[index + 1]);
  }
  assert.ok(mapPairs.includes('0:d?'));
});


test('append-only mode maps the complete source before appended streams', () => {
  const args = buildMuxCommand({
    mainInputPath: 'main.mkv',
    outputPath: 'out.mkv',
    sourceAudioCount: 2,
    sourceSubtitleCount: 1,
    preserveAllSourceStreams: true,
    preserveAllOriginalSubtitles: true,
    preserveAllOriginalAttachments: true,
    originalAttachmentCount: 2,
    externalAudioTracks: [
      { path: 'extra.flac', inputIndex: 1, language: 'eng', title: 'Extra', default: false },
    ],
    newSubtitleTracks: [
      { path: 'new.ass', inputIndex: 2, language: 'zho', title: 'New', default: false },
    ],
    fontAttachments: [
      { path: 'font.ttf', filename: 'font.ttf', mimeType: 'font/ttf' },
    ],
  });

  const mapped = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '-map') mapped.push(args[index + 1]);
  }
  assert.equal(mapped[0], '0');
  assert.equal(mapped.includes('0:v?'), false);
  assert.equal(mapped.includes('0:s?'), false);
  assert.equal(mapped.includes('0:t?'), false);
  assert.ok(mapped.includes('1:a:0'));
  assert.ok(mapped.includes('2:0'));
  assert.ok(args.includes('-metadata:s:a:2'));
  assert.ok(args.includes('-metadata:s:s:1'));
  assert.ok(args.includes('-metadata:s:t:2'));
});
