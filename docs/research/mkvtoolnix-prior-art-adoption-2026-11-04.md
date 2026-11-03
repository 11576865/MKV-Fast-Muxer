# Softmux × MKVToolNix：成熟设计借鉴与执行器边界（首轮）

- 日期：2026-11-04
- 性质：工程设计审查 / Prior-art adoption proposal / **非代码实施、非 1.0 验收、非 Canonical 变更**
- 被核查产品：11576865/MKV-Fast-Muxer，main = 5ce85fc8d1657797809d25b51c8b51512f762406（2026-11-03）
- 对照来源：MKVToolNix 官方工具手册、2026 年版本更新说明、Matroska RFC 9559；历史源码样本用于**架构例证**，不等同当前 Codeberg 源码。
- 本轮目标：避免重复发明 EBML 编辑器，明确不同操作类型的现成实现与软封的真正差异；**不批准重写、不导入 GPL 代码、不改变原有字幕/字体/批处理能力。**

## 1. 已核实的成熟工具行为

1. mkvmerge：组合输入、选择或排除轨道、附件、章节、标签，配置时间与轨道属性，执行新的容器复用/封装。新输出不能自动推出所有旧 EBML 关系保持原样。
2. mkvpropedit：对既有 Matroska 的部分属性、章节、标签、附件执行直接编辑（add/replace/update/delete attachment），无需完整重封装。这是与 mkvmerge 不同的操作族，也有原文件修改、偏移和错误恢复风险。
3. mkvextract/mkvinfo：提取与观察。把独立回读作为成品验证而不是一项“写入成功”同义词。
4. MKVToolNix GUI：封装、信息、章节编辑与头部编辑是不同工具；可以保存和恢复封装设置。2025—2026 年发布说明记载了专门的附件拖放区域，以及自动把拖入图片配置为 cover attachment 的快捷入口。
5. Matroska 的封面：基于 AttachedFile 和文件名约定，不存在需要单独开发的封面轨道写入器。多张图片可以存在，但不应自动认定任意播放器会显示多张封面。

来源：
- https://mkvtoolnix.download/doc/mkvpropedit.html
- https://mkvtoolnix.download/doc/mkvmerge.html
- https://mkvtoolnix.download/doc/mkvtoolnix-gui.html
- https://www.rfc-editor.org/rfc/rfc9559.html （特别是 Attachments / cover art 与容器结构）
- https://github.com/Kissaki/MKVToolNix/releases （记录 GUI 的附件和封面拖放操作；此库仅发布信息，不是当前上游源码主仓）
- https://codeberg.org/mbunkus/mkvtoolnix （2025 年迁移后的上游，**当前直接源码访问未能完成**）

补充的历史源码阅读（独立 GitHub 旧版存档，**不得当作 2026 当前实现**）：
- https://github.com/nmaier/mkvtoolnix/blob/master/src/propedit/propedit.cpp ：按 Info/Tracks/Tags/Chapters 一级元素选择、写出，并明确 update/remove 的失败路径；
- https://github.com/nmaier/mkvtoolnix/blob/master/src/propedit/target.cpp ：选择对象、属性合法性检查，再应用变更；
- https://github.com/nmaier/mkvtoolnix/blob/master/src/mmg/tabs/attachments.cpp ：附件列表、属性检查器（name/MIME/description）与拖放入口。
这些只证明模式有历史实现，不是当前主仓的逐行源审计。本阶段不能宣称已完成 MKVToolNix 2026 源码审查、WebAssembly 可移植性或合法代码引入。

## 2. 软封当前可复用的工程事实（精确路径）

| 现有模块 | 已确认职责 | 决策 |
| --- | --- | --- |
| src/container-project.js | 不可变、来源中立的语义草稿；并非通用写入器 | **复用**，不复制第二套项目状态 |
| src/output-composition.js | 对来源和外部编辑器的只读组成投影 | **复用**，明确不是写入权威 |
| src/container-tree.js + src/source-object-sections.js | 基于 FFprobe 的来源对象展示；章节为扁平视图，标签不是 UID 关系图 | **复用并补证据来源**，不据此证明完整 EBML |
| src/live-source-track-authority.js / src/live-container-workspace-authority.js | 来源轨道有界字段与事务所有权 | **保留单一编辑权威** |
| src/container-capabilities.js | 格式合法性、执行器能力与真实验证彼此分开 | **复用**，扩展操作级判定，不新增平行总开关 |
| src/mux-command.js | FFmpeg Stream Copy 与轨道/字幕/附件映射 | **保留在媒体流组合路径**，不用于所有 EBML 属性编辑 |
| src/p2-existing-mkv-writer-router.js | 四条有界附件 FileData 写入策略和共同检查 | **保留作受限已验证路径**；新需求必须先比较 mkvpropedit 成熟行为 |
| src/p2-matroska-inline-metadata-ui.js | 当前小范围同 UTF-8 字节长度章节/标签文本替换 | **如实声明受限**，不得包装成完整属性编辑 |
| src/media-attachment-delivery.js | 普通附件的 MIME/名字/大小检查及输出验证；规范化图片 attached_pic 投影 | **复用**，封面应是调用方语义预设 |
| src/multi-attachment-only-job-plan.js | 附件-only 实验性新容器计划，上限等显式 | **保持独立的无媒体目标能力，不强制视频** |
| src/workbench-navigation.js / src/batch.js | 已有工作台导航与批量输入功能 | **保留**，不改回多个独立业务数据库 |

注意：路径存在、代码有声明不等于用户现场验收；2026-11-03 README 标记开发版 0.1047，不是正式 1.0。

## 3. 采用 MKVToolNix 的领域划分，而非复制其所有页面

用户意图 → 真实对象/修改 → 执行器 → 成品审计，四层分开。

**操作类别**（不是同时开放的“高级模式”）：

A. Inspection：打开并检查来源，不制造目标输出，不自动建立修改许可。

B. Property mutation：轨道名、语言、default/forced 等标志、文件标题、附件名、少量章节/标签文字。底层为元数据修改；执行策略优先评价可否安全局部编辑。**即使只改一个字段也必须验证实际 UID/关系是否受影响。**

C. Attachment mutation：普通图片、封面、字体、任意附件均通过同一种资源模型；目标操作可以是加入、排除、替换或改名。封面仅叠加约定文件名 + 兼容性提示，不建立另一套写入机制。

D. Container composition：增加/删除/选择轨道、跨 MKV 选取源、追加字幕/字体、构建新文件。允许 Stream Copy，但不把 “-c copy” 等同完整容器保真。

E. Resource-only creation：无媒体轨的 Matroska 资源容器必须仍作为合法的特定目标；播放器兼容不保证。

F. Batch delivery：对多个**冻结输出计划**执行，不通过重复点击单工程按钮假装批次。

所有类别共用来源身份、当前对象、拟输出成员资格、执行资格、审查和结果证据；不能建立六套冲突的业务状态。

## 4. 推荐执行器选择：按操作语义而不是文件格式或功能按钮

对于每一项明确修改，先得出以下只读结论（**推荐合同，尚未编码**）：

- operation identity：意图（inspect / property-set / attachment-add / replace / exclude / track-compose / resource-create / batch）、源和目标对象标识；
- input identity：准确 File 对象 + SHA 证据等级 + 来源 EBML 事实；
- change set：实际影响的元素/字段；此前与拟输出值；UID 引用/索引/时间相关影响；
- candidate backend：read-only / bounded-existing-writer / browser-stream-copy / resource-only-writer / unsupported；
- feasibility：supported-for-this-fixture / requires-preflight / blocked / unknown，而非全局“支持 MKV”；
- output contract：不可更改来源文件，生成新成品，重新回读、核对没有请求更改的对象；
- compatibility：结构正确、媒体保真、字幕字体可渲染、播放器显示等证据分开。

优先使用已有 proven writer。只有实际能力缺口、运行环境兼容、许可证和性能审查同时通过，才考虑成熟源码移植或自研补丁。不把原生 mkvpropedit “无需重封装”直接推断成浏览器已经支持，也不因其可编辑而允许覆盖用户原文件。

**明确禁止的捷径**：
- 一个源 FFprobe attached_pic 流就被误作 Matroska 真正视频轨；当前已有相关修复及负映射，必须保留。
- 用 ffprobe 扁平章节冒充完整 ChapterAtom/Edition/TagTargets 关系。
- 因为元数据看似只改一字节就跳过输出 UID/索引/CRC/未知元素检查。
- 文件名相同就将不同附件视为同一对象或推断封面显示顺序。
- 在不能保留复杂结构时静默换 FFmpeg 重封装来“兼容”。

## 5. 用户界面方案：一处组合工作台，局部语义快捷入口

桌面/平板主要区域：
- 左侧窄资源库：已导入来源与已检查对象；支持多个 MKV，导入≠输出成员资格。
- 中央唯一当前文档：选择来源时显示真实观察树；选择拟输出目标时显示组成树；两种视图不是两套可写状态。
- 右侧对象检查器：对象身份/所属来源、真实属性、拟更改属性、用途快捷操作、影响范围和写入方式；危险时才展开关系详情。
- 底部紧凑输出区：仅在存在已审核目标时显示生成/执行资格与差异摘要；已经导出的成品状态独立。
- 批处理为同一输出计划模型的多项列表；不能把 20 个任务显示成一个长滚动的巨大表单。

**将成熟工具的快捷入口嵌入原有输入语义**：
- 拖入图片：先进入资源库，不自动作为封面或加入输出；在图片对象附近提供“作为普通附件”“设为默认封面”“横版封面”“仅保留在资源库”。
- “设为默认封面”：拟输出附件名称建议为 cover.jpg；可选 cover_land.jpg/small_cover.jpg 等符合约定的变体；显示原名→拟写名；不得擅改源 File 名、MIME 或像素。
- 默认封面重复：列出已经占用 cover.jpg 的对象，由用户明确决定替换、保留普通附件或取消；**不能产生同名自动轮换**。
- 拖入多个 MKV：各自可独立检查；不能默认把第一个作为输出主件，其余自动合并。
- 原有“视频 + ASS + 字体”快速封装仍是一条短路径，而不是强迫从通用资源库逐项设置。
- 现有“修改章节/标签”“添加附件”应根据具体受支持的能力显示可执行/受限/未验证，而不是“看得到对象便能修改”。

借鉴的是 MKVToolNix 将复杂选项组织到对象、属性与任务中的方法，不是照搬其多工具导航或 Qt 布局。

## 6. 不应再重复发明的部分

- 没有证据证明存在必要差异时，不开工“又一套通用 EBML Writer”或“封面专用文件写入器”。
- 不用额外的 FFmpeg 重新封装修复本来属于 metadata-only 的编辑问题，而要先分析现有有界编辑器与 mkvpropedit 的能力差距。
- 对每个新增功能应填写成熟工具来源、其默认行为/失败条件、现有项目模块、最小新增能力、测试差距、许可证/平台门槛。
- 不把一次 MKVToolNix 成功的重封装当成未知结构的普遍保留证明：已知 Issue #77 的独立对照中，普通 mkvmerge 对章节 UID 定向 Tag 仍发生丢失。
  https://github.com/11576865/MKV-Fast-Muxer/issues/77

## 7. 本轮立即可进入实现评审的 3 个切片（均需单独 CI）

**Slice 1 / 语义快捷方式**（优先，不增加底层引擎）：在统一普通附件数据模型上加入 cover filename preset + 冲突显式选择；绑定真实对象与拟输出计划，证明只是 metadata/intent 差异。不允许仅写一个未连接 UI 的 helper 就声称完成。

**Slice 2 / 只读操作差异与能力**：选中现有 MKV 的属性修改时，显示“仅字段修改 / 需要重封装 / 当前未验证”的执行资格说明；真实对象字段变化与未触及对象的保真范围可核对。不能为了显示支持而绕过当前有界写入限制。

**Slice 3 / 与成熟工具的同输入对照**：把 10+ 种含未知 EBML/嵌套章节/定向 Tag/图片附件/多轨/音频前滚的真实素材同时交给 mkvmerge、mkvpropedit（适用时）和软封，比较目标操作、实际输出结构、包数据和可提取字节。每项显示“操作适用/不适用”，不得用不存在的等价执行来比较。

## 8. 交付、限制与权威边界

本提交是**带来源的第一轮设计制品**，可以审阅和落实到 UI/执行器 backlog，但没有修改生产入口、没有对 2026 当前 MKVToolNix Codeberg 源码完成审计、没有引入或移植源码、没有通过真实浏览器对照实验、也没有提升 1.0 通过数。

后续每个真实工程切片要给出：选定目标、精确上游版本/源码/许可、当前模块的能力缺口、实际代码与 UI 操作、真实媒体成品、独立验证器、负例、精确提交及 CI 结果。优先研究/借鉴成熟实现是执行约束，不是“所有底层内容以后绝不能自研”的绝对规则。
