import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMuxCommand } from '../src/mux-command.js';

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
