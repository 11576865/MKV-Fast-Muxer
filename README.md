# MKV Fast Muxer v3

一个在浏览器本地运行的 MKV 快捷自动封包工具。

它把视频、ASS 字幕和 TTF/OTF 字体封装进 MKV 容器，视频与音频保持 `copy`，不重新编码。

## 功能

- 支持 MP4 / MKV / WebM / MOV / M4V 输入视频
- ASS 作为软字幕封装
- 正确读取 UTF-8、UTF-16LE、UTF-16BE ASS（含 BOM；无 BOM UTF-16 使用保守启发式检测）
- TTF / OTF 作为字体附件封装
- “强制使用上传字体”模式：ASS 样式和内联 `\fn` 都改为字体内部 Family Name
- 可选择新字幕的 Matroska 语言元数据，不再固定写成中文
- MKV 输入可显式选择是否保留原字幕轨与附件
- 任务运行期间锁定输入并防止重复启动；临时文件按任务唯一命名
- 支持取消当前任务；取消后会终止 ffmpeg.wasm worker，下次任务自动重新加载核心
- 视频、音频使用 stream copy，不重新编码
- 全程在浏览器本地处理，不上传媒体文件
- 使用 ffmpeg.wasm，可在 Android 浏览器 / Termux + Vite 环境中运行

## 当前轨道策略

默认输出包括：

- 输入视频轨
- 输入音频轨
- 新加入的 ASS 字幕
- 新加入的字体附件
- 输入文件的全局元数据与章节

对于 MKV 输入，**默认不保留原字幕轨和附件**。界面提供“保留原 MKV 字幕与附件”选项；启用后，原字幕轨与附件会一并 stream copy 到输出，并在其基础上加入新的 ASS 和字体。

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

- 多字体附件与 ASS 字体到附件的对应关系
- 字体缺字（glyph coverage）检查
- 更细粒度的轨道选择与默认轨 / 强制轨控制
- 编码检测扩展到常见 legacy 编码，并提供明确的转换提示

## 许可证

本仓库原创代码采用 [MIT License](./LICENSE)。

项目使用/分发的第三方组件仍按各自许可证授权，其中：

- `@ffmpeg/ffmpeg` 0.12.15 — MIT
- `@ffmpeg/util` 0.12.2 — MIT
- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later

详细说明见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
