# MKV Fast Muxer v3

> **产品版本（2026-10-25）**：当前开发版为 **软封0.1031版本**；此前的 **0.1014** 曾被误写成“10.14”，该历史勘误继续有效。最终目标是 **软封1.0版本**，须满足 [UI 与底层工程联合验收合同](docs/softmux-1.0-release-contract-20261016.md)。自 0.1015 起，产品版本随每次可交付更新递增，网页、`package.json` 与封装报告使用同一个版本来源（npm 三段格式 `0.1031.0` 对应显示 `0.1031`）。历史内部 `sf14` 名称仅为兼容。**当前仍不是 1.0。** 已新增由真实章节/标签观察到现有受限 EBML 文本写入工具的安全导航；不自动预选可写字段、不继承用户确认，只在重新检验后提供原有等字节长度写入能力。 本阶段开始落实 [方案 B 的 1 GB 非阻断警告与 14 项产品验收](docs/softmux-1.0-product-acceptance-contract-20261020.md)；普通输入超过 1 GB 只显示三角风险提示，不作为人工封装上限。实际 ≥1 GB 完整媒体执行仍需真实浏览器验收。

一个在浏览器本地运行的 **MKV 快速封装工作台**。

它面向“已有视频 / 原 MKV + ASS / SSA / SRT / WebVTT / PGS / VobSub + 可选外部音频 + 字体附件”的成品封装场景：视频和音频保持 **stream copy**，字幕作为 Matroska 软字幕轨加入，字体作为 MKV attachment 写入，不重新压制媒体流。

**Web App:** https://11576865.github.io/MKV-Fast-Muxer/  
**Package version:** 0.1031.0  ·  **Product version:** 软封0.1031版本

**0.1031 S09 双领域一笔事务恢复（PR 待精确提交 CI）：** 当前组合草稿经来源完整 SHA-256 与外部音频、字幕、sidecar 全部 SHA-256 核验后，新增独立的“同时验证两个领域 → 审核及同意 → 一次性应用 → 冲突保护联合撤销”路径。在受限的来源轨道、已有来源附件与外部音频／字幕元数据范围内，先验证全部来源身份、原字段值、排序/附件编辑门槛，并在同一个不可变 ContainerProject 内编译所有改动；只有成功后才同步更新封装器消费的字段，不再容许来源与外部两套恢复半途分别落地。旧的单领域恢复仍保留。无法使用未核验草稿、跳过确认、改变浏览器 File 授权、恢复字体权限或将此视为通用 EBML Writer；正式封装与媒体保真仍需原有独立执行、预检和真实产物审计。本候选只在精确提交的 Node/Chromium/S12 CI 全部通过后合并，当前**不代表整个 1.0 发布**。

**0.1030 S09 组合元数据工程草稿（PR #202，待精确 CI）：** 在当前工作台新增一个 JSON 组合导出/导入入口，把已有来源轨道／来源附件草稿和外部音频／字幕／sidecar 元数据草稿纳入同一文件。来源仍需记录完整 SHA-256，外部资源由原有独立校验器保存 SHA-256；导入时先同时验证两个严格 Schema，无效组件导致整包拒绝且不覆盖既有待审核状态。有效导入仅进入只读待审核，仍须分别重新选择真实文件、验证内容、明确同意应用，不恢复 File 权限、字体资源、媒体字节或跨领域原子撤销。本功能不是统一可写工程模型，也不代表 S09/1.0 完成。

**0.1029 S11 单工程目录保存与不重新封装的保存重试：** 在真实单工程 MKV+JSON 报告生成后，用户可主动选择输出目录，使用现有批量文件安全写入器逐项保存、分块完整回读并明确记录双文件成功/部分成功/失败；报告失败时只重新保存未完成的报告，已写 MKV 必须重新核对字节，不重新调用 FFmpeg；同名/Unicode 兼容碰撞和失败残留不予覆盖。目录写入权限与成功收据均仅绑定本次生成的实际 Blob，不升级来源保真/存储断电持久性证明。没有 File System Access API 时仍提供原来的两个下载链接。本版本的具体实现与 Node/Chromium 验收随 PR/CI 确认；**不代表整体 1.0 正式发布**。

**0.1028 S12 真实来源与成品结构只读检查（PR #200，待准确提交 CI）：** 在单工程实际成品检查器中主动检查当前来源 File 和真实生成 MKV Blob 的 SeekHead、Cues、Block、CueTime；结构证明不足时明确显示未验证，不隐式赋予 FFmpeg 封装器新的安全范围。工作台绑定精确来源 File 和当前计划，新封装撤销旧 Blob 的证据关系，异步旧扫描不可覆盖新结果。旧有实际输出 ffprobe 审计、保存状态和新的只读结构结果是三条不同的证据；本版本不主张任意 MKV 结构保真或物理设备持久化验收。

**0.1027 S12 大来源 WORKERFS 只读挂载（待准确提交验收）：** 对 ≥128 MiB 的真实来源 File，在原 MKV 轨道扫描和正式 FFmpeg.wasm 封装时尝试只读 WORKERFS 挂载，避免每个阶段先通过 `fetchFile` 把全部原始媒体复制进 MEMFS；小文件沿用已有路径。不根据文件名、体积、修改时间代替真实 File 身份，挂载错误不暗中回退到整文件内存复制，操作结束清理挂载。候选的独立 [S12 正例 CI](.github/workflows/s12-scoped-real-media.yml) 要求 128 MiB 原附件与 512 MiB/大于十进制 1 GB 的实际 PCM 媒体包来源均完成浏览器封装、成品下载和原生独立审核。研究 [PR #170](https://github.com/11576865/MKV-Fast-Muxer/pull/170) 已在 [CI #39587026817](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39587026817) 中交付一个 1,012,769,255 字节成品的受限正例，但**另有 256/512 MiB 的大量原附件 MKV 仍因 FFmpeg.wasm 内存问题失败**。此功能不宣称典型长电影、原附件大规模保真、所有设备与浏览器均可承受 1 GB，也不引入任何硬性输入大小封锁。本 0.1027 交付候选须通过自身准确 SHA 的完整 CI 方可合并，S12 总体验收仍为部分完成。

**0.1026 S12 大来源扫描空清单阻断（已合并）：** 当 FFmpeg/Wasm `ffprobe` 对有实际来源的 MKV 输出可解析但空的流清单时，不再将其认定为“轨道扫描完成：0 个流”，也不建立空的领域来源轨道权威。界面明确报告来源无法核验，阻止对此结果建立编辑意图；当前 File 自动重试被临时抑制，用户仍可明确重试，新 File 重新识别。独立的无视频/附件-only Matroska 只读检查入口不被禁止。修复不增加 1 GB 人为封装上限，也**不承诺 1 GB 封装成功**。诊断来源：S12 [压力 PR #170](https://github.com/11576865/MKV-Fast-Muxer/pull/170) 的 [#39557148027](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39557148027) 在约 1 GB 与 1.2 GB 有效原生 MKV 上观察到浏览器空流清单，64 MiB 真实成品与原附件 SHA 验收成功；独立修复 [PR #171](https://github.com/11576865/MKV-Fast-Muxer/pull/171) 的准确提交 CI 待最终裁决。

**0.1025 S09 来源与附件组合冲突/撤销验收（已合并）：** [PR #169](https://github.com/11576865/MKV-Fast-Muxer/pull/169) 在当前真实对象工作台复用原有领域事务，依次验证导出草稿后换选错误来源 MKV 的完整 SHA-256 拒绝、正确来源上的旧值冲突不覆盖、轨道与附件共同恢复后再次改动附件时整笔撤销必须拒绝并保持其他轨道不动、消解冲突后明确撤销和重新同意应用，最终以真实 MKV 和独立 `ffprobe` 检查两个对象的成品元数据，保持来源文件哈希不变。测试提交和最终 0.1025 精确提交均通过完整 CI（[最终 #39548135801](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39548135801)），已通过 [PR #169](https://github.com/11576865/MKV-Fast-Muxer/pull/169) 合并主干。这不是通用工程撤销栈或完整 S09 合同完成；跨设备验收及不支持类型的显式矩阵仍待处理。

**0.1024 S09 工程草稿跨刷新恢复（已合并）：** [PR #168](https://github.com/11576865/MKV-Fast-Muxer/pull/168) 在当前对象工作台内演练真实来源 MKV + 外部 FLAC 的两份独立 JSON 草稿：导出、真实页面刷新、重新选择媒体文件、分别 SHA-256 核验及用户确认、一次真实软封装，最后用独立 `ffprobe` 和来源哈希确认修改确实进入成品且不改源文件。恢复面板明确限制：两份草稿不是一个原子统一工程文件，不保留浏览器 File 权限、正在运行的任务或全量撤销/重做历史。跨刷新验收的测试提交 [CI #39544078401](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39544078401) 与最终 0.1024 提交 [CI #39544828352](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39544828352) 均已通过，且 [#168](https://github.com/11576865/MKV-Fast-Muxer/pull/168) 已合并主干。广义撤销/重做覆盖、其它来源/附件冲突类型及真实目标设备操作仍需独立核验。

**0.1023 来源轨道输入焦点保护（已合并，仍非 1.0）：** [PR #167](https://github.com/11576865/MKV-Fast-Muxer/pull/167) 对来源轨道编辑时的无关字幕/字体刷新做有界防重挂载：只有同一实际 File、同一扫描域状态和相同 append 模式且当前非忙时，保留用户聚焦的来源文本输入节点；换源、扫描和执行状态仍必须刷新。新增真实 Chromium 失效/持续输入测试与独立 FFprobe 成品标题检查。已在准确提交的完整 [CI #39473270429](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39473270429) 通过并合并至 main；既有间歇性 R2 编辑回退仍需重复环境与时序验收，不把单次绿色当作完全排除。该改动不放宽原 MKV 保真门槛。

**0.1022 批量结果恢复（已合并并通过精确主干 CI）：** 批次可在当前会话保留已生成 MKV 和审计报告的输出身份。目录写入失败时，仅针对保存阶段重试，不重新封装；单个封装失败任务可在冻结计划与实际来源重核后单独重试。冲突目录不得覆盖，用户仍可下载已有文件。真实浏览器验收见 [PR #163](https://github.com/11576865/MKV-Fast-Muxer/pull/163) 与 [main CI](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39392016068)；会话关闭后不承诺恢复浏览器文件权限。

**软封1.0 S10 的20项真实浏览器批量基准（已合并）：** [PR #164](https://github.com/11576865/MKV-Fast-Muxer/pull/164) 在准确提交 [CI #39401811327](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/39401811327) 通过20项实际 MKV/独立字幕、流数据、字体、哈希核验，632项 Node 及整套原有 Chromium 回归也通过。该测试基于两类真实2秒素材的20个独立文件，**不等于20部不同长片，也不证明1 GB/平板/用户实际磁盘保存**。详细证据和未完成范围见 [S10 验收记录](docs/softmux-1.0-S10-20-real-batch-acceptance-20261020.md)。仍为0.1022开发版。

**0.1019 成品附件失败诊断：** 逐对象审计现在先识别最终 MKV 附件缺失、同名目标冲突及 MIME 与草稿不符，再判定独立 FileData SHA-256 证据是否可用；不能把单纯 ffprobe 出现冒充字节验证。附件工作台显示来源编号、原附件到目标名称、预期 MIME 及可理解的失败原因。新增反例单元测试和真实 MKV 对象界面断言。本阶段依旧不证明未知 EBML/UID 关系与用户本机保存，精确提交 CI 尚待验收。

**0.1018 附件成品审计加强：** 逐附件 FileData“已核验”状态现在要求与独立 Matroska 字节审计模块的证据类型、摘要格式、统计一致性、来源和最终附件唯一身份相符。伪造/缺失摘要、名称碰撞和无法完成检查分别返回可解释原因；在同一对象检查器内显示真实 SHA-256 和核验字节数，并明确没有证明 UID 引用和用户侧保存。新增反例 Node 测试与真实 MKV E2E 断言。版本仍为开发版，当前提交需精确 CI 验收。

**0.1017 附件交付证据：** 已有最终 MKV 独立 ffprobe 与 FileData SHA-256 审计现在映射到逐个来源附件；只有来源 File 与当前拟输出计划都匹配时，工作台才显示本次成品结果。字节一致、最终 ffprobe 清单排除、证据不足分开标注；不代表 UID/TagTargets 或用户侧保存已获证实。

主界面按 01 素材、02 预览与调整、03 封装输出组织。视频与字幕是主要输入；字体和外部音频按需添加。预览是本地 FFmpeg/libass 按需生成的 16:9 静态帧，可指定时间点或跳转字幕，不是连续播放器。02 的对象入口为「全部 / 字幕 / 音频 / 字体 / 原轨道」，默认全部可见，切换时保留已编辑属性；支持新增字幕与音频 metadata、字体模式与子集化、原 MKV 轨道和附件管理。03 显示封装结构、执行状态与审计结果。批量工作区从页面下方展开，仍支持文件和文件夹输入、Group 字体子集以及输出目录。

> 媒体文件只进入当前浏览器会话和 ffmpeg.wasm 虚拟文件系统，不会上传到项目服务器。

## About

MKV Fast Muxer v3 is a browser-local Matroska muxing workbench built around a visual-first soft-mux workflow. It previews ASS/SSA with FFmpeg/libass, supports text and bitmap subtitle tracks, keeps media on Stream Copy where possible, manages source-MKV tracks/attachments, batches folder-based jobs, and audits the generated container with ffprobe. Media stays on the user device.

## 已交付的结构保真编辑边界（2026-10-14）

- **P1 + P3-B 已合并**：外部音频/字幕/字体资源的不可变领域编辑与来源授权校验、按集单独编辑字幕属性、Batch Recipe v2 的显式审核和来源重新选择、冻结计划后真实两 MKV 批量封装及独立结果验证。见 [#134](https://github.com/11576865/MKV-Fast-Muxer/pull/134)。
- **P0 + P2 已合并的第一类已有容器写入**：对于原 MKV 已存在的附件，可以明确选择一个**未被 TagAttachmentUID 引用**的 FileUID，将 FileData 替换为**完全相同字节长度**的新内容。工具独立生成并本地 SHA-256/原始 EBML 字节审计新 MKV；原文件、章节、标签、UID、其他附件以及媒体包不重封装。仅限 <=60 MiB 来源、<=4 MiB 单个替换文件且满足 CRC/来源布局门槛，不支持附件重命名、任意增删、变长、被引用对象变更及通用 MKV 编辑。完整真实 Chromium + MKVToolNix/ffprobe 证据见 [#136](https://github.com/11576865/MKV-Fast-Muxer/pull/136) 与 [工程保真说明](docs/P0-P2-SAME-SIZE-EXISTING-MKV-ATTACHMENT-REPLACEMENT-20261014.md)。

- **P0/P2-V 已合并的受限变长编辑**：如果原有 MKV 的某个**未被 TagAttachmentUID 引用**的 `AttachedFile/FileData` 后方紧邻有效 `Void` 预留区，现在可让该附件数据增长或缩短，并在同一个旧区间内相应减小或增大 `Void`。父元素大小、SeekHead/Cues/Chapters/Tags、媒体数据、原其他附件与所有后续字节偏移均不移动；输出是经本地 SHA-256 核验的独立新副本。**这不支持没有预留 Void 的普通变长替换，不提供 CRC 修复和 UID 重关联。**真实 MKVToolNix／`ffprobe` 独立验收见 [#137](https://github.com/11576865/MKV-Fast-Muxer/pull/137) 与 [P0/P2-V 说明](docs/P0-P2-VARIABLE-FILEDATA-RESERVED-VOID-20261014.md)；完整 CI 542/542 Node 及浏览器通过。

- **P0/P2-T 已合并的第三类已有 MKV 结构编辑（无需预留 `Void`）**：对于原 MKV 的**最后一个 Segment 子元素为 Attachments**、且目标是其最后一个未被标签引用的 AttachedFile，用户现在可审查后对 FileData 进行真正的增长/缩短。本地非重封装写入器仅修改 Segment／Attachments／AttachedFile／FileData 的四处已有 EBML 尺寸字段和选中 FileData 字节；原先的 SeekHead/Cues、轨道/媒体包、Chapters/Tags 与之前其他附件不移位、不改写。对非末尾附件、原编码尺寸容量不足、CRC、未知 EBML 或被定向标签引用的目标继续拒绝。来源不超过 60 MiB，单个新 FileData 不超过 4 MiB；并非任意 EBML Writer。真实 Chromium 545/545 Node + 原生 MKVToolNix／`mkvextract`／`ffprobe` 完整验收见 [#138](https://github.com/11576865/MKV-Fast-Muxer/pull/138)、[工程安全边界](docs/P0-P2-TAIL-ATTACHMENTS-NO-VOID-RESIZE-20261014.md)。

- **P0/P2-N 已合并的第四类已有 MKV 附件编辑（原附件不在末尾）**：对原有单个 Attachments **位于 Segment 中途**，并且原 SeekHead **确实正确索引该附件**的来源，允许显式审核后变长替换其**最后一个、未被 TagAttachmentUID 指向的 AttachedFile**。不移动原有媒体包、Chapters、Tags、Cues、Tracks 等顶层对象；在旧附件所在同一原始字节空间新建链式 SeekHead 中继，把原索引 SeekID 由附件改指中继，原 SeekPosition 保持不变，再把修改后的完整附件主元素追加到 Segment 最末尾并更新必要尺寸。来源和新文件 SHA 及 UID 引用关系、受保护字节通过本地审计，原生 MKVToolNix/`mkvextract`/`ffprobe` 独立验收和完整 Chromium 547/547 Node 证据见 [#139](https://github.com/11576865/MKV-Fast-Muxer/pull/139)、[工程说明](docs/P0-P2-NONTERMINAL-ATTACHMENTS-SEEKHEAD-RELAY-20261014.md)。无正确原始 SeekHead、受影响 CRC、不能容纳中继、非最后 AttachedFile 或被定向标签引用的来源**拒绝**；不是任意 EBML Writer，不修复一般 SeekHead/Cues、不覆盖来源文件。

- **P0/P2-N2 已合并：非末尾附件列表中的任意未引用 FileUID 可变长替换**。此前链式 SeekHead 路径要求选中最后一个 AttachedFile；现在支持选择前面或中间的原始附件，只要来源拥有已验证的非末尾 Attachments／正确 SeekHead 索引、UID 不被 Tag 引用且其余结构门槛满足。修改前面附件时，后续其他附件在新追加的 Attachments 主元素内部会发生**可计算的偏移变化**，工具逐一验证 UID、名称、MIME、文件数据 SHA-256 和偏移；外部 Cluster/Cues/Chapters/Tags/Tracks 原始字节与偏移不移动。真实 Chromium 基于独立 MKVToolNix 制作的**三附件**来源，验证了修改第二个附件、保留被 Tag 指向的第一个和位于其后的第三个，并由独立 `mkvmerge`／`mkvextract`／`ffprobe` 检查真实成品；完整 CI 549/549 Node，详见 [#140](https://github.com/11576865/MKV-Fast-Muxer/pull/140) 与 [P0/P2-N2 工程边界](docs/P0-P2-NONFINAL-FILEUID-RELAY-20261014.md)。这仍不是无 SeekHead／CRC／任意 EBML 编辑器。

- **P0/P2-C：已验收的两层 EBML CRC-32 附件变长编辑**：在原 MKV 符合既有非末尾 Attachments／正确 SeekHead 索引和 UID 引用保护时，若原 `AttachedFile` 与 `Attachments` 包含**原值正确且处于各自 Master 第一个子元素位置**的 CRC-32，现在可以审核后变长替换未被标签引用的附件数据。生成新 MKV 时先重算内层 CRC-32、再重算外层 CRC-32；来源、目标 UID、其他附件、Chapters、Tags、Cues 和媒体包保真仍受保护。完整 552/552 Node、Chromium 与**独立 Python `zlib` + MKVToolNix／`mkvextract`／`ffprobe`** 双层来源／输出校验见 [PR #141](https://github.com/11576865/MKV-Fast-Muxer/pull/141)、[安全边界与 RFC 首子元素修正](docs/P0-P2-NESTED-ATTACHMENT-CRC32-20261014.md)。**不代表已支持 CRC 受保护的 SeekHead、Chapters、Tags、Cues 或通用 EBML 结构编辑**。

**重要：**历史问题 [#77](https://github.com/11576865/MKV-Fast-Muxer/issues/77) 所揭示的 FFmpeg 重封装嵌套章节与定向标签丢失风险未被通用修复。新的等长附件数据替换采取不重封装媒体、原位置保留的独立路径，不能据此推论任意 EBML 编辑安全。

## 理论初版五步集成预览（2026-10-13）

在既有快速字幕封装、原 MKV 轨道/附件、冻结批量执行、真实成品审计之外，新增**工程草稿导出**（版本化、不可执行、来源须重新授权）、**当前来源与后端能力边界**以及可在批量区域**导入/导出规则 JSON**。配方导入不会恢复媒体 File 权限、输出文件夹授权、旧成品或自动执行任务。领域 `ContainerProject` 的修改与撤销目前为独立纯逻辑迁移切片；用户已使用的单工程编辑器暂未被它全面替换。

当前能力判定始终区分计划可描述与写入真正可执行：附件-only 保持实验性，已有 MKV 的安全附件写入仍要求有界 Void 等严格前提，FFmpeg 重封装不承诺完整未知 EBML、嵌套章节与 UID 关联保留，静/动态 libass CI 不等于任意播放器渲染认证。

**领域化编辑进展（2026-10-14）：** 已新增真实、不可变的 `ContainerProject` 来源轨道会话权威。来源 MKV 完成扫描后，音频与字幕轨道的保留状态、标题、语言、Default、Forced 由同一领域事务处理，再一次性投影给现有 FFmpeg 执行路径；覆盖对象检查器、传统编辑控件和批量编辑。只有完成实际扫描的同一 `File` 对象可以继续编辑，不允许同名替换文件沿用会话。排序、附件、章节、标签、外部轨道及其余高级轨道属性尚未迁入统一可写领域，不得据此声明已完成通用 Matroska 编辑器。工程说明参见 [P1 来源轨道领域权威迁移](docs/p1-live-source-track-domain-authority-20261014.md)。

**轨道高级编辑扩展（2026-10-14，待集成验证）：** 原有来源音频/字幕的 Original、Commentary、Hearing Impaired 也已由 `ContainerProject` 领域事务管理，并可通过已核验的工程草稿安全导出及显式恢复；来源音轨/字幕轨道的同类型上下排序已接入同一领域权威，并直接改变现有 FFmpeg 输出轨道顺序。**排序现在可以在完整来源 SHA-256、同类型全量轨道排列、旧值冲突检查与明确确认通过后从工程草稿恢复**；不包含任意跨类型排序、已排除同类轨道的排列恢复，也不新增通用 EBML 写入权限。详见 [P1 来源轨道排序的核验恢复](docs/p1-verified-source-track-order-replay-20261014.md)。上述范围不等于章节、标签和附件的全保真通用编辑。详见 [P1 轨道高级属性与排序实施记录](docs/p1-source-track-advanced-flags-order-20261014.md)。

**来源附件领域化编辑（2026-10-14，待整体验收）：** 现有 MKV 来源附件的保留、文件名、MIME 属性已统一通过扫描来源绑定的不可变 `ContainerProject` 事务修改，并同步到原有 FFmpeg 封装计划；对象检查器、附件列表、批量保留/删除和元数据重置均使用同一编辑状态。**这不意味着 AttachmentUID、目标 Tag 或任意 EBML 结构已实现无损重写。** 经完整来源 SHA-256 核验、同一来源流身份与字段旧值对比及用户显式确认后，工程草稿现在可以原子恢复来源附件的保留、文件名和 MIME 修改，并支持冲突保护撤销；单纯导入 JSON 不会应用任何修改。**受支持的同类型来源轨道完整置换可经来源核验、排列检查、明确确认后跨会话恢复**；带已排除同类轨道的复杂排列依然被保守阻断，复杂 EBML 写入安全限制没有放宽。详见 [P1 来源附件领域权威实施记录](docs/p1-live-source-attachment-authority-20261014.md)与 [来源附件核验恢复报告](docs/p1-verified-source-attachment-replay-20261014.md)。

**外部音频／字幕／字体领域状态（2026-10-14，待完整 CI）：** 外部音频与新增字幕的标题、语言、Default、Forced（字幕）及 Original／Commentary／Hearing Impaired，已改由独立的不可变 `ContainerProject` 会话统一提交，再同步给原有 FFmpeg 执行模型；选中的字体文件进入领域来源清单，`preserve / force` 字体策略也由领域状态记录。资源 `File` 和字幕 sidecar 保持严格对象引用绑定，替换同名同大小文件不会继承旧标题；后台刷新不再把旧表单值写入新资源。**这仍是与来源 MKV 轨道会话并列的有界领域所有者，并非覆盖全部对象的单个可执行总工程，也未提供外部资源工程草稿跨会话文件授权或无视频资源封装功能。** 详见 [P1 外部资源领域化实施说明](docs/p1-external-resource-domain-authority-20261014.md)。

**这并非整个 P0–P6 理论计划的最终稳定版。** 对应功能、失败边界和仍未通过的阶段退出条件见 [五步工程验收账本](docs/five-step-theory-initial-preview-20261013.md)。

### P1：来源轨道修改的导出与显式恢复（2026-10-14，待完整 CI 验收）

工程草稿现可从**实际已扫描来源**保存音频、字幕的扫描基线与当前编辑差异（保留状态、标题、语言、Default、Forced），而不是只保存缺少修改记录的最终快照。重新导入后必须核对当前来源完整 SHA-256、源轨身份、字段旧值，且需关闭“保留全部”模式和明确确认。通过后可将所有受支持变更一次应用到现有待封装轨道编辑状态；同一会话还提供带冲突检查的“撤销本次恢复”。正式封装及独立成品验证仍使用既有执行路径，不会被导入草稿自动启动。

此功能**不允许**自动回放、编辑章节/标签/附件、重新排序、恢复浏览器权限或绕过 Matroska 写入风险阻断。完整来源哈希已支持对大型媒体进行分块 SHA-256，单次至多读取 1 MiB 文件切片，不需要将整部影片加载到单个 WebCrypto 缓冲区。当前操作上限为 16 GiB；超过上限的草稿仍可导出，但无法借此证明来源字节一致，因而不能核验恢复。哈希可取消，计算耗时取决于设备和文件长度。JSON 是用户可修改的文本，哈希匹配不证明其历史真实性或作者。PR 上的源代码和测试不能替代完成后的正式 CI 结果。详细功能、反例和测试范围见 [P1 轨道恢复工程记录](docs/p1-verified-source-track-transaction-20261014.md)。

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

“字体子集化”默认关闭。开启后使用 HarfBuzz WebAssembly 根据当前字幕实际字符生成单字体 SFNT 的子集，并保留 OpenType layout glyph closure；TTC / OTC 集合目前保持原文件，以避免错误拆分 collection face。是否可子集化由实际字体结构决定，不再由文件名后缀决定；例如真实 TTF 即使被改成未知后缀，仍会按 TrueType 结构生成 `.subset.ttf`。子集字体仍作为标准 Matroska attachment 写入。

### 6. 批处理

批量模式支持多选文件，也支持直接选择视频目录、字幕目录与字体目录。视频候选先按实际文件头识别 MP4 / MOV / M4V / Matroska / WebM，再按同名、语言后缀以及常见 SxxExx / EPxx 形式自动配对；文件名扩展与实际容器不一致时会在任务计划中显示诊断，并以实际容器为准。批量字体也会解析实际 SFNT / TTC collection 结构与内部 face；未知或错误字体后缀不会再决定是否进入字体集合，伪装成 `.ttf` 的无效文件则不会被接受。字幕文件名中的 `zh-Hans` / `chs` / `cht` / `en` / `ja` / `ko` 等常见后缀会自动填入 language 与默认 title。任务按队列顺序逐项运行，共用既有 Stream Copy 与 post-mux audit 路径；单项失败会记录并继续后续任务，可中途取消。

批量配对遇到多个视频同分候选时，不会按列表顺序猜选第一个。计划中会显示有歧义的字幕及候选视频，需调整命名或分批处理才能启动。若不同任务将生成相同的输出文件名（包含大小写和 Unicode 兼容字符的等价情况），也会阻止批量启动，以降低输出覆盖风险。未匹配但无歧义的文件仍单独列为提示。这是批量计划的安全检查，不修改任何输入文件。

选择批量输出目录后，还会在规划阶段与启动前检测目录内既有的 MKV / JSON 报告文件。已有相同或规范化等价名称时禁止开始；真正保存时再复核一次。目录写入失败不会抹去已经成功生成的成品：批处理结果会显示未完成目录保存，并保留 MKV / 报告的浏览器下载链接。此检查不声称具备跨进程原子性：浏览器 File System Access API 不提供原子 `create-if-absent`，如果其他程序在最后一次检查与创建之间抢先写入同一文件，仍存在竞态，因此应避免多个程序同时向同一输出目录生成同名文件。**写入失败后会中止写入流，但不会自动删除同名目标**：即使目标仍是空文件，浏览器也无法证明它由本次操作创建；请按界面提示人工检查或清理，再重试。

批量封装完成后，当前批次的 MKV 与报告下载链接会继续有效。只有用户**成功开始下一批任务**、旧结果列表即将被替换时，程序才释放上一批链接对应的 Blob URL，以避免多次处理大型视频造成浏览器内存持续累积。若需要保留上一批成品，请在开始下一批前下载或保存。

如果 Group 字体子集准备或其他批量任务准备步骤异常中断，状态栏会明确显示“批量中断”、异常原因以及已完成 / 单项失败数量，不会再把尚未执行任何任务的批次误报为“成功 0，失败 0”。已经完成的批次结果下载链接仍保留，输入设置会按既有流程恢复。

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

支持一次选择多个 TTF / OTF / TTC / OTC。字体身份以实际 SFNT / collection 结构和内部表解析为准，而不是扩展名：真实 TTF / OTF / TTC / OTC 即使改成未知后缀仍可被识别，伪造支持后缀但内部结构无效的文件会被拒绝。TTC / OTC 会按集合内的 face 解析 Family、Weight、Italic 与 Unicode `cmap`，但在 MKV 中仍只附加原始集合文件一次；写入 MKV 时的 attachment MIME 也由实际字体结构决定。扩展名与实际内容不一致会记录警告，并在生成的字体 attachment 名称中恢复与已验证结构一致的 `.ttf` / `.otf` / `.ttc` / `.otc` 后缀，避免错误文件名继续传播到播放器侧。

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

## 新增 ASS 的成品事件回读验证（受限）

快速软封和冻结批量任务生成 MKV 后，会尝试从**实际完成的 MKV** 重新提取本轮新增的 ASS 字幕轨，逐项比较 `Dialogue` 事件的文本（包括 ASS 覆盖标签）、起止时间、事件顺序和重复事件。这是独立于 `ffprobe` 轨道数/语言标签审计的一项新增证据；正式 Chromium E2E 还使用系统 FFmpeg 对真实下载成品进行外部交叉检查。

- 仅覆盖新加入的 `.ass` 轨（不包括已有来源轨、SSA、SRT、WebVTT、PGS/VobSub）；不验证 `Style`、Script Info、字形覆盖、字体替换效果、libass 实际渲染或播放器兼容。
- 对超过 512 MiB 的成品、超过 2 MiB 的 ASS 文本、超过 8 条新增 ASS、超出事件预算或提取失败的情况，返回 `unavailable`，不得写作通过。该大小界限**只属于此项附加验证**，不是封装输入支持上限。
- ASS 回读提取器使用 FFmpeg `-copyts` 保持容器字幕时间轴，避免提取时因负时间戳自动重设起点造成伪差异；独立系统 FFmpeg 测试采用同样的时间轴语义。
- `pass` 只说明上述事件字段在最终容器回读中一致；`warning` 表示已观察到差异，并降低整体审计状态，但成品仍可下载复核；`unavailable` 不改变先前已完成的基础轨道审计结论，也不构成事件保真证明；`not-requested` 表示当前没有受支持的新增 ASS 轨。
- 检查结果记录于封装报告 `audit.assEventAudit`，并出现在主工作台的实际成品证据区域。已有的附件 FileData SHA-256 校验是另一种独立证据，不能代替 ASS 字幕的事件回读。

## 新增 ASS 的 V4+ Style 成品验证（受限）

新增的 V4+ 样式校验与上面的 Dialogue 校验互相独立。系统从**最终 MKV** 回读新增 ASS，按实际 `Format` 列顺序解析 V4+ `Style` 定义，比较完整的 23 个已知字段（包括 Fontname、Fontsize、颜色、Bold/Italic、ScaleX/Y、Spacing、Outline/Shadow、Alignment、Margins 和 Encoding）。数值的小数表示及十六进制颜色字母大小写会做保留语义的规范化；真正的值变化、样式缺失或顺序变化则报告差异。

- 只支持新增 ASS 的完整已知 `[V4+ Styles]` 表；有未知/自定义样式列、重复名称、无法可靠解析或超出预算时，单独记录 `unavailable`，不将局部通过当作全部样式已验证。
- 同一次最终 MKV 回读供 `audit.assEventAudit` 与 `audit.assStyleAudit` 使用，但证据结论保持独立；样式字段发生已证实的差异会触发整体审计 `warning`，成品仍可以保存并由用户复核。
- 受限于不超过 8 条新增 ASS 轨、512 MiB 成品、2 MiB ASS 文本和每轨 512 条样式定义的检查预算。这些数字不是一般软封能力上限。
- **不覆盖** `[Script Info]`、未建模的扩展字段、SSA、已有来源字幕、完整 ASS 附件依赖、字体替换、实际 libass shaping/渲染、播放器兼容、EBML UID 关系和任意媒体文件规模。即使事件、样式和字体附件 SHA-256 分别通过，也不等于真实字幕画面已经完成验收。

## 独立 libass 成品渲染验收（P3 CI 专用）

除了最终 MKV 中 ASS Dialogue、V4+ Style 和字体附件 FileData 的独立回读，Chromium 端到端测试还使用**系统 FFmpeg/libass**，在 320×180 黑底帧上分别渲染原始 ASS 与浏览器生成并下载后的 MKV 字幕。专用测试字体修改了 SFNT 内部字体族名称，不依赖系统预装 DejaVu；测试必须证明最终 MKV 含有可由 MKVToolNix 独立提取、与上传字体逐字节一致的附件，并检查 libass 实际选择该独特字体族，而非静默回退。

同一时刻（1 秒）使用相同 libass `ass` 入口渲染源字幕与**从最终 MKV 独立提取的字幕及字体**，两者 PNG 必须逐字节一致。同时直接从最终 MKV 使用 `subtitles` 滤镜渲染，必须选中独有字体族、画面非空、与原始帧的 SSIM ≥0.995；空白与篡改文本的负例 SSIM 均须低于 0.97。两种 FFmpeg 字幕入口可能产生轻微边缘抗锯齿差异，因此绝不将其不相同的 PNG 字节直接认作封装破损，也不取消前一项严格逐像素断言。提交到 CI 的 JSON 判定与源帧、成品帧、负例帧由 `p3-final-mkv-libass-render-proof` 构建工件保留；渲染失败会直接令正式 Chromium E2E 失败。

**证据边界：** 当前是单一控制样本、单帧、单个独有字体与同一版本系统 libass 的真正成品像素对照，不代表全部时间点、复杂 ASS 动画/卡拉 OK、字形覆盖、全部字体集合、跨平台播放器的渲染等价，也不代表该渲染已变成浏览器用户界面内的常驻审计功能。实际产品报告的事件/样式/附件审计依然独立，不能把 CI 测试覆盖范围冒充用户自己文件的渲染认证。

## P3 动态 ASS 的成品多时点渲染验证（CI 专用）

在已有单帧真实成品 libass 证明之外，真实 Chromium E2E 新增一个使用独有内部字体族的动态 ASS 测试：同一轨同时包含位置运动 `\\move`、样式插值 `\\t` 与卡拉 OK `\\kf`。浏览器生成并下载 MKV 后，使用 MKVToolNix 独立抽取字体并验证字节一致，FFmpeg 从成品回读 ASS，然后在 **0.20、0.65、1.10、1.55 秒** 分别渲染源与成品。

- 为单帧输入显式使用 `settb=AVTB,setpts=PTS+time/TB`，避免以 1 fps 采样把小数秒错误量化到整秒。
- 四个时间点的源 ASS 与最终 MKV 回读 ASS 使用相同的 libass `ass` 滤镜且分别隔离字体目录，逐帧 PNG SHA-256 必须完全相同，并且四张参考帧必须互不相同。
- 直接在最终 MKV 上使用 `subtitles` 滤镜的每帧 SSIM 必须 ≥ 0.995，且必须实际选用独有的内嵌字体；每个时间点的空白帧 SSIM 低于 0.97。
- 分别破坏 `\\move`、`\\t` 和一段 `\\kf` 后重渲染 0.65 秒；每一种破坏都必须单独改变参考图像，防止把某个特效未运行误判为验证成功。
- 红绿证据分别记录于 CI `p3-dynamic-mkv-ass-temporal-evidence` 的 JSON 与 PNG 文件，而非用户文件运行时的通用渲染认证。

**范围限制：** 四个静态取样点、一个 2 秒合成媒体、一个字体和 Linux 系统 libass。尚不能证明整个连续时间轴、所有 ASS 动画参数、全部 `\\k/\\kf/\\ko` 语义、复杂字体替换链、任意真实播放器及移动设备。单一测试通过不自动修改 UIGS Canonical 规范。

## MKV 轨道管理

输入本身是 MKV 时，默认启用 **“复制原轨并追加（重封装）”**：通过 FFmpeg Stream Copy 尝试映射全部已识别的原音频、原字幕和附件，并请求映射来源 Chapters、部分全局 metadata 与轨道 disposition，再追加新字幕 / 外部音频 / 新字体。这个模式不要求先手动扫描轨道。

**重要保留性边界：** Stream Copy 表示相关编码媒体流不必重新编码，不等于原 MKV 的 EBML 元素、章节层级、标签目标 UID、所有附件关系或文件字节保持不变。独立 P0 实验已发现：对某些有效 MKV 的无修改重封装，当前后端会丢失嵌套章节及其关联标签（[Issue #77](https://github.com/11576865/MKV-Fast-Muxer/issues/77)）。现有预检会阻断已识别的高风险章节/标签结构，对部分尚未证实的轨道、附件关联只给出警告；未阻断不代表完成了全面保留验证。重要来源请保留原文件并独立核查输出。

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

关闭“复制原轨并追加（重封装）”且又没有扫描时，才使用旧兼容行为：原音频保留、原字幕不保留；原附件由兼容开关决定。

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

### 兼容性证据矩阵

`DIRECT_COPY` 不再由一组仅凭经验维护的 codec allowlist 决定。项目在 `src/compatibility-evidence.js` 中维护机器可读的 **Compatibility Evidence Matrix**：只有具备当前浏览器运行时的真实 fixture、ffmpeg.wasm Stream Copy、生成 MKV、系统 ffprobe codec 保真检查与 post-mux audit 证据的 codec 才标记为 `verified-e2e`。

当前矩阵对 H.264 / HEVC / AV1 / VP8 / VP9 / MPEG-4 Part 2，以及 AAC / FLAC / MP3 / Opus / Vorbis / AC-3 / E-AC-3 / ALAC / 多种 PCM 建立独立实测案例。CI 会生成短小真实媒体 fixture，并逐项走浏览器封装路径；任一 `verified-e2e` fixture 缺失、mux 失败、输出 codec 改变或审计失败，Browser E2E 都会失败。

如果某个 codec 只有容器/FFmpeg 层面的预期支持，但仓库还没有这条浏览器 E2E 证据，则保持 `expected` / `UNVERIFIED`。例如 DTS 目前不会因为静态知识而被标成已经验证。未知 codec 也保持 `UNVERIFIED`，继续交给实际 FFmpeg 执行验证，不会自动转码或被静态规则误判为必然失败。

JSON 封装报告中的 `compatibility.evidence` 会记录本次视频/音频轨实际命中的 evidence id、状态与对应 fixture，使“规则声明”和“这项声明由哪条实测证据支持”可以追溯。

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
- Group 字体子集、原 MKV 源轨复制并追加、输出目录与队列状态保持直接可见，不使用 Basic / Advanced 模式隐藏能力；
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
- 原 MKV 源流复制并追加（完整 EBML 保留未获证明）；
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
