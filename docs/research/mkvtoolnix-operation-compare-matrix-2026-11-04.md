# MKVToolNix × Softmux：操作对照与可反证验收矩阵

日期：2026-11-04。状态：**拟执行的跨实现对照合同 / 尚未运行**。以 README 0.1047.0 与产品 main 5ce85fc8d1657797809d25b51c8b51512f762406 为代码观察截面。

本矩阵不把所有 MKVToolNix 功能强迫塞进浏览器。先比较**同一用户意图**及实际可以实现的操作，再比较结果。不允许用“输出了一个能播放的 MKV”代替结构保真。

## 1. 每个测试必须保存的比较证据

- 输入：独立构造的真实文件、完整源 SHA-256、生成工具与版本、轨道/附件/章节/标签的物理对象树。
- 用户意图：是否修改、修改哪些对象/字段、源/目标成员资格、封面名称约定、预期输出格式。
- 操作适用性：mkvpropedit / mkvmerge / 浏览器受限 writer / FFmpeg.wasm 是否能完成**同一操作**；不可比须标 N/A，不能伪造等价。
- 执行方式：原地编辑（只在独立副本上）、生成新文件、Stream Copy 或其他；区分 bytes changed 与 merely presentation changed。
- 实际验证：mkvmerge -J / mkvextract 的独立回读、EBML 结构树对比、Chapters/Tags XML、FileUID/TrackUID/ChapterUID 与 TargetUID 关系、附件 SHA-256、ffprobe 包 PTS/载荷哈希、必要时真实字幕字体渲染。
- 报告状态：PASS / FAIL / BLOCKED_BY_DESIGN / INAPPLICABLE / NOT_RUN / INCONCLUSIVE，逐字段标出，而非简单 green。
- 当前用户设备、播放器、浏览器大文件、完整 1.0 不因任何单个 PASS 自动得到通过声明。

## 2. 首轮最小对照用例（全为 NOT_RUN；不是已实现声明）

| ID | 同一用户意图与真实源样本 | MKVToolNix 基准 | Softmux 现有路径/关注点 | 关键验收 |
| --- | --- | --- | --- | --- |
| MTX-01 | MKV 含 1 张 JPEG，设为默认封面 | 附件更名为 cover.jpg，适用时 mkvpropedit | 普通附件数据模型 + 拟输出文件名方案；拟议 UI 快捷动作 | 原始图片字节不变、仅一个默认封面候选、播放器显示单独记为未知 |
| MTX-02 | 3 张图片分别普通/默认/横版 | mkvmerge/mkvpropedit 的附件命名和顺序 | 附件清单、多图像 Matroska 归类 | 按不同文件名保留三份 FileData；不可自动覆盖 |
| MTX-03 | 存在 cover.jpg 再要求另一张作默认封面 | 对比重复名与选择器语义 | 只生成冲突待审核意图 | 不静默替换、不无提示增加第二默认封面、不使用同名判断对象身份 |
| MTX-04 | 已有 MKV 修改音轨名称/语言/default | mkvpropedit 属性编辑 vs mkvmerge 新输出 | live source-track authority + 有界 writer | 不重编码；正确修改目标 TrackUID；其他媒体包与关系有证据 |
| MTX-05 | 已有 MKV 替换字体附件，不动音视频 | mkvpropedit replace-attachment | p2-existing-mkv-writer-router 4 路 | 替换唯一 FileUID；旧内容不出现在成品；原其他对象保留 |
| MTX-06 | 已有 MKV 增加任意 TXT/PDF 附件 | mkvpropedit add-attachment | 有界附件新增流程/执行能力检查 | 新增真实 AttachedFile；原附件与媒体 SHA/PTS/关系保留 |
| MTX-07 | 仅 PNG + PDF，零音视频，创建合法资源容器 | mkvmerge 是否可直接生成需实测；必要时独立原生 EBML 工具，不假设 | multi-attachment-only-job-plan（实验性） | 实际 0 Track/2 AttachedFile、字节可提取；播放器兼容不等同规范合法 |
| MTX-08 | 原 MKV 含嵌套 Edition/Chapter、ChapterUID 定向 Tag，零修改 | 对照 mkvmerge、mkvpropedit 只读复制/修改操作适用性 | FFmpeg.wasm 普通重封装 + preflight | 禁止静默丢失；保留 hierarchy、language、UID、Target 关系 |
| MTX-09 | MKV 含未知但合法 EBML 一级/嵌套元素 | 原生工具的可保留/可编辑边界 | bounded writers 的 fail-closed | 不理解对象不得被 UI 伪装成可安全编辑；差异报告真实 |
| MTX-10 | MKV 内 PNG AttachedFile 被 FFprobe 映射成 attached_pic video | mkvmerge/mkvextract 物理 AttachedFile | media-attachment-delivery.js normalizeMatroskaAttachmentPictures | 成品仍为附件；不出现意外视频轨；FileData SHA 保留 |
| MTX-11 | 原 MKV 两条音频 + ASS + TTF 新封装 | mkvmerge 显式 track/attachment 选取 | mux-command.js；字幕/字体现有短路径 | 原音频及新 ASS/TTF 正确，媒体包身份和字幕时间可验证 |
| MTX-12 | MKV A 的一条字幕加入 MKV B 目标，其他 A 对象不导入 | mkvmerge 多来源明确映射 | 跨来源字幕选择（main 近期 PR #232） | A 原样；B 的目标仅含选定对象，时钟和 TrackUID 源归属清楚 |
| MTX-13 | 多集视频+多字幕自动配对打包 | MKVToolNix GUI 保存多个任务/队列 | batch.js + 已有 batch-runner | 输出身份逐项冻结，失败不能误认上一成品 |
| MTX-14 | 含多个语言和 forced/default 字幕 | mkvmerge 轨道标志与名称参数 | src/container-project.js + mux-command.js | 正确的元素、准确写入对象，播放器自动选择仅作附加证据 |
| MTX-15 | 约 1 GB 来源文件添加字幕/附件 | 原生适用路径；记录运行环境 | 浏览器 FFmpeg.wasm 真实负载 | 1 GB 仅非阻断三角警告，运行时实际能力另判，不许偷设硬限 |

### 特殊对照说明

- MTX-08 已有历史独立反例 Issue #77（2026-10-12）：普通 mkvmerge remux 同一输入能保留章节层级，但仍丢失 ChapterUID 定向 Tag；FFmpeg/Wasm remux 同时丢失嵌套章节和目标标签。本轮必须以**新对照**确认当前版本与具体操作，不把旧负例伪装为当前全局能力结论。
- MTX-07 中 MKVToolNix 是否接受相同的附件-only 新建任务，需要真实运行验证，不凭 Matroska 规范推断某个 writer 的功能。
- MTX-12 的最新代码存在不等于多来源任意格式都支持；只测试明确受支持的 SubRip 路径。
- MTX-15 的体积压力与元素保真是独立维度：能处理 1 GB 不能替代 UID/章回关系验证。

## 3. 建议的测试实现顺序

1. 先固定 5 个基准源：普通视频+ASS/字体、嵌套章节+TargetUID Tag、多图片+重复命名、attachment-only、图片 AttachedFile 的 FFprobe 异常投影；以完整 SHA 固定。
2. 对每一项确认 MKVToolNix CLI 具体操作是否**适用**，并明确是原地修改还是新文件；原地编辑只能作用于输入的安全副本。
3. 对 softmux 的相同用户意图执行当前已支持的路径；不支持时记录 BLOCKED_BY_DESIGN 而不是临时绕过门禁。
4. 先独立检查输出字节/EBML/UID，再做 UI 操作可发现性与用户端浏览器测试；不以自家 writer 的成功返回作为同一 writer 的验证。
5. 最后形成保留、收敛、复用 upstream 方案或自研必需的逐模块决策，并单独评估许可（当前产品 MIT；MKVToolNix GPL 系列）及浏览器移植成本。

## 4. 对实现 PR 的硬约束（建议，需按项目现行合同审查）

任何“借鉴 MKVToolNix”的功能 PR 必须附：上游具体版本或文档、当前源码原有入口、实际改动范围、为何不能用现有机制、准确来源与目标文件身份、对照操作语义、至少一个可复现正例和反例，以及实际输出独立读取证明。仅参考 GUI 截图、增加按钮或提交一张概念图，不计为实质功能实现。

**当前状态：矩阵已写入，不包含上述实验的运行结果；未执行正式 MKVToolNix/FFmpeg 对照 CI。**
