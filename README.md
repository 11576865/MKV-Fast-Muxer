# MKV Fast Muxer v3

一个在浏览器本地运行的 MKV 快捷自动封包工具。

它把视频、ASS 字幕和 TTF/OTF 字体封装进 MKV 容器，视频与音频保持 `copy`，不重新编码。

## 功能

- 支持 MP4 / MKV / WebM / MOV / M4V 输入视频
- ASS 作为软字幕封装
- 正确读取 UTF-8、UTF-16LE、UTF-16BE ASS（含 BOM；无 BOM UTF-16 使用保守启发式检测）
- TTF / OTF 支持多选并作为多个字体附件封装
- 默认“保留 ASS 原字体”模式：解析 Style `Fontname` / `Bold` / `Italic`、Dialogue 的 Style、内联 `\fn` / `\b` / `\i` 与 `\r`，并匹配到具体字体 face
- 兼容“强制统一字体”模式：ASS 样式和显式内联 `\fn` 改为第一个上传字体的 Family Name，其余上传字体不附加
- 字体依赖与缺字检查：读取 Unicode `cmap`，按每个 ASS 字体实际承担的 Dialogue 字符做非阻断式覆盖检查
- 字体家族完整性检查：按 Family 汇总 Regular / Bold / Italic / Bold Italic，报告缺失的基础 face
- ASS transform 字体分析：识别 `\t(...)` 内的 `\fn` / `\b` / `\i`，将动态样式作为潜在字体依赖纳入检查
- 可选择新字幕的 Matroska 语言元数据，不再固定写成中文
- MKV 输入可扫描原音频/字幕轨，逐轨选择是否保留、编辑语言/标题、调整输出顺序，并设置 Default / Forced；原附件单独控制
- 任务运行期间锁定输入并防止重复启动；临时文件按任务唯一命名
- 支持取消当前任务；取消后会终止 ffmpeg.wasm worker，下次任务自动重新加载核心
- 视频、音频使用 stream copy，不重新编码
- 封装后再次运行 `ffprobe`，审计实际轨道数量、顺序相关元数据、language/title、Default/Forced、附件数量和新字体文件名
- 全程在浏览器本地处理，不上传媒体文件
- 使用 ffmpeg.wasm，可在 Android 浏览器 / Termux + Vite 环境中运行

## 字体处理模式

### 保留 ASS 原字体（默认）

程序不会改写 ASS 的 `Fontname`。封装前会：

1. 解析 `[V4+ Styles]` / `[V4 Styles]` 中的字体声明；
2. 解析 Dialogue 所用 Style；
3. 追踪内联 `\fn` 字体覆盖和 `\r` 样式重置；
4. 读取每个上传字体的 Family / Full Name / PostScript Name 等别名；
5. 读取字体 OS/2 / head 表中的 weight、bold、italic 信息；
6. 将 ASS 请求的 Family + Weight/Bold + Italic 与具体字体 face 匹配；
7. 对每个 face 实际负责显示的字符执行 Unicode `cmap` 覆盖检查。

缺失字体和缺字只会产生 WARNING，不会阻止封装。所有上传字体仍会作为 MKV 附件保留，方便处理 ASS 中未被静态分析捕获的特殊情况。

### 强制统一字体

兼容旧版工作流。只使用第一个上传字体：

- Style `Fontname` 改为该字体 Family Name；
- 显式内联 `\fnSomeFont` 改为该字体；
- `\fn` 空参数保留其“恢复当前样式字体”的语义；
- 其余上传字体不会附加；
- 用该字体检查整份 Dialogue 的字符覆盖。

## 当前轨道策略

默认输出包括：

- 输入视频轨
- 输入音频轨
- 新加入的 ASS 字幕
- 新加入的字体附件
- 输入文件的全局元数据与章节

对于 MKV 输入，可先使用“扫描轨道”读取原音频和字幕轨。扫描后：

- 音频轨默认保留，可逐轨取消，编辑 language/title，调整音频输出顺序，并设置 Default；
- 原字幕轨默认不保留，可逐轨启用，编辑 language/title，调整字幕输出顺序，并设置 Default / Forced；
- 新加入的 ASS 独立设置 language/title、Default / Forced；
- 原 MKV 附件由单独开关决定是否保留；
- “封装计划”会预览最终视频、音频、字幕和附件结构，并提示多个 Default 等潜在冲突；
- 未扫描轨道时保持兼容行为：保留所有原音频，不保留原字幕。

## 字幕语言元数据

界面目前提供：

- `und`：未指定
- `zho`：简体中文
- `eng`：英语
- `jpn`：日语
- `kor`：韩语
- `mul`：多语言 / 双语

默认使用 `und`，避免在无法可靠判断字幕语言时写入错误元数据。

## ASS 编码

封装前会先把 ASS 解码为 JavaScript 字符串、完成字体名重写，再统一以 UTF-8 写入 ffmpeg.wasm 虚拟文件系统。

支持：

- UTF-8
- UTF-8 BOM
- UTF-16LE BOM
- UTF-16BE BOM
- 无 BOM UTF-16LE / UTF-16BE（仅在空字节分布足够明显时识别）

无法确认的非 UTF-8 / UTF-16 文本会中止任务，而不是继续写入乱码。

## v3 主要改动

v3 处理了 Android/Termux + Vite 下 ffmpeg.wasm 的 Worker 加载问题。

`vite.config.js` 排除了 `@ffmpeg/ffmpeg` 与 `@ffmpeg/util` 的依赖预打包；安装依赖时，`scripts/copy-core.mjs` 会把 ffmpeg.wasm core 和 class worker 复制到 `public/`，供浏览器从本站静态加载。

## 本地运行

需要 Node.js 与 npm。

```bash
npm install
npm run dev -- --host 127.0.0.1
```

然后打开终端显示的本地地址，通常为：

```text
http://127.0.0.1:5173/
```

## 构建

```bash
npm run build
```

构建结果位于 `dist/`。

## GitHub Pages

仓库内包含 `.github/workflows/deploy-pages.yml`。启用 GitHub Pages，并将 Source 设为 **GitHub Actions** 后，每次向 `main` 分支推送都会自动构建并部署。

## 技术说明

封装时核心参数相当于：

```text
-c copy
```

因此媒体流不会因为封装过程被再次压缩。字幕与字体作为 MKV 内部轨道/附件加入。

浏览器版 ffmpeg.wasm 需要把输入文件完整载入浏览器可用内存，因此超大视频的实际可处理上限受设备内存和浏览器限制。

## 后续计划

- 更完整的 ASS transform 语义分析（复杂嵌套 transform、clip/drawing 等）
- 编码检测扩展到常见 legacy 编码，并提供明确的转换提示

## 许可证

本仓库原创代码采用 [MIT License](./LICENSE)。

项目使用/分发的第三方组件仍按各自许可证授权，其中：

- `@ffmpeg/ffmpeg` 0.12.15 — MIT
- `@ffmpeg/util` 0.12.2 — MIT
- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later

详细说明见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
