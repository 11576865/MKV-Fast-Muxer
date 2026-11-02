# Media and ordinary attachment delivery

> **For agentic workers:** Use superpowers:executing-plans inline; user authorized continued substantive implementation, without another design approval round.

**Goal:** Deliver original media, subtitles/fonts and ordinary AttachedFile objects in one actual Matroska.
**Architecture:** Extend the existing single-task FFmpeg attachment map with a separate ordinary-attachment plan and exact staged-byte SHA receipts. Existing generic File selection witness binds output authority. Preserve the no-media attachment-only writer and batch scope. Unknown bytes require an explicit opaque-attachment action rather than being guessed as a media format.
**Tech Stack:** JS, FFmpeg.wasm, EBML reader, Chromium, native FFprobe/FFmpeg.
**Spec:** Approved future resolution D-04 and attachment first-class object requirements; existing 1.0 contract.

## Global Constraints
- Ordinary attachments: up to8 included, nonempty, <=16MiB each, <=32MiB total. Existing font policies remain; source image reattachment has a new bounded FileData path (see decisions).
- Original input bytes untouched; no arbitrary decoding/execution; MIME declaration is not content safety.
- Unsafe names reject; collision with retained source/fonts or other new attachments receives a safe distinct output name, recorded explicitly.
- Exact File/membership/MIME witness checked before writes and publication; output ordinary payload must pass independent complete SHA before publish.
- Existing source identity/preservation and media compatibility gates remain; no batch extension or automatic Canonical promotion.

## Review Focus
- Opaque assignment cannot bypass duplicate File identity conflict, read error or known media roles.
- Original/new-font/new-ordinary attachment names share one collision namespace.
- Ordinary audit cannot be reported as font evidence or merely ffprobe count success.
- Excluded attachments don't enter output; changing membership makes previous output stale.
- Legacy pickers still supply media; neither pure-attachment nor media writer can ignore it.

### Task 1: Complete mixed attachment workflow
**Files:** src/media-attachment-delivery.js planning/verify; src/output-attachment-payload-audit.js shared byte audit; output-font-payload-audit.js compatible wrapper; asset-intake/main UI+executor; tests and browser fixture; docs/version/task.
**Interfaces:** planMediaAttachments(entries,reservedNames) -> File-bound descriptors with safe filename/MIME; verifyMediaAttachments(output,claims) rejects failed actual payload verification; assignOpaqueAttachmentRole(entry) -> explicit opaque inventory row, rejecting ineligible classifications.
- [x] Write failing planner/opaque-role/output-audit tests and observe RED.
- [x] Implement bounded planning, preserve font audit behavior through shared audit, integrate mixed staging/readback/report and final witness.
- [x] Real browser: source has original note+font name conflicts; new PNG/PDF/explicit JSON+ASS/font -> exact bytes, unchanged media hashes/PTS; exclude/remove/re-enable; audio-only source; legacy-picker compatibility and pure-attachment regression.
- [x] Full tests/build and independent native actual output proof; fresh reviewer; fix material findings.
- [ ] Persist branch/PR, bounded UIGS Intake and one immediate CI status, then stop pending.

Decision: unknown opaque resources require explicit user assignment, keep application/octet-stream, and are never interpreted as a recognized format. Existing source/font collision allocation runs first; ordinary names use remaining namespace. Output .mkv and report/save flow stay shared.

## Evidence and decisions

Native RED: a valid Matroska PNG AttachedFile is exposed as video+attached_pic by FFprobe; native -map0/-c copy turns it into a movie track. GREEN product path normalizes this Matroska-only observation, requires matching physical FileData, negative-maps raw image indices and reattaches the actual bytes. Affected images are bounded to16MiB each/32MiB total, failing closed beyond the proved range; this is an explicit additional source-image policy. Font/other-original policies remain unchanged. Source image edited name/selection and source-font exclusion are exercised in a fifth real output.

Native/browser output audit caught detached buffer length0 after writeFile transfer: store the exact staged size before worker handoff; actual output SHA/length RED/GREEN verifies the fix. Source picture reattachment shifts original attachment ordinals, so expected original list now mirrors mapped originals then reattached pictures.

Fresh reviewer passed13 focused tests and found one inherited late-cancel publication gap in scope of this unit. Real DOM-log observation cancelled at ASS Style audit: RED published completion; GREEN final cancel flag guard refuses publication, then the same user-visible task successfully retries. No test-only product hooks or private application state.

839/839 full Node tests and build passed. Five actual mixed video/audio MKVs check independent media packet/PTS, original/new PNG FileData, native ordinary payload extraction, source/font/ordinary name namespace, ASS/font readback, exclusion/staleness/reinclude, selective source image edits and audio+PDF. Pure-attachment regression generated two actual zero-track outputs, then legacy picker media+attachments produced an actual playable-track MKV. Full hosted CI pending;14/44/57 verdicts unchanged.

Ruling: unknown resources require explicit opaque assignment and application/octet-stream; they are not promoted to media/font format recognition. Ruling: ordinary collision names may change automatically, with source/final names in report and preview disclosure. Ruling: source image FileData follows mapped original attachments on output; UID/description/target-relation preservation is outside the existing FFmpeg contract, which keeps the original preservation preflight. These are bounded delivery choices, not general Matroska conformance or content-safety claims.
