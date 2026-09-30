# About MKV Fast Muxer v3

## GitHub About

**Description**

Browser-local MKV muxing workbench with FFmpeg/libass ASS/SSA preview, text + bitmap subtitles, Stream Copy, batch folders, font subsetting, source-MKV preservation and post-mux audit.

**Homepage**

https://11576865.github.io/MKV-Fast-Muxer/

**Suggested topics**

`mkv` `matroska` `ffmpeg-wasm` `ass-subtitles` `libass` `jassub` `subtitle-preview` `stream-copy` `webassembly` `browser-tool` `font-attachments` `muxing`

## 项目简介

MKV Fast Muxer v3 是一个完全在浏览器本地运行的 Matroska / MKV 软封装工作台。它面向“媒体已经完成，现在需要追加文本/图形字幕、字体或音频并形成最终 MKV”的阶段。

1.0.0 将工作流从“先看参数，再封装”改为“先看见，再封装”：选择本地视频、ASS 与字体后，可以先用 FFmpeg / libass 直接查看字幕在画面中的渲染，再调整新增轨道、原 MKV 轨道、metadata、Default / Forced、附件与字体策略。

视频和音频默认使用 Stream Copy，不重新编码；ASS 作为软字幕轨加入；字体作为 Matroska attachments 写入；生成后再由 ffprobe 审计实际轨道、附件、Chapter 与 metadata。

项目没有媒体上传后端。视频、字幕、字体与输出 MKV 都留在用户设备的浏览器上下文中。

## What it is

- A browser-local MKV muxing workbench.
- A visual preflight tool for ASS / SSA subtitle + font workflows.
- A text + bitmap subtitle muxer (ASS / SSA / SRT / WebVTT / PGS / VobSub).
- A folder-oriented batch muxer with optional Group font subsetting.
- A Stream Copy oriented final-packaging tool.
- A track / attachment metadata editor for source MKV files.
- A mux-plan and post-mux audit workflow.

## What it is not

- A hard-subtitle encoder.
- A general video editor.
- A transcoding frontend.
- An OCR / ASR subtitle generator.
- A guarantee that every external player will render ASS identically.

## Core workflow

```text
Local video / source MKV
        +
ASS subtitles
        +
fonts / optional external audio
        ↓
FFmpeg / libass preview frame
        ↓
track + font + metadata adjustments
        ↓
mux plan
        ↓
ffmpeg.wasm Stream Copy
        ↓
MKV
        ↓
ffprobe audit
```
