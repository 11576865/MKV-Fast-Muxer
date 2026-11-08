/**
 * Conservative compatibility boundary for Group ASS font subsetting.
 *
 * Real FFmpeg/libass "subtitles=" rendering of an Arabic mixed-script
 * subtitle differed when an original full TrueType face was replaced with
 * a HarfBuzz-subset font. Native HarfBuzz clusters/advances and the
 * "ass=" renderer both passed, and an attempt to add every Unicode Arabic
 * presentation form to the subset did NOT repair the direct-MKV picture.
 *
 * The product has no reliable browser-local proof for all native target
 * renderers. Preserve the USER'S ORIGINAL FONT BYTES for this observed
 * script class instead of silently generating an unsafe Group subset.
 * This is intentionally conservative, not a claim of universal font
 * safety for any other writing system.
 */
export const ASS_GROUP_ARABIC_FALLBACK_VERSION='ass-group-arabic-preserve-v2';
const ARABIC_SCRIPT=/\p{Script=Arabic}/u;

export function mustPreserveOriginalGroupFonts(text){
  return ARABIC_SCRIPT.test(String(text??''));
}
