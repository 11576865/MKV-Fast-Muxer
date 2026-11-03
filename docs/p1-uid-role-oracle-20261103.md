# P1: Matroska UID-target semantic role oracle — 2026-11-03

**Status:** executable research / test enhancement on a PR; no production writer permission or 1.0 status change.

## Why this changes the previous P1 result

The first complete XML oracle, merged at #228, detects loss of ordinary nested Tags and Chapters but deliberately flags **every raw UID number change**. Matroska writers may legally replace TrackUID / AttachmentUID / EditionUID / ChapterUID when corresponding relationships are reconnected. To avoid reporting every safe remux as content loss, this second independent oracle resolves known Tag Targets to source and destination **logical object roles**.

Native use:

```bash
python3 scripts/p1-uid-role-oracle.py original.mkv output.mkv p1-role-report.json
# 0 SCOPED_RELATIONS_MATCH (only the verified named scope)
# 2 DIFFERENCE_DETECTED
# 3 CHECK_UNAVAILABLE, e.g. dangling target, malformed or ambiguous identity

python3 scripts/p1-uid-role-oracle.py --selftest
```

This Python script is for development/CI only. It requires native `mkvmerge` and `mkvextract`; Softmux remains browser-only without any new user's-machine dependency.

## Comparison authority

- **ChapterUID:** exact decimal `uint64` is mapped to its Edition and recursive ChapterAtom position; all *other* chapter XML fields and nested hierarchy are compared. Chapter numerical UID may change only if references still resolve to the same path. If an Edition/Chapter is removed or time/flags/display differs, the chapter comparison differs.
- **EditionUID:** maps to its EditionEntry position, with non-UID Edition fields included in the comparison.
- **AttachmentUID:** maps to a uniquely identified attachment by filename, MIME and SHA-256 of the **actual independently extracted FileData**. Identical duplicate attachment identities refuse certification rather than create ambiguous UID mapping.
- **TrackUID:** maps to the ordered track index, type and codec from `mkvmerge -J`. This is a deliberately weak logical proxy and **cannot prove stream content identity or reordering of same-type same-codec tracks**. Existing FFprobe + independent packet/PTS oracles remain required for those cases.
- **Tag targets:** every known TrackUID, AttachmentUID, ChapterUID and EditionUID in each Tag/Targets resolves to the role above. Ordinary SimpleTag trees are compared **without the old P0_ prefix filter**, including nested Simple and unrecognized extracted XML fields. An unresolved UID, duplicated UID, unrecognized Target field or ambiguous attachment fails as `CHECK_UNAVAILABLE`, never PASS. Global / zero UID targets are recorded separately.
- **Tag order** is normalized, retaining duplicate Tags and nested SimpleTag child order. Other unrecognized EBML layout information remains out of scope.

**SCOPED_RELATIONS_MATCH is not a generic semantic-conformance certificate.** This conservative comparator does not check unextracted unknown EBML, media packet SHA and timestamps, other track metadata, externally linked Segments, or player/font rendering. A successful known-role comparison cannot give the production writer new capabilities.

## Native positive + negative matrix

CI runs `scripts/p1-uid-role-real-audit.py` after the existing independent MKVToolNix fixture generator:

1. Copy an independently mkvmerge-authored MKV with one video, a real attachment and two-level ChapterAtom / EditionEntry.
2. Attach four regular Tag entries that target its actual video TrackUID, attachment FileUID, EditionUID and nested ChapterUID; one contains a nested non-P0 `COMMENT` SimpleTag.
3. Use native `mkvpropedit` to modify **the real Matroska file**: renumber EditionUID and both ChapterUIDs, and rewrite the corresponding Target UIDs. The role-based comparison must pass while the earlier strict raw-tree comparison would report numeric changes.
4. On a copy, redirect the nested-chapter Tag to the parent ChapterUID; the role-based comparison must report `tags` difference.
5. On a copy, delete the nested `COMMENT` SimpleTag without changing the target; it must report `tags` difference.
6. Upload four real MKVs, generated chapter/tag XML, per-scenario reports and full JSON receipt.

The five statements above are CI requirements, **not claimed observed PASS until exact-head job reports success**.

## Future extension

Improve track logical identity with independent packet payload/timebase hashes, add cross-target graph handling for any unsupported or externally linked relations, compare unknown EBML coverage explicitly, and connect independently established output semantic reports to a user-readable result. No feature-name parade or unapproved change to the 1.0 contract.
