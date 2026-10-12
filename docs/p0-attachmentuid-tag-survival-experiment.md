# P0 experiment: AttachmentUID-targeted Tag and independently extracted attachment identity

Status: Draft experiment — no runtime mux/preflight changes; CI result pending.
Issue: https://github.com/11576865/MKV-Fast-Muxer/issues/77
Previous TrackUID semantic control: `docs/p0-trackuid-tag-survival-experiment.md`.

## Hypothesis and capability boundary

Issue #77 proves a browser writer loss of nested Chapters and their ChapterUID-targeted Tags. The merged structural preflight hard-blocks such sources, but for ordinary TrackUID- and AttachmentUID-targeted Tags it warns and permits remux pending independent proof. PR #83 established one small positive TrackUID control. This experiment independently examines the AttachmentUID case, **not** all attachment or MKV structures.

## Test material

`tests/e2e/generate-independent-matroska-fixture.sh` creates `p0-independent-attachmenttag.mkv` using **mkvmerge**, from one regular video source plus two distinct attachments: `p0-attachment-evidence.bin` (a small binary) and `p0-attachment-decoy.txt`. It reads `mkvmerge -J` to obtain the evidence attachment's actual `properties.uid` (not its short extraction `id`), then injects custom `P0_ATTACHMENT_RELATION` through `mkvpropedit --tags all:...` with `Targets/AttachmentUID`. It self-checks the source Tags XML with `mkvextract` before the browser run.

## Independent semantic oracle

`scripts/p0-audit-attachment-tag-relations.py` uses **mkvmerge -J + mkvextract** (not producing FFmpeg) to enumerate source and output attachments. It extracts the *actual bytes*, hashes SHA-256, and maps each source/output AttachmentUID to `filename, MIME, size, SHA-256`. It extracts Tags XML and compares the `P0_*` marker payload and **semantic target identity**. Unlike a naive UID equality test, reassignment of an AttachmentUID is not treated as data loss if the tag still targets the same actual attachment. A deliberately distinct decoy makes mistaken retargeting observable.

The oracle has a self-test proving it distinguishes a legitimate UID renumber, a dropped marker, a wrong decoy target, a dangling UID, and changed bytes. It writes a separate JSON report in every case: `CHECKED_RELATIONS_MATCH`, `DIFFERENCE_DETECTED`, or `CHECK_UNAVAILABLE`. The Browser E2E uses the actual application to remux with no requested edits and confirms that the current warning is visible; CI uploads `p0-attachmentuid-target-relation-audit` even if it fails.

## Interpretation and non-claims

- Green: exactly this target relation and attachment payload match on this fixture. Does not establish general Matroska preservation, other Tags, full EBML, or packet/timestamp correctness.
- Red `DIFFERENCE_DETECTED`: a substantive relationship/payload discrepancy on a currently warning-and-allow class. Preserve artifacts and reconsider how to treat AttachmentUID sources; do not suppress the negative assertion.
- `CHECK_UNAVAILABLE`: fixture generation/tool/parser/check could not be performed, so not evidence that the writer lost data. Fix infrastructure and rerun.

Do not relax the existing ChapterUID/EditionUID protection on the basis of a green result here, and do not close Issue #77.
