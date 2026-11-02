# Audio-only Matroska Mux Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; continue the user-authorized implementation without another approval round.

**Goal:** Author a real audio-based Matroska without a video host, retaining audio editing, external audio/subtitle/font and artifact workflows.
**Architecture:** Extend single-task runtime eligibility, keeping the existing video-only predicate for batch. An explicit audio-only compatibility option requires at least one retained/new audio stream; raw elementary audio and subtitle-only sources remain outside this unit. Existing preservation and exact File/domain checks remain mandatory.
**Tech Stack:** JavaScript, FFmpeg.wasm Stream Copy, Vite, Chromium, native FFprobe.
**Spec:** Approved future product resolution D-01/D-04/D-07, docs/softmux-1.0-product-acceptance-contract-20261020.md; user directs substantive media functions.

## Global Constraints
- No new encoding, backend dependencies, batch scope, arbitrary EBML preservation or device claims.
- Inputs: content-recognized Matroska/WebM/ISO BMFF/MOV with real audio. Unknown/empty/subtitle-only inputs fail closed.
- Continue in the dedicated feature branch in this disposable checkout; external git is durable storage.
- Output remains Matroska .mkv to keep shared saving/report/name contracts; no fake video track.

## Review Focus
- All original audio excluded: refuse unless an included external audio supplies the output.
- No-video or subtitle-only source does not imply arbitrary resource writing eligibility.
- Complex chapters/UID-risk protection still runs before writing.
- M4A is content-recognized; extension never grants source eligibility.
- Batch retains its original video requirement and video workflows remain compatible.

### Task 1: Audio-only single mux end to end
**Files:** src/media-identity.js, src/compatibility.js, src/container-capabilities.js, src/main.js, tests/audio-only-mux.test.mjs, tests/e2e/audio-only-mux-scenario.mjs, browser runner/workflow, README/package, task checkpoint.
**Interfaces:** isSupportedPrimaryMediaIdentity(identity) accepts observed audio/video in existing supported source containers; resolveMuxCompatibility({allowAudioOnlySource:true,...}) requires output audio when video absent; capability input hasAudio defaults false.
- [x] Add failing identity/compatibility/capability/command tests; run and observe RED.
- [x] Extend eligibility and capability without weakening batch/video-only identity; correct phantom video plan row.
- [x] Real browser RED/GREEN: MKA source -> retained copy; edited dual audio + ASS/font -> native checked output; audio exclusion refusal and external-audio-only replacement; M4A -> output, unknown and subtitle-only refusal. Unchanged inputs and no fake video.
- [x] Run full npm test/build and scoped real browser; independent native packet hashes/PTS, codec private data, metadata/subtitle/font payload.
- [x] Fresh whole-branch review: no material findings,40 focused tests passed; later real refusal case exposed error-feedback precedence, two unit cases RED/GREEN fixed. Bounded UIGS append to existing Candidate prepared.
- [x] Pushed code a384eac and PR #223; checkpoint records pending exact-head CI, with one immediate status read at turn boundary.

## Evidence and decisions

832/832 Node tests/build passed. Actual Chromium five zero-video Matroska outputs passed independent FFprobe audio packet checks; retained MKA every-packet PTS/private, actual font bytes and ASS text/events checked. Runtime expected-refusal errors now take precedence over preceding successful ffprobe log lines; browser RED and two unit RED/GREEN cases cover this finding. WebM actual Opus added after initial review to cover the previously identity-only case.

Ruling: outputs remain `.mkv` to preserve existing report/destination naming contracts; the container stream set is zero-video and no synthetic media is generated. Costs: audio-specific MKA naming remains a later UX choice. Raw elementary audio primary, batch-only-audio, pure subtitle composition and video-frame preview without video remain out of scope. No 14/44/57 formal verdict promotion or device claim.

Final video regression: six cross-domain history steps and three real video MKVs passed on0.1045. UIGS Intake completed: existing Candidate observation appended @d82ccbcdf0c0fe954b28cc83ad5995e4b930bef3; no Canonical change. PR #223: https://github.com/11576865/MKV-Fast-Muxer/pull/223.
