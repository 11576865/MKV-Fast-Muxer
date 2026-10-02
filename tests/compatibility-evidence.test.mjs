import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  COMPATIBILITY_EVIDENCE_STATUS,
  MATROSKA_STREAM_COPY_EVIDENCE,
  compatibilityEvidenceFor,
  verifiedCompatibilityEvidence,
} from '../src/compatibility-evidence.js';

const fixtureScript = fs.readFileSync(new URL('./e2e/generate-fixtures.sh', import.meta.url), 'utf8');
const browserE2e = fs.readFileSync(new URL('./e2e/browser-mux.e2e.mjs', import.meta.url), 'utf8');

test('compatibility evidence ids and dimension/codec keys are unique', () => {
  const ids = new Set();
  const keys = new Set();
  for (const entry of MATROSKA_STREAM_COPY_EVIDENCE) {
    assert.ok(entry.id);
    assert.ok(!ids.has(entry.id), 'duplicate evidence id: ' + entry.id);
    ids.add(entry.id);

    const key = entry.dimension + ':' + entry.codec;
    assert.ok(!keys.has(key), 'duplicate evidence key: ' + key);
    keys.add(key);
    assert.equal(compatibilityEvidenceFor(entry.dimension, entry.codec)?.id, entry.id);
  }
});

test('every verified-e2e codec has a reproducible fixture and browser scenario binding', () => {
  const verified = verifiedCompatibilityEvidence();
  assert.ok(verified.length >= 10);

  for (const entry of verified) {
    assert.equal(entry.status, COMPATIBILITY_EVIDENCE_STATUS.VERIFIED_E2E);
    assert.ok(entry.fixture, entry.id + ' missing fixture');
    assert.ok(entry.expectedCodec, entry.id + ' missing expectedCodec');
    assert.equal(entry.e2eScenario, 'compatibility-evidence-matrix');
    assert.equal(
      fixtureScript.includes(entry.fixture),
      true,
      entry.id + ' fixture is not generated',
    );
  }

  assert.match(browserE2e, /compatibility-evidence-matrix/);
  assert.match(browserE2e, /verifiedCompatibilityEvidence/);
});

test('expected-only entries cannot masquerade as verified fixture evidence', () => {
  const expected = MATROSKA_STREAM_COPY_EVIDENCE.filter(
    (entry) => entry.status === COMPATIBILITY_EVIDENCE_STATUS.EXPECTED
  );
  assert.ok(expected.length >= 1);
  for (const entry of expected) {
    assert.equal(entry.fixture, undefined);
    assert.ok(entry.note);
  }
});
