import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAssFontUsage} from '../src/ass-font-rewrite.js';
const ass=String.raw`[V4+ Styles]
Format: Name, Fontname
Style: Default,Proof
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,A B\hC\ND E{\p1}m 0 0 l 9 9{\p0}F
Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Ignored Ω
`;
test('ASS subset characters retain horizontal spaces while diagnostic characters exclude whitespace',()=>{
 const analysis=analyzeAssFontUsage(ass);
 assert.ok(analysis.subsetCharacters?.includes(' '),'subset must retain U+0020 needed by libass spacing');
 assert.ok(analysis.subsetCharacters.includes('\u00a0'),'ASS hard spaces need their own codepoint');
 assert.ok(analysis.subsetCharacters.includes('\u2003'),'authored horizontal whitespace must be retained');
 assert.ok(!analysis.allCharacters.includes(' '),'diagnostic glyph counts keep their existing meaning');
 for(const ignored of ['\n','m','9','Ω'])assert.ok(!analysis.subsetCharacters.includes(ignored));
 assert.ok(analysis.subsetCharacters.includes('F'));
});

test('ASS soft line breaks retain a space glyph even when no literal space exists',()=>{
 const single=text=>ass.replace(/Dialogue:.*\nComment:/,`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,${text}\nComment:`);
 assert.ok(analyzeAssFontUsage(single(String.raw`A\nB`)).subsetCharacters.includes(' '));
 assert.ok(!analyzeAssFontUsage(single(String.raw`A\NB`)).subsetCharacters.includes(' '));
});

const normalizationAss=text=>ass.replace(/Dialogue:.*\nComment:/,()=>`Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,${text}\nComment:`);
test('ASS subset closure retains canonical composed forms before character deduplication',()=>{
 const analysis=analyzeAssFontUsage(normalizationAss('a XYZ a\u0301'));
 for(const c of ['a','\u0301','á'])assert.ok(analysis.subsetCharacters.includes(c),'missing canonical repertoire member '+c);
 assert.ok(!analysis.allCharacters.includes('á'),'diagnostics describe authored characters, not subset-only normalization candidates');
});
test('ASS subset closure retains canonical decompositions and visible runs across overrides',()=>{
 const composed=analyzeAssFontUsage(normalizationAss('á'));
 for(const c of ['a','\u0301','á'])assert.ok(composed.subsetCharacters.includes(c));
 const split=analyzeAssFontUsage(normalizationAss(String.raw`a{\bord1}́`));
 assert.ok(split.subsetCharacters.includes('á'),'non-text override must not hide a canonical composition candidate');
});
test('ASS canonical subset closure does not use compatibility normalization or include drawing/comment text',()=>{
 const analysis=analyzeAssFontUsage(normalizationAss(String.raw`ﬃ{\p1}á{\p0}`));
 assert.ok(analysis.subsetCharacters.includes('ﬃ'));
 for(const c of ['f','i','á','a','\u0301','Ω'])assert.ok(!analysis.subsetCharacters.includes(c));
});

test('ASS subset canonical closure includes intermediate multi-stage compositions',()=>{
 for(const text of ['a\u0302\u0301',String.raw`â{\fs30}́`,'a\u0327\u0302\u0301']){
  const analysis=analyzeAssFontUsage(normalizationAss(text));
  for(const c of ['a','\u0302','\u0301','â','ấ'])assert.ok(analysis.subsetCharacters.includes(c),'missing intermediate '+c);
 }
});
test('ASS canonical closure preserves Hangul intermediates and does not compose across grapheme boundaries',()=>{
 const hangul=analyzeAssFontUsage(normalizationAss('각'));
 for(const c of ['각','가','\u1100','\u1161','\u11a8'])assert.ok(hangul.subsetCharacters.includes(c));
 const separated=analyzeAssFontUsage(normalizationAss('a \u0302\u0301'));
 assert.ok(!separated.subsetCharacters.includes('â'));
 assert.ok(!separated.subsetCharacters.includes('ấ'));
});
