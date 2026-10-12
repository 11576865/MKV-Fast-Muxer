# P0 experiment: TrackUID-targeted custom Tag survival in ordinary Matroska

Status: independently verified **CHECKED_RELATIONS_MATCH** for this fixture / no production mux code or UI modification.

**Recorded result:** Browser E2E workflow https://github.com/11576865/MKV-Fast-Muxer/actions/runs/38202212178, head c75a68a0b7a614436ec06164f4fa8fec397f3b35, 228/228 Node tests, Chromium E2E PASS; actual run reported `P0 track-tag semantic relation: CHECKED_RELATIONS_MATCH`. The P0 JSON audit artifact was uploaded under `p0-trackuid-target-relation-audit`. This confirms only the tagged video-target relation of this fixture.

## Why this matters

Issue #77 confirmed that an independent Matroska source containing nested chapters and chapter-linked tags loses those relationships through the existing browser FFmpeg/Wasm writer. Main's partial guard blocks ChapterUID/EditionUID-linked tags, but currently allows common TrackUID/AttachmentUID-targeted Tags with an **unverified warning** to retain legacy behavior.

It is unknown whether a normal *flat* Matroska with a custom TrackUID Tag survives an actual browser remux. This is a meaningful safety boundary, and a merely successful MKV output/FFprobe stream count cannot prove the tag's survival.

## Controlled fixture and independent oracle

- `tests/e2e/generate-independent-matroska-fixture.sh` authors `p0-independent-tracktag.mkv` with MKVToolNix; no nested ChapterAtoms are added.
- Uses `mkvmerge -J` to read the source video's actual 64-bit UID (Python `int`, not lossy JavaScript `Number`), then `mkvpropedit --tags all:<xml>` to embed `P0_TRACK_RELATION` with `Targets/TrackUID=<source-video-UID>`.
- Source fixture self-check requires actual `mkvextract` tags XML containing the custom marker and `TrackUID`.
- The actual Chromium application uses its current default MKV preserve source-stream policy (no requested edit) and should show an unverified TrackUID warning, not a preflight hard block.
- `scripts/p0-audit-track-tag-relations.py` independently extracts source/output tags and maps each Target UID back to its actual track (type/codec/ordinal). The test does **not** assert that the raw UID number is unchanged. It checks that the custom tag value remains attached to the same logical video track.
- Reports `CHECKED_RELATIONS_MATCH`, `DIFFERENCE_DETECTED`, or `CHECK_UNAVAILABLE`, writes the JSON output before exiting. Chromium CI uploads `p0-trackuid-target-relation-audit` even on failure.

## Confidence and acceptance

A green result proves only this one custom, directly video-linked TrackUID Tag and its logical target were retained on this specific browser writer/fixture. It does not justify claims about chapters, other tracks/tags, binary tag values, unknown EBML, attachments, complete stream preservation or all MKVTools versions.

A red `DIFFERENCE_DETECTED` is actionable reproduction against a currently **warning-and-allow** class. It should trigger investigation and explicit safety decisions about TrackUID-targeted metadata, without silencing the evidence or retroactively claiming universal failure.

`CHECK_UNAVAILABLE` (missing tool, fixture invalid, source marker not present, malformed XML, etc.) is a test infrastructure failure, not evidence of a product loss.

The known chapter-linked source loss remains in Issue #77 and Draft PR #76. The CI artifact has been interpreted as a narrowly scoped positive control. Its test can be retained as a regression guard, without declaring Issue #77 resolved or broadening the feature guarantee.

References: https://github.com/11576865/MKV-Fast-Muxer/issues/77
