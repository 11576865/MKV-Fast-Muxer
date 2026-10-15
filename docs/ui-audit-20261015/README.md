# 软封10.14版本：第一阶段差异盘点、迁移计划与风险

日期：2026-10-15（Asia/Shanghai）。范围：第一阶段审计与实施设计；**没有修改产品 JS、CSS、HTML、业务模型或稳定入口**。本文件不是完整 UI 验收证书。

## 1. 基线、设计依据与缺失资料

| 依据 | 实际核对结果 |
|---|---|
| 当前 main | 本地 HEAD、远端 main 均为 `a1f4e0aa3af33c2459d8a66569b9043e75feec21`；包版本仍为 1.2.2 |
| PR #153 | 已合并；原分支 head `9c9d38335fec2db554a53572a0d2552b330cb43b`；合并提交即上述 main。[PR](https://github.com/11576865/MKV-Fast-Muxer/pull/153) |
| 完整 UI 合同 | 已阅读全文：[合同](../软封10.14版本_完整UI合同与原子切换.md)。其“候选门禁尚未默认化”和“PR 仍为 Draft”等描述已过时；代码 `src/main.js` 最后几行实际为 `ui !== legacy` 时挂载新 UI |
| Figma | 用户链接 `https://www.figma.com/design/RbYeODU3j1y9xFWjcSxxt3`；访问实际返回代理 `403 CONNECT tunnel failed`。没有取得设计节点、组件属性或原型交互，不能声称完成 Figma 像素对照 |
| 10-12 总决议 | 未找到用户所指原文；已核对仓库 `GENERAL-CONTAINER-CORE-ALIGNMENT-2026-10-12.md` 和 acceptance-ledger 中 D-01～D-10 摘录，作为次级依据，不能代替原文 |
| 10-13 UI 报告与 L-001～L-044 | 仓库、现有素材目录及 Issue #75 正文/评论中未找到原始清单；下表采用独立的 A 编号，**不冒充 L 编号，也不声明 L 清单已逐项验收** |
| 旧设计与实际约束 | 已核对 [对象中心 UI 合同](../mkv-object-centric-ui-contract-2026-10-11.md)、[状态契约](../mkv-output-composition-state-contract-2026-10-12.md)、[Issue #75](https://github.com/11576865/MKV-Fast-Muxer/issues/75)、Round 2 统一业务权威文档 |
| 并行工作 | 开放 PR #150（保存重试）、#151（失败任务重试），#152 为整合台账；这些分支的功能不能计入本次 main 能力 |

PR #153 已合并，因此本轮使用后继审计分支 `feat/softmux-10.14-ui-audit-20261015`。它不是第二套 UI 实现，也不重置、强推或复活旧 PR；后续只有一个继续实现的审阅入口。合同中“唯一旧分支”的历史描述需要在后续实施时一并更新。

## 2. 已确认可复用的结构

| 结构 | 实际权威与本轮结论 |
|---|---|
| UI 壳 | `src/softmux-10.14-workbench.js` 的 `mountSoftmux1014Workbench()`：现有 source、composition、inspector、output、batch 节点通过 appendChild 移动，不复制表单或 ID。继续复用同一个 `#sf14Root` |
| 来源与 File 权限 | `identifyImportedAsset`、`resolveImportedRoles`、`importedAssetEntries` 和现有 File inputs。布局不得重新创建这些输入或用导入 JSON 恢复权限 |
| 单工程可写模型 | `liveWorkspaceAuthority` 将 source/external sessions 绑定到同一个不可变 ContainerProject；`commitLiveWorkspaceChange` 核验适配器。现存行数组是执行投影，不能再增设 UI 可写轨道数组 |
| 输出投影与选择 | `buildContainerDocument()` → `buildOutputComposition()` → `renderOutputComposition()`；`selectedCompositionId` / `reconcileContainerSelection` 管理现有稳定选择。新分类只筛选派生显示，不复制 title/default/forced 等属性 |
| 对象编辑 | `focusCompositionItem()`、现有 `assetInspectorHost`、外部音轨/字幕编辑控件及现有 handler。复用字段提交入口，按对象上下文显示，避免再展开同一对象的全局编辑器 |
| 执行与安全 | 现有 FFmpeg writer、preservation-preflight、实际审计/下载与严格附件写入器；改 UI 不得放宽 UID、CRC、SeekHead、尺寸或来源权限验证 |
| 批量 | `resolveBatchImportedAssets`、`renderBatchJobInspector`、Recipe v2、`freezeBatchJobPlan`、`runFrozenBatchQueue`、结果 URL registry。矩阵是同一队列的视图，不新增一套 task status |
| 实验能力 | 容器工具保留原预检、只读/实验状态及独立副本输出；普通章节/标签查看不得自动获得任意写权限 |

## 3. 实际差异与截图证据

本轮用 Chromium、真实仓库夹具和默认 `/` 路由验证，不以 Figma 图片或 HTML 字符串测试证明功能。

| 差异 | 实测/源码证据 | 影响与优先级 |
|---|---|---|
| 平板横屏仍机械三栏 | 1180×820 来源约 270px、中央约 565px、检查器约 342px；1024×768 约 255/439/328px。两栏模式仅在 <=930px 生效 | P1：来源文件名严重折行，检查器属性局促；按合同应以拟输出+检查器为主、来源可显式调出 |
| 批量模式的主要对象仍被资源列表压低 | 1180px 下 CSS 明确把 `.batch-layout` 和 `.batch-review-layout` 设为单列；四个真实文件已使任务矩阵位于首屏底部 | P1：应优先展示每行拟输出 MKV，导入清单改为次级可访问区域；不能只换标题 |
| 底部行动区不适应真实头部换行高度 | 820×1180、360×780 的开始封装按钮并未完整处于初始视口；截图可见被底缘裁切。其他已测尺寸可完整显示 | P1：使用按实际内容分配的 shell 行高与安全底部空间，不能继续依赖多层固定 `100dvh - 常量` |
| 附件/章节/标签分类不是对象清单 | `setSection()` 只填入静态限制说明；附件页仍显示上一音轨检查器。当前说明没有伪造成功，但未完成对象化迁移 | P1：复用真实投影与稳定选择，显示真实只读观察对象；无权限字段保留原因 |
| 保护模式的编辑入口缺少直接指引 | 原轨属性在“保留全部原内容”时禁用；切换入口在来源树/全局选项，不在当前对象旁 | P1：当前对象处说明保护原因并提供定位已有模式控件的动作；不能静默关闭保护 |
| 批量与单工程的添加资源语义不一致 | `sf14Add` handler 无条件 `changeView('single')` 并触发 `unifiedAssetInput` | P1：批量模式应调用现有批量导入入口；不改解析模型 |
| 来源/拟输出/旧选项存在重复展示机会 | 来源树仍有原流、中央有输出流、右侧可展开 legacy 全局编辑器 | P2：来源保留事实/冲突/保护开关；逐对象编辑只在当前检查器呈现，迁移前不能删除原 handler |
| 输出保存与审计可见性需要补齐 | 下方为受限高度输出带，成品证据 rehost 至检查器；手机部分 summary 被隐藏 | P1：运行、生成、审计、下载/目录保存分开呈现，错误和未验证不能随折叠消失 |
| 可访问性验证不完整 | 已有 role=tab、左右键切换、focus-visible、dialog；尚缺触摸上下文、全键盘路径、抽屉焦点返回及 assistive technology 验收 | P2：补测试后才能声明可访问；当前无横向溢出不代表触摸可用 |
| 文档/测试的入口身份不一致 | 当前主壳 E2E 检查默认 `/`，其余大部分功能场景 `openApp()` 主动使用 `?ui=legacy`；合同仍称候选 | P1：按功能迁移有效断言到候选 UI，保留 legacy 诊断；不能删除旧有效断言换绿灯 |

### 可直接审阅的浏览器截图

- [平板横屏 1180×820，真实来源](screenshots/tablet-landscape-source-1180.png)
- [平板横屏 1024×768，真实来源](screenshots/tablet-landscape-source-1024.png)
- [横屏批量：四文件、两个真实待执行任务](screenshots/tablet-batch-1180.png)
- [附件页目前的限制说明](screenshots/tablet-attachments-1180.png)
- [原音轨改名与真实变更投影](screenshots/tablet-edited-audio-1180.png)
- [真实封装与下载后](screenshots/tablet-delivery-1180.png)
- [桌面 1440×900](screenshots/desktop-source-1440.png)
- [平板竖屏 820×1180：底部按钮裁切](screenshots/tablet-portrait-source-820.png)
- [手机 390×844](screenshots/phone-composition-390.png)、[360×780：底部行动区不足](screenshots/phone-composition-360.png)
- [平板横屏空状态](screenshots/tablet-landscape-empty-1180.png)
- [复杂来源的真实安全阻断](screenshots/tablet-complex-source-blocked-1180.png)

以上是桌面 Chromium 的视口模拟，尚不等同于实体平板、触屏或移动浏览器验收。Figma 访问尚未恢复，因此此处没有“与原型一致”的结论。

## 4. 功能迁移表

状态定义：**实测**为本轮默认 UI 的真实文件验证；**已有**表示源码/既有测试中有实现，尚未逐项在新 UI 完成验收；**受限**为已有安全边界；**待迁移**不代表后端不存在。A 编号仅用于此次审计；取得原文后必须另加 L 编号对照，禁止猜测对应关系。

| ID | 旧能力与现有入口 | 目标归属 / 复用结构 | 本轮状态与验收要求 |
|---|---|---|---|
| A01 | 文件内容导入 `unifiedAssetInput` | 来源；identifyImportedAsset | 实测：真实 MKV 识别及扫描 |
| A02 | 文件夹 `unifiedFolderInput` | 来源；已有目录输入 | 已有：逐文件内容识别、权限拒绝需新 UI 回归 |
| A03 | 多容器主源选择/删除 | 来源冲突；resolveImportedRoles | 已有：切换不得继承旧选择/哈希 |
| A04 | 未知/损坏/扩展名不符输入 | 来源诊断与输出阻断 | 已有：失败必须可见，不假造轨道 |
| A05 | 原视频与音频 stream copy | 中央输出对象+执行器 | 实测：MPEG-4/AAC/Opus 来源生成真实 MKV |
| A06 | 原音轨标题/语言 | 当前对象；changeSourceTracks | 实测：改名→下载→ffprobe 标题一致 |
| A07 | 原轨保留/排除/排序 | 输出清单+已有领域事务 | 已有：索引/UID 稳定、排除项可恢复 |
| A08 | Default/Original/Commentary/HI | 当前对象真实属性 | 已有：原生 ffprobe 独立回读 |
| A09 | 完整保留原内容 append 模式 | 当前对象保护说明+来源设置 | 实测开关；复杂来源仍受 P0 阻断 |
| A10 | 原字幕标题/语言/Forced | 当前原字幕对象 | 已有：保留模式不得误用选择性修改 |
| A11 | 外部音频导入与属性 | 新增音轨对象；live external owner | 已有：真实文件、内容身份与失败恢复 |
| A12 | ASS/SSA/SRT/WebVTT/PGS/VobSub | 来源识别+输出字幕对象 | 已有：格式边界、sidecar、WebVTT 转换声明 |
| A13 | 新字幕标题/语言/标记 | 当前字幕；现有字段事务 | 已有：源变更后失效、成品回读 |
| A14 | FFmpeg/libass 静态预览 | 当前可预览字幕上下文 | 已有：候选实际按钮生成帧；非连续播放器 |
| A15 | 时间点/前后 cue/预览放大 | 现有 preview 控件/dialog | 已有：预览不修改封装状态 |
| A16 | 字体识别/集合/依赖/缺字诊断 | 字体对象及字幕上下文 | 已有：未知依赖显式显示，不做绝对渲染承诺 |
| A17 | 字体 preserve/force/子集 | 对象/当前工程字体策略 | 已有：复用 existing policy、输出字体字节审计 |
| A18 | 原附件保留/名称/MIME | 输出附件分类+同一检查器 | 后端已有；分类列表待迁移，不能新增可写数组 |
| A19 | 附件扫描/安全提取/导出命名 | 专业工具+附件上下文定位 | 受限：复用 attachment extraction UI |
| A20 | FileUID/TagAttachmentUID 影响图 | 附件只读证据 | 受限：关系核查不等于允许修改 |
| A21 | 已有附件等长替换/路由 | 原 routed editor 工具 | 受限：原检查与独立副本不变 |
| A22 | 紧邻 Void 的变长替换 | 原 reserved-void 工具 | 受限：只允许满足已验证布局的对象 |
| A23 | Segment 末尾附件变长 | 原 tail 工具 | 受限：不得宣传任意 FileData 增长 |
| A24 | 非末尾 SeekHead 中继/CRC | 原 relay / routed 工具 | 受限：UID、CRC、偏移与来源预检保持 |
| A25 | 追加 1–8 个附件候选 | 专业受限 append 工具 | 受限：不得变为无条件附件 CRUD |
| A26 | PNG-only Matroska | 独立实验入口 | 受限：零视频样本、独立解析/提取证据 |
| A27 | 多通用附件容器 | 原多附件实验入口 | 受限：无视频不等于通用主执行器可写 |
| A28 | 章节观察 | 输出章节分类/只读检查器 | 投影已有；树形/扁平证据分开，列表待迁移 |
| A29 | 全局/定向 Tags 与 UID | 输出标签分类/关系证据 | 观察投影已有；不可假定完整 Tags 树 |
| A30 | 等字节章节标题/标签文本修改 | 专业 inline metadata 工具 | 受限：复用现有门禁与独立成品审计 |
| A31 | 工程草稿导出 | 工程恢复 disclosure | 已有：导出不含 File 权限/实际产物 |
| A32 | 工程导入/差异/冲突/intent | 工程恢复 disclosure | 已有：只读比较不是自动恢复 |
| A33 | SHA-256 重绑/明确应用/撤销 | 现有 source-proof/replay | 已有：完整来源核验、旧值与权限门槛 |
| A34 | 外部元数据 checkpoint | 工程恢复+对应外部对象 | 已有：明确重新选择、确认应用/撤销 |
| A35 | 开始/取消/复位/连续任务 | 固定交付区；同一 executeCurrentMuxTask | 实测开始；取消/连续任务需候选专测 |
| A36 | 实际审计/MKV 下载/JSON 报告 | 交付状态+当前对象证据 | 实测下载及独立 ffprobe；报告入口需候选复测 |
| A37 | 批量文件/文件夹内容识别 | 批量次级来源；batchUnifiedInput | 实测四文件、两任务，不另造队列 |
| A38 | 配对/歧义/排除/冲突 | 首要任务矩阵 | 已有：缺字幕/重名不能静默跳过 |
| A39 | 每任务来源/字幕 metadata 检查器 | 现有 batchJobInspector | 已有：矩阵选行稳定映射已有任务 |
| A40 | Recipe v1/v2 导入导出/审核 | 批量配方上下文 | 已有：重新选源、明确确认后冻结 |
| A41 | 批量 Group/每任务字体子集 | 批次字体规则 | 已有：复用子集缓存与真实字体证据 |
| A42 | Frozen JobPlan/Queue/取消 | 原 runner；任务行状态投影 | 已有：失败隔离、取消不清除已完成产物 |
| A43 | 目录授权/命名冲突/保存/Blob | 任务行结果与保存回执 | 已有基础；PR #150/#151 重试能力未合并，禁止宣称可用 |
| A44 | 帮助/密度/键盘/响应式 | 同一 UI 壳及视觉偏好 | 入口已有；本轮跨视口 File 身份保持；焦点、触摸、屏阅未验收 |

## 5. 实施方案与依赖顺序

### 方案比较

1. **推荐：继续现有 shell 与派生投影，逐域补齐。** 保护运行中的 File/handler、现有事务和结果生命周期；允许最小 CSS 与 DOM rehosting 修正。难点是 legacy cascade 需通过实测收敛。
2. 只覆盖 CSS：容易改善横屏，但无法让附件/章节/标签成为真实对象视图，也不能纠正批量添加资源与对象选择。不能满足完整 UI。
3. 全量替换 root/引入第二套组件状态：初期视觉自由，但会放大权限丢失、双状态与未迁移 handler 风险；本轮不采用。

### 候选隔离与默认入口

main 已经默认使用 10.14；本轮不回滚历史默认化。后续实施在同一 shell 加入显式审阅路由 `?ui=10.14-review` 的展示配置，审阅样式限制在该配置下，默认 `/` 与 `?ui=legacy` 保持当前行为。配置只控制布局/呈现，不创建另一份轨道、附件、队列或执行器。满足完整门禁并由用户审阅后，才提出默认切换；不自动合并或部署。

### 有序工作单元

| 单元 | 修改范围/可复用结构 | 退出条件 |
|---|---|---|
| U0：冻结依据与本次设计 | 补齐可访问 Figma、10-12/10-13 原文与 L 清单；更新本表对照列；核对截图与当前 main | 设计源可追溯，需求冲突有明确决策；本书面设计经用户审阅 |
| U1：候选隔离、平板横屏 shell | 现有 workbench mount 的展示配置、scoped CSS；不用固定高度常量堆叠。1180/1024 默认输出+检查器双域，来源显式抽屉；桌面保留三域 | 1180×820/1024×768 行动区完整可见；抽屉开关不重建输入；视口转换保持对象/编辑/滚动 |
| U2：输出分类与检查器 | 同一 ContainerDocument 派生分类、原 selectedCompositionId、现有 mutation adapters；附件为真实现有对象；章节/标签明确观察证据 | 空列表真实；只读对象不出现可执行写入承诺；一个对象只对应一个编辑权威 |
| U3：旧功能逐项接入 | 按 A01～A36 与取得的 L 表逐项连接既有控件；字幕预览、字体策略、源保护开关做当前对象上下文入口 | 每项记录新入口、原 handler、真实输入/结果、缺失边界；迁移前保留旧 runtime 节点 |
| U4：批量矩阵优先 | 把现有 batch queue/inspector 放到首要区域，导入与设置为次级；按当前模式触发正确添加入口；仍使用 frozen plan/runner | 平板首屏看到两个任务与阻断/状态；真实两 MKV 和报告独立回读；歧义/取消/保存失败保持已完成结果 |
| U5：安全与交付 | 当前输出证据、下载/报告、目录保存回执按任务实际状态展示；专业工具保留独立边界 | 复杂 MKV 原样阻断；不把下载链接存在当作已保存，不把 mux 成功当作全 EBML 保留 |
| U6：跨视口/辅助交互 | 1440×900、1180×820、1024×768、820×1180、390×844、360×780；触屏上下文、Tab/方向键/Escape/焦点返回 | 无横向溢出、主动作未裁切、File identity/选中对象/草稿稳定；截图人工审阅 |
| U7：默认化提案与回滚 | 精确 head 的 Node/build/候选 UI 全套功能+原生工具证据；更新合同/入口文档 | 用户审核后提出原子切换；保留 legacy 诊断及可回滚提交，不自动合并 |

实施不得把 #150/#151 的批量重试、#152 台账中的未知项顺便合并。只有已合并且完成自身时间/文本独立验证的能力才可改变显示状态。

## 6. 风险清单

| 风险 | 级别 | 控制和验收 |
|---|---|---|
| Figma/正式原文缺失导致错误解释 | 高，设计阻断 | 恢复访问或取得可访问导出；本轮只声明代码/合同差异，不能猜 L 映射 |
| 已默认化与合同候选策略冲突 | 高 | 按真实 main 建基线；改动隔离在审阅配置，发布文档单独更正 |
| 多层 CSS 覆盖、固定高度裁切 | 高 | 基于 actual header/output 尺寸分配布局；截图与 bounding rect 一起检查 |
| 重建 DOM 导致 File 权限/输入/监听丢失 | 高 | 保持 appendChild 实例和现有初始化；记录 DOM identity，跨视口断言 |
| 第二套对象/任务状态漂移 | 高 | UI 只读派生；全部修改走同一领域事务，任务结果读已有 ledger |
| 只读章节/标签被误当可写 | 高 | 能力 resolver 和证据状态优先；一般编辑字段禁用并说明原因 |
| 保护模式被 UI 自动关闭 | 高 | 显式操作、风险说明、已有 preflight；复杂来源反证用例 |
| 已有产物 URL/保存状态在切换中丢失 | 高 | 不重置 registry；已完成/审计/保存分栏，取消/重试保留产物 |
| 旧 handler 假定祖先/布局、隐藏字段不可达 | 中高 | 功能逐项候选 UI 复测；不要在尚未迁移时删旧包装/输入 |
| 异步重绑/元数据编辑竞争 | 中高 | 环境验证曾出现共享工程标题间歇性失败，完整重跑通过；保留原断言，用 ready/领域绑定状态诊断，不能用固定 sleep 掩盖 |
| 大部分 E2E 仍为 legacy 路由 | 高 | 把每个有效任务路径迁到候选入口；保留独立成品 oracle，不靠删除选择器换绿灯 |
| 触摸、键盘、焦点恢复未经验证 | 中高 | 单独 coarse-pointer/touch context、实际热区与 focus 测试；不以桌面视口代替 |
| 外部 PR #150/#151 与 main.js 冲突 | 中高 | 每次实施前检查远端 main/PR，明确合并边界，UI 不实现未合并重试 |
| 大文件性能/浏览器设备差异 | 中 | 本轮小夹具不代表大文件；明确预算，不扩张为 P5/P6 完成声明 |

## 7. 本轮验证、复现与交付边界

- `npm test`：586 通过，0 失败、0 跳过；当前产品代码与 main 基线相同。
- `npm run build`：通过；现有 chunk-size 提示仍在，不视作功能验收失败。
- 默认 UI 真实浏览器：源 MKV 导入 → 选中原音轨 → 显式关闭 append 保护模式 → 当前检查器改名 → 390/1440/1180 切换保留标题 → 实际封装 → 下载 `.e2e/ui-audit/edited-source.mkv` → 独立宿主机 ffprobe 核验改名成功。
- 跨视口同一个 videoInput DOM 身份保持；已加载状态无重复 ID、无页面横向溢出。空态尚无选中 File，identity 值不作为失败。
- 批量：四个真实文件产生两个独立待执行任务；本轮仅检查矩阵与布局，**没有重新执行完整批量与所有格式 E2E**。
- 复杂来源：使用独立 MKVToolNix 夹具，默认 UI 的 preservation-readiness 必须 blocked，封装按钮禁用；不绕过门禁。
- 本次设置云环境时，相同产品 SHA 的完整 legacy+默认壳 E2E 曾最终通过；这只是历史环境基线，不能代替本轮未执行的候选 UI 全量功能验收。
- [baseline.json](baseline.json) 保存产品 SHA、逐视口 rect/输入身份/重复 ID、真实输出流与 SHA-256、批量矩阵文本和阻断证据。
- 产品修改：**无**。交付差异为审计文档、复现脚本、机器证据与真实 Chromium 截图。

复现（两个终端，先完成构建，再开始捕获，禁止并行重建 dist）：

```bash
cd /workspace/MKV-Fast-Muxer
export PATH=/workspace/.mkv-tools/bin:$PATH
npm install --package-lock=false
npm test
npm run build
# 若夹具尚未存在，生成器会清空自己的 .e2e/fixtures；先确认没有用户文件。
bash tests/e2e/generate-fixtures.sh
bash tests/e2e/generate-independent-matroska-fixture.sh
npm run preview -- --host 127.0.0.1 --port 4173
```

另一个终端：

```bash
cd /workspace/MKV-Fast-Muxer
node docs/ui-audit-20261015/capture.mjs
```

当前复现脚本针对本环境 Chromium `/usr/bin/chromium`；执行会刷新本目录同名审计证据与截图，输出媒体写入 ignored `.e2e/ui-audit`。原始用户媒体不修改、不上传，媒体输出未提交到 Git。

## 8. 尚未完成与下一阶段入口

尚未取得 Figma 与原始 L 清单，尚未实施 U1～U7，尚未做触摸/屏阅、完整新 UI 功能迁移与正式发布验收。没有新增发布、合并、产品执行能力或功能完成百分比。

请先审阅本书面迁移设计；恢复缺失设计资料后补齐精确对照，再按 U1 起的顺序实施。这个审阅点对应用户要求的“先盘点、确认可复用结构、再改界面”，也符合 brainstorming 技能对架构类改动先审阅书面设计的要求。
