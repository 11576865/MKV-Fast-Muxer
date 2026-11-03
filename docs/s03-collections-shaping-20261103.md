# S03 collections, canonical subset closure and shaping — 0.1047

## Concrete defect and repair

The actual CFF-subset Matroska passed its container, font payload and authored ASS event audits but its independently rendered combining accent changed. Native HarfBuzz shaped the original `a` + U+0301 sequence as one precomposed glyph; the subset lacked the U+00E1 cmap candidate and fell back to separate base/mark glyphs. The full-font/subset `á AV` run changed4→5glyphs and89native-render pixels. Latin ligature and Arabic position vectors still matched: merely preserving GSUB/GPOS was insufficient.

`analyzeAssFontUsage` now decomposes visible dialogue canonically, segments actual graphemes, and conservatively retains canonical composition candidates whose decomposition components occur within each grapheme. This includes intermediate forms such as `â` on the way to `ấ`, rather than only the final NFC/NFD endpoints. A fixed Unicode-scalar scan builds a runtime-version-matched cached composition table once; it avoids quadratic growing-prefix normalization. Visible spans across non-text overrides contribute; drawing and Comment content remain excluded. This expands only subset candidates, leaving original ASS text and authored-character diagnostic counts unchanged. Compatibility normalization NFKC/NFKD is not used. Single and frozen-batch subset callers share the same analysis. Product version0.1047.0.

Focused regression:2new tests RED before repair; all5focused tests GREEN after repair, including normalization before dedup, decomposition, non-text overrides, compatibility exclusion and drawing/comment exclusions. Before-fix native evidence: [s03-canonical-subset-red-20261103.json](evidence/s03-canonical-subset-red-20261103.json).

## Actual default-workbench acceptance slice

| Case | Independent assertions |
|---|---|
| TrueType TTC, two Regular/Bold faces, subset requested | Actual preview PNG, original collection SHA unchanged in final MKV; both face identities/weights; native libass selects actual Regular/Bold; reference/final pixels equal; regular-only negative differs |
| OpenType CFF OTC, same two-face workflow | Real OTTO/CFF tables in both faces (not a renamed TTC); same whole-collection SHA and face/style/render assertions |
| Standalone CFF OTF subset | Actual subset smaller than full font, retained GSUB/GPOS/cmap; Latin ligature, Arabic, combining-mark native HB cluster/advance/offset vectors equal full font; reference/final pixels equal; layout-table deletion changes shape/render |
| Frozen batch CFF OTF subset | Same native shape/render checks on a real batch-created MKV, with explicit frozen-batch report identity |

The unique families are absent from installed system fonts. FontTools builds real TTC/CFF OTC fixtures from installed DejaVu Regular/Bold outlines and copies genuine GDEF/GSUB/GPOS with identical glyph ordering. Native controls use only the original or extracted delivered font directory. Selection checks inspect the chosen PostScript name after `fontselect ->`, rather than merely the requested family. All final output SHA values match their reports; fonts and input ASS source files remain unchanged.

## Validation and lifecycle

- Four actual Chromium/FFmpeg.wasm outputs pass native FFprobe, fontTools, system HarfBuzz, isolated FFmpeg/libass rendering and the missing-face/layout/text/blank controls.
- `npm test`:859/859 passed; build passed; Python/JavaScript syntax and workflow YAML checked.
- Standalone runner: `node tests/e2e/font-collections-shaping.e2e.mjs`, after normal media fixture generation and build/preview. E2E_S03_OUTPUT_DIR supports isolated local runs; CI uses the default evidence path.
- Mandatory Browser CI step and always-uploaded receipt, render controls, reports and real MKVs added. Exact-head full CI pending until observed.
- Final success receipt must be validated as PASS/four modes/30 native vectors before copying to `docs/evidence/s03-collections-shaping-green-20261103.json`.

## Limits and harness corrections

Collection subsetting remains unsupported and honestly reports `font-collection` passthrough; no new face picker is implied. This proves two known generated faces and selected text samples, not arbitrary fonts/scripts, every player, device or formal S03 acceptance. Preview is an actual visible PNG, not a claimed pixel/face-identity equivalence proof; external preview runs at error log level, so absence of informational fontselect logs is expected. Face identity and exact pixels are verified on independently extracted final artifacts.

An initial ASS fixture accidentally used `AngleStyle` instead of standard `Angle`; this caused Style audit unavailability, not the independently confirmed canonical glyph regression. It was corrected before successful validation. A batch fixture name with spaces also violated the native filter helper's documented safe path contract; safe ASCII fixture paths corrected that harness issue. No product protection or assertion was weakened to accept the canonical mismatch.

## Independent review and one repair pass

Fresh review found one Important counterexample: `a` + U+0302 + U+0301 requires intermediate `â` for HarfBuzz sequential composition. NFC/NFD endpoints alone omitted it, producing1→3glyphs in an actual hb-subset-wasm/native HarfBuzz reproduction. Added two failing tests for intermediate/multi-mark/override composition and Hangul/grapheme boundaries; all7focused tests now pass. Actual native corpus includes multi-stage accents and a non-composing intervening mark. The original authored text, diagnostic repertoire and compatibility exclusions remain unchanged. Review repair is verified by tests and native outputs, without claiming universal script/font acceptance.
