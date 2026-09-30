#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.e2e/fixtures}"
rm -rf "$ROOT"
mkdir -p "$ROOT"

FONT_SRC="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
test -f "$FONT_SRC"
cp "$FONT_SRC" "$ROOT/DejaVuSans.ttf"
cp "$FONT_SRC" "$ROOT/DejaVuSans-copy.ttf"

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

echo "Generated E2E fixtures in $ROOT"
ffprobe -v error -show_entries stream=index,codec_type,codec_name:stream_tags=language,title,filename,mimetype -show_chapters -show_format -of json "$ROOT/source-with-attachments.mkv"
