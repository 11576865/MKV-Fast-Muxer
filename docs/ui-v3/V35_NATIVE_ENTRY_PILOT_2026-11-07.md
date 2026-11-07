# Softmux V3.5 · 第一组真实功能入口接线与验收台账

日期：2026-11-07  
性质：**Opt-in 实现切片 / 不属于 V3.5 全量功能验收**  
验证入口：`?ui=v3&nav=full`  
对照设计：[V3.5 · 55 态 Figma 候选](https://www.figma.com/design/5iZSy48FV1sJnGdmUf1uQc?node-id=60-2)，[设计账本 PR #266](https://github.com/11576865/MKV-Fast-Muxer/pull/266)。

## 1. 确认的生产代码事实

- `src/softmux-10.14-workbench.js` 原本就以 `get(doc,'sf14Batch').appendChild(batch)` 将**真实** `.stage-batch` 和所有原有任务矩阵、导入控件、任务队列与运行控制器移动到同一工作台；另有 `changeView('batch')` 和 `changeView('tools')`。**本次没有新建 BatchRunner、导入器、计划模型或文件权限持有者。**
- 原 V3 的 `src/softmux-v3-surface.js` 将原 `[data-sf-view]` 放入顶部 `.sfv3-legacy-menu`，只给侧栏设置来源和“添加资源”图标。故“Batch 已实现”与“Batch 在 V3 中为一级可发现入口”是不同判断。
- 本 PR 在试验路由下增加有文本名称的 `#sfv35FeatureNavigation`，并且**只是点击已存在的原生 `[data-sf-view]` 导航**。原有 `#sf14Batch`、`#batchPlan`、`#batchUnifiedInput`、`#sf14Tools` 和 `#muxBtn` 的 DOM、事件和文件引用保持单一所有者。
- 直接点击「拟输出」时，仍经原 `setSurface('plan')` 授权检查；缺少已确认目标则调用**原目标选择器** `openTargetPicker(null)`。返回来源模式保留原有只读条件，不能仅因显示按钮就宣布可执行。
- `.sfv35-nav` 范围内修复 V3 强制 `display:grid!important` 会覆盖已有 `[hidden]` 的冲突，避免切到批量时原单工程页面叠在下面；不改变默认 V3 CSS。

## 2. 导航路径和证据类型

| 当前 V3.5 入口 | 原始 DOM / 业务状态 | 保护要求 | 证据 |
|---|---|---|---|
| 来源 | `[data-sf-view=single]` → `setSurface('source')` → `#sf14Single` | 不自动生成可执行拟输出，来源只读 | 单元合同 + Chromium 真实 MP4 扫描 |
| 拟输出 | `[data-sf-view=single]` → `setSurface('plan')` 或原目标弹窗 | 明确选择目标后才允许编辑／封装 | Chromium 打开、取消目标选择 |
| 批量任务 | `[data-sf-view=batch]` → `#sf14Batch` | 保留单工程 File、批次独立 JobPlan、无伪完成状态 | Chromium 导入真实媒体及字幕 |
| 容器工具 | `[data-sf-view=tools]` → `#sf14Tools` | 受限写入门禁不放宽 | Chromium 原容器工具工作区可达 |

## 3. 并非本次完成的设计入口

V3.5 55 态设计包含完整的轨道、字幕、字体、附件、验证、工程恢复和批量任务细分。**目前仅有四个任务路由新增了试验性常驻入口**；这不构成九类任务都已达到一级可发现性的证据。

以下领域必须继续做独立真实入口核查与执行确认：
- L-010/L-012/L-013：轨道元数据、排序及批量属性在 V3 对象检查器中的可见路径；
- L-020—L-027：ASS/libass 预览、字体闭包、子集化/统一字体和成品证明；
- L-016—L-018：附件、Chapters/Tags/UID、Data/Other 的安全只读/受限写入路径；
- L-030—L-037：交付验证报告、批量运行／保存恢复；
- L-040：**本次部分实现**，独立一级 Batch 入口可进入原生任务矩阵，但绝非 Batch 全面 V3.5 视觉批准。

## 4. 验收出口

1. 准确 HEAD 的 `npm test`、`npm run build`、V3 Chromium 专项、Browser E2E、new-MKV 独立 E2E 均通过才允许提出进一步范围评审；**不得**从旧 SHA 的 CI 结果继承绿色。
2. 在真实浏览器检查 `#sf14Batch`、`#batchPlan`、`#batchUnifiedInput` 和单工程 `#videoInput` 的实际节点唯一性；导航前后原 File 引用不变；目标未经确认不能写入。
3. 核查 `1440×900`、`620×900` 的入口命中区和 `aria-current="page"`；真机触控、屏幕阅读器与 55 态视觉一致性未覆盖。
4. 尚未取得正式 V3.5 设计签核、原 V3 Figma 来源漂移未闭合，因此 **Draft PR、不自动合并、不切默认**。

## 5. 交付范围与状态

**已实施（代码）：** 试验性命名导航、Batch/Tools 实际复用、目标许可检查复用、CSS 显隐修复、单元测试与 Chromium E2E、专项 CI 接线。  
**待证实（运行）：** 精确 PR HEAD 的完整 CI、真实浏览器来源和批量入口操作，具体结果以 GitHub Actions 和产物为准。  
**Pending（整体验收）：** Figma 设计版本冻结、九类入口充分性、全旧能力功能可达性、设备与无障碍、1.0 发布。

此台账是基于当前实现源码的**局部真实接线审查**，并非从 Figma 或旧报告推定全量功能完成。


## 6. 续建：六类专业入口与真实控件路由（待精确 HEAD CI）

本次在同一 `?ui=v3&nav=full` 试验开关下，把原来的四个入口扩展为十个：**来源、拟输出、轨道、字幕、字体、附件、批量任务、验证、工程、容器工具**。与 Figma 的九大任务类别相比，容器工具是额外的安全能力隔离页，不以“全部功能已完成”论证。

| 新增入口 | 原始真实所有者 | 允许动作及边界 |
|---|---|---|
| 轨道 | `#compositionTracks` / 原 `[data-sf-section=tracks]` | 必须先确认目标；打开现有拟输出轨道列表，不合成新 Track |
| 字幕 | `#sf14OptionsDrawer` / `[data-editor-filter=subtitle]` / `#sf14PreviewDrawer` | 只展开现存字幕字段和真实预览工具，不生成虚拟字幕 |
| 字体 | `#sf14OptionsDrawer` / `[data-editor-filter=font]` / `#fontMode` | 使用原字体模式和子集化控件，不自动改用户设定 |
| 附件 | `#sf14Tools` / `#attachmentExtractionDetails` / `#existingAttachmentImpactDetails` | 路由到已有附件读取/提取/影响检查；不存在“任意附件安全改写”假权能 |
| 验证 | `#sfv3Verification` / 实际 `#outputEvidencePanel` | 必须先确认目标；打开真实预检，未生成成品时不显示通过报告 |
| 工程 | `#sf14Recovery` | 来源模式即可进入真实 JSON 草稿/恢复控件；不会凭恢复记录重获 File 权限 |

**延迟上下文请求（deferred context navigation）**：当用户点击轨道/字幕/字体/验证却还没有有效的目标时，首先出现**原生目标选择器**。只有原本的 `setSurface('plan')` 经身份校验成功，才转入请求的实际对象上下文。取消和 Escape 放弃请求；来源/批量/容器工具/工程不获得写入权限。没有创建第二套 Inspector、Wasm 执行器、BatchRunner 或业务状态仓库。

响应式设计：大屏入口持续可见；<=959px 用两行五列显示十个带中文名称的任务按钮，避免把专业入口全塞进横向隐性滚动。<=499px 使用四列三行。此布局仍为试验方案，尚需真机人体工学及视觉验收。

**测试策略**：延长 `tests/e2e/v35-native-feature-nav.e2e.mjs` 的真实 Chromium 操作，检验来源→工程恢复→附件工具→目标门禁/取消→确认→字幕/字体/轨道/验证→来源及紧凑十入口，验证原 File 身份不变、所有对象唯一、无虚假结果，并产出截图。具体 PASS/FAIL 以后续精确 HEAD 的 V3 Pilot CI 为准。

**独立既有阻断（不得并入本变更已修复）**：PR #267 先前的完整 Browser E2E [#42368921977](https://github.com/11576865/MKV-Fast-Muxer/actions/runs/42368921977) 在 `batch-run-console-scenario.mjs` 的 **Stop 模式运行记录下载**等待时出现 `page.waitForEvent('download')` 30 秒超时，且该测试前已报告一个任务已生成/审计通过。来源有待单独重现及分类（下载事件或报告导出程序/测试时序），不可把子集通过宣告成全套通过，也不应为了转绿放宽验收条件。

实现和验证与获批 V3 视觉权威继续隔离，PR 保持 Draft，默认 UI 不切换。
