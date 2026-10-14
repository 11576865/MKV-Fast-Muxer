# P0/P2-N2 — Indexed nonterminal Attachments, non-final FileUID length editing

Status: **integrated branch, pending exact-head full Node/Chromium/native-MKVToolNix acceptance**. This expands only [the bounded merged relay writer #139](https://github.com/11576865/MKV-Fast-Muxer/pull/139), not arbitrary Matroska or the closed historical #77 remux preservation gate.

## New genuine capability

The user selects **any original unreferenced Attachment FileUID**, including the first or middle AttachedFile, inside an original **nonterminal** Attachments master with a validated direct existing SeekHead index. The parent Attachments master is still relocated to Segment EOF as a newly resized copy; the original byte span becomes an equal-length chained SeekHead relay, preserving all pre-existing top-level Cluster/Cues/Chapters/Tags/Tracks bytes and offsets.

The selected AttachedFile is located by **the exact original FileData byte range supplied by an independently inspected attachment inventory**, not array index or filename. Source EBML traversal requires one actual FileData per candidate AttachedFile to avoid ambiguity. Its nested SIZE field and the enclosing Attachments and Segment sizes must remain representable using their original VINT widths. Source and output UID target graphs must agree; any TagAttachmentUID reference to the selected original FileUID blocks writing.

If the selected FileData is followed by another AttachedFile, that later original FileData's output byte offset **must equal the original offset + (original Source EOF − original Attachments start) + requested length delta**. If it precedes the modified data, the delta is zero. The target FileData offset itself moves only by the original master relocation distance; the target length changes. For every source attachment, the output reader must verify FileUID, filename, MIME, description, length (except selected), exact calculated output range, and SHA-256 of the original unmodified FileData. This prevents conflating semantic preservation with unchanged offsets when offsets necessarily change inside the appended Attachments master.

CRC in affected target AttachedFile or Attachments master remains refused; unknown target fields fail closed. The relocated bytes of other AttachedFile children are copied unchanged, not regenerated or parsed into FFmpeg. Frozen private in-session File grants, explicit review, current picker SHA-256 checks at write and download, original source bytes untouched and manual separate MKV output remain requirements.

## Independent acceptance

Node adversarial tests: original two-attachment nonterminal indexed source with **free first, Tag-linked second**; grow the free first by +41 bytes; shrink it; prove later tagged FileUID/data preserves bytes and its output offset reflects exactly the length delta. Negative tests keep tagged selection refusal and all existing index/CRC/unknown/forged plan gates.

Full Chromium scenario **authors a new original three-attachment MKV with native mkvmerge**, then adds native nested Chapters and a real `TagAttachmentUID` target of the **first** attachment using native mkvpropedit. The **middle** existing FileUID is the actual edited item; a **third** unmodified original attachment lies after it. This is deliberately **not** a test-only source relocation or synthetic EBML source. Full browser selects the middle UID, reviews and downloads real grown FileData output. Independent native `mkvmerge -J` must discover all 3 attachments with identical UIDs and metadata; `mkvextract` proves the first and third original attachment bytes as well as the middle replacement content, Chapters and targeted Tags; `ffprobe` validates all original compressed packet SHA-256 and PTS/DTS. Original source SHA must not change.

**Do not merge without full exact-head Node, build and real browser, and named independent native three-attachment output success.** No broad player conformance, unknown EBML support, source without original SeekHead index, VINT widening, source >60 MiB or CRC rewriter follows from this work.
