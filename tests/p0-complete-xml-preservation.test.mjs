import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareRoundtripFacts } from '../scripts/p0-compare-roundtrip.mjs';

const helper = fileURLToPath(new URL('../scripts/p0-summarize-ebml-xml.py', import.meta.url));
const python = process.env.E2E_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const probe = spawnSync(python, ['--version'], { encoding: 'utf8' });
const pythonAvailable = !probe.error && probe.status === 0;

function project(kind, xml) {
  const result = spawnSync(python, [helper, kind], { input: xml, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
function facts(chapterXmlTree, tagXmlTree) {
  return {
    ffprobe: { streams: [], chapters: [], format: { tags: {} } },
    attachments: [],
    deep: { chapterHierarchy: [], p0MarkedTags: [], chapterXmlTree, tagXmlTree },
  };
}

const nestedChapter = `<?xml version="1.0"?>
<Chapters><EditionEntry><EditionUID>1000</EditionUID>
<EditionFlagDefault>1</EditionFlagDefault><EditionFlagOrdered>0</EditionFlagOrdered>
<ChapterAtom><ChapterUID>1001</ChapterUID><ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>
<ChapterDisplay><ChapterString>Root</ChapterString><ChapterLanguage>eng</ChapterLanguage></ChapterDisplay>
<ChapterAtom><ChapterUID>1002</ChapterUID><ChapterTimeStart>00:00:02.000000000</ChapterTimeStart>
<ChapterDisplay><ChapterString>Nested</ChapterString><ChapterLanguage>zho</ChapterLanguage></ChapterDisplay>
</ChapterAtom></ChapterAtom></EditionEntry>
<EditionEntry><EditionUID>2000</EditionUID><EditionFlagDefault>0</EditionFlagDefault>
<ChapterAtom><ChapterUID>2001</ChapterUID><ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>
</ChapterAtom></EditionEntry></Chapters>`;

const nonMarkerTags = `<?xml version="1.0"?>
<Tags><Tag><Targets><TargetTypeValue>30</TargetTypeValue><ChapterUID>1002</ChapterUID></Targets>
<Simple><Name>DIRECTOR</Name><String>Contributor</String><TagLanguage>eng</TagLanguage>
<Simple><Name>COMMENT</Name><String>Nested details</String><TagLanguageIETF>zh-Hans</TagLanguageIETF></Simple>
</Simple></Tag>
<Tag><Targets><AttachmentUID>9007199254740993</AttachmentUID></Targets>
<Simple><Name>DESCRIPTION</Name><String>Asset metadata</String></Simple></Tag>
</Tags>`;

test('P1 complete XML projection retains two editions, nested chapters and non-default flags',
  { skip: !pythonAvailable }, () => {
    const tree = project('complete-chapters', nestedChapter);
    assert.equal(tree.element, 'Chapters');
    assert.equal(tree.children.length, 2);
    const edition = tree.children[0];
    assert.equal(edition.children.find(x => x.element === 'EditionFlagOrdered').text, '0');
    const root = edition.children.find(x => x.element === 'ChapterAtom');
    assert.equal(root.children.filter(x => x.element === 'ChapterAtom').length, 1);
    assert.equal(root.children.find(x => x.element === 'ChapterAtom')
      .children.find(x => x.element === 'ChapterUID').text, '1002');
    assert.equal(tree.children[1].children.find(x => x.element === 'EditionUID').text, '2000');
  });

test('P1 complete XML captures unmarked nested Tags and exact uint64 target strings',
  { skip: !pythonAvailable }, () => {
    const tree = project('complete-tags', nonMarkerTags);
    assert.equal(tree.children.length, 2);
    const target = tree.children[1].children.find(x => x.element === 'Targets');
    assert.equal(target.children[0].text, '9007199254740993');
    const parent = tree.children[0].children.find(x => x.element === 'Simple');
    assert.equal(parent.children.find(x => x.element === 'Name').text, 'DIRECTOR');
    const nested = parent.children.find(x => x.element === 'Simple');
    assert.equal(nested.children.find(x => x.element === 'Name').text, 'COMMENT');
    assert.equal(nested.children.find(x => x.element === 'TagLanguageIETF').text, 'zh-Hans');
    assert.deepEqual(project('tags', nonMarkerTags), [],
      'legacy P0-only mode stays deliberately narrow');
  });

test('P1 independent fact comparison detects non-P0 nested Tag loss despite identical ffprobe facts',
  { skip: !pythonAvailable }, () => {
    const chapters = project('complete-chapters', nestedChapter);
    const tags = project('complete-tags', nonMarkerTags);
    const source = facts(chapters, tags);
    assert.deepEqual(compareRoundtripFacts(source, structuredClone(source)), []);
    const after = structuredClone(source);
    const firstSimple = after.deep.tagXmlTree.children[0].children.find(x => x.element === 'Simple');
    firstSimple.children = firstSimple.children.filter(x => x.element !== 'Simple');
    const diff = compareRoundtripFacts(source, after);
    assert.equal(diff.length, 1);
    assert.equal(diff[0].code, 'EXTRACTED_XML_TREE_DIFFERENCE');
    assert.equal(diff[0].field, 'tagXmlTree');
  });

test('P1 complete XML comparison catches nested Chapter/Edition loss and UID changes without calling them proven data loss',
  { skip: !pythonAvailable }, () => {
    const source = facts(project('complete-chapters', nestedChapter), project('complete-tags', nonMarkerTags));
    const after = structuredClone(source);
    after.deep.chapterXmlTree.children[0].children =
      after.deep.chapterXmlTree.children[0].children.filter(x => x.element !== 'ChapterAtom');
    const diff = compareRoundtripFacts(source, after);
    assert.equal(diff.length, 1);
    assert.equal(diff[0].code, 'EXTRACTED_XML_TREE_DIFFERENCE');
    assert.equal(diff[0].field, 'chapterXmlTree');
    const remapped = structuredClone(source);
    remapped.deep.tagXmlTree.children[1].children[0].children[0].text = '9007199254740994';
    const uidDiff = compareRoundtripFacts(source, remapped);
    assert.equal(uidDiff[0].code, 'EXTRACTED_XML_TREE_DIFFERENCE');
    assert.equal(uidDiff[0].field, 'tagXmlTree',
      'UID number changes must be reviewed for semantic equivalence');
  });

test('P1 complete XML refuses malformed XML and wrong extraction root instead of inventing an empty inventory',
  { skip: !pythonAvailable }, () => {
    for (const [mode, xml] of [['complete-tags', '<Tags><Tag>'], ['complete-chapters', '<Tags/>']]) {
      const result = spawnSync(python, [helper, mode], { input: xml, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
    }
  });
