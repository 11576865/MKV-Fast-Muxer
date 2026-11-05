import test from 'node:test';
import assert from 'node:assert/strict';
import { previewAssDialogueActivity } from '../src/ass-preview-dialogue-activity.js';

const late = [
  '[Script Info]', 'ScriptType: v4.00+', '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,Late subtitle beyond source duration',
].join('\n');
test('late ASS cue beyond a 2-second source is genuinely inactive, not font failure', () => {
  assert.equal(previewAssDialogueActivity(late, 0.5), 'inactive');
  assert.equal(previewAssDialogueActivity(late, 1.99), 'inactive');
  assert.equal(previewAssDialogueActivity(late, 10), 'active');
  assert.equal(previewAssDialogueActivity(late, 11.99), 'active');
  assert.equal(previewAssDialogueActivity(late, 12), 'inactive');
});
test('active known white cue remains active even without any system font provider', () => {
  const active = late.replace('0:00:10.00,0:00:12.00', '0:00:00.00,0:00:01.40');
  assert.equal(previewAssDialogueActivity(active, 0.5), 'active');
  assert.equal(previewAssDialogueActivity(active, 1.4), 'inactive');
});
test('ASS Format positions, commas in text and commented cues are respected', () => {
  const ass = '[Events]\nFormat: Text, End, Start\n' +
    'Comment: ignored,0:00:10.00,0:00:08.00\n' +
    'Dialogue: words,with,commas,0:00:10.00,0:00:08.00\n';
  // A nonstandard Format placing Text first would put Text at index 0;
  // the parser must not treat malformed placement as proof of inactivity.
  assert.equal(previewAssDialogueActivity(ass, 9), 'unknown');
  const standard = '[Events]\nFormat: Start, End, Text\n' +
    'Comment: 0:00:08.00,0:00:10.00,ignored\n' +
    'Dialogue: 0:00:08.00,0:00:10.00,words,with,commas\n';
  assert.equal(previewAssDialogueActivity(standard, 9), 'active');
  assert.equal(previewAssDialogueActivity(standard, 10), 'inactive');
});
test('unknown or malformed ASS must never prove no activity', () => {
  for (const bad of ['', 'nonsense', '[Events]\nDialogue: 0,0:00:08.00,0:00:10.00,x',
    '[Events]\nFormat: Start, End, Text\nDialogue: invalid,0:00:10.00,hello',
    '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:10.00,0:00:10.00,hello'
  ]) assert.equal(previewAssDialogueActivity(bad, 0.5), 'unknown');
  assert.equal(previewAssDialogueActivity(late, NaN), 'unknown');
  assert.equal(previewAssDialogueActivity(late, -1), 'unknown');
});
