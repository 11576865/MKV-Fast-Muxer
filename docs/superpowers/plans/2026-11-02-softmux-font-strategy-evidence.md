# Font strategy evidence implementation plan

Goal: exercise the existing S03 font policies using real browser outputs and independent system FFmpeg/fontTools inspection.
Spec: `docs/softmux-1.0-product-acceptance-contract-20261020.md`, S03. The existing convergence plan authorizes inline execution.
Architecture: a separate E2E scenario consumes the existing uniquely named P3 font fixture and current workbench controls. No new product behavior is planned. Full-font preservation, HarfBuzz subset and forced-family policies each produce a real MKV; a fourth deliberately missing-family/missing-glyph input must produce visible diagnostics and retain its authored ASS.

## Review focus
- Subsets must retain needed codepoints, font identity and rendered glyphs, rather than merely have smaller byte length.
- Preserve must not rewrite ASS family names; force must rewrite style/inline families and attach only the first font.
- Missing dependencies remain warnings even if container auditing succeeds.
- Independent checks must consume downloaded output, with source hashes unchanged.
- Named-fixture observations never promote S03 or any formal 14/44/57 verdict.

## One bounded task
- [x] Add `tests/e2e/font-strategy-scenario.mjs` with actual UI policy selection, downloads, native demux/extraction, fontTools cmap/name checks and isolated libass frame comparisons.
- [x] Exercise the oracle against omitted/wrong font inputs and altered subtitle controls, so false success is observable.
- [x] Run the real scenario locally; fix product code only if a reproducible defect appears, with RED/GREEN evidence.
- [x] Wire the scenario and mandatory CI artifacts; run Node suite/build and fresh whole-branch review.
- [x] Update evidence discovery links and durable task, push PR and read external status once.

Ruling: native FFmpeg attachment extraction supports the same independent byte/identity checks locally as in CI without introducing a new MKVToolNix dependency. Render comparisons concern one controlled frame, not arbitrary shaping/player equivalence.

Validation: 799/799 Node tests, production build and all four real-browser/native output scenarios passed. Actual pre-fix subset lacked U+0020; unit RED/GREEN additionally pins soft-break-only text. Enhanced fixture includes ASS hardspace and U+2003. Native render controls omit delivered font, alter text and remove subtitles. Fresh review found Python interpreter contract and soft-break handling; both addressed, no remaining material findings. CI pending after push.

Ruling: use a separate `subsetCharacters` repertoire rather than changing diagnostic `allCharacters`; prevents changing missing-glyph warning counts while retaining horizontal whitespace needed by rendering. Soft breaks conservatively retain U+0020 even for WrapStyle 2.
