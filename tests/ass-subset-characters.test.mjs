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
