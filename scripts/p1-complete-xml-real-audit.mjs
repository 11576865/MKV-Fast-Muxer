// Independent real-MKV regression for the strict P1 chapters/tags XML oracle.
// mkvpropedit authors actual changed EBML, mkvextract reads the output; this
// test is not a browser writer certification or a full semantic equivalence proof.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkRoundtrip } from './p0-compare-roundtrip.mjs';

function command(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
}

export function runCompleteXmlRealAudit({
  fixtures = process.env.E2E_FIXTURE_DIR || '.e2e/fixtures',
  output = process.env.E2E_OUTPUT_DIR || '.e2e/output',
} = {}) {
  mkdirSync(output, { recursive: true });
  const base = path.resolve(fixtures, 'p0-independent-mkvtoolnix.mkv');
  const source = path.resolve(output, 'p1-complete-xml-source.mkv');
  const matched = path.resolve(output, 'p1-complete-xml-match.mkv');
  const altered = path.resolve(output, 'p1-complete-xml-ordinary-tag-removed.mkv');
  const tagFile = path.resolve(output, 'p1-complete-xml-tags.xml');
  const alteredTagFile = path.resolve(output, 'p1-complete-xml-tags-without-child.xml');
  const reportFile = path.resolve(output, 'p1-complete-xml-real-audit.json');

  const fullTags = `<?xml version="1.0" encoding="UTF-8"?>
<Tags>
  <Tag>
    <Targets><TargetTypeValue>30</TargetTypeValue><ChapterUID>510011</ChapterUID></Targets>
    <Simple>
      <Name>DIRECTOR</Name><String>Independent non-P0 tag</String><TagLanguage>eng</TagLanguage>
      <Simple><Name>COMMENT</Name><String>Nested ordinary tag to preserve</String></Simple>
    </Simple>
  </Tag>
</Tags>
`;
  const missingNestedTag = fullTags.replace(
    '      <Simple><Name>COMMENT</Name><String>Nested ordinary tag to preserve</String></Simple>\n', '');
  assert.notEqual(missingNestedTag, fullTags, 'the negative control must actually remove a field');
  writeFileSync(tagFile, fullTags, 'utf8');
  writeFileSync(alteredTagFile, missingNestedTag, 'utf8');
  copyFileSync(base, source);
  command('mkvpropedit', [source, '--tags', 'all:' + tagFile]);
  copyFileSync(source, matched);
  copyFileSync(source, altered);
  command('mkvpropedit', [altered, '--tags', 'all:' + alteredTagFile]);

  const strictControl = checkRoundtrip(source, matched, { completeXml: true });
  assert.equal(strictControl.outcome, 'CHECKED_FIELDS_MATCH',
    'identical actual source and output must pass strict comparison');
  const legacy = checkRoundtrip(source, altered, { deep: true });
  assert.equal(legacy.outcome, 'CHECKED_FIELDS_MATCH',
    'the old P0_ marker-only deep mode is expected to miss ordinary nested Tag loss');
  const strictNegative = checkRoundtrip(source, altered, { completeXml: true });
  assert.equal(strictNegative.outcome, 'DIFFERENCE_DETECTED',
    'loss of a real non-P0 nested SimpleTag must be detected');
  assert.ok(strictNegative.differences.some(item =>
    item.code === 'EXTRACTED_XML_TREE_DIFFERENCE' && item.field === 'tagXmlTree'),
  'strict independent extraction must produce the precise tag-structure difference');

  const receipt = {
    schema: 'p1-complete-xml-real-mkv-oracle-v1',
    source, matched, altered, tagFile, alteredTagFile,
    sourceAuthoredBy: 'independent mkvmerge fixture, modified by native mkvpropedit',
    controlledDifference: 'nested COMMENT SimpleTag under non-P0 DIRECTOR tag removed',
    sameFileControl: strictControl.outcome,
    oldDeepBlindSpot: legacy.outcome,
    strictNegative: strictNegative.outcome,
    preciseDifferenceFields: strictNegative.differences.map(item => ({
      code: item.code, field: item.field,
    })),
    tools: strictNegative.tools,
    notClaimed: [
      'automatic UID remapping semantic equivalence',
      'all unknown EBML element preservation',
      'actual browser mux success or end-user disk persistence',
    ],
    verdict: 'PASS',
  };
  writeFileSync(reportFile, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log('P1 real MKV independent nested ordinary Tag loss: PASS');
  console.log('P1 report: ' + reportFile);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCompleteXmlRealAudit();
}
