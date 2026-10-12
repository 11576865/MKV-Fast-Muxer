# P2 R-02 Browser — Experimental one-PNG nonplaying Matroska creation

Status: **Draft implementation submitted; exact-head Chromium and independent downloaded-output audit pending.**

Depends on verified product [PR #93](https://github.com/11576865/MKV-Fast-Muxer/pull/93), whose **candidate writer** generated one-PNG, zero-track Matroska subsequently accepted by independent MKVToolNix and our reader. That candidate is not a general writer or a replacement for the old FFmpeg/Wasm mux.

## User-visible bounded experiment

In the independent source area of the main workbench, an explicitly labeled experimental disclosure allows selecting a **single PNG, maximum 16 MiB**. This is a new blank Matroska, not an edit to an existing container. It never changes `#videoInput`, subtitle/font/batch authoring state or `muxBtn`.

A two-step flow keeps creation and saving separate:

1. **生成并本地验证**: compile an immutable, session-File-bound `PNG_ONLY_PLAN_SCHEMA`, reject mismatched PNG prefix, use the candidate Blob writer to create EBML Header + Segment(Info, one AttachedFile), with zero Tracks/Cluster; independently *within the browser* read the resulting Blob back using the preexisting raw-EBML attachment reader, require one PNG/UID1, zero Tracks and Cluster, same byte size, and compare source and extracted FileData SHA-256 using WebCrypto.
2. **下载实验性 MKV**: enabled only after that verification returns; requires a fresh explicit user click. Uses an opaque Blob URL with safe fixed name `attachments-only.mkv`; browser owns actual destination. Input change invalidates prepared Blob and disables saving, while generation-token checking denies stale asynchronous results.

No automatic preview, no DOM execution of attachment payloads, no overwrite authorization or absolute-path selection. The status explains that local roundtrip verification is **not independent-tool conformance**, and that nonplaying MKV is not guaranteed supported by ordinary media players.

## Real Chromium independent auditor

A separate E2E scenario selects the actual PNG bytes and uses the browser UI to generate/verify/download `attachments-only.mkv`. **The actual downloaded output**, not a Node-only writer Blob or the older deterministic R-02 fixture, is parsed by an independent `mkvmerge -J`: zero tracks, one PNG with correct MIME/name/size. `mkvextract attachments` then must recover exact source PNG bytes. The E2E saves `p2-r02-browser-candidate-report.json` with SHA-256 and the outcome `BROWSER_WRITER_INDEPENDENT_ZERO_TRACK_AND_PNG_BYTES_MATCH`, plus the raw MKV and extracted PNG; workflow uploads the artifact. Mislabelled PDF bytes named `.png` must fail before preparing/saving a new file. Legacy Browser E2E and P0 preservation tests are unchanged.

## Limits and next gate

- Source identity is operation-local; no content-addressable job recovery.
- PNG 8-byte signature and same-byte audit do not certify full PNG content safety or media-player compatibility.
- The candidate writer is strictly *new container, one PNG attachment*. No multi-attachment CRUD, arbitrary MIME, existing-MKV modification, ChapterUID/Tags or unknown EBML preservation.
- Full 16 MiB browser memory/performance, cancellation/revoked object URL on all devices, destination filename collision and UX evidence remain to be verified.
- Do not remove the experimental label or promote writer to a general backend based on a single fixture or one Chromium run. The independently red P0 #77 chapter/tag remux issue remains unresolved at writer level.
