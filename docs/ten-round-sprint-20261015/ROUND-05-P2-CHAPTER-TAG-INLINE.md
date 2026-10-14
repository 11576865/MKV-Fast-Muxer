# Round 5/10 · Real Chapters / Tags text edits in bounded Matroska, including audio-only

Status: **implementation branch only; exact-head Node/Build/full Chromium/native oracles pending**.

## CI debt before starting Round 5

The prior main-targeted combined review PR #146 at `075679bb2d1cea180ce0892d48afd4fd6ec76ef0` exposed **two red Node tests** (573/575 passed) caused by incorrectly constructed test preconditions: source name/length mismatch was expected to be digest mismatch, and the ledger test assumed a submitted Round had no SHA/PR. The product's SHA/identity and safe refusal code was NOT weakened. After corresponding test fixture repairs, `6fa1e89eda705b931848b91b688cd65e3378f3be` Pages Node/Build passed; Chromium failed an R2 mixed-output test because it assumed `subtitles.at(-1)` was the newly added subtitle although the last stream was an original one (`Original Signs`). On #145, `17a81ee8bc2d057dc633b297a172e986da0f68db` repairs the assertion to find the exact independently authored title and verify unique Forced disposition, and retargets the CI-only branch #146 to that exact SHA for a further complete run. **Do not call CI green without the new run's actual conclusion**.

## Delivered: scoped real writer, not arbitrary Chapter/Tag editing

`src/p2-matroska-inline-metadata-writer.js`:
- Reads a *real* complete finite `matroska` Segment (source ≤60 MiB) and walks recognized Chapters/EditionEntry/ChapterAtom/ChapterDisplay/ChapString and Tags/Tag/SimpleTag/TagString paths.
- Enumerates actual selectable existing UTF-8 fields, including nested ChapterAtom and nested SimpleTag. This can run on **audio-only or attachment-only Matroska** without fabricating a video track; it does **not** itself create a new no-video container from scratch.
- A one-field operation demands explicit review, exact source text and exact **new UTF-8 byte count** (not Unicode character count); uses an opaque one-shot bound plan with complete source SHA-256. New text must be valid and does not contain control characters.
- Refuses malformed/unknown-size/multi-Segment/unknown-top-level layouts, CRC on Segment or ancestors of edited metadata, unexpected replacement lengths, forged/reused/stale plans. No FFmpeg fallback or original source overwrite.
- Generates a new Blob from original byte prefix, replacement UTF-8 bytes, and original byte suffix. Same byte length means EBML element headers, UID references, SeekHead, Cues, media packets and chapter structure stay at their original offsets.
- Re-inspects source and output metadata field hierarchy and full top-level byte commitments, checks every non-target raw element unchanged, compares the two *original source* byte regions around the one edited field to the output byte-for-byte, and verifies original source hash again at the end. Local proof explicitly does **not** claim external native reader/player approval.
- New genuine browser editor `src/p2-matroska-inline-metadata-ui.js` is mounted from `src/main.js` and `index.html`. Users select source, actual text field, equal-byte-length replacement and explicit review; output is a separate download with original-source and output SHA displayed.

### New tests

- `tests/p2-matroska-inline-metadata-writer.test.mjs`: real non-video EBML byte fixtures with nested chapter UID/Tag target, two chapter titles and TagString; two actual sequential field writes and raw-offset invariance; negative CRC, unknown-top-level, size mismatch, forged/replayed plan, stale text and review.
- `scenarioTracklessMkaRealChapterTagTextEdit` in **full Chromium** creates an independent real audio-only `.mka` with MKVToolNix, applies native chapter and ChapterUID-targeted Tag fixture, edits TagString through real browser UI, re-opens its downloaded MKV and edits the nested ChapterString. Native `mkvmerge`, `mkvextract chapters`, `mkvextract tags` and `ffprobe -show_packets -show_data_hash sha256` then assert **zero video tracks**, unchanged audio track UID, complete identical packet sequence, correct *only* two text substitutions, unchanged ChapterUID target and unchanged original source SHA.

## Known limits (remain pending)

1. This does **not** allow length-changing text, new/deleted ChapterAtom or Tag, arbitrary tag target relocation, opaque/unknown hierarchy rewriting, CRC rewrite, very large MKV source or alternate Segment representation.
2. The pre-existing dedicated PNG and multi-attachment-only **candidate** writers are still separate product experiments; they are not silently promoted to a generally supported no-video material-creation workflow by this Round.
3. Saving a new file is a user download, not a guaranteed filesystem atomic rename or permission restoration.
4. Existing historical #77 FFmpeg preservation failures remain blocked. Chapters and tags intentionally bypass *FFmpeg* for only this equal-byte-content operation.

## Round 5 acceptance

Require exact-head Node pass, Vite build, **entire Chromium** (including earlier R2/R3/R4 new features) and independent MKVToolNix/ffprobe checks. Mark any red verdict as blocking. High-priority ledger scenario `T-009` must NOT be marked `verified` merely from this bounded text writer; the requirement is broader zero-edit/complex structure preservation. Neither P2 nor R-02 can be marked fully complete.
