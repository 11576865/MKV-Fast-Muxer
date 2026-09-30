# Changelog

## 1.0.2 — 2026-09-30

### Fixed

- 修复 1.0.1 固定预览帧仍依赖浏览器 `<video>` 解码与 seek，导致部分 MKV / HEVC / AV1 等输入无法生成预览的问题。
- 预览改为与硬压工具同类的 FFmpeg 路径：通过 WORKERFS 挂载本地视频，精确提取源帧，再由 FFmpeg 内置 libass 渲染 ASS 与上传字体，输出 PNG。
- 移除 JASSUB 运行时依赖与额外 worker / WASM 资源，减少预览初始化开销和重复字幕渲染栈。


## 1.0.1 — 2026-09-30

### Changed

- 将持续实时 ASS 视频预览改为按需生成固定字幕预览帧，避免 JASSUB/libass 长时间加载与持续渲染拖慢工作台。
- 自动从所选 ASS 中找到一条 Dialogue 的代表性时间点；只有用户点击“生成预览帧”时才加载视频、字体与字幕渲染器。
- 更换视频、ASS、字体或字体模式后只标记预览需要刷新，不再自动重建预览。
- 桌面端“检查并封装”区域取消内部滚动容器；封装计划按页面可用空间自然展开，避免右栏出现多层滚动。

### Fixed

- 修复桌面宽屏仍给输出栏和封装计划强制设置 `max-height + overflow-y:auto`，导致明明有页面空间却需要在右栏内部滚动的问题。


## 1.0.0 — 2026-09-30

### Added

- 新增本地视频 + ASS 可视化预览，使用 JASSUB/libass 渲染 ASS，而不是近似 CSS 字幕层。
- 预览可选择多条新增 ASS 中的一条，并使用用户上传字体；禁用在线字体查询。
- 字体强制统一模式会同步应用到预览文本。
- 浏览器无法直接播放某些 MKV 容器 / codec 时，界面明确提示该限制不影响最终 Stream Copy 封装。

### Changed

- 删除白天主题入口，界面固定为深色工作台。
- “调整”改为“预览与调整”，将可视化前置到轨道与封装计划之前。
- 重排新增 ASS / 外部音频卡片，metadata 与 Default / Forced / 高级属性不再争抢同一横向空间。
- “运行日志与诊断”降级为仅排错时展开的辅助区域。


## 0.8.2 — 2026-09-30

0.8.2 是一次稳定化版本，不扩大 mux 功能边界。重点是错误反馈、响应式布局、仓库改名迁移与回归保护。

### Changed

- 将轨道扫描与封装失败从底层异常文本整理为可操作的用户级错误反馈。
- 区分损坏媒体、Stream Copy 容器不兼容、浏览器 / WebAssembly 内存不足、临时存储不足、运行核心加载失败、ffprobe 失败、无有效音频轨与损坏字体等情况。
- 原始 FFmpeg / ffprobe 错误仍保留在运行日志中。
- 560–760px 小平板 / 横屏手机保留更高的信息密度；小于 560px 再切换为完整单列。
- 缩小移动端编辑卡片、输出区和诊断区的纵向占用，并加强长文件名 / metadata 换行。
- 原 MKV 附件管理器默认折叠；触控设备的小型操作控件扩大可点击区域。
- 增加 canonical、Open Graph、Twitter metadata、Schema.org WebApplication JSON-LD、robots.txt 与 sitemap.xml。
- GitHub 仓库 slug 从 `MKV-Fast-Muxer-v3` 调整为 `MKV-Fast-Muxer`；产品名仍为 **MKV Fast Muxer v3**。
- GitHub Pages 正式地址更新为 `https://11576865.github.io/MKV-Fast-Muxer/`。
- 保持 Vite `base: './'`，避免静态资源路径依赖仓库 slug。

### Fixed

- 修正 0.8.2 版本号变更后 E2E 仍期待 0.8.1 的断言。
- 修正错误反馈改版后测试仍依赖旧“失败：”状态前缀的问题。
- 修正附件管理器默认折叠后 E2E 直接操作隐藏控件的问题。
- 修正仓库改名后 README、canonical、JSON-LD、robots.txt 与 sitemap.xml 仍引用旧 URL 的问题。

### Tests

- 新增用户级错误分类单元测试。
- 新增移动端 / 小平板响应式布局回归测试。
- 新增仓库身份回归测试，阻止旧仓库 slug 重新进入 README / public metadata / sitemap / Vite 配置。
- Chromium Browser E2E 覆盖 22 个编号场景，包含输入、轨道、字幕、字体、附件、取消、恢复、连续任务与异常路径。

### Compatibility / boundaries

- 仍以浏览器本地 ffmpeg.wasm + Stream Copy 为核心。
- 不加入硬字幕、转码回退、Native bridge 或新的视频编辑能力。
- private package identifier 保持 `mkv-fast-muxer-v3`，不视为公开 npm 包改名。
