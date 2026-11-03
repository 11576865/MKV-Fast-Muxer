# S03 font collections and shaping acceptance slice

> Execute inline under executing-plans; the user has authorized the existing S03 next unit.

Goal: verify actual TTC/OTC multi-face preservation and CFF OpenType subsetting/shaping from default workbench through independent native extraction and isolated rendering.
Spec: docs/softmux-1.0-product-acceptance-contract-20261020.md S03. Preserve collection passthrough behavior and capability limits; do not invent generic collection-subset/face-selection permission.

- [x] Generate unique two-face Regular/Bold TrueType and real CFF OpenType collections plus standalone CFF font, preserving genuine DejaVu GSUB/GPOS/GDEF layout and original outline geometry.
- [x] Execute actual default-workbench preview/mux for TTC/OTC with subset requested and standalone OTF subset. Independently extract full collection bytes and all face identities; prove bold and regular native libass selections. Verify subset layout/shaping on Latin ligature, Arabic and combining-mark samples with native HarfBuzz and isolated libass rendering/negative controls.
- [x] Keep source hashes, report actual SHA and collection fallback semantics; no physical-device/all-player/general shaping PASS. Run full Node/build and actual Chromium scenarios.
- [x] Fresh independent review and one bounded fix pass complete; durable PR227 submitted. One immediate exact-head CI read remains the external handoff.

Review focus: a valid ttcf header is not a real CFF collection; native selection must identify both faces, not system fallback; subset must retain shaping/positioning, not only cmap; collection subset request must honestly preserve originals; negative render controls must visibly differ.

Observed RED: CFF subset changed a+combining-acute from one composed glyph to two, with89changed native-render pixels; source cmap precomposed á was pruned after repertoire deduplication. Added canonical NFC/NFD subset-only closure per visible dialogue before deduplication; authored diagnostics/ASS remain untouched. Three focused new tests:2REDbeforefix, all5GREENafterfix, including override boundaries, compatibility exclusion and drawing/comment exclusion. Verify both single and frozen batch actual CFF outputs. Product0.1047.0.

Four-mode isolated final run PASS; receipt validated PASS/fourmodes/18nativevectors/pixel positive+negative controls. Preview external loglevel error cannot support informational selected-face assertion; preview PNG only is claimed, selected faces proven independently on final artifacts. Exact-head CI/review still separate.

Final review: Important NFC/NFD endpoint closure omitted intermediate â for a+circumflex+acute (actual subset1->3glyphs). One repair pass adds canonical candidate closure per grapheme with a cached fixed Unicode table; two new RED tests ->7focusedGREEN. Actual native multi-stage corpus rerun required; no compatibility or source normalization.

PR227 exact64fd7db all three full CI workflows passed; merged main0160bf0. Canonical intermediate closure repair validated; deployment/device/formal verdicts remain separate.
