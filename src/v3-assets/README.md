# Softmux V3 exact Figma SVGs

These icons were exported without edits from approved Figma file `5iZSy48FV1sJnGdmUf1uQc`, V3 node `28:2`, on 2026-11-04. Each file contains the vector geometry/inline color exported from the named icon node; do not replace by an approximate glyph or runtime temporary asset URL.

- `softmux.svg` → Figma node `28:6`
- `mkv-document.svg` → Figma node `28:12`
- `add-file.svg` → Figma node `28:22`
- `search.svg` → Figma node `28:27`
- `undo.svg` → Figma node `28:31`
- `help.svg` → Figma node `28:34`
- `settings.svg` → Figma node `28:38`
- `more.svg` → Figma node `28:43`
- `documents.svg` → Figma node `28:50`
- `object-list.svg` → Figma node `28:54`
- `video.svg` → Figma node `28:127`
- `audio.svg` → Figma node `28:143`
- `subtitle.svg` → Figma node `28:169`
- `attachment.svg` → Figma node `28:193`
- `chapter.svg` → Figma node `28:201`
- `tag.svg` → Figma node `28:209`
- `open.svg` → Figma node `28:135`
- `create-output.svg` → Figma node `28:117`
- `ready.svg` → Figma node `28:223`

## V3-03 explicit destination chooser (Figma `31:2`, 2026-11-06)

The following are exact, unchanged SVG exports from the approved target picker, not substitute glyphs. Original root intrinsic dimensions and stroke values are retained.

- `picker-selected.svg` → Figma node `31:249`, 17×17, selected base indicator
- `picker-empty-target.svg` → Figma node `31:255`, 17×17, blank-target indicator (UI disabled until a real execution path is approved)
- `picker-confirm.svg` → Figma node `31:260`, 18×18, confirmation icon

`src/softmux-v3-surface.js` references these as build-local assets. A stable `data-sfv3-icon` attribute identifies their actual design role regardless of whether Vite retains the filename in a URL or inlines a small SVG as a `data:` URI. Real Chromium assertions require successful image loading; visual fidelity remains subject to whole-frame review.
