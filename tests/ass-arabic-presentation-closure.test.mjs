import assert from 'node:assert/strict';
import test from 'node:test';
import {ASS_ARABIC_PRESENTATION_CLOSURE_VERSION,
  extendAssGroupSubsetTextForArabic} from '../src/ass-arabic-presentation-closure.js';

test('ASS Arabic Group closure retains logical text plus real presentation forms',()=>{
  const original='office ffi AV العربية لا Ω Ж';
  const covered=extendAssGroupSubsetTextForArabic(original);
  assert.equal(ASS_ARABIC_PRESENTATION_CLOSURE_VERSION,'ass-arabic-presentation-v1');
  assert.ok(covered.startsWith(original));
  assert.ok(covered.length>original.length+100);
  assert.ok(covered.length<original.length+900,'bounded compatibility expansion');
  for(const ch of ['\ufe8d','\ufefb','\ufefc'])
    assert.ok(covered.includes(ch),'Arabic presentation glyph closure must include '+ch);
  assert.ok(!covered.includes('\ufeff'),'must not include a BOM non-glyph');
  assert.ok(!covered.includes('\ufdd0'),'must not append Unicode noncharacters');
});
test('non-Arabic and empty Group contents are byte-for-byte unchanged',()=>{
  for(const text of ['','office ffi AV a\u0301','Ω Ж','中日韩 ASS 合成','plain subtitles'])
    assert.equal(extendAssGroupSubsetTextForArabic(text),text);
});
test('Arabic Supplement and Arabic Extended logical text also activates closure',()=>{
  for(const ch of ['\u0750','\u08a0'])
    assert.ok(extendAssGroupSubsetTextForArabic(ch).includes('\ufefb'));
});
