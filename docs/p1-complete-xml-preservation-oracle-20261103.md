# P1 / Complete extracted Chapters and Tags comparison

Status: **feature branch implementation; exact-head CI and real independent fixture execution pending**.
This is an enhancement to the existing independent P0 roundtrip oracle, not a new production writer or an approved 1.0 acceptance declaration.

## User-relevant failure it can now expose

The existing `--deep` report intentionally compared every extracted chapter's limited fields but inspected **only test-fixture `P0_*` Tags**. A normal Matroska Tag such as `DIRECTOR`, `DESCRIPTION` or a nested SimpleTag could disappear from a remux without changing ffprobe's flat chapter/track list or the P0-only tag report.

Use `--complete-xml` to capture and compare **all** nodes in independently extracted `mkvextract chapters` and `mkvextract tags` XML, including:
- Multiple EditionEntry elements, nested ChapterAtom trees, chapter flags, displays, Segment references and unrecognized extracted XML fields;
- TargetTypeValue and complete UID target values as strings (including uint64 above JS Number.MAX_SAFE_INTEGER);
- Every Tag and recursively nested Simple, even if it is not named `P0_*`;
- Explicit ordering, duplicates, attributes and all other mkvextract-exposed XML leaf values.

```bash
node scripts/p0-compare-roundtrip.mjs original.mkv output.mkv p1-audit.json --complete-xml
```

Exit codes: 0 = all *checked projections* match, 2 = differences, 3 = prerequisite/tool/parsing error. The resulting JSON includes `EXTRACTED_XML_TREE_DIFFERENCE` for `chapterXmlTree` or `tagXmlTree`, with source/output subtrees. Earlier default and `--deep` modes retain the original bounded scope.

## Correct interpretation

- **Different XML does not always mean lost user content.** A muxer can safely renumber UIDs with corresponding reference updates, reorder equivalent tags or normalize optional defaults. This strict mode intentionally reports a difference for manual semantic review; it does **not** perform UID role resolution or proclaim proven loss.
- **Matching XML does not prove full Matroska fidelity.** The comparison only covers structures exposed by `mkvextract`. Unknown EBML elements, raw packet/PTS integrity, pixel-accurate font rendering, player interoperability and actual persisted files need separate oracles.
- The source/output attachment extraction and ffprobe scoped fields remain checked by the existing oracle. Input parsing errors fail closed.
- `mkvextract` and `mkvmerge` are independent **development/CI tools**, not required in the user's pure-browser Softmux runtime.
- No Matroska source bytes are edited and no new UI grant or source-output permission is created.

## Regression tests

`tests/p0-complete-xml-preservation.test.mjs` uses independent representative XML to check:
1. Multiple editions and recursive ChapterAtom visibility;
2. Non-P0 Tags, nested Simple and precise large UID target strings;
3. A missing nested ordinary Tag is detected when all ffprobe facts match;
4. Missing chapter/edition and changed target UID are reported with qualified difference code;
5. Malformed/wrong-root XML cannot be treated as empty content.

Run:
```bash
npm test
node --test tests/p0-complete-xml-preservation.test.mjs
```

For real-file acceptance, execute the command on an independently authored complex MKV and its altered/remuxed counterpart. Require one known-safe control and independently removed nested Tag and edition negatives. Store the actual input, output, external tool versions, report and execution SHA; a synthetic XML test alone is **not** a real MKV acceptance.

## Real native MKV gate

`scripts/p1-complete-xml-real-audit.mjs` is now invoked **after the independent
Matroska fixture generator** in `.github/workflows/browser-e2e.yml`.
It copies the existing mkvmerge-authored nested-ChapterUID source and uses
native `mkvpropedit` to author one non-P0 DIRECTOR Tag with an inner COMMENT.
A second copy is native-edited to remove only the inner COMMENT.

Three independent checks must run on those **real MKV files**:

1. Strict complete XML source vs byte-identical copy → checked fields match;
2. Historical `--deep` source vs altered file → does not notice the
   unmarked nested Tag loss, demonstrating the old oracle's known blind spot;
3. New `--complete-xml` source vs altered → reports `tagXmlTree` difference.

The required runner generates the files and uploads both real inputs and a
JSON receipt, including the native tool versions, even if the E2E pipeline
later fails. Evidence requires the **exact PR head** complete workflow; authored
tests alone do not constitute a passed delivery.

## Next implementation slice

Using this independent extracted-tree oracle as a regression baseline, construct a **resolved semantic graph** connecting tag target UIDs to actual Track, Attachment, Chapter and Edition objects. Accept legitimate UID renumbering when references still resolve to the same logical object; flag dangling or changed target relations. It is not safe to treat strict raw UID equality as universal semantic preservation. Then compare actual generated MKVs under this graph and connect scoped evidence to user-facing output verification, without allowing a diagnostic comparison to widen the writer's safety envelope automatically.
