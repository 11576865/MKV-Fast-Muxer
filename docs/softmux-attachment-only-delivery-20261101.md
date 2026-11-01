# Normal-workbench attachment-only delivery — 2026-11-01

Status: locally implemented/verified; exact-head full CI and native MKVToolNix proof pending. Not a 1.0 release.

## Delivered

- Existing unified import recognizes PNG/PDF signatures as ordinary attachment resources. Header recognition is not validation of document contents, safety or executable payloads.
- Normal resource inventory exposes include/exclude; the composition shows only selected attachments in its count without inventing video tracks. Normal Start creates a new zero-track Matroska, verifies each attachment's name/MIME/UID/complete SHA-256 using the existing separate reader, and offers existing MKV/report downloads plus directory save/readback/retry.
- Reuses the existing bounded new-container writer, with 1–8 nonempty attachments. Existing experimental multi-file UI keeps its default 2-file minimum. Limits remain 16 MiB/file, 32 MiB total; readiness explains actual refusal before Start. Unsafe/transformed/conflicting filenames require renaming before import; there is no silent rename or normal-case confirmation gate.
- Generic attachment+media combinations have no supported general writer in this unit and are refused, never silently omitted. Exact live legacy media File grants also prevent an attachment-only route. Generic membership participates in completed-media-output currency, even when the unsupported media plan projection has no generic writer entry.
- Attachment-only evidence explicitly states browser structure/payload verification, nonplaying output and unverified physical save. It never calls a zero-track output FFprobe/playback-verified.
- Modern workbench rehosts original MKV/report/save controls with finished artifact evidence, preserving handlers and artifact ownership. The bounded Start/Cancel dock no longer stretches due to result/save prose. Text links retain readable width after leaving the icon-only toolbar context.

## Verification obtained

Baseline: 757/757 Node tests; final: 764/764, zero failures/skips. Build passed with existing large-chunk advisory.

Real Chromium 153.0.8010.0 against the built application: import actual PNG bytes and opaque PDF-signature fixture bytes, no media input, exclude PDF, normal Start and download real one-attachment MKV; reinclude PDF and download real two-attachment MKV. Re-extract complete bytes and compare independent Node SHA-256; compare report SHA to the downloaded output. Changed selection marks historical evidence stale. Legacy video picker combined with generic inventory refuses generation and retains the prior completed artifact. 1440/1024/768 viewports test ordinary Start clicks, artifact link width and dock content height.

Reran the existing candidate-subtitle browser scenario: excluded candidate preview, actual one/two-subtitle media outputs with native FFprobe, same-label candidate switches, generic attachment addition invalidating old media evidence, and restored original workflow all passed locally.

New full-suite scenario requires native `mkvmerge -J` and `mkvextract attachments` against both actual browser downloads and compares extracted SHA-256. Local environment has no MKVToolNix: this proof is pending CI, not inferred from the product's own reader. Physical tablet verification remains unavailable.

## Review

Independent reviewer identified two material issues: legacy media inputs could bypass the generic-only routing assumption; generic additions could retain stale current-media-output evidence. Both were fixed with exact grant/membership guards and browser regressions. Visual inspection exposed the toolbar/result-context link width and dock overflow issues, now covered by real geometry and click checks.

## Still open

Multi-MKV independent inspection/draft preservation, general media+arbitrary attachment writing, all-file-types attachment intake, complete recovery of generic-only drafts, final 1.0 contract reconciliation, physical-device evidence and release/deployment/rollback acceptance. None is promoted from this bounded unit.
