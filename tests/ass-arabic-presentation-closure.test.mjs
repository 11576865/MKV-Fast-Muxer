import assert from 'node:assert/strict';
import test from 'node:test';
import {ASS_GROUP_ARABIC_FALLBACK_VERSION,
  mustPreserveOriginalGroupFonts} from '../src/ass-arabic-presentation-closure.js';

test('observed Arabic ASS shaping requires original bytes instead of unverified Group subset',()=>{
  assert.equal(ASS_GROUP_ARABIC_FALLBACK_VERSION,'ass-group-arabic-preserve-v2');
  for(const text of ['office ffi العربية لا Ω Ж','\u0750','\u08a0','\ufefb']){
    assert.equal(mustPreserveOriginalGroupFonts(text),true,
      'actual Arabic logical or presentation-form text must trigger fail-safe');
  }
});
test('non-Arabic Group inputs continue to permit real subset without silent broad disable',()=>{
  for(const text of ['', 'office ffi AV a\u0301','Ω Ж','中日韩 ASS 合成','字幕 - 한국어']){
    assert.equal(mustPreserveOriginalGroupFonts(text),false);
  }
});
