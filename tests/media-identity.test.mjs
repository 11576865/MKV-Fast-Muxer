import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audioIdentityFromProbe,
  containerFromProbe,
  identityMismatchMessage,
  isMatroskaIdentity,
  isSupportedVideoIdentity,
  mediaExtension,
  sniffContainerBytes,
  sourceVirtualSuffix,
  videoIdentityFromProbe,
} from '../src/media-identity.js';

function bytes(...values) {
  return new Uint8Array(values);
}

function asciiBytes(text) {
  return new TextEncoder().encode(text);
}

test('sniffs MP4-family content from ftyp instead of filename', () => {
  const data = new Uint8Array([
    0x00, 0x00, 0x00, 0x18,
    ...asciiBytes('ftyp'),
    ...asciiBytes('isom'),
    0x00, 0x00, 0x02, 0x00,
  ]);
  assert.deepEqual(sniffContainerBytes(data), {
    container: 'iso-bmff',
    evidence: 'iso-bmff-ftyp',
    majorBrand: 'isom',
  });
});

test('sniffs Matroska and WebM DocType from EBML bytes', () => {
  const prefix = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88);
  const mkv = new Uint8Array([...prefix, ...asciiBytes('matroska')]);
  const webm = new Uint8Array([...prefix, ...asciiBytes('webm')]);

  assert.equal(sniffContainerBytes(mkv).container, 'matroska');
  assert.equal(sniffContainerBytes(webm).container, 'webm');
});

test('probe identity accepts renamed MP4 when actual container and video stream are supported', () => {
  const identity = videoIdentityFromProbe(
    { name: 'episode.mmmmmm', type: '' },
    {
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      streams: [
        { codec_type: 'video', codec_name: 'h264' },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    },
    { container: 'iso-bmff', evidence: 'iso-bmff-ftyp' },
  );

  assert.equal(identity.container, 'iso-bmff');
  assert.equal(identity.hasVideo, true);
  assert.equal(isSupportedVideoIdentity(identity), true);
  assert.equal(identity.extensionMatches, false);
  assert.equal(sourceVirtualSuffix(identity), '.mp4');
  assert.match(identityMismatchMessage(identity), /\.mmmmmm/);
});

test('Matroska identity is content-derived even when filename claims MP4', () => {
  const identity = videoIdentityFromProbe(
    { name: 'actually-matroska.mp4' },
    {
      format: { format_name: 'matroska,webm' },
      streams: [{ codec_type: 'video', codec_name: 'hevc' }],
    },
    { container: 'matroska', evidence: 'ebml-doctype' },
  );

  assert.equal(isMatroskaIdentity(identity), true);
  assert.equal(identity.extensionMatches, false);
  assert.equal(sourceVirtualSuffix(identity), '.mkv');
});

test('supported extension cannot make non-video content a supported video', () => {
  const identity = videoIdentityFromProbe(
    { name: 'fake.mp4' },
    {
      format: { format_name: 'data' },
      streams: [],
    },
    { container: 'unknown', evidence: 'none' },
  );

  assert.equal(identity.hasVideo, false);
  assert.equal(isSupportedVideoIdentity(identity), false);
});

test('audio identity reports actual AAC even when renamed to FLAC', () => {
  const identity = audioIdentityFromProbe(
    { name: 'voice.flac' },
    {
      format: { format_name: 'aac' },
      streams: [{ codec_type: 'audio', codec_name: 'aac' }],
    },
  );

  assert.equal(identity.codec, 'aac');
  assert.equal(identity.hasAudio, true);
  assert.equal(identity.extensionMatches, false);
  assert.match(identityMismatchMessage(identity), /aac/i);
});

test('FLAC renamed to AAC is also reported as a mismatch', () => {
  const identity = audioIdentityFromProbe(
    { name: 'voice.aac' },
    {
      format: { format_name: 'flac' },
      streams: [{ codec_type: 'audio', codec_name: 'flac' }],
    },
  );

  assert.equal(identity.codec, 'flac');
  assert.equal(identity.extensionMatches, false);
});

test('probe aliases fall back to a container family when header sniff is unavailable', () => {
  assert.equal(containerFromProbe('matroska,webm'), 'matroska-webm');
  assert.equal(containerFromProbe('mov,mp4,m4a,3gp,3g2,mj2'), 'iso-bmff');
  assert.equal(mediaExtension('VIDEO.MP4'), '.mp4');
});
