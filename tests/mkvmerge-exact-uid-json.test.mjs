import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMkvmergeJsonWithExactUids, exactPositiveUid } from '../src/mkvmerge-exact-uid-json.js';

test('mkvmerge JSON 64-bit attachment UIDs stay exact above JS safe integer', () => {
  const raw = '{"attachments":[{"file_name":"one.bin","properties":{"uid":8607425577185101443}},' +
    '{"file_name":"two.bin","properties":{"uid":2465833630312329627}}],"tracks":[],"duration":23333333}';
  const parsed = parseMkvmergeJsonWithExactUids(raw);
  assert.equal(parsed.attachments[0].properties.uid, '8607425577185101443');
  assert.equal(parsed.attachments[1].properties.uid, '2465833630312329627');
  assert.notEqual(parsed.attachments[0].properties.uid, String(8607425577185101443));
  assert.equal(parsed.duration, 23333333);
  assert.equal(exactPositiveUid(parsed.attachments[0].properties.uid), '8607425577185101443');
});

test('maximum uint64 UID is retained without any floating point conversions', () => {
  const parsed = parseMkvmergeJsonWithExactUids(
    '{"attachments":[{"properties":{"uid":18446744073709551615}}]}');
  assert.equal(exactPositiveUid(parsed.attachments[0].properties.uid),
    '18446744073709551615');
  assert.throws(() => exactPositiveUid('18446744073709551616'), /OUT_OF_UINT64_RANGE/);
  assert.throws(() => exactPositiveUid(8607425577185101000), /NOT_EXACT_DECIMAL/);
});

test('already-quoted UID stays a string and other numeric fields keep number type', () => {
  const parsed = parseMkvmergeJsonWithExactUids(
    '{"attachments":[{"properties":{"uid":"42"},"id":1,"size":23}],"tracks":[]}');
  assert.equal(parsed.attachments[0].properties.uid, '42');
  assert.equal(parsed.attachments[0].id, 1);
  assert.equal(parsed.attachments[0].size, 23);
});

test('parser does not silently accept invalid JSON or non-UID numeric fields', () => {
  assert.throws(() => parseMkvmergeJsonWithExactUids('{bad json'), SyntaxError);
  assert.throws(() => parseMkvmergeJsonWithExactUids({ uid: 7 }), /JSON_TEXT_REQUIRED/);
  assert.throws(() => exactPositiveUid('0'), /OUT_OF_UINT64_RANGE/);
  assert.throws(() => exactPositiveUid('not-a-decimal'), /NOT_EXACT_DECIMAL/);
});
