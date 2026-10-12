# P2 — Browser generic attachment inspect/export vertical slice

Status: implementation on dedicated branch, exact-head Node / Vite / Chromium CI pending.

## Runtime behavior

An independent disclosure in the source intake shows a separate file input for Matroska attachment inspection. It does **not** write to the main `#videoInput`, switch the mux source, or require video Tracks. The inspector calls `createMatroskaAttachmentReader` (#89), and it only renders extraction buttons after complete bounded raw-EBML inspection. A monotonically incrementing generation token and exact `File` object reference suppress stale asynchronous scan results when the user changes the input mid-read.

Each entry displays original **untrusted** FileName, safe `planAttachmentExportNames` (#90) suggestion, declared MIME marked **unverified**, and observed FileData byte length. Rendering uses `textContent` and `bdi`, never HTML interpolation of hostile metadata.

On a direct user button click, the reader opens the selected FileData range via `Blob.slice` only. The UI hands a Blob wrapper with `application/octet-stream` to an `a[download]` URL using the safe suggested basename. It does not execute or preview the source bytes and does not invoke FFmpeg. The user/browser chooses whether and where the download is saved. Blob URLs are revoked after a conservative delay or on pagehide. This is a browser download request, not confirmed persistence, destination overwrite checking, signed content or authenticated MIME.

## Acceptance evidence

Added real Chromium E2E:

1. Inspect independent MKVToolNix-authored `p0-independent-attachmenttag.mkv`, observing two generic attachments without setting `#videoInput`.
2. Download the first attachment and verify **exact bytes** against the independently attached fixture `notes.txt`; assert the expected safe filename.
3. Switch to a malformed EBML input and verify no stale download buttons remain.
4. Hold an actual Blob.slice asynchronous read, replace the source during inspection and verify the obsolete scan never reveals an extraction control.
5. Existing P0 preservation preflight, single-file mux, font/subtitle and batch E2E remain unchanged and must stay green.

## Explicit limits

- Uses the known bounded reader envelope: unknown-size child elements, exotic EBML constructs and malformed declared metadata may refuse extraction. An unsupported reader path is not proof the Matroska is malformed.
- Does not perform SHA-256 at runtime or guarantee arbitrary payload integrity/absence of malicious content. Filename and MIME are source declarations, not trusted classifications.
- No File System Access directory writer or overwrite; regular browser download behavior applies.
- No automatic preview, JavaScript execution, attachment injection/remux, universal source preservation or new batch executor.
- No video-invented fallback to support no-media containers.

After this slice, expand adversarial filename browser evidence, MIME/signature inspection and explicit save transaction if user files/FS API are introduced; retain attachment UID/tag relationship risk and #77 data-loss evidence.
