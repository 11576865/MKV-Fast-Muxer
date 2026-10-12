# P0 — Matroska source preservation preflight (Issue #77)

Status: implementation and regression tests on Draft PR #78; **not a complete Matroska roundtrip certification**.

## Trigger and evidence

The real browser writer successfully remuxed a file created by MKVToolNix but changed its semantics (evidence PR #76, Issue #77): a nested ChapterAtom disappeared, its ChapterUID-targeted tag was lost, a parent chapter display language changed, and an EditionUID was rewritten. A control MKVToolNix remux preserved nested chapters but did **not** automatically preserve the targeted custom tag. Plain mux success is therefore insufficient proof of original metadata preservation.

## This limited gate

`src/preservation-preflight.js` inspects the **original File/Blob**, before any output is written, using EBML element IDs from RFC 9559. It streams element headers through `Blob.slice()`, skipping large Cluster payloads by offsets. It only buffers individual Chapters and Tags blocks up to 8 MiB and imposes bounded structural recursion/counting.

The gate refuses:
- nested chapters (including the independently reproduced case);
- ordered/multiple chapter editions and chapter-processing elements, which have not been proven safe;
- Tags targeting a *nonzero* TrackUID, EditionUID, ChapterUID, or AttachmentUID;
- structures it cannot safely inspect: malformed EBML, unknown-size segment children, excessively large metadata, invalid/unsupported DocType, missing segment or unreadable source.

Zero UID targets have wildcard semantics and do not trigger UID-specific refusal. Generic, unrelated metadata is not deleted or modified by the preflight. Native `webm` DocType bypasses this **Matroska-specific** protection; it is not a claim of full WebM preservation.

The result `NO_KNOWN_HAZARD` means only that these specific risk patterns were not found. It must **never** be displayed or reported as verified all-element retention.

## Execution behavior

- Single-file work: inspect **before** clearing/revoking previously completed output links and **before** loading the source into the Wasm virtual filesystem; a refusal leaves the prior completed artifact available and does not create a new output.
- Batch: inspect *every* planned Matroska source before running any job or replacing saved result links. If any is refused, the batch remains unstarted with an actionable cause. This is intentionally all-or-none by default and does not silently run just the “safe” subset.
- Browser cancellation: a cancelled preflight must not continue into mux execution.
- The fail-closed path produces a special `preservation-preflight-block` diagnostic instead of a generic FFmpeg error.

## Explicit non-goals and known false positives

This is intentionally conservative. Files written by MKVToolNix can contain benign-looking track-targeted statistics Tags with nonzero TrackUIDs; these may be rejected until an independently proven remux-and-repair strategy exists. It is preferable to block than silently discard metadata, but the resulting workflow friction should be measured, not concealed.

This gate does **not** detect every legal EBML feature which a rewriter might drop: simple Chapter UID changes, every language/format field, unknown EBML extensions, track codec-private content, exact timestamp packet fidelity, multi-segment linked files, all Tag variants, or player/ASS rendering behavior. Any affirmative complete-preservation claim still requires independent artifact auditing. The gate is not a substitute for a Matroska-aware execution backend or fully scoped preservation policy.

## Acceptance gates

1. Unit tests cover safe basic source, nested chapter, explicit nonzero UID target, zero UID target, ordered/multiple editions, malformed/inconclusive EBML, WebM exemption and large-Cluster skip by bounded reads.
2. Real browser E2E imports the independent P0 hard fixture (nested chapters + chapter-targeted tag) and refuses to mux. The output download link and report must not become new completed artifacts.
3. Mixed batch (ordinary media and hard MKV) is refused *before* processing the first job; existing batch outputs must not be replaced.
4. All existing subtitle/font, original-track, batch/Group, cancellation and file saving browser scenarios remain green.
5. Source-independent evidence PR #76 remains red as an explicit counterexample until a verified preservation-capable writer/strategy is available. Do not weaken its oracle to make the guard look successful.

References:
- https://github.com/11576865/MKV-Fast-Muxer/issues/77
- https://github.com/11576865/MKV-Fast-Muxer/pull/76
- https://www.rfc-editor.org/rfc/rfc9559
- https://www.matroska.org/technical/elements.html
