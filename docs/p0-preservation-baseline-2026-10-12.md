# P0 · Matroska preservation baseline (2026-10-12)

**Status: evidence-gathering / no production behavior change.**

Planning decision: `软封工程_未来规划总决议_2026-10-12.txt`, P0 and WP-01/02/03.
Source baseline: `main@7781a4f410a9c6edb9a1f3d056091e6ace333cc4` (PR #74 merge).

## Purpose and boundaries

This branch does **not** replace the mux engine, remove the video-track requirement, add generic attachments, guarantee chapter/tag preservation, or redraw the UI. It establishes a real browser no-requested-edit roundtrip and an independent, limited preservation comparison.

The existing `tests/e2e/browser-mux.e2e.mjs` already tests multi-audio/multi-subtitle, ASS/SSA/SRT/WebVTT/PGS/VobSub, font subsetting and preview, source MKV attachment/track changes, legacy batch queue and Group font mode, ambiguous pairing, output collision and save failure. Those cases must be preserved as the legacy behavior baseline; passing them does not imply that a completely generic Matroska core exists.

## New executable experiment

Fixture: `.e2e/fixtures/source-with-attachments.mkv` from `tests/e2e/generate-fixtures.sh`.

Expected source features (verify with actual probes; do not hardcode as oracle output):
- source video and audio tracks;
- two chapters with titles;
- global container title and comment;
- TTF font and text report/notes attachments.

Run the existing browser mux implementation with *only this MKV selected*, **no added subtitle, font or other edit**, using its default preserve-all append mode. Save the browser-produced MKV. Then run:

```sh
node scripts/p0-compare-roundtrip.mjs \
  .e2e/fixtures/source-with-attachments.mkv \
  .e2e/output/p0-preservation-output.mkv \
  .e2e/output/p0-preservation-audit.json
```

Requires: `ffprobe`, `mkvmerge` and `mkvextract`; the browser CI workflow provisions these tools. GitHub Actions uploads `mkv-p0-preservation-audit` JSON even when the scoped comparison reports a difference.

The comparison checks:
1. Ordered **video/audio/subtitle track type, codec, language/title, default/forced** using FFprobe.
2. Chapter start/end (ms precision) and title.
3. Container-level title/comment.
4. Attachment filename, MIME, and **SHA-256 of actual extracted bytes** using independent Matroska tools.

A difference makes the P0 scenario fail intentionally. In particular, “a valid MKV was generated” does not clear a changed attachment or chapter.

## Evidence levels — crucial non-claims

`CHECKED_FIELDS_MATCH` means **only the explicitly checked facts match**. It is NOT proof of:
- full EBML roundtrip / arbitrary unknown element retention;
- nested chapter/tag targets, UIDs, Segment linking, CodecPrivate identity;
- packet-level bit identity or precise timestamp semantics;
- playback compatibility, subtitle visual fidelity or font isolation;
- output file byte identity, index/SeekHead/Cues layout preservation;
- arbitrary large-file browser behavior or task persistence.

The source fixture was itself created using system FFmpeg. For truly independent Matroska stress coverage, later P0 fixtures must be constructed with mkvmerge or crafted EBML and contain hard cases not representable by the original writer. This remains **pending** until those artifacts and independent evidence exist. A passing synthetic fixture is not sufficient to assert complete preservation.

## First-round status ledger

| Work item | Status when this branch opens | Evidence |
| --- | --- | --- |
| Existing old single-file + batch regression | Existing tests; rerun required at this PR head | `tests/e2e/browser-mux.e2e.mjs` |
| Browser real no-edit remux | Test added; CI result pending | new P0 scenario |
| Scoped independent semantic/attachment comparison | Script and focused unit test added; CI result pending | `scripts/p0-compare-roundtrip.mjs` |
| Full EBML inventory, unknown valid elements | Not yet covered | needs independent reader/fixture |
| Complex nested chapters/tags, linking/UIDs | Not yet covered | P0 extension |
| Same tests with browser Wasm input size near practical limit | Not yet covered | later load-test matrix |
| ASS embedded-font isolated rendering | Not this work item | P3 |
| New ContainerDocument writable authority | Not this work item | P1 |

## P0 go/no-go and follow-up

- **Red** if ordinary no-edit remux loses any checked semantics or attachment bytes. Record source, browser output, tool versions and report JSON. Do not “fix” by weakening the oracle or changing original input silently; isolate the cause and choose safe capability boundaries.
- **Yellow** if scoped test passes but complex structures are untested. Continue expanding the fixture corpus and define unsupported-risk behavior before a generic-writer promise.
- **Green for this slice** requires passing current-head unit + Chromium E2E, visible audit artifact, and independently reproduced results. “Green for this slice” is **not** P0 completion.

Do not merge a failing comparison merely to turn CI green. Do not remove existing browser or batch tests. Branch and PR status require confirmation after async CI; historic CI screenshots are not proof for the new commit.


## P0 expansion — independently authored Matroska (2026-10-12)

The initial Chromium roundtrip has now been observed **green** at commit `7291eb587a309c62a0a82407251a34c45fd24d13`: 220/220 Node tests, Browser E2E all scenarios including the basic no-edit roundtrip, and `CHECKED_FIELDS_MATCH` in job logs. That result applies only to the simple FFmpeg-authored fixture and the comparator's explicitly checked fields.

A second, higher-risk scenario is implemented on this **Draft PR**, with CI result to be observed independently:

- `tests/e2e/generate-independent-matroska-fixture.sh` uses **mkvmerge** to author MKV from standard media inputs with intentionally nested chapter atoms and a binary attachment; **mkvpropedit** injects `P0_*` custom tags with a `ChapterUID` target. We explicitly do **not** use `mkvmerge --global-tags` for chapter-linked tags, since that option removes all tag targets.
- An explicit fixture self-check extracts independent chapter and tag XML and checks that both nested chapter and `ChapterUID` marker actually exist **before** browser processing.
- `scripts/p0-summarize-ebml-xml.py` (stdlib-only) projects extracted chapter hierarchy and `P0_*` tag/target relationships to JSON.
- `scripts/p0-compare-roundtrip.mjs --deep` compares this real extracted information before and after browser remux, in addition to earlier FFprobe fields and attachment bytes.
- The browser E2E scenario saves `p0-independent-audit.json` even on semantic difference; CI must not silently turn dropped data into success.

If this hard fixture goes red, distinguish a **fixture-authoring failure**, **comparison/parser failure**, **Wasm writer failure**, and **verified content-preservation loss** before changing production claims. The report intentionally does not cover arbitrary unknown EBML elements or all Matroska tags and references. Even if the new hard fixture passes, P0 is not complete.

Review PR head-specific CI and JSON artifact, not an earlier green commit. Remain Draft until the failure classification and safety policy are explicit.


## Confirmed red: MKVToolNix source is not preserved by the browser writer

**CI run:** https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38194692640
**Tracked defect:** https://github.com/11576865/MKV-Fast-Muxer/issues/77
**Outcome:** `DIFFERENCE_DETECTED`, `chapterHierarchy` and `p0MarkedTags` on actual browser-generated output.

Independent XML source shows parent chapter UID `510010`, nested child UID `510011`, edition UID `510001`, and a `P0_NESTED_CHAPTER_KEEP` custom tag that targets `ChapterUID=510011`. The browser output has only the parent chapter and the targeted custom tag is missing; the parent language changed from `eng` to `und`, and the original edition UID was not retained. Global tag `P0_GLOBAL_KEEP` survived.

This is a **reproduced P0 preservation red**. It is not an assertion that ordinary flat chapter workflows fail, nor a proof of a particular internal FFmpeg implementation defect; it establishes that the product's existing browser remux path cannot be trusted to retain this source's high-level relationships. The earlier simple fixture remains `CHECKED_FIELDS_MATCH`.

**Release impact:** Do not approve the general-purpose source-container mutation path without an explicit detection/compatibility gate. If the tool cannot preserve the source semantics, it must block or obtain informed acceptance of an explicitly degraded *new* output; it cannot claim total preservation. No production fix or automatic detection path has been implemented by this P0 branch.

PR #76 intentionally remains **Draft / red** with downloadable machine-readable JSON attached to the failed run. A later implementation PR should carry the actual guard or backend solution and prove the same fixture changes from fail to an explicitly supported outcome without hiding the source structure.


## Independent writer control experiment (new; CI pending)

To localize the observed loss more accurately, Browser E2E CI now first remuxes the same `p0-independent-mkvtoolnix.mkv` with **mkvmerge itself** and runs the exact same `--deep` oracle. The JSON control report is placed in `.e2e/p0-control/p0-mkvtoolnix-control-audit.json` and collected even on CI failure.

If this control is green but the FFmpeg/Wasm browser path is red, that narrows the difference to the tested execution paths for this fixture. If the control is red, re-check expected structural ID normalization and fixture authoring before assigning all loss to the browser. Do not treat an unexecuted control as proof.
