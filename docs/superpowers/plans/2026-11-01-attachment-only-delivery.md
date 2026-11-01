# Normal-workbench attachment-only delivery

Goal: drop PNG/PDF files, include/exclude them, generate a real zero-track Matroska and save it using the normal workbench. Reuse existing bounded writer, name policy and readback reader. Do not silently feed generic files into the media mux path.
Scope: new containers only, 1–8 nonempty files, existing 16 MiB/file and 32 MiB total backend bounds. Normal MKV/ASS/font and batch paths retain their behavior. PNG/PDF classification is signature evidence, not safety validation. No autoplay/attachment execution, physical tablet claim or 1.0 release claim.

Tasks:
- [x] Add failing tests for content classification, single generic output, exclusions, payload readback and stale snapshots.
- [x] Reuse the bounded multi-attachment writer for one or more explicitly selected files; retain legacy experimental two-file default.
- [x] Route normal intake, composition/counts, main Start and existing output/download/verified-directory save to attachment-only execution when no media resources participate.
- [x] Test actual browser drag/import PNG+PDF, exclude PDF, generate one-file output, then include PDF and generate two-file output. Independent native MKVToolNix parse/extract in full CI is required, not FFprobe's playable-track expectations.
- [x] Run Node/build and local Chromium; obtain independent review; persist code and task state; submit exact-head CI.

Review focus: stale file/selection during async readback; source names requiring changes must be rejected with actionable wording, not silently renamed; mixing media/generic attachments must block unsupported writes; previous output remains honest; no duplicate source File may inherit output authority.
