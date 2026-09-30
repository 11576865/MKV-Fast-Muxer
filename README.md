# MKV Fast Muxer v3

一个在浏览器本地运行的 **MKV 快速封装工作台**。

它面向“已有视频 / 原 MKV + 多条 ASS + 可选外部音频 + 字体附件”的成品封装场景：视频和音频保持 **stream copy**，字幕作为 Matroska 软字幕轨加入，字体作为 MKV attachment 写入，不重新压制媒体流。

**Web App:** https://11576865.github.io/MKV-Fast-Muxer-v3/  
**Package version:** 0.7.0

> 媒体文件只进入当前浏览器会话和 ffmpeg.wasm 虚拟文件系统，不会上传到项目服务器。

## About

MKV Fast Muxer v3 is a browser-local Matroska muxing workbench for combining existing video, ASS subtitles and font attachments without re-encoding the media streams. It includes ASS font dependency analysis, MKV track management, editable subtitle metadata, mux-plan preview and post-mux ffprobe auditing, while keeping all media processing on the user device.

## 项目定位

这个项目不是视频编辑器，也不是硬字幕压制器。

它解决的是已经完成字幕排版之后的 **最终封装（muxing）**：

```text
视频 / 原 MKV
      +
ASS 字幕
      +
TTF / OTF / TTC / OTC 字体
      ↓
轨道与字体检查
      ↓
封装计划
      ↓
ffmpeg.wasm stream copy
      ↓
MKV
      ↓
ffprobe 审计
```

核心原则：

- 不重新编码视频；
- 不重新编码音频；
- 不把 ASS 烧进画面；
- 不把媒体上传到远端后端；
- 尽可能在封装前暴露轨道、字体和元数据问题；
- 封装后再检查实际容器结构。

## 适合的工作流

典型使用场景：

- MP4 / MKV / WebM / MOV / M4V 已经是最终视频；
- 一条或多条 ASS 字幕已经完成时间轴和排版；
- 可选加入 FLAC / AAC / Opus 等外部音频轨；
- 字幕使用一个或多个外部字体；
- 希望把视频、字幕、字体一次性封装进 MKV；
- 希望保留原视频 / 音频码流，不做二次压缩；
- 输入本身是 MKV 时，需要管理原音频、字幕和附件。

如果需要的是：

- 硬字幕烧录；
- H.264 / HEVC / AV1 转码；
- 视频剪辑；
- 音频重编码；
- OCR / 字幕识别；

这些不属于本项目职责。

## 核心能力

### 1. Stream copy MKV 封装

封装核心等价于：

```text
-c copy
```

因此原有视频和音频不会因为封装再次有损压缩。

支持输入：

```text
MP4 / MKV / WebM / MOV / M4V
```

输出固定为：

```text
MKV
```

### 2. 多 ASS 软字幕

支持一次选择多条 ASS。每条新增字幕独立写入 MKV，并可分别设置 language、title、Default 与 Forced。

可设置：

- language（可直接输入 ISO 639 或 BCP 47，例如 `zho`、`eng`、`zh-Hans`）
- title
- Default
- Forced
- 高级属性：Original、Commentary、Hearing impaired

内置语言项：

- `und` — 未指定
- `zho` — 简体中文
- `eng` — English
- `jpn` — 日本語
- `kor` — 한국어
- `mul` — 多语言 / 双语

默认使用 `und`，避免在无法可靠判断语言时写入错误元数据。

### 3. ASS 编码处理

支持：

- UTF-8
- UTF-8 BOM
- UTF-16LE BOM
- UTF-16BE BOM
- 无 BOM UTF-16LE / UTF-16BE（仅在字节分布足够明显时）

程序会先把字幕解码成 JavaScript 字符串，再统一以 UTF-8 写入 ffmpeg.wasm 文件系统。

如果文本编码无法可靠判断，任务会中止，而不是继续生成乱码字幕。

### 4. 多字体附件

支持一次选择多个 TTF / OTF / TTC / OTC。TTC / OTC 会按集合内的 face 解析 Family、Weight、Italic 与 Unicode `cmap`，但在 MKV 中仍只附加原始集合文件一次。

默认模式是：

```text
保留 ASS 原字体
```

程序会分析：

- `[V4+ Styles]` / `[V4 Styles]`
- Style `Fontname`
- Dialogue 使用的 Style
- 内联 `\fn`
- `\b`
- `\i`
- `\r`
- `\t(...)` 中的字体 / 粗体 / 斜体变化

并读取字体文件中的：

- Family Name
- Full Name
- PostScript Name
- weight
- bold / italic 信息
- Unicode `cmap`

然后把 ASS 实际请求的 Family / Weight / Italic 映射到上传的具体 font face。

### 5. 字体依赖与缺字检查

程序不仅检查“有没有上传字体”，还会检查：

```text
这个 ASS 片段
由哪个字体 face 负责
这个 face 是否真的包含这些 Unicode 字符
```

检查结果是 **WARNING**，不会自动阻止封装。

这样可以在保留用户决定权的同时，提前发现：

- 缺失字体；
- Regular / Bold / Italic / Bold Italic 家族不完整；
- CJK / 特殊符号缺字；
- ASS transform 中潜在的动态字体依赖。

### 6. 强制统一字体模式

兼容旧式工作流。

选择后：

- 只使用第一个上传字体；
- ASS Style `Fontname` 改为该字体 Family Name；
- 显式 `\fnSomeFont` 改写为该字体；
- `\fn` 空参数仍保留“恢复当前样式字体”的语义；
- 其他上传字体不附加。

这不是默认模式。

## MKV 轨道管理

当输入本身是 MKV 时，可以先执行 **扫描轨道**。

扫描后可管理原：

### 音频轨

- 保留 / 移除
- language
- title
- 输出顺序
- Default
- 高级属性：Original、Commentary、Hearing impaired

### 字幕轨

- 保留 / 移除
- language
- title
- 输出顺序
- Default
- Forced
- 高级属性：Original、Commentary、Hearing impaired

### 原附件

扫描 MKV 后会列出原附件，可逐项选择保留，也可以修改选中附件的：

- filename
- MIME type

新字体如果与保留的原附件同名，会自动获得稳定的 SHA-256 短后缀，避免输出中出现含义不清的同名附件。也可以使用“全部保留”；未扫描时仍保留兼容性的整体开关。

### 外部音频

可一次加入多条外部音频，并分别设置 language、title 与 Default。外部音频与原音频一样使用 stream copy，不主动重编码。

### 批量轨道元数据

扫描 MKV 后可对“当前保留”的原音频或原字幕批量设置 language，并提供 Default 快捷策略：

- 仅第一条保留音频设为 Default；
- 仅第一条保留字幕设为 Default；
- 一键清除所有原轨、新增轨的 Default。

批量操作只修改封装计划中的元数据，不改变媒体码流。

新加入的 ASS、外部音频与原容器轨道分开配置。

如果没有扫描 MKV 轨道，则保持兼容行为：

- 原音频默认保留；
- 原字幕默认不保留。

## 封装计划

执行前，“封装计划”会把预期容器结构直接列出来：

```text
Video
Audio #1
Audio #2
Subtitle #1
New ASS
Attachments
```

并提示例如：

- 多个 Default 音频；
- 多个 Default 字幕；
- 未扫描原 MKV 时的兼容行为；
- Chapter 的保留状态；
- 全局 metadata 的保留状态；
- 原附件是否保留及同名冲突；
- 新字体附件数量。

这样轨道策略不是隐藏在 FFmpeg 命令里，而是在执行前可见。

## 封装后审计

生成 MKV 后，会再运行 ffprobe 检查实际结果，包括：

- 视频 / 音频 / 字幕轨数量与 codec 保真；
- 轨道相关元数据；
- language；
- title；
- Default / Forced；
- Original / Commentary / Hearing impaired；
- 附件数量、filename 与 MIME type；
- 被选择保留的原附件与新字体文件名；
- Chapter 数量；
- 容器 title；
- 可保留的全局 metadata tags。

审计使用偏向 **容器元数据** 的探测策略，不要求完整解码视频。

对于 AV1 等浏览器 wasm 解码支持有限的情况，会尽量关闭不必要的 stream info 分析，避免“只是检查容器，却因为视频解码器限制失败”。

如果：

```text
MKV 已成功生成
但 ffprobe 审计失败
```

成品仍然允许保存，界面会明确标记为 **审计未完成**，不会把已成功生成的 MKV 当成失败结果丢弃。

## 任务安全

当前实现包含：

- 任务运行期间锁定输入；
- 防止重复启动同一封装任务；
- 每个任务使用唯一临时文件名；
- 可取消当前任务；
- 取消时终止当前 ffmpeg.wasm worker；
- 下一次任务自动重新加载 core；
- 新任务不会复用上一次任务的临时文件。

这是为了避免浏览器端并行任务互相覆盖输入或输出。

## 本地处理与隐私边界

浏览器页面和 ffmpeg.wasm core 可以从 GitHub Pages 加载，但：

```text
视频
字幕
字体
生成的 MKV
```

都在当前设备的浏览器上下文中处理。

项目没有媒体上传 API，也没有远端转码后端。

需要注意：

> 浏览器本地处理不等于“无限文件大小”。

界面会汇总当前选中的视频、外部音频、ASS 与字体大小，并按经验阈值给出“普通 / 较大 / 很大”的非阻断提示。这个提示不是浏览器硬限制，也不会阻止任务。

ffmpeg.wasm 需要把输入和处理中间数据放进浏览器可用内存，因此超大视频的可处理上限取决于：

- 设备 RAM；
- 浏览器内存限制；
- wasm 内存；
- 输入文件数量；
- MKV 原附件规模。

桌面浏览器通常比移动设备更适合较大的文件。

## 界面

当前 UI 已作为专用 muxing workbench 整理：

- 白天 / 夜间 / 跟随系统；
- 宽屏桌面布局；
- 输入区；
- 字幕与字体控制；
- MKV 轨道管理；
- 输出工作台；
- 封装计划；
- 执行与校验；
- 可展开运行日志；
- 明确的成品保存入口。

手机 / Android 浏览器仍可使用，但超大媒体主要受浏览器内存约束。

## 在线使用

GitHub Pages：

https://11576865.github.io/MKV-Fast-Muxer-v3/

打开页面后直接选择本地文件即可。

媒体不会先上传到 GitHub Pages；Pages 只提供静态 Web App 和 ffmpeg.wasm 运行资源。

## 本地运行

需要 Node.js 与 npm。

```bash
git clone https://github.com/11576865/MKV-Fast-Muxer-v3.git
cd MKV-Fast-Muxer-v3
npm install
npm run dev -- --host 127.0.0.1
```

然后打开 Vite 输出的地址，通常为：

```text
http://127.0.0.1:5173/
```

安装阶段的 `postinstall` 会运行：

```text
scripts/copy-core.mjs
```

把 ffmpeg.wasm core 与 class worker 复制到 `public/`，避免运行时依赖外部 CDN。

## 测试

```bash
npm test
```

当前自动测试覆盖：

- AV1 / ffprobe 探测参数策略；
- favicon 资源；
- 宽屏桌面布局关键结构。

GitHub Actions 在 Pull Request 上执行测试和构建；向 `main` 推送后再部署 GitHub Pages。

## 构建

```bash
npm run build
```

结果位于：

```text
dist/
```

## v3 的由来

v3 最初是为了解决 Android / Termux + Vite 环境下 ffmpeg.wasm Worker 与 core 静态加载问题。

之后项目逐渐加入：

- UTF-16 ASS 安全解码；
- 字幕语言元数据；
- 多字体依赖分析；
- TTC / OTC 字体集合 face 解析；
- glyph coverage；
- 字体 face 匹配；
- 原 MKV 轨道管理；
- 封装计划；
- post-mux audit；
- AV1 容器级探测策略；
- 任务互斥与取消；
- 深浅色和宽屏工作台。

因此当前 v3 已不只是“把三个文件拖进去”的最小封装页面，而是一套针对 ASS + font attachment 工作流的浏览器本地 MKV muxing 工具。

## 已知边界

当前新加入字幕只面向 ASS；外部音频以 stream copy 为目标，因此输入 codec 必须能被 Matroska 容器直接承载。

字体静态分析不能完整证明任意复杂 ASS override / drawing / transform 在所有播放器中的最终渲染行为，因此字体检查被设计为辅助诊断，而不是完整 ASS renderer。

浏览器端 ffmpeg.wasm 的性能和文件大小上限不能等同于原生 FFmpeg。

项目只负责封装和容器审计，不负责证明每个播放器都会以完全相同方式渲染 ASS。

## 许可证

本仓库原创代码采用 [MIT License](./LICENSE)。

第三方组件按各自许可证授权：

- `@ffmpeg/ffmpeg` 0.12.15 — MIT
- `@ffmpeg/util` 0.12.2 — MIT
- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later

详细说明见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
