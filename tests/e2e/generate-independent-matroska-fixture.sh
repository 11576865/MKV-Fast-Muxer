#!/usr/bin/env bash
set -euo pipefail

# Independent-of-FFmpeg Matroska authoring corpus. Must run AFTER
# tests/e2e/generate-fixtures.sh and requires mkvmerge + mkvextract.
ROOT=".e2e/fixtures"
if [[ $# -gt 0 ]]; then ROOT="$1"; fi
command -v mkvmerge >/dev/null
command -v mkvextract >/dev/null
test -f "$ROOT/base.mp4"
test -f "$ROOT/notes.txt"

cat > "$ROOT/p0-independent-chapters.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<Chapters>
  <EditionEntry>
    <EditionUID>510001</EditionUID>
    <ChapterAtom>
      <ChapterUID>510010</ChapterUID>
      <ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>
      <ChapterTimeEnd>00:00:02.000000000</ChapterTimeEnd>
      <ChapterDisplay>
        <ChapterString>P0 parent chapter</ChapterString>
        <ChapterLanguage>eng</ChapterLanguage>
      </ChapterDisplay>
      <ChapterAtom>
        <ChapterUID>510011</ChapterUID>
        <ChapterTimeStart>00:00:00.200000000</ChapterTimeStart>
        <ChapterTimeEnd>00:00:01.000000000</ChapterTimeEnd>
        <ChapterDisplay>
          <ChapterString>P0 nested chapter</ChapterString>
          <ChapterLanguage>eng</ChapterLanguage>
        </ChapterDisplay>
      </ChapterAtom>
    </ChapterAtom>
  </EditionEntry>
</Chapters>
XML

cat > "$ROOT/p0-independent-tags.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<Tags>
  <Tag>
    <Targets><TargetTypeValue>50</TargetTypeValue></Targets>
    <Simple>
      <Name>P0_GLOBAL_KEEP</Name>
      <String>independent-mkvmerge-marker</String>
    </Simple>
  </Tag>
  <Tag>
    <Targets>
      <TargetTypeValue>30</TargetTypeValue>
      <ChapterUID>510011</ChapterUID>
    </Targets>
    <Simple>
      <Name>P0_NESTED_CHAPTER_KEEP</Name>
      <String>linked-chapter-metadata</String>
    </Simple>
  </Tag>
</Tags>
XML

# Do not use the FFmpeg writer to author this container: the preservation
# experiment must not only test the muxer's own preferred EBML subset.
mkvmerge --quiet \
  --output "$ROOT/p0-independent-mkvtoolnix.mkv" \
  --chapters "$ROOT/p0-independent-chapters.xml" \
  --global-tags "$ROOT/p0-independent-tags.xml" \
  --attachment-name p0-generic-report.bin \
  --attachment-mime-type application/octet-stream \
  --attach-file "$ROOT/notes.txt" \
  "$ROOT/base.mp4"

# Assert the independent writer actually emitted the proposed adversarial
# features. If it did not, fail at fixture creation, not after browser mux.
mkvextract "$ROOT/p0-independent-mkvtoolnix.mkv" chapters \
  | grep -q 'P0 nested chapter'
mkvextract "$ROOT/p0-independent-mkvtoolnix.mkv" tags \
  | grep -q 'P0_NESTED_CHAPTER_KEEP'

echo "Independent Matroska P0 fixture generated."
