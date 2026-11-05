# Approved Softmux V3 — reference renders

These are PNG exports of the **user-approved Figma artboards**, captured on 2026-11-04 from file `5iZSy48FV1sJnGdmUf1uQc`. They are reference evidence only: never use them as runtime UI assets, and do not count their existence as a passing browser visual diff.

- `v3-desktop-source-1440x900.png` → Figma node `28:2`
- `v3-portrait-source-820x1180.png` → Figma node `33:2`
- `v3-landscape-target-1180x820.png` → Figma node `36:2`
- `v3-compact-target-620x900.png` → Figma node `37:223`
- `v3-desktop-empty-1440x900.png` → Figma node `39:2`

The Figma mock data (A.mkv/B.mkv/track metadata) is static; Chromium fixture names and media differ. Visual QA must compare **corresponding viewport, fonts, layouts, icon slots and semantic states**, mask or replace dynamic regions explicitly, and report differences rather than apply a universal PNG score. Figma screen snapshots are not interactive proof. No final motion approval exists.
