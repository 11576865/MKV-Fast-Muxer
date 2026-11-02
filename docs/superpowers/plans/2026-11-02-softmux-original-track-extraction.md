# Core delivery: original track extraction

User priority: expand actual container/media capabilities. Do not replace this unit with more undo, queue, selection or testing-only infrastructure.

Current evidence: source audio/subtitle tracks can be scanned/edited/remuxed; embedded ASS is temporarily read for preview. There is no public original audio/subtitle export flow. Attachment extraction is already separate and must remain available.

Goal: select an actually observed original audio or subtitle stream from the imported source and produce a reusable standalone media output using stream copy. No source overwrite, transcode or mutation of the current mux composition.

Implementation path:
- Existing source object inspector context action, exact source File and raw stream index witness.
- Reuse the current FFmpeg/Wasm owner and WORKERFS staging, busy/cancel handling and cleanup. Do not create a second project or writer authority.
- Codec-appropriate lossless extraction for supported explicit formats; use standalone Matroska audio/subtitle (MKA/MKS) where appropriate to preserve codec private data without inventing elementary format support.
- Copy packets/timestamps from the original source; use observed source metadata, not pending edits. Missing/changed File/stream or unsupported execution fails explicitly.
- Exported subtitle track is not a promise that original font attachments/chapters/Tags are included; make the exact extracted scope visible.
- Extraction artifacts/receipt are separate from the current remux output, and cannot overwrite source or acquire its output-audit/save authority.

Acceptance:
- Actual browser outputs for named original AAC/FLAC and text ASS/SRT samples; appropriate graphic-subtitle container samples if supported by the unchanged backend.
- Native FFprobe every packet SHA/count/PTS checks plus codec private data/metadata where available. Independent raw ASS text/frame checks as applicable.
- Source bytes and authored remux plan unchanged; stale-source and cancellation recovery tested with actual current workbench.
- Ship the capability and its result files; no claim of generic player compatibility or full original Matroska structural preservation.

Deferred until PR221 bounded repair validation: exact file formats and per-codec cases must be settled from native/backend reproduction before implementation. This plan is not a completion claim.
