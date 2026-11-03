import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/p0-summarize-ebml-xml.py', import.meta.url));
function run(kind, xml) {
  return JSON.parse(execFileSync(process.env.E2E_PYTHON || 'python3', [helper, kind], {
    input: xml, encoding: 'utf8',
  }));
}

test('P0 XML chapter parser retains nested structure and target UID identity', () => {
  const actual = run('chapters', [
    '<?xml version="1.0"?><Chapters><EditionEntry>',
    '<EditionUID>510001</EditionUID><ChapterAtom>',
    '<ChapterUID>510010</ChapterUID><ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>',
    '<ChapterDisplay><ChapterString>Parent</ChapterString><ChapterLanguage>eng</ChapterLanguage></ChapterDisplay>',
    '<ChapterAtom><ChapterUID>510011</ChapterUID><ChapterTimeStart>00:00:00.200000000</ChapterTimeStart>',
    '<ChapterDisplay><ChapterString>Nested</ChapterString></ChapterDisplay></ChapterAtom>',
    '</ChapterAtom></EditionEntry></Chapters>',
  ].join(''));
  assert.equal(actual[0].editionUid, '510001');
  assert.equal(actual[0].chapters[0].uid, '510010');
  assert.equal(actual[0].chapters[0].children[0].uid, '510011');
  assert.equal(actual[0].chapters[0].children[0].displays[0].name, 'Nested');
});

test('P0 XML tag parser retains scoped target linkage but filters mux-generated tags', () => {
  const actual = run('tags', [
    '<?xml version="1.0"?><Tags>',
    '<Tag><Targets><TargetTypeValue>30</TargetTypeValue><ChapterUID>510011</ChapterUID></Targets>',
    '<Simple><Name>P0_NESTED_CHAPTER_KEEP</Name><String>linked-chapter-metadata</String></Simple>',
    '</Tag><Tag><Simple><Name>_STATISTICS_WRITING_APP</Name><String>mkvmerge</String></Simple></Tag>',
    '</Tags>',
  ].join(''));
  assert.deepEqual(actual, [{
    targets: { ChapterUID: '510011', TargetTypeValue: '30' },
    name: 'P0_NESTED_CHAPTER_KEEP', string: 'linked-chapter-metadata', binary: '', language: '',
  }]);
});

test('P0 XML parser does not report empty or invalid XML as successful absence', () => {
  assert.throws(() => run('tags', ''), /Command failed/);
  assert.throws(() => run('chapters', '<Chapters>'), /Command failed/);
});
