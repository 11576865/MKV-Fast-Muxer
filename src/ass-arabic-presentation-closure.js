/**
 * Content-derived compatibility closure for actual libass Matroska ASS
 * attachment rendering. The observed native subtitles= path may ask the
 * embedded font for Arabic presentation-form codepoints, while the same
 * subset rendered via a standalone ass=fontdir path shapes logical Arabic
 * successfully. Merely keeping GSUB/GPOS and matching HarfBuzz clusters is
 * therefore insufficient to guarantee a self-contained MKV.
 *
 * Include only real Unicode Script=Arabic presentation forms; HarfBuzz
 * subsetting will intersect them with the current source font cmap.
 * No synthetic file, renderer state, permissions, or font family mutation.
 *
 * This is a specific observed workaround, NOT a general Unicode shaping
 * closure proof for all scripts/players. An independent real-output browser
 * test must demonstrate direct subtitles= rendering after any change.
 */
const HAS_ARABIC_LOGICAL=/[\u0600-\u06ff\u0750-\u077f\u0870-\u089f\u08a0-\u08ff]/u;
const ARABIC_SCRIPT=/\p{Script=Arabic}/u;
export const ASS_ARABIC_PRESENTATION_CLOSURE_VERSION='ass-arabic-presentation-v1';
const ArabicPresentationForms=(()=>{
  let result='';
  for(const [first,last] of [[0xfb50,0xfdff],[0xfe70,0xfefc]]){
    for(let codepoint=first;codepoint<=last;codepoint++){
      const char=String.fromCodePoint(codepoint);
      if(ARABIC_SCRIPT.test(char))result+=char;
    }
  }
  return result;
})();

export function extendAssGroupSubsetTextForArabic(text){
  const original=String(text??'');
  return HAS_ARABIC_LOGICAL.test(original)
    ? original+ArabicPresentationForms : original;
}
