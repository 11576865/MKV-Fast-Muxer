# P2 — Untrusted Matroska attachment export filename policy

Status: source-independent safety policy implementation submitted; exact-head tests pending. This is a **pure proposal** and no actual export UI/save operation.

## Input trust boundary

The Matroska `AttachedFile.FileName` and `FileMediaType` are caller-controlled bytes and **must not** be treated as a verified safe destination path or content type. The new policy `src/attachment-export-policy.js` translates original metadata to a proposed **basename** with an immutable audit of transformations. It normalizes Unicode NFKC *before* removing slash/backslash-separated path components, replaces Unicode control/bidi/unsafe filename characters, protects common Windows device names and leading/trailing dots, bounds UTF-8 name length and resolves proposed case-insensitive collisions by suffix.

The original file name remains available separately for review; it is never passed as a writable path. Declared MIME is only metadata, never evidence for decoding a font, picture, script or executable. An input claiming image/png while named like an executable remains unverified, with no automatic preview/launch.

`planAttachmentExportNames` accepts an optional caller-provided snapshot of existing destination names, but **cannot** read actual directory state. It declares `destinationRecheckRequired: true`, `overwriteAuthorized: false`, `readyToWrite: false`, `payloadIntegrity: not-checked`. This does not authorize real overwrite or guarantee race-free collision avoidance on diverse target file systems.

## Verification and next boundary

`tests/attachment-export-policy.test.mjs` contains independent Node adversarial examples for ../ traversal, Windows paths, fullwidth slash, bidi overrides, reserved names, Unicode UTF-8 length, case-insensitive collisions, MIME mismatch, and frozen no-write proposals. These tests must pass with full legacy Node/Chromium E2E before merging the policy.

**Next (not implemented in this PR):** integrate source reader from Draft PR #89 after its exact-head independent SHA-256 crosscheck; obtain explicit destination/user consent; recheck real destination collision immediately before saving; download as inert Blob with safe name; report failures and audit original/sanitized names; verify content hash against independently extracted FileData. Browser UI and filesystem write should be tested as separate focused work and may require adapting device API support.

Existing UIGS Case: `inbox/cases/2026-10-12-matroska-untrusted-attachment-safety-and-disclosure.md`. No Canonical standard promotion.
