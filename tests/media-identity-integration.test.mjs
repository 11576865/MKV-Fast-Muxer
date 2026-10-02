import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('single-file video workflow exposes content identity instead of extension-only gating', () => {
  assert.match(html, /id="videoIdentity"/);
  assert.match(main, /sniffFileContainer/);
  assert.match(main, /videoIdentityFromProbe/);
  assert.match(main, /isSupportedVideoIdentity/);
  assert.match(main, /sourceVirtualSuffix/);
  assert.doesNotMatch(
    main,
    /\['\.mp4', '\.mkv', '\.webm', '\.mov', '\.m4v'\]\.includes\(videoExt\)/,
  );
});

test('external audio is probed from neutral virtual filenames and reports real codec identity', () => {
  assert.match(main, /audio-\$\{index\}\.source/);
  assert.match(main, /audioIdentityFromProbe/);
  assert.match(main, /按实际 codec/);
});

test('MKV-only UI decisions can be driven by content identity', () => {
  assert.match(main, /currentVideoIsMatroska/);
  assert.match(main, /isMatroskaIdentity\(verifiedIdentity\)/);
  assert.doesNotMatch(main, /ext\(videoInput\.files\[0\]\?\.name \|\| ''\) !== '\.mkv'/);
});
