# Softmux V3.5 — 批量八阶段真实工作流与可验证执行证据

日期：2026-11-08  
状态：Draft；仅 `?ui=v3&nav=full`，**不改变默认 V3、旧浏览器工作流或 Figma V3 原设计权威**。  
来源分支：依赖 [PR #267](https://github.com/11576865/MKV-Fast-Muxer/pull/267) 十任务入口及 [PR #268](https://github.com/11576865/MKV-Fast-Muxer/pull/268)「源结构」第十一入口；两者均未合并。

## 审查起点：为什么 70 张截图仍然不够

此前 CI 证据有 70 张 PNG（60 张真实 Chromium，10 张 Figma–浏览器对照），但不代表 70 个独立功能。44 项历史能力的审查仍有 10 项无直接截图，另一项缺少专项情境；特别是 **批量配对歧义、逐任务属性、Group 字体、配方、运行控制与成品保存** 有大量功能入口跨折叠区域，单独截图不足以证明操作闭环。工作目标不是再增加一串命名按钮，而是**在一个真实批次中串联 8 组旧控件，验证源 File→配对→选择→属性→执行→下载/审计**。

## 真实实现：复用现有单一 owner

新增 `src/v35-batch-workflow.js`，由 `src/softmux-v3-surface.js` 的可选全功能导航挂载。只保存 `#sf14Batch.dataset.sfv35BatchFocus` 这个 **UI 表现上下文**，不另建业务状态。原 `#sf14Batch`、`.stage-batch`、原始 `#batchPlan`、`#batchJobInspector`、`#batchUnifiedInput`、`#batchSubsetScope`、`#batchRecipeV2ExportBtn`、`#batchRunConsole`、`#batchResults`、`#batchInspectBtn` 节点全部保持独立 ID 和原始事件监听器。

| 直接操作上下文 | 原生控件 / 状态 | 交互语义 / 权限边界 |
|---|---|---|
| 资源清单 | `#sf14BatchSources` / `#batchUnifiedInput` | 展开原有资源分类/导入；不覆盖单工程 File |
| 配对与冲突 | `#batchPlan` / `[data-batch-tie-index]` | 显示真实配对歧义与明确人工选择；不自动猜测目标 |
| 逐任务属性 | `#batchJobInspector` / `[data-batch-task-field]` | 对当前原生选中 Job 的字幕标题、语言和标志编辑，原业务层提交 |
| 字体策略 | `#batchFontSubsetEnabled` / `#batchSubsetScope` | 本地选择逐任务/Group 策略；未提供真实 ASS 字体依赖时不声称执行已证明 |
| 配方与目录 | `#sf14BatchRecipe` / `#batchRecipeV2ExportBtn` | 原 JSON v2 配方导出，不能恢复素材/目录权限 |
| 运行队列 | `#batchRunConsole` / `#batchStartBtn` | 原冻结 JobPlan、运行/暂停/停止/记录导出 |
| 成品与保存 | `#batchResults` | 原 MKV 下载、报表、SHA/ffprobe 成品验证，未选择目录时不得称已持久保存 |
| 容器检查 | `#batchInspectBtn` | 原独立检查任务，不把观察误作封装结果 |

八个入口都由上方永久命名阶段栏展示，选择目标时实际滚动到**原生拥有者的滚动容器**，不移动全页顶栏、不复制导入器、不模拟任务结果。内置三组*只读*实测信息：批量资源数、原原生任务审查摘要、原运行状态；任务数与歧义数取自原生 `#batchPlan`，成品数取自 `#batchResults a.download`。运行状态的直播由原始 `aria-live` owner 保管，不在摘要里重复播报。

## 浏览器与真实成品的覆盖计划

`tests/e2e/v35-batch-deep-workflow.e2e.mjs` 创建两个实际、内容不同的视频文件，以及一条与 A 精确命名匹配的 SRT 和另一条只有集数的 SRT。这构成有意且可复现的 **真实独立任务 + 双来源配对歧义**：

1. 正式批量统一导入真实四份文件，保留 A 的独立任务与 B 的待人工处理字幕歧义；原 `#batchStartBtn` 必须 disabled。
2. 操作者通过原 `[data-batch-tie-index]` 明确选择 B 源，确认阻断解除；不得因为文件枚举顺序自动决策。
3. 通过实际选中 Job 原 `[data-batch-task-field]` 编辑标题与语言（例如 `Review confirmed subtitle` / `zho`），导出真实 JSON v2 规则确认写入的是本任务字段。
4. 打开真实 Group 子集策略并恢复默认；**此 SRT 测试不验证 HarfBuzz/ASS 群组闭包**，留作单独含 ASS 与字体的专项。
5. 在原批次选择集排除一个任务，只执行显式选中的目标；经原 BatchRunner 生成真实新 MKV。
6. 下载实际 MKV / JSON 审计 / 运行记录并由独立 FFprobe/FFmpeg 检查媒体包、字幕文本、字幕语言标题、SHA256 和原始媒体文件不变；明确区分 generated / audited / saved。
7. 用 1440×900、820×1180、620×900 三种视口分别拍摄八个真实工作阶段，生成 24+ 场景原图和 JSON 收据。这些仍只代表 8 组操作，不代表 24 个新产品能力。

**CI 门禁**：`.github/workflows/ui-v3-pilot.yml` 在准确 HEAD 执行此专项以及此前来源、空目标、多轨、ASS、11 全局入口、来源结构、独立 MKV 和所有 Node 回归。实际 PASS/FAIL 以 Actions 为准；不得从 PR #267/#268 的旧 HEAD 继承结论。主完整 Browser E2E 必须独立通过。

## 不声称完成的范围

- Group ASS 字体闭包/子集实际产物、20 个异构长视频、大于 1 GB 的设备约束、断电恢复或跨会话继续。
- 自定义附件/章节/标签的通用 EBML 写入，跨播放器兼容，不承诺一切 Matroska 保真。
- 55 态 Figma 的像素级签核、物理平板和正式默认入口替换。
- 未经实际通过的单项测试、保存目录持久化、其他没有对应真实媒体样本的旧能力。

用户反馈和实际能力审计的底线：**技术上存在 ≠ 入口可见 ≠ 可完成操作 ≠ 具备成品和独立审计证据**。
