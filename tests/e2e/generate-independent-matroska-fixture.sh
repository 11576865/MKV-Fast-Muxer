#!/usr/bin/env bash
set -euo pipefail

# Independent-of-FFmpeg Matroska authoring corpus. Must run AFTER
# tests/e2e/generate-fixtures.sh and requires mkvmerge + mkvextract.
ROOT=".e2e/fixtures"
if [[ $# -gt 0 ]]; then ROOT="$1"; fi
command -v mkvmerge >/dev/null
command -v mkvextract >/dev/null
command -v mkvpropedit >/dev/null
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
  --attachment-name p0-generic-report.bin \
  --attachment-mime-type application/octet-stream \
  --attach-file "$ROOT/notes.txt" \
  "$ROOT/base.mp4"

# --global-tags intentionally strips tag Targets; use an explicit tag edit
# so the test really contains a ChapterUID relationship.
mkvpropedit "$ROOT/p0-independent-mkvtoolnix.mkv" --tags "all:$ROOT/p0-independent-tags.xml"

# Assert the independent writer actually emitted the proposed adversarial
# features. If it did not, fail at fixture creation, not after browser mux.
mkvextract "$ROOT/p0-independent-mkvtoolnix.mkv" chapters "$ROOT/p0-check-chapters.xml"
mkvextract "$ROOT/p0-independent-mkvtoolnix.mkv" tags "$ROOT/p0-check-tags.xml"
grep -q 'P0 nested chapter' "$ROOT/p0-check-chapters.xml"
grep -q 'P0_NESTED_CHAPTER_KEEP' "$ROOT/p0-check-tags.xml"
grep -q '<ChapterUID>510011</ChapterUID>' "$ROOT/p0-check-tags.xml"

cp "$ROOT/zh.ass" "$ROOT/p0-independent-mkvtoolnix.zh.ass"
echo "Independent Matroska P0 fixture generated."


# Second corpus member: flat/no ChapterAtom hierarchy but an explicitly linked
# P0_TRACK_RELATION tag. The existing guard must only warn for TrackUID risk.
# The marker is dynamically linked to the real video's writer-generated UID.
mkvmerge --quiet --output "$ROOT/p0-independent-tracktag.mkv" "$ROOT/base.mp4"
python3 - "$ROOT/p0-independent-tracktag.mkv" "$ROOT/p0-independent-tracktag-tags.xml" <<'PY'
import json
import subprocess
import sys
from xml.etree import ElementTree as ET

source, destination = sys.argv[1:]
info = json.loads(subprocess.check_output(["mkvmerge", "-J", source], text=True))
videos = [track for track in info["tracks"] if track["type"] == "video"]
if len(videos) != 1:
    raise SystemExit("P0 track-tag fixture requires exactly one video")
uid = videos[0].get("properties", {}).get("uid")
if not isinstance(uid, int) or uid <= 0:
    raise SystemExit("P0 track-tag fixture lacks video UID")
root = ET.Element("Tags")
tag = ET.SubElement(root, "Tag")
targets = ET.SubElement(tag, "Targets")
ET.SubElement(targets, "TargetTypeValue").text = "30"
ET.SubElement(targets, "TrackUID").text = str(uid)
simple = ET.SubElement(tag, "Simple")
ET.SubElement(simple, "Name").text = "P0_TRACK_RELATION"
ET.SubElement(simple, "String").text = "only-video"
tree = ET.ElementTree(root)
tree.write(destination, encoding="UTF-8", xml_declaration=True)
PY
mkvpropedit "$ROOT/p0-independent-tracktag.mkv" \
  --tags "all:$ROOT/p0-independent-tracktag-tags.xml"
mkvextract "$ROOT/p0-independent-tracktag.mkv" tags "$ROOT/p0-tracktag-check.xml"
grep -q 'P0_TRACK_RELATION' "$ROOT/p0-tracktag-check.xml"
grep -q 'TrackUID' "$ROOT/p0-tracktag-check.xml"
echo "P0 flat TrackUID-targeted tag fixture generated."
