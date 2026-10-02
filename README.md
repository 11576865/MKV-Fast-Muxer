# MKV Fast Muxer v3

一个在浏览器本地运行的 **MKV 快速封装工作台**。

它面向“已有视频 / 原 MKV + ASS / SSA / SRT / WebVTT / PGS / VobSub + 可选外部音频 + 字体附件”的成品封装场景：视频和音频保持 **stream copy**，字幕作为 Matroska 软字幕轨加入，字体作为 MKV attachment 写入，不重新压制媒体流。

**Web App:** https://11576865.github.io/MKV-Fast-Muxer/  
**Package version:** 1.2.2

主界面按 01 素材、02 预览与调整、03 封装输出组织。视频与字幕是主要输入；字体和外部音频按需添加。预览是本地 FFmpeg/libass 按需生成的 16:9 静态帧，可指定时间点或跳转字幕，不是连续播放器。02 的对象入口为「全部 / 字幕 / 音频 / 字体 / 原轨道」，默认全部可见，切换时保留已编辑属性；支持新增字幕与音频 metadata、字体模式与子集化、原 MKV 轨道和附件管理。03 显示封装结构、执行状态与审计结果。批量工作区从页面下方展开，仍支持文件和文件夹输入、Group 字体子集以及输出目录。

> 媒体文件只进入当前浏览器会话和 ffmpeg.wasm 虚拟文件系统，不会上传到项目服务器。

## About

MKV Fast Muxer v3 is a browser-local Matroska muxing workbench built around a visual-first soft-mux workflow. It previews ASS/SSA with FFmpeg/libass, supports text and bitmap subtitle tracks, keeps media on Stream Copy where possible, manages source-MKV tracks/attachments, batches folder-based jobs, and audits the generated container with ffprobe. Media stays on the user device.

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
视频 + ASS 可视化预览
      ↓
轨道、字体与元数据调整
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
- 一条或多条 ASS / SSA / SRT / WebVTT 字幕已经完成时间轴；ASS / SSA 可继续携带高级排版；
- 希望在软封装前直接看到 ASS 在视频画面中的实际渲染；
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

文件扩展名只作为名称提示。单次任务会先读取容器文件头，再在执行阶段用 ffprobe 验证实际容器与轨道；扩展名与实际内容不一致时给出警告，但不会让错误后缀覆盖真实媒体身份。例如有效 MP4 改成未知后缀后仍可按 MP4 内容处理，Matroska 改成 `.mp4` 后仍可进入 MKV 原轨 / 附件管理。外部音频同样以 ffprobe 检测到的实际 codec 为准。批量模式也会读取候选文件头后再建立视频列表和字幕配对，因此未知或错误视频后缀不会再决定批量媒体身份；无法识别为受支持视频容器的文件会留在批量诊断中而不会进入任务队列。

输出固定为：

```text
MKV
```

### 2. 本地 ASS / SSA 可视化预览

1.0.0 起，主工作流加入视频 + ASS 预览。

预览使用 ffmpeg.wasm 内置 **libass** 在浏览器本地渲染所选 ASS / SSA，并可直接使用用户上传的 TTF / OTF / TTC / OTC 字体。支持输入任意时间点（秒数或 `HH:MM:SS.mmm`），也可以按“上一条 / 下一条”在 Dialogue 之间跳转；“强制统一字体”模式会同步反映到预览。

预览不会：

- 上传视频、字幕或字体；
- 修改最终参与封装的原始 ASS；
- 对视频进行转码；
- 改变最终 Stream Copy 封装策略。

为了保持本地性，预览关闭在线字体查询。

需要区分两种兼容性：

- **预览兼容性**取决于浏览器能否直接播放当前视频容器和 codec；
- **封装兼容性**取决于 ffmpeg.wasm / Matroska 是否能完成 Stream Copy。

因此浏览器无法直接播放某个 MKV、HEVC、AV1 或其他 codec 时，可能只影响预览，不代表最终 MKV 无法封装。

### 3. 多 ASS 软字幕

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

### 4. 多字幕格式

新增字幕支持：

- ASS：完整高级路径（字体依赖、glyph coverage、libass 预览、可选强制字体）；
- SSA：按 ASS-like 路径处理，可预览并保留样式；
- SRT：直接作为 Matroska 文本字幕软封装；
- WebVTT：输入支持；由于当前 ffmpeg.wasm / Matroska 写入兼容性边界，仅将该字幕流规范化为 SubRip，视频与音频仍保持 stream copy；
- PGS / SUP：作为 Matroska 图形字幕直接 stream copy；
- VobSub：选择同名 `.idx + .sub` 文件对，作为一条 DVD bitmap subtitle 轨写入 MKV。

ASS / SSA / SRT / WebVTT 统一支持 UTF-8 / UTF-16 文本解码策略；PGS / VobSub 按二进制字幕流处理，不经过文本解码。

字幕格式同样以实际内容为准，而不是由文件扩展名决定。单次与批量模式都会先读取字幕内容特征：ASS / SSA 识别脚本结构与版本，SRT 识别时间轴语法，WebVTT 识别 `WEBVTT` 头，PGS 识别二进制 segment 标记，VobSub 则把 IDX 文本索引与 SUB MPEG program stream 作为一个配对资源处理。扩展名与检测结果不一致时会提示，但仍按实际字幕格式建立封装计划。

### 5. 可选字体子集化

“字体子集化”默认关闭。开启后使用 HarfBuzz WebAssembly 根据当前字幕实际字符生成 TTF / OTF 子集，并保留 OpenType layout glyph closure；TTC / OTC 集合目前保持原文件，以避免错误拆分 collection face。子集字体仍作为标准 Matroska attachment 写入。

### 6. 批处理

批量模式支持多选文件，也支持直接选择视频目录、字幕目录与字体目录。视频候选先按实际文件头识别 MP4 / MOV / M4V / Matroska / WebM，再按同名、语言后缀以及常见 SxxExx / EPxx 形式自动配对；文件名扩展与实际容器不一致时会在任务计划中显示诊断，并以实际容器为准。字幕文件名中的 `zh-Hans` / `chs` / `cht` / `en` / `ja` / `ko` 等常见后缀会自动填入 language 与默认 title。任务按队列顺序逐项运行，共用既有 Stream Copy 与 post-mux audit 路径；单项失败会记录并继续后续任务，可中途取消。

批量字体子集化支持两种范围：每个任务独立 subset，或 **Group 模式**先汇总整个批次实际字幕字符，只生成一次 HarfBuzz 子集并复用。支持 File System Access API 的 Chromium 浏览器还可以选择输出目录，成功任务会直接把 MKV 与 JSON 报告写入该目录；不支持时保留逐项下载回退。

### 7. ASS 编码处理

支持：

- UTF-8
- UTF-8 BOM
- UTF-16LE BOM
- UTF-16BE BOM
- 无 BOM UTF-16LE / UTF-16BE（仅在字节分布足够明显时）

程序会先把字幕解码成 JavaScript 字符串，再统一以 UTF-8 写入 ffmpeg.wasm 文件系统。

如果文本编码无法可靠判断，任务会中止，而不是继续生成乱码字幕。

### 5. 多字体附件

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

### 6. 字体依赖与缺字检查

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

### 7. 强制统一字体模式

强制模式会优先选择字体内部可被 libass 稳定识别的 Family / Full / PostScript 别名，而不是简单把上传文件名当作 ASS Fontname。这样可以降低中文字体、带本地化 Family Name 的字体在预览和最终软封装中出现“附件存在但字幕不显示”的概率。

兼容旧式工作流。

选择后：

- 只使用第一个上传字体；
- ASS Style `Fontname` 改为该字体 Family Name；
- 显式 `\fnSomeFont` 改写为该字体；
- `\fn` 空参数仍保留“恢复当前样式字体”的语义；
- 其他上传字体不附加。

这不是默认模式。

## MKV 轨道管理

输入本身是 MKV 时，默认启用 **“完整保留原容器结构，仅追加”**：保留全部原音频、原字幕、附件、Chapters、全局 metadata 与原 disposition，只追加新字幕 / 外部音频 / 新字体。这个模式不要求先扫描轨道。

如果需要删轨、改 language/title、调整 Default/Forced 或附件，则点击 **扫描轨道**。开始扫描会自动切换到手动源轨控制模式，之后按逐项选择结果执行。

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

新字体如果与保留的原附件同名，会自动获得稳定的 SHA-256 短后缀，避免输出中出现含义不清的同名附件。附件区还提供全部保留、全部取消，以及恢复扫描时 filename / MIME 的快捷操作。未扫描时仍保留兼容性的整体开关。

### 外部音频

可一次加入多条外部音频，并分别设置 language、title 与 Default。外部音频与原音频一样使用 stream copy，不主动重编码。

### 批量轨道操作

扫描 MKV 后可以批量：

- 保留 / 取消全部原音频；
- 保留 / 取消全部原字幕；
- 为当前保留的音频或字幕统一设置 language；
- 仅第一条保留音频设为 Default；
- 仅第一条保留字幕设为 Default；
- 一键清除所有原轨、新增轨的 Default；
- 将原音频 / 原字幕的 language、title 与 disposition 恢复到扫描时状态。

批量操作只修改封装计划，不改变媒体码流。

新加入的 ASS、外部音频与原容器轨道分开配置。

关闭“完整保留原容器结构，仅追加”且又没有扫描时，才使用旧兼容行为：原音频保留、原字幕不保留；原附件由兼容开关决定。

## 组合兼容性解析

项目不再把“分别支持这些视频 / 音频 / 字幕 / 字体格式”解释成“这些资源可以任意做笛卡尔积组合”。

实际执行前后会区分以下兼容性状态：

- `DIRECT_COPY`：当前已知组合可按既定策略直接封装；
- `COMPATIBILITY_WARNING`：封装本身可继续，但某些资源关系可能没有实际效果，例如只有 PGS / SRT 时附加字体不会改变这些字幕的渲染；
- `CONVERSION_REQUIRED`：存在显式、可见的格式转换。目前典型情况是 WebVTT → SubRip；该转换只作用于对应字幕流，视频与音频仍保持 Stream Copy；
- `UNVERIFIED`：发现当前规则库尚未验证的 codec。程序不会因此偷偷转码，也不会仅凭静态规则宣判失败，而是继续交给实际 FFmpeg mux 路径验证；
- `UNSUPPORTED`：当前产品没有定义可执行策略的组合，会在真正封装前停止。

兼容性解析使用实际 probe 得到的容器和 stream codec，而不是文件扩展名。规则结果会和最终 FFmpeg 执行证据一起写入 JSON 封装报告；因此“规则判断”“实际 mux 成功”“封装后审计通过”是不同证据层级。

这里的兼容性指 **当前工具把这些资源写入 Matroska 的能力**。它不等于任意播放器都能正确解码或渲染该 MKV。目标播放器 / 渲染器兼容性是独立维度；未指定具体 playback profile 时，报告会明确保持为未验证。

视频和音频策略仍然是 `stream-copy-only`，不会因为组合不理想而静默重编码。

## 封装计划

执行前，“封装计划”会按“容器 / 视频 / 音频 / 字幕 / 附件”分组显示预期结构：

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

当前 UI 已作为视觉优先的专用 muxing workbench 整理：

- 固定深色工作台；
- 单次任务保持 01「输入素材」→ 02「预览与调整」→ 03「检查并封装」三段主流程；
- 01 使用紧凑素材带，视频 / 字幕为一级对象，字体 / 外部音频保持直接可见但视觉降权；
- 02 以严格 16:9 的 ASS / SSA 实际渲染预览为主视觉，右侧就地编辑新增轨道、字体与原 MKV 结构；
- 03 固定为“输出摘要 → 封装结构 → 执行 / 审计”，不与编辑控件争夺主工作区；
- 批处理位于同页主流程之后，按“视频 / 字幕 / 字体”三类对象组织，每类内部同时提供文件与文件夹入口；
- Group 字体子集、完整保留原 MKV、输出目录与队列状态保持直接可见，不使用 Basic / Advanced 模式隐藏能力；
- 只有原始日志、字体诊断与低频排错信息进入可折叠诊断区；
- 移动端 / 小平板保持单列或紧凑双列响应式布局；
- 明确的成品与审计报告保存入口。

手机 / Android 浏览器仍可使用，但超大媒体主要受浏览器内存约束。字幕预览采用按需固定预览帧：工具自动定位到一条 ASS Dialogue 的代表性时间点，用户点击“生成预览帧”后，由 ffmpeg.wasm 直接读取源视频、提取该帧，再通过内置 libass 与上传字体渲染成 PNG。这个流程不依赖浏览器 `<video>` 能否直接播放源 MKV / codec，因此与最终 Stream Copy 封装的兼容性边界更一致。

## 在线使用

GitHub Pages：

https://11576865.github.io/MKV-Fast-Muxer/

打开页面后直接选择本地文件即可。

媒体不会先上传到 GitHub Pages；Pages 只提供静态 Web App 和 ffmpeg.wasm 运行资源。

## 本地运行

需要 Node.js 与 npm。

```bash
git clone https://github.com/11576865/MKV-Fast-Muxer.git
cd MKV-Fast-Muxer
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

把 ffmpeg.wasm core 与 class worker 复制到 `public/`，避免预览和封装运行时依赖外部 CDN。

## 测试

```bash
npm test
npm run test:e2e
```

当前自动测试分为单元 / 结构回归与 Chromium Browser E2E 两层。

本地 E2E 可通过 `E2E_BROWSER_EXECUTABLE` 指定已有 Chromium / Edge 可执行文件；夹具生成脚本支持 `E2E_FONT_REGULAR`、`E2E_FONT_BOLD` 与 `E2E_PYTHON` 路径覆盖，便于使用 Git Bash 在 Windows 上生成同一套素材。需要可读取 Matroska 高级轨道标记的现代 `ffprobe`。

单元与结构回归覆盖：

- AV1 / ffprobe 探测参数策略；
- mux command / audit / report；
- 文件去重与字体相关辅助逻辑；
- 工作负载提示；
- favicon；
- 宽屏、移动端与小平板响应式布局；
- ASS 固定预览帧结构、WORKERFS 本地视频挂载与 FFmpeg/libass 渲染路径；
- 仓库改名后的 Pages / canonical / sitemap / clone URL 一致性。

Browser E2E 当前覆盖 30+ 个编号场景，包括：

- 对象切换后保留编辑值，扫描后的真实轨道 / 附件在 1920、1440、900、390 像素窗口下可操作、无横向溢出且预览保持 16:9；

- MP4 / MKV、多音轨、多 ASS、字体附件；
- Chapter、全局 metadata 与原 MKV 附件保留；
- UTF-16LE / UTF-16BE ASS；
- 同名不同内容字体；
- AV1 容器探测；
- Default / Forced / advanced disposition；
- 外部音频错误恢复、任务取消与连续任务；
- malformed ASS、损坏 / 零字节字体；
- video-only、无字幕 / 无附件 MKV；
- 原音频排序、Unicode 文件名与长 title；
- TTC collection、BCP 47、批量 metadata；
- 10 次连续 mux 的状态隔离；
- SRT / SSA / WebVTT 无字体封装；
- HarfBuzz 字体子集；
- 两任务批处理与失败隔离；
- 文件名语言自动识别；
- 原 MKV 完整保留并追加；
- 批量 Group 字体子集。

GitHub Actions 在 Pull Request 与 `main` push 上执行测试和构建；`main` 通过后部署 GitHub Pages。

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
- 深色和宽屏工作台；
- FFmpeg / libass 固定字幕预览帧。

因此当前 v3 已不只是“把三个文件拖进去”的最小封装页面，而是一套针对 ASS + font attachment 工作流的浏览器本地 MKV muxing 工具。

## 已知边界

WebVTT 当前不是以原生 WebVTT codec 写入 Matroska，而是只转换该字幕流为 SubRip；这不影响视频 / 音频的 Stream Copy。字体子集化当前只处理单文件 TTF / OTF，TTC / OTC 保留完整集合。批量模式优先解决常见剧集命名配对，不把模糊文件名强行配对。


当前新加入字幕只面向 ASS；外部音频以 stream copy 为目标，因此输入 codec 必须能被 Matroska 容器直接承载。

字体静态分析仍不能单独证明任意复杂 ASS override / drawing / transform 在所有播放器中的最终行为，因此字体检查继续作为辅助诊断；1.0.0 的 JASSUB/libass 预览用于补上封装前的直接视觉检查。

预览画面仍受浏览器原生视频解码能力约束。某些 MKV、HEVC、AV1 或特殊 codec 可能无法直接在浏览器 video 元素中播放，但这不等同于 Stream Copy 封装失败。

浏览器端 ffmpeg.wasm 的性能和文件大小上限不能等同于原生 FFmpeg。

项目负责封装、预览与容器审计，但不同播放器、libass 版本和渲染环境之间仍可能存在显示差异。

## 官方来源与版权

MKV Fast Muxer v3 的官方项目来源如下：

- 官方仓库：https://github.com/11576865/MKV-Fast-Muxer
- 官方 Web App：https://11576865.github.io/MKV-Fast-Muxer/
- 问题反馈：https://github.com/11576865/MKV-Fast-Muxer/issues

Copyright (c) 2026 11576865.

本仓库原创代码采用 MIT License；第三方组件继续受各自许可证约束。Fork、镜像、修改版或重新部署版本，除非由项目维护者明确说明，否则不属于 MKV Fast Muxer 的官方版本。

项目来源与版权声明见 [NOTICE.md](./NOTICE.md)，第三方许可证见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。


### AI 辅助开发

MKV Fast Muxer 的代码实现、调试、测试、文档及部分工程工作大量使用了 OpenAI ChatGPT 辅助完成。项目需求、功能取舍、设计方向、审查、集成、发布及维护由 11576865 负责。

该说明用于记录项目的实际开发过程；ChatGPT 与 OpenAI 不列为本项目原创代码的版权持有人。

## 许可证

本仓库原创代码采用 [MIT License](./LICENSE)。

第三方组件按各自许可证授权：

- `@ffmpeg/ffmpeg` 0.12.15 — MIT
- `@ffmpeg/util` 0.12.2 — MIT
- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later
- `jassub` 2.5.15 — 见其复合许可证与上游 libass 相关条款

详细说明见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
