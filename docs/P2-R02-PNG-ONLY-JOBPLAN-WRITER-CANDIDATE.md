# P2 R-02-W — Experimental attachment-only JobPlan and candidate EBML writer

Status: **Submitted / exact-head CI and independent candidate writer report Pending**.
This is an implementation of the previously approved user R-02/T-012 counterexample, not a change to the product's general writer capability.

## Purpose and product boundary

The user-approved `软封工程_未来规划总决议_2026-10-12` D-01/D-04/D-08/D-10 requires Matroska be modeled without a mandatory video root, yet prohibits claiming writer support based solely on a plausible EBML plan. Earlier R-02 tests proved a hard-coded **test-only** fixture with one PNG `AttachedFile`, zero `Tracks`/`Cluster`, independently readable via MKVToolNix. This slice adds a separate, restricted **candidate writer** operating on an immutable and session-bound `JobPlan`, without making it available in the workbench as a supported production operation.

## Data and authorization

`preparePngAttachmentOnlyPlan({file, filename, outputName})` requires exactly one, non-empty PNG candidate of at most 16 MiB. It creates a plain, recursively frozen `matroska-png-attachment-only-jobplan-v0` containing an output target, source-session asset ID, safe output/attached name, one `image/png` AttachedFile intent with FileUID 1, and explicit zero Tracks/Cluster. The original browser `Blob` is held in a private WeakMap keyed by the **actual frozen plan object**, not inside its serialized description. JSON cloning, same-metadata file replacement or fabricating a plan cannot inherit the source binding.

The plan's revision/identity is **operation-local evidence**, not a content digest, general source version, storage-safe portable job or authorization to overwrite a destination. Other chapter, tag, track, multi-attachment, or existing Matroska remux cases are not enabled.

## Candidate writer (not user facing)

`executePngAttachmentOnlyCandidate(plan)` validates the private source binding and reads only an eight-byte PNG signature. If not PNG, it throws; a PNG header is **not** full PNG validation. The new EBML serializer composes a Blob from header, Info (TimestampScale/MuxingApp/WritingApp), Attachments/AttachedFile and the original FileData Blob. It never creates a video track, Cluster or FFmpeg command; it does not open or modify any existing Matroska source.

The output result deliberately returns `CREATED_AWAITING_INDEPENDENT_AUDIT`, `fullByteEquivalence:'unverified'`, `independentMatroskaParsing:'not-yet-tested'`, not the name “validated MKV”.

The test-only candidate is not connected to `#videoInput`, `muxBtn`, BatchRunner, any normal user download, or the existing FFmpeg/Wasm writer. A product-facing writer capability declaration requires more than one fixture and additional user-facing error/retention tests.

## Independent verification (R-02-W)

`scripts/r02-candidate-writer-independent-audit.mjs` constructs an **actual candidate writer output** from one PNG source, independently parses it with `mkvmerge -J`, requires **zero tracks** and exactly **one `image/png` attachment**, extracts it with `mkvextract attachments`, and compares SHA-256 / byte equality to the original. The project's separate raw-EBML attachment reader then re-inspects **the same new output**, requiring zero Tracks and Cluster and the expected UID, and checks its extracted bytes equal the independent extraction.

`.github/workflows/browser-e2e.yml` retains the entire old Node/Vite/Chromium E2E suite and independent P0 safeguards, then executes the writer experiment as **non-gating research** with always-uploaded JSON/Matroska/PNG artifacts. A green workflow is insufficient: the separate report result must be `CANDIDATE_WRITER_INDEPENDENT_ZERO_TRACK_AND_PNG_BYTES_MATCH`. Failed or absent report means the candidate is not accepted.

Node tests cover supported creation, no accidental file/object freezing, copied/forged plan binding rejection, invalid names/sizes, non-PNG input refusal, exact no-media output through model reader, and bounded eight-byte prefix read.

## Remaining blockers

- **No production writer authorization or create-MKV UI** from this slice.
- PNG header alone does not validate complete PNG structure or malware safety.
- FileUID 1 is unique within this one-attachment new Segment; no graph remux or external UID reference preservation claim.
- No full Matroska conformance certification, broad parser interoperability or player compatibility.
- The existing P0 known complex chapters / ChapterUID target tags loss (#77's technical evidence) remains unaddressed and stays behind legacy preservation preflight.
- More input sizes, file names, arbitrary data types, multiple attachment UID references, memory/cancellation and browser limits must be tested before allowing general attachment CRUD.

Next: check exact-head CI and JSON, fix bounded test failure if any; separately implement browser-scoped candidate execution and explicit output audits only after independent proof.
