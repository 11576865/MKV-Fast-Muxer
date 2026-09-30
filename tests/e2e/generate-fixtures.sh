#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.e2e/fixtures}"
rm -rf "$ROOT"
mkdir -p "$ROOT"

FONT_REGULAR="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
test -f "$FONT_REGULAR"
test -f "$FONT_BOLD"
cp "$FONT_REGULAR" "$ROOT/DejaVuSans.ttf"
cp "$FONT_REGULAR" "$ROOT/DejaVuSans-copy.ttf"

mkdir -p "$ROOT/font-a" "$ROOT/font-b"
cp "$FONT_REGULAR" "$ROOT/font-a/Same.ttf"
cp "$FONT_BOLD" "$ROOT/font-b/Same.ttf"

cat > "$ROOT/zh.ass" <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Primary subtitle
ASS

cat > "$ROOT/en.ass" <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,22,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.20,0:00:01.70,Default,,0,0,0,,Secondary subtitle
ASS

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
zh = (root / "zh.ass").read_text(encoding="utf-8")
en = (root / "en.ass").read_text(encoding="utf-8")
(root / "zh-utf16le.ass").write_bytes(b"\xff\xfe" + zh.encode("utf-16le"))
(root / "en-utf16be.ass").write_bytes(b"\xfe\xff" + en.encode("utf-16be"))
PY

cat > "$ROOT/chapters.ffmeta" <<'META'
;FFMETADATA1
title=Fixture Container
[CHAPTER]
TIMEBASE=1/1000
START=0
END=900
title=Opening
[CHAPTER]
TIMEBASE=1/1000
START=900
END=1800
title=Ending
META

printf 'fixture attachment\n' > "$ROOT/notes.txt"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=24:duration=2" \
  -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=2" \
  -shortest \
  -c:v mpeg4 -q:v 5 -pix_fmt yuv420p \
  -c:a aac -b:a 96k \
  "$ROOT/base.mp4"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=2" \
  -c:a flac \
  "$ROOT/external.flac"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=2" \
  -c:a libopus -b:a 64k \
  "$ROOT/original-second.opus"

ffmpeg -hide_banner -loglevel error -y \
  -i "$ROOT/base.mp4" \
  -f ffmetadata -i "$ROOT/chapters.ffmeta" \
  -map 0 -map_metadata 1 -map_chapters 1 -c copy \
  -attach "$ROOT/DejaVuSans.ttf" \
  -metadata:s:t:0 mimetype=application/x-truetype-font \
  -metadata:s:t:0 filename=fixture-original.ttf \
  -attach "$ROOT/notes.txt" \
  -metadata:s:t:1 mimetype=text/plain \
  -metadata:s:t:1 filename=notes.txt \
  "$ROOT/source-with-attachments.mkv"

ffmpeg -hide_banner -loglevel error -y \
  -i "$ROOT/base.mp4" \
  -i "$ROOT/original-second.opus" \
  -i "$ROOT/en.ass" \
  -map 0:v:0 -map 0:a:0 -map 1:a:0 -map 2:s:0 \
  -c copy \
  -metadata:s:a:0 language=jpn \
  -metadata:s:a:0 title="Japanese AAC" \
  -disposition:a:0 default \
  -metadata:s:a:1 language=eng \
  -metadata:s:a:1 title="English Opus" \
  -disposition:a:1 0 \
  -metadata:s:s:0 language=jpn \
  -metadata:s:s:0 title="Original Signs" \
  -disposition:s:0 forced \
  "$ROOT/source-multitrack.mkv"

if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libaom-av1'; then
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=160x90:rate=12:duration=1" \
    -f lavfi -i "sine=frequency=520:sample_rate=48000:duration=1" \
    -shortest \
    -c:v libaom-av1 -cpu-used 8 -crf 45 -b:v 0 \
    -c:a aac -b:a 64k \
    "$ROOT/av1.mp4"
else
  echo "libaom-av1 encoder unavailable; AV1 E2E scenario will be skipped."
fi

echo "Generated E2E fixtures in $ROOT"
ffprobe -v error -show_entries stream=index,codec_type,codec_name:stream_tags=language,title,filename,mimetype -show_chapters -show_format -of json "$ROOT/source-with-attachments.mkv"
ffprobe -v error -show_entries stream=index,codec_type,codec_name:stream_tags=language,title -of json "$ROOT/source-multitrack.mkv"
